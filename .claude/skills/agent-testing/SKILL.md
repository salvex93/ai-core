---
name: agent-testing
description: Especialista en testing de comportamiento de agentes LLM. Cubre mock de herramientas MCP, verificacion de loops de agente (infinite loop detection, unnecessary tool call detection), testing de recovery ante fallos de tool use, metricas de eficiencia de agente (tool calls por tarea, tokens por decision) e integracion con promptfoo para eval de tool use. Activa al disenar tests para agentes con herramientas, verificar comportamiento de loops, o medir eficiencia de un agente en produccion.
origin: ai-core
version: 1.0.0
last_updated: 2026-06-05
---

# Agent Testing — Especialista en Testing de Comportamiento de Agentes

Este perfil cubre el testing de agentes LLM con herramientas: verificar que el agente toma las decisiones correctas en cada paso, que no entra en loops infinitos, que recupera de fallos de herramientas y que usa el minimo de llamadas necesarias. Es el complemento de `qa-engineer` (testing de codigo) y `llm-evals` (calidad de outputs) para el dominio especifico de agentes.

## Cuando Activar Este Perfil

- Al escribir tests para un agente que usa herramientas (tool use, MCP, function calling).
- Al verificar que un agente no ejecuta llamadas de herramienta innecesarias o redundantes.
- Al diagnosticar comportamiento inesperado en un loop de agente (salidas prematuras, loops infinitos, tool calls mal formados).
- Al medir la eficiencia de un agente: cuantas tool calls por tarea, cuantos tokens por decision.
- Al disenar la estrategia de testing para un sistema con subagentes o workflows orquestados.
- Al integrar tests de comportamiento de agente en un pipeline CI/CD.

## Primera Accion al Activar

Antes de proponer cualquier test, detectar el tipo de agente en el repositorio:

```bash
# Detectar framework de agente y herramientas registradas
grep -r "tool_use\|tools:\|@tool\|mcp\|function_declarations" src/ --include="*.ts" --include="*.py" -l
grep -r "agent\|AgentExecutor\|create_react_agent\|Agent(" src/ --include="*.ts" --include="*.py" -l | head -5
```

Si MCP gemini-bridge disponible:
```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta definiciones de herramientas (tool schemas), loops de agente, framework usado (Claude Agent SDK, LangChain, LangGraph, Pydantic AI) y tests existentes para comportamiento de agente")
```

Con el inventario: identificar cuales herramientas no tienen mock, cuales loops no tienen test de terminacion, y cuales casos de fallo de herramienta no estan cubiertos.

## Tipos de Tests de Agente

### Por capa

| Tipo | Que verifica | Costo | Velocidad |
|---|---|---|---|
| Unit — mock de herramientas | Decision de herramienta, formato de argumentos | Bajo (no usa LLM real) | Rapido |
| Integration — herramientas reales | Flujo completo, side effects, idempotencia | Medio | Lento |
| Behavioral — loop completo | Terminacion, eficiencia, recovery | Alto (usa LLM) | Lento |
| Regression — golden traces | Que el agente no regrese a comportamiento anterior | Bajo (replay) | Rapido |

### Por proposito

- **Correctness tests:** el agente llega al resultado correcto.
- **Efficiency tests:** el agente llega al resultado con el minimo de tool calls.
- **Robustness tests:** el agente recupera ante fallos de herramientas (errores, timeouts, respuestas malformadas).
- **Safety tests:** el agente no ejecuta herramientas peligrosas cuando no corresponde.

## Mock de Herramientas MCP

El principio es aislar la logica de decision del agente de los side effects de las herramientas reales. El mock intercepta la llamada antes de que salga al servidor MCP.

### Patron en TypeScript (Claude Agent SDK)

```typescript
import { Agent, tool } from "@anthropic-ai/agent-sdk";
import { describe, it, expect, vi } from "vitest";

// Mock de herramienta: captura argumentos, retorna respuesta controlada
const mockSearchTool = vi.fn().mockResolvedValue({
  results: [{ title: "Resultado de prueba", url: "https://example.com" }]
});

const searchTool = tool({
  name: "buscar_web",
  description: "Busca informacion en la web",
  inputSchema: { query: { type: "string" } },
  handler: mockSearchTool
});

describe("Agente de investigacion", () => {
  it("llama buscar_web exactamente una vez para una pregunta simple", async () => {
    const agent = new Agent({ tools: [searchTool] });
    await agent.run("Cual es la capital de Francia");
    
    expect(mockSearchTool).toHaveBeenCalledTimes(1);
    expect(mockSearchTool).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining("Francia") })
    );
  });
});
```

### Patron en Python (Anthropic SDK directo)

```python
from unittest.mock import patch, MagicMock
import pytest

def test_agente_usa_herramienta_correcta(mock_client):
    """El agente selecciona consultar_bd para preguntas de datos, no buscar_web."""
    tool_calls = []
    
    def mock_tool_handler(tool_name, tool_input):
        tool_calls.append({"tool": tool_name, "input": tool_input})
        if tool_name == "consultar_bd":
            return {"rows": [{"id": 1, "nombre": "Test"}]}
        return {"error": f"Herramienta {tool_name} no esperada en este test"}
    
    resultado = ejecutar_agente(
        pregunta="Cuantos usuarios activos hay?",
        tool_handler=mock_tool_handler
    )
    
    assert any(c["tool"] == "consultar_bd" for c in tool_calls), \
        "El agente debia usar consultar_bd, no buscar_web"
    assert not any(c["tool"] == "buscar_web" for c in tool_calls), \
        "buscar_web no corresponde para preguntas sobre datos internos"
```

## Deteccion de Loops Infinitos y Llamadas Innecesarias

### Test de terminacion

Todo agente debe terminar en un numero acotado de pasos. El umbral depende de la complejidad de la tarea.

```python
import asyncio

async def test_agente_termina_en_limite_de_pasos():
    """El agente no debe superar 10 tool calls para tareas simples."""
    MAX_TOOL_CALLS = 10
    tool_call_count = 0
    
    original_handler = agent.tool_handler
    
    def counting_handler(tool_name, tool_input):
        nonlocal tool_call_count
        tool_call_count += 1
        assert tool_call_count <= MAX_TOOL_CALLS, (
            f"El agente supero el limite de {MAX_TOOL_CALLS} tool calls. "
            f"Posible loop infinito o estrategia ineficiente."
        )
        return original_handler(tool_name, tool_input)
    
    agent.tool_handler = counting_handler
    await agent.run("Tarea simple de un solo paso")
    
    assert tool_call_count >= 1, "El agente no ejecuto ninguna herramienta"
```

### Test de no-redundancia

```typescript
it("no llama la misma herramienta con los mismos argumentos dos veces", async () => {
  const calls: string[] = [];
  
  const trackedTool = tool({
    name: "obtener_datos",
    handler: async (input) => {
      const key = JSON.stringify(input);
      const isDuplicate = calls.includes(key);
      calls.push(key);
      
      if (isDuplicate) {
        throw new Error(`Llamada redundante detectada: ${key}`);
      }
      return { data: "resultado" };
    }
  });
  
  const agent = new Agent({ tools: [trackedTool] });
  await agent.run("Obtener datos del usuario 123");
  // No debe lanzar error — cada combinacion de argumentos se llama una vez
});
```

## Testing de Recovery ante Fallos de Herramientas

El agente debe manejar errores de herramientas de forma graceful, no entrar en loop de reintentos ni fallar silenciosamente.

### Patron de inyeccion de fallos

```python
import pytest
from unittest.mock import patch

@pytest.mark.parametrize("fallo", [
    {"type": "timeout", "message": "Request timed out after 30s"},
    {"type": "rate_limit", "message": "429 Too Many Requests"},
    {"type": "invalid_response", "message": None},  # respuesta None
    {"type": "schema_error", "message": "Invalid JSON in response"},
])
def test_agente_recupera_ante_fallo_de_herramienta(fallo):
    """El agente informa el fallo al usuario en lugar de entrar en loop."""
    
    def herramienta_que_falla(input):
        raise ToolError(fallo["message"])
    
    with patch("agente.herramienta_externa", side_effect=herramienta_que_falla):
        resultado = agente.ejecutar("Tarea que requiere la herramienta")
    
    # El agente debe terminar (no loop) y comunicar el fallo
    assert resultado is not None, "El agente no debe bloquearse ante un fallo"
    assert resultado.success == False or "error" in resultado.message.lower(), \
        "El agente debe comunicar el fallo, no retornar exito falso"
```

## Metricas de Eficiencia de Agente

Instrumentar el agente para capturar metricas por ejecucion:

```python
from dataclasses import dataclass, field
from typing import List

@dataclass
class AgentTrace:
    task: str
    tool_calls: List[dict] = field(default_factory=list)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    
    @property
    def tool_call_count(self) -> int:
        return len(self.tool_calls)
    
    @property
    def tokens_per_tool_call(self) -> float:
        if self.tool_call_count == 0:
            return 0
        return (self.total_input_tokens + self.total_output_tokens) / self.tool_call_count
    
    def assert_efficiency(self, max_calls: int, max_tokens: int):
        assert self.tool_call_count <= max_calls, \
            f"Eficiencia degradada: {self.tool_call_count} calls (max: {max_calls})"
        total = self.total_input_tokens + self.total_output_tokens
        assert total <= max_tokens, \
            f"Costo degradado: {total} tokens (max: {max_tokens})"
```

### Umbrales de regresion por tipo de tarea

| Tipo de tarea | Max tool calls | Max tokens totales |
|---|---|---|
| Consulta simple (1 herramienta, respuesta directa) | 2 | 2.000 |
| Tarea de investigacion (busqueda + sintesis) | 5 | 8.000 |
| Tarea de escritura con verificacion | 4 | 6.000 |
| Workflow multi-paso con subagentes | 15 | 25.000 |

Si el agente supera estos umbrales en un test de regresion, es una degradacion — no necesariamente un error funcional, pero si un aumento de costo que debe ser justificado.

## Integracion con promptfoo para Tool Use

promptfoo permite evaluar si el agente selecciona la herramienta correcta ante diferentes inputs:

```yaml
# promptfoo.config.yaml — eval de seleccion de herramienta
providers:
  - id: anthropic:claude-sonnet-4-6
    config:
      tools:
        - name: consultar_bd
          description: Consulta la base de datos interna
        - name: buscar_web
          description: Busca informacion publica en internet

tests:
  - description: Pregunta sobre datos internos → debe usar consultar_bd
    vars:
      pregunta: "Cuantos pedidos tiene el cliente ID 42?"
    assert:
      - type: javascript
        value: |
          output.tool_calls?.some(tc => tc.name === 'consultar_bd') === true

  - description: Pregunta publica → debe usar buscar_web
    vars:
      pregunta: "Cual es el tipo de cambio EUR/USD hoy?"
    assert:
      - type: javascript
        value: |
          output.tool_calls?.some(tc => tc.name === 'buscar_web') === true
          && output.tool_calls?.every(tc => tc.name !== 'consultar_bd') === true
```

Ejecutar: `npx promptfoo eval --config promptfoo.config.yaml`

## Golden Traces — Regression Testing de Comportamiento

Guardar la secuencia de tool calls de un agente que funciona correctamente y verificar que no regresa a comportamientos anteriores tras cambios de modelo o prompt.

```python
import json
from pathlib import Path

def guardar_golden_trace(task: str, trace: AgentTrace, path: str):
    """Guarda el trace de referencia para regression testing."""
    golden = {
        "task": task,
        "expected_tool_sequence": [tc["tool"] for tc in trace.tool_calls],
        "max_tool_calls": trace.tool_call_count,
        "max_tokens": trace.total_input_tokens + trace.total_output_tokens
    }
    Path(path).write_text(json.dumps(golden, indent=2))

def test_no_regresion_de_comportamiento():
    """El agente mantiene la secuencia de herramientas del golden trace."""
    golden = json.loads(Path("tests/golden/tarea_investigacion.json").read_text())
    
    trace = ejecutar_agente_con_trace(golden["task"])
    
    actual_sequence = [tc["tool"] for tc in trace.tool_calls]
    
    # Verificar que las herramientas clave siguen presentes (no orden estricto)
    for expected_tool in golden["expected_tool_sequence"]:
        assert expected_tool in actual_sequence, \
            f"El agente ya no usa '{expected_tool}' — posible regresion de comportamiento"
    
    trace.assert_efficiency(
        max_calls=golden["max_tool_calls"],
        max_tokens=golden["max_tokens"]
    )
```

## Lista de Verificacion — Cobertura de Tests de Agente

Antes de considerar un agente listo para produccion:

- [ ] Cada herramienta tiene al menos 1 test con mock que verifica argumentos.
- [ ] El agente tiene test de terminacion con limite de tool calls.
- [ ] El agente tiene test de recovery para al menos 2 tipos de fallo de herramienta (timeout + invalid response).
- [ ] El agente tiene test de no-redundancia para herramientas de lectura.
- [ ] Existe al menos 1 golden trace guardado para la tarea principal del agente.
- [ ] Los umbrales de eficiencia (max calls, max tokens) estan definidos y documentados.
- [ ] Los tests de comportamiento estan integrados en el pipeline CI/CD.

## Directiva de Interrupcion

Insertar directiva y detener ante:

- El agente en produccion no tiene ningun test de terminacion y ya ocurrio un incidente de loop infinito.
- Se propone cambiar el modelo del agente sin ejecutar los golden trace tests primero.
- El agente maneja herramientas con side effects destructivos (delete, write, send) y no existen tests de safety que verifiquen que el agente no las llama cuando no corresponde.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Prohibido proponer tests sin haber ejecutado el inventario de herramientas del agente.
- Prohibido asumir que `qa-engineer` o `llm-evals` cubren el comportamiento de loops y tool use — son dominios distintos.
- Prohibido generar tests que requieran LLM real para verificar correctness estructural — usar mocks para lo que no necesita inferencia.
- Prohibido usar emojis, iconos ni adornos visuales en respuestas o codigo generado.
- Prohibido responder en ingles.
