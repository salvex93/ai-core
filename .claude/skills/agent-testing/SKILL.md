---
name: agent-testing
description: Especialista en testing de comportamiento de agentes LLM. Cubre mock de herramientas MCP, verificacion de loops de agente (infinite loop detection, unnecessary tool call detection), testing de recovery ante fallos de tool use, metricas de eficiencia de agente (tool calls por tarea, tokens por decision) e integracion con promptfoo para eval de tool use. Activa al disenar tests para agentes con herramientas, verificar comportamiento de loops, o medir eficiencia de un agente en produccion.
origin: ai-core
version: 1.2.0
last_updated: 2026-08-15
rol: auditor
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

## Cuando NO Activar Este Perfil

- La tarea es testing de codigo de la aplicacion (funciones, servicios, endpoints) sin agentes — usar `qa-engineer`.
- La tarea es medir la calidad semantica de los outputs del agente (faithfulness, alucinaciones) — usar `llm-evals`. Si la pregunta mezcla ambos dominios (ej. "tests de tool use y de fidelidad de citas"), responder la parte de tool use/loops/recovery con este skill y remitir la parte de faithfulness/entailment/citation correctness a `llm-evals` por nombre, sin desarrollar diseno de tests ni metricas de esa parte semantica aqui.
- La tarea es diagnosticar la arquitectura del agente, no su comportamiento en tests — usar `claude-agent-sdk` o `managed-agents-specialist`.
- El sistema no tiene herramientas (tool use, MCP, function calling) — no hay comportamiento de agente que testear con este skill.
- La tarea es definir el system prompt del agente, no testearlo — usar `prompt-engineer`.

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

## Mock-LLM a nivel de servidor HTTP (para agentes autonomos completos)

Distinto del mock de herramientas de la seccion siguiente (que mockea a nivel de funcion/cliente dentro del proceso): un mock-LLM levanta un servidor HTTP real que imita el endpoint `/v1/messages`, y redirige el SDK hacia el via `baseURL` configurable. Patron equivalente a `mock-llm`/`mock-llm-docker` de OpenHands (hallazgo de auditoria de mercado 2026-08-15) — util para probar el comportamiento COMPLETO de un agente autonomo (loop real, parsing de `tool_use`, manejo de `stop_reason`) sin gastar tokens reales ni depender de la API disponible, cuando el codigo bajo prueba construye su propio cliente internamente (no expone un punto de inyeccion a nivel de import).

Implementado en `tests/harness/mock-llm-server.js` (ai-core): `iniciarMockLLM({ respuestas, toolUse, stopReason })` levanta el servidor, retorna `{ baseURL, llamadasRecibidas, detener }`. Ejemplo de uso real contra `scripts/anthropic-bridge.js` en `tests/harness/mock-llm-anthropic-bridge.test.js` — verifica routing, construccion de system blocks y contabilidad de uso sin llamar a `api.anthropic.com`.

```javascript
const { iniciarMockLLM } = require('./mock-llm-server');

const mock = await iniciarMockLLM({
  respuestas: ['Voy a usar una herramienta.'],
  toolUse: { name: 'buscar_producto', input: { query: 'zapatillas' } },
});
process.env.ANTHROPIC_BASE_URL = mock.baseURL; // el SDK redirige aqui, no a la API real

// ... invocar el codigo del agente bajo prueba ...

assert.equal(mock.llamadasRecibidas.length, 1);
await mock.detener();
```

Cuando usarlo: los 7 agentes autonomos de `.claude/agents/` en CI, o cualquier codigo que construye su propio cliente Anthropic/Gemini internamente. Cuando NO usarlo: si solo se necesita verificar que herramienta invoca el agente (mock de funcion, ver seccion siguiente, mas simple y rapido para ese caso).

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

### Test de fallo al lanzar por scope de herramientas

El scope de un subagente se define con `tools` como allowlist (o `disallowedTools` como denylist). Si ningun tool de la lista resuelve, el subagente falla al lanzarse en vez de arrancar sin tools silenciosamente — un modo de fallo distinto a los de tiempo de ejecucion (timeout, rate_limit, invalid_response, schema_error) de arriba, porque ocurre en tiempo de configuracion/lanzamiento.

```python
def test_subagente_falla_al_lanzar_si_tools_no_resuelven():
    """Un subagente con allowlist de tools que no resuelve debe fallar
    explicitamente al lanzarse, nunca arrancar en modo degradado sin
    herramientas."""
    with pytest.raises(AgentLaunchError):
        lanzar_subagente(tools=["herramienta_que_no_existe"])
```

Agregar al checklist final: `[ ] Existe un test que verifique que el subagente falla al lanzarse si su allowlist de tools no resuelve, en vez de arrancar silenciosamente sin herramientas.`

### Test de Integridad de Thinking Blocks en Tool Use

Al usar extended thinking con tool use, es obligatorio preservar integros tanto el bloque `thinking` como el `tool_use` del turno anterior al construir el siguiente mensaje del assistant — omitir o reordenar el `thinking_block` al reenviar el `tool_result` produce comportamiento incorrecto o error de la API. Construir un historial de mensajes multi-turno con thinking+tool_use, ejecutar un segundo turno con `tool_result`, y verificar programaticamente que el bloque thinking del turno anterior sigue presente e integro (sin modificar ni reordenar) en el array de `content` enviado en la siguiente request — fallar el test si el bloque thinking fue omitido o alterado.

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

### Test de subagentes paralelos y contexto agregado

El paralelismo funciona mejor con rutas de investigacion independientes, pero muchos subagentes que devuelven resultados detallados pueden consumir contexto significativo del padre igualmente. Distinguir este umbral del de tool calls por agente individual:

```python
def test_subagentes_paralelos_no_saturan_contexto_padre():
    """N subagentes en paralelo con tareas independientes no deben hacer
    que la suma de tokens de sus respuestas consolidadas exceda el
    umbral definido para ese workflow."""
    traces = ejecutar_subagentes_paralelos(n=5, tarea="investigacion independiente")
    total_tokens_consolidados = sum(t.total_input_tokens + t.total_output_tokens for t in traces)
    assert total_tokens_consolidados <= UMBRAL_CONTEXTO_PADRE
```

## Integracion con promptfoo para Tool Use

promptfoo permite evaluar si el agente selecciona la herramienta correcta ante diferentes inputs:

```yaml
# promptfoo.config.yaml — eval de seleccion de herramienta
providers:
  - id: anthropic:claude-sonnet-5
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

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.
- Ejecutar el inventario de herramientas del agente antes de proponer cualquier test.
- Distinguir activamente entre dominio de este skill (loops, tool use) y el de `qa-engineer` (codigo) y `llm-evals` (calidad semantica).
- Ante preguntas que piden diseno detallado de tests de faithfulness, entailment o citation correctness: remitir a `llm-evals` por nombre y no desarrollar esas secciones aqui, ni siquiera como contexto complementario — la mencion de deslinde no reemplaza el limite de no desarrollar el contenido.
- Usar mocks para tests de correctness estructural — los LLMs reales se reservan para evals de calidad semantica.

## Modulo — Deteccion Adversarial de Comportamiento Emergente en Agentes

### Identidad declarada antes de ejecutar

Antes de escribir cualquier test de este modulo, llenar:

```
IDENTIDAD AGENTE BAJO TEST:
  Topologia: [single-agent con tools | multi-agente jerarquico (padre-subagentes) | multi-agente en malla (peer-to-peer) | pipeline secuencial de agentes]
  Superficie de riesgo dominante: [tool con side effect destructivo | manejo de contenido externo no confiable | consumo de contexto/costo en produccion | decision de escalamiento a humano]
  Senal de exito no negociable: [termina en N pasos | nunca ejecuta tool X sin confirmacion | nunca trata output de tool como instruccion nueva | degrada con gracia ante fallo parcial]
  Metodo de observacion: [trace OTLP/OpenTelemetry | log estructurado de tool calls | golden trace snapshot | recorder de promptfoo]
```

Sin esta declaracion no hay caso de test valido — un test que no sabe cual es la senal de exito no negociable termina verificando solo que el agente "corrio", no que se comporto correctamente.

### Prohibido — patrones reconocibles de test superficial en este dominio

- Test que verifica unicamente `resultado is not None` como criterio de exito, sin inspeccionar la secuencia real de tool calls.
- Mock de herramienta que siempre retorna el camino feliz — nunca inyecta timeout, respuesta vacia, JSON malformado o permiso denegado.
- Test de "no supera N tool calls" sin verificar tambien que las tool calls ejecutadas son las correctas — un agente puede quedarse corto en llamadas y aun asi tomar la decision equivocada.
- Golden trace congelado que nunca se regenera tras un cambio de modelo deliberado, quedando como fuente de falsos negativos permanentes.
- Test que trata el contenido devuelto por una tool (archivo, pagina web, resultado de otro agente) como si fuera instruccion valida del sistema, sin verificar que el agente bajo test lo aisla correctamente — omite la superficie de prompt injection via tool output.
- Suite de tests que solo cubre el camino donde todas las herramientas resuelven — cero cobertura de fallo parcial en workflows con subagentes paralelos (2 de 5 fallan, el padre debe seguir con los 3 restantes).

### Gate de calidad medible

| Metrica | Umbral | Verificacion |
|---|---|---|
| Tasa de terminacion sin timeout | 100% de las ejecuciones de test deben terminar (exito o fallo explicito) en <= limite de pasos declarado — cero ejecuciones colgadas | Contador de pasos instrumentado en el test harness, assert por ejecucion, no solo en agregado |
| Cobertura de inyeccion de fallos | Cada herramienta con side effect tiene al menos 4 variantes de fallo cubiertas: timeout, rate limit, respuesta malformada, permiso denegado | Conteo de `@pytest.mark.parametrize` (o equivalente) por herramienta contra el inventario de tools del agente |
| Tasa de deteccion de contenido no confiable | El agente no ejecuta como instruccion ninguna directiva embebida en el output de una tool, en un set de casos de prueba con injection conocida | Suite dedicada de casos con payload de injection en tool output, assert de que el comportamiento declarado del agente no cambia |
| Reproducibilidad de golden trace | Divergencia de la secuencia de tools contra el golden trace <= 1 tool de diferencia entre ejecuciones identicas, salvo cambio de modelo declarado | Diff programatico de `expected_tool_sequence` contra `actual_sequence` en CI, no inspeccion manual |
| Degradacion ante fallo parcial en paralelo | Con fallo forzado en <= 40% de subagentes paralelos, el padre completa la tarea con los resultados restantes en vez de abortar el workflow completo | Test que fuerza fallo en N de M subagentes y verifica que el padre retorna resultado parcial, no excepcion no manejada |

### Vigencia — estandar mas reciente del dominio

Verificado contra `promptfoo.dev/docs/red-team/agents/` en esta tarea: promptfoo expone evaluacion basada en trazas (OTLP/OpenTelemetry) con assertions especificas `trajectory:tool-used`, `trajectory:tool-args-match` y `trajectory:tool-sequence`, ademas de plugins de red-team orientados a agentes — `agentic:memory-poisoning`, `excessive-agency`, `tool-discovery` — que superan el alcance de simple seleccion de herramienta ya cubierto en este skill. Esto habilita testing de comportamiento adversarial (memory poisoning en agentes stateful, exceso de autoridad) sin escribir el harness de trazas desde cero.

La documentacion oficial consultada no confirma capacidad nativa de deteccion de loops infinitos como plugin dedicado — donde este modulo o el resto del skill mencionen esa capacidad en promptfoo especificamente, tratarla como orientativo, no verificado contra fuente oficial, y mantener la deteccion de loops via el contador de pasos instrumentado ya definido en este archivo como mecanismo primario, no dependiente de promptfoo.

Antes de adoptar `agentic:memory-poisoning`, `excessive-agency` o `tool-discovery` en un pipeline real: confirmar la version instalada de promptfoo soporta el plugin exacto (los nombres de plugin de red-team cambian entre releases) y no asumir por analogia con plugins de seguridad de aplicacion tradicional.
