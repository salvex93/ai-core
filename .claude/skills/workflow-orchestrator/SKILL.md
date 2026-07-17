---
name: workflow-orchestrator
description: Especialista en orquestacion multi-agente y workflows de larga duracion. Fan-out/fan-in, retry con backoff exponencial, checkpointing de estado, coordinacion de subagentes heterogeneos y recuperacion ante fallos parciales. Activa al disenar workflows con multiples agentes paralelos, implementar pipelines con dependencias entre pasos, o garantizar durabilidad ante fallos transitorios.
origin: ai-core
version: 2.3.0
last_updated: 2026-07-17
rol: architect
---

# Workflow Orchestrator — Orquestacion Multi-Agente

Gobierna el diseno e implementacion de workflows multi-agente con durabilidad, paralelismo controlado y recuperacion ante fallos. Complementa `claude-agent-sdk` (agente individual) y `managed-agents-specialist` (agentes gestionados por Anthropic). Este skill cubre la capa de coordinacion entre agentes, no la logica interna de cada uno.

## Cuando Activar Este Perfil

- Al disenar un workflow con mas de dos agentes que deben ejecutarse en paralelo o en secuencia con dependencias.
- Al implementar fan-out (una tarea se divide en N subtareas paralelas) o fan-in (N resultados se consolidan en uno).
- Al garantizar que un pipeline largo (> 5 pasos) pueda reanudarse tras un fallo sin reiniciar desde cero.
- Al implementar retry con backoff exponencial en llamadas a LLMs o APIs externas.
- Al coordinar agentes con modelos distintos (Gemini para lectura masiva, Haiku para clasificacion, Sonnet para razonamiento).
- Al detectar y manejar fallos parciales en workflows donde algunos subagentes fallan y otros no.

## Cuando NO Activar Este Perfil

- La tarea es construir un agente individual (sin subagentes ni coordinacion entre agentes) — usar `claude-agent-sdk` o `managed-agents-specialist`.
- La tarea es disenar la logica interna de un agente (sus herramientas, su system prompt) — usar `prompt-engineer` o `claude-agent-sdk`.
- El "workflow" tiene un solo paso o se ejecuta una vez sin dependencias entre pasos — no hay que orquestar nada.
- La coordinacion es entre microservicios HTTP sincrona (request/response sin estado persistente entre pasos) — usar `backend-architect`.
- El pipeline solo procesa datos sin LLMs (ETL puro) — usar `data-engineer`.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta frameworks de orquestacion activos (LangGraph, Temporal, Prefect, Airflow, Bull/BullMQ), store de estado (Redis, PostgreSQL, SQLite), y patrones de retry existentes")
```

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `requirements.txt`, `.env.example`.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener:

- El workflow tiene herramientas destructivas (eliminacion, escritura en produccion) sin checkpoint de estado previo al paso destructivo.
- El fan-out genera mas de 50 tareas paralelas sin mecanismo de throttling — riesgo de saturacion de cuota de API.
- El workflow no tiene condicion de terminacion definida para el caso de fallo total.
- El estado de checkpoint incluye PII sin cifrado documentado.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Subagentes Nativos de Claude Code vs Orquestacion via API

- Si la coordinacion vive DENTRO de una sesion de Claude Code (el padre es Claude, los subagentes son Task/Agent lanzados por Claude Code) → usar subagentes nativos (`.claude/agents/` o `AgentDefinition` del Agent SDK si es una app SDK), NO reimplementar fan-out con asyncio y llamadas directas a la API. Los subagentes nativos ya traen scope de tools via allowlist/disallowedTools y contexto aislado por diseno.
- Reservar los patrones de asyncio.gather + AsyncAnthropic de este skill para el caso donde el orquestador NO es una sesion de Claude Code (un servicio backend propio, un cron, un pipeline batch fuera del IDE) y por tanto no hay Task tool disponible.
- Para coordinar mas de unas pocas tareas por turno dentro de una sesion Claude Code, evaluar la herramienta Workflow (Dynamic Workflows) en vez de fan-out manual: permite hasta 16 agentes concurrentes y 1000 totales por corrida, con resultados intermedios en variables de un script en vez de en el contexto de Claude — mas apropiado que este patron de asyncio cuando el fan-out ocurre a peticion del usuario dentro de Claude Code.

## Patrones de Orquestacion

### Fan-Out / Fan-In

Dividir una tarea en N subtareas paralelas y consolidar los resultados.

```python
import asyncio
from anthropic import AsyncAnthropic

client = AsyncAnthropic()

async def subagente(tarea: str, indice: int) -> dict:
    """Ejecuta una subtarea y retorna resultado con indice para ordenar el fan-in."""
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": tarea}]
    )
    return {"indice": indice, "resultado": response.content[0].text}

async def orquestador_fan_out(tareas: list[str]) -> list[dict]:
    """Fan-out: ejecuta todas las subtareas en paralelo con limite de concurrencia."""
    semaforo = asyncio.Semaphore(10)  # max 10 llamadas paralelas — protege cuota de API

    async def ejecutar_con_limite(tarea, i):
        async with semaforo:
            return await subagente(tarea, i)

    resultados = await asyncio.gather(
        *[ejecutar_con_limite(t, i) for i, t in enumerate(tareas)],
        return_exceptions=True
    )

    # Fan-in: separar exitos de fallos, ordenar por indice
    exitos = [r for r in resultados if isinstance(r, dict)]
    fallos = [r for r in resultados if isinstance(r, Exception)]
    return sorted(exitos, key=lambda x: x["indice"]), fallos
```

Regla: siempre definir un `Semaphore` para el fan-out. Sin el, N tareas paralelas = N llamadas simultaneas a la API, lo que agota cuota y genera errores 429.

### Retry con Backoff Exponencial

```python
import asyncio
import random

async def llamar_con_retry(fn, max_intentos: int = 3, base_delay: float = 1.0):
    """Reintenta fn con backoff exponencial + jitter ante errores transitorios."""
    for intento in range(max_intentos):
        try:
            return await fn()
        except Exception as e:
            es_ultimo = intento == max_intentos - 1
            if es_ultimo:
                raise
            delay = base_delay * (2 ** intento) + random.uniform(0, 1)
            await asyncio.sleep(delay)
```

Errores que justifican retry: HTTP 429 (rate limit), HTTP 503 (servicio no disponible), timeout de red.
Errores que NO justifican retry: HTTP 400 (input invalido), HTTP 401 (credencial incorrecta), errores de validacion de schema.

### Checkpointing de Estado

Persistir el estado del workflow despues de cada paso costoso. Permite reanudar sin repetir pasos completados.

```python
import json
import time

class WorkflowCheckpoint:
    def __init__(self, store, workflow_id: str):
        self.store = store       # Redis, PostgreSQL, o archivo local
        self.workflow_id = workflow_id

    async def guardar(self, paso: str, resultado: dict):
        clave = f"workflow:{self.workflow_id}:{paso}"
        payload = {"resultado": resultado, "timestamp": time.time(), "completado": True}
        await self.store.set(clave, json.dumps(payload), ex=86400)  # TTL 24h

    async def cargar(self, paso: str) -> dict | None:
        clave = f"workflow:{self.workflow_id}:{paso}"
        raw = await self.store.get(clave)
        if raw:
            data = json.loads(raw)
            if data.get("completado"):
                return data["resultado"]
        return None

    async def ejecutar_paso(self, nombre: str, fn):
        """Ejecuta fn solo si el paso no fue completado previamente."""
        cached = await self.cargar(nombre)
        if cached is not None:
            return cached
        resultado = await fn()
        await self.guardar(nombre, resultado)
        return resultado
```

### Coordinacion de Modelos Heterogeneos (Jerarquia de Costo)

Asignar el modelo mas barato que complete cada subtarea:

```python
MODELO_POR_COMPLEJIDAD = {
    "lectura_masiva":    "gemini-3.5-flash",          # Gemini free — archivos grandes
    "clasificacion":     "claude-haiku-4-5-20251001",  # Haiku — transformacion simple
    "razonamiento":      "claude-sonnet-5",           # Sonnet — analisis y diagnostico
    "arquitectura":      "claude-fable-5",              # Fable 5 — diseno de sistema nuevo (razonamiento profundo sin tools)
    "arquitectura_tools":"claude-opus-4-8",             # Opus — diseno con computer use o herramientas integradas
}

async def paso_pipeline(tipo: str, contenido: str) -> str:
    modelo = MODELO_POR_COMPLEJIDAD[tipo]
    if modelo.startswith("gemini"):
        return await llamar_gemini(modelo, contenido)  # via MCP gemini-bridge
    response = await client.messages.create(
        model=modelo, max_tokens=1024,
        messages=[{"role": "user", "content": contenido}]
    )
    return response.content[0].text
```

### Manejo de Fallos Parciales

En fan-out, algunos subagentes pueden fallar sin invalidar el resultado global:

```python
def consolidar_con_fallos(exitos: list, fallos: list, umbral_minimo: float = 0.8) -> dict:
    """Acepta el resultado si al menos umbral_minimo de subtareas tuvieron exito."""
    total = len(exitos) + len(fallos)
    tasa_exito = len(exitos) / total if total > 0 else 0

    if tasa_exito < umbral_minimo:
        raise RuntimeError(
            f"Demasiados fallos: {len(fallos)}/{total} subtareas fallaron "
            f"(umbral minimo: {umbral_minimo:.0%})"
        )

    return {
        "resultados": exitos,
        "fallos_ignorados": len(fallos),
        "tasa_exito": tasa_exito,
        "advertencia": f"{len(fallos)} subtareas fallaron y fueron omitidas" if fallos else None
    }
```

## Context Compaction en Workflows Largos

Para pipelines de > 20 pasos donde el historial de Claude crece linealmente, implementar compaction entre fases:

```python
MAX_TOKENS_HISTORIAL = 50000  # umbral antes de compactar

async def compactar_si_necesario(historial: list, client) -> list:
    tokens_estimados = sum(len(m["content"]) // 4 for m in historial)
    if tokens_estimados < MAX_TOKENS_HISTORIAL:
        return historial

    resumen_response = await client.messages.create(
        model="claude-haiku-4-5-20251001",   # Haiku para compactar — es mas barato
        max_tokens=2048,
        messages=historial + [{
            "role": "user",
            "content": "Resume los pasos completados, sus outputs clave y el estado actual del workflow en formato JSON estructurado."
        }]
    )
    resumen = resumen_response.content[0].text
    return [{"role": "assistant", "content": f"[HISTORIAL COMPACTADO]\n{resumen}"}]
```

Regla: compactar siempre con Haiku (no con Sonnet/Opus) — la tarea es resumen, no razonamiento. Ahorro tipico: 70-80% en tokens de contexto.

## Seleccion de Framework de Orquestacion

| Criterio | Sin framework (asyncio) | LangGraph | Temporal / Prefect |
|---|---|---|---|
| Complejidad del workflow | Lineal o simple fan-out | Grafo de pasos con condicionales | Long-running, dias/semanas |
| Checkpointing nativo | No — implementar manualmente | Si (estado del grafo) | Si (durable execution) |
| Observabilidad | Manual | LangSmith integrado | Dashboard propio |
| Costo de infraestructura | Cero | Bajo | Medio-alto |
| Cuando elegir | < 5 pasos, sin persistencia requerida | Agentes con decision condicional entre pasos | Workflows de dias, reinicio tras crash de servidor |

Para ai-core: preferir `asyncio` puro para workflows simples; LangGraph si el flujo tiene ramas condicionales basadas en outputs de agentes; Temporal solo si el workflow debe sobrevivir reinicios del servidor.

## Lista de Verificacion — Workflow Multi-Agente

1. Fan-out: `Semaphore` configurado con limite de concurrencia (recomendado: 5-20 segun cuota de API).
2. Retry: implementado con backoff exponencial + jitter para llamadas a LLMs y APIs externas.
3. Checkpoint: estado guardado antes y despues de cada paso costoso o destructivo.
4. Fallos parciales: definido el umbral minimo de exito y el comportamiento ante fallo total.
5. Modelos: asignado el modelo mas barato que complete cada tipo de subtarea.
6. Condicion de terminacion: definida explicitamente — el workflow tiene un estado final claro.
7. TTL de estado: el store de checkpoint tiene TTL configurado para evitar acumulacion indefinida.
8. Observabilidad: cada paso loguea `workflow_id`, `paso`, `modelo`, `tokens_consumidos`, `duracion_ms`.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion. Adicionales:
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.
- Todo fan-out lleva `Semaphore` con limite de concurrencia declarado antes de emitir codigo.
- Los pasos destructivos reciben checkpoint de estado antes de ejecutarse.
- Todo workflow con mas de 3 pasos tiene condicion de terminacion explicitamente definida.
- Subtareas de clasificacion o extraccion simple usan Haiku o Gemini — nunca Opus.
