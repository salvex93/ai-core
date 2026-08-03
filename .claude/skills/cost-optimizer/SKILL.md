---
name: cost-optimizer
description: Optimizador de costos de inferencia LLM. Selecciona el modelo mas barato que completa la tarea, fuerza Gemini como tier 0, aplica prompt caching, prefill y batch inference. Activa al detectar consumo excesivo de tokens, al iniciar sesion con tareas multiples, o al disenar pipelines de agentes donde el costo es variable.
origin: ai-core
version: 1.3.0
last_updated: 2026-08-03
rol: architect
---

# Cost Optimizer

Este perfil gobierna la seleccion de modelo, la estrategia de caching y la reduccion de tokens en cada interaccion. El objetivo es completar cada tarea con el modelo de menor costo que la resuelva correctamente. El desperdicio de tokens es un bug, no un estilo.

## Cuando Activar Este Perfil

- Al inicio de cualquier sesion con mas de 3 tareas encadenadas.
- Al detectar que Claude esta respondiendo con prosa extensa donde bastaria codigo.
- Al disenar un pipeline de agentes con llamadas LLM repetitivas.
- Al revisar por que el costo de una sesion supero el presupuesto esperado.
- Al evaluar si agregar prompt caching a un sistema existente.
- Al comparar el costo de resolver una tarea con distintos modelos.

## Cuando NO Activar Este Perfil

- La tarea es una peticion unica y simple — la optimizacion de costo es irrelevante para una sola llamada.
- El proyecto esta en fase de prototipo y la prioridad es velocidad de entrega, no costo — documentar la deuda y revisitar antes de produccion.
- La tarea es reducir el costo de la infraestructura (servidores, BD, CDN) — ese es dominio de `devops-infra`.
- El sistema ya usa Gemini tier 0 para todas las tareas elegibles y tiene caching activo — no hay mas palancas disponibles sin degradar calidad.

## Jerarquia de Modelos (releer antes de cada llamada LLM)

```
Tier 0A — Gemini 3.5 Flash-Lite (GRATUITO — escala masiva, verificado 2026-08-03 en ai.google.dev/gemini-api/docs/pricing)
  Volumen > 10.000 requests/dia donde Flash es suficiente
  Clasificacion masiva, moderacion de contenido, extraccion simple a escala
  Latencia objetivo < 300ms con contextos cortos (< 4k tokens)
  Pipelines de alto throughput donde el costo por token es la variable critica
  Pricing paid: $0.30/$2.50 por 1M in/out — reemplaza a 3.1 Flash-Lite ($0.25/$1.50) como tier 0 mas barato de la familia 3.x. Si el proyecto ya tiene 3.1 Flash-Lite integrado y no requiere las mejoras de 3.5, no hay obligacion de migrar solo por version.

Tier 0B — Gemini 3.6 Flash (GRATUITO en API — uso general, verificado 2026-08-03 en ai.google.dev/gemini-api/docs/pricing y /docs/models)
  Leer archivos > 200 lineas
  Analizar logs > 50 lineas
  Resumir repositorios completos
  Busqueda web e investigacion
  Comparar mas de 3 alternativas tecnicas
  Pricing paid: $1.50/$7.50 por 1M in/out — es el Flash mas reciente, reemplaza a 3.5 Flash ($1.50/$9.00) como modelo agentico de tier general con mejor output pricing. Confirmar que el free tier de la API sigue vigente antes de asumirlo en produccion de alto volumen.

Tier 1 — Haiku 4.5 (MAS BARATO PAGADO)
  Transformaciones simples < 8k tokens de contexto
  Clasificacion, extraccion de entidades
  Formateo, conversiones de estructura
  Generacion de codigo boilerplate sin logica compleja

Tier 2 — Sonnet 5 (EQUILIBRIO)
  Refactorizacion con logica
  Diagnostico de errores
  Busqueda y analisis de calidad
  Revision de seguridad
  Generacion de tests

Tier 3 — Opus 4.8 (SOLO SI ES NECESARIO)
  Diseño de sistemas nuevos multim-modulo
  Refactorizacion de arquitectura completa
  Planificacion de workflows complejos con dependencias
  Razonamiento sobre trade-offs con multiples restricciones
```

Regla de seleccion: si la tarea puede completarse en Tier N, usar Tier N. Subir solo cuando el tier inferior falla o la calidad es insuficiente. Documentar la razon del upgrade.

## Prompt Caching — Implementacion Obligatoria

### Cuando aplicar cache

Toda sesion con contexto de sistema > 1.024 tokens debe usar cache breakpoints. El TTL por defecto de Anthropic es 5 minutos. El TTL extendido (1 hora) esta disponible en cuentas con acceso a beta.

### Estructura de cache para sistemas con skills

```
[BLOQUE 1 — cacheable, inmutable por sesion]
  System prompt base (CLAUDE.md)
  Definicion del skill activo (SKILL.md)
  Contexto del proyecto (CONTEXT_MAP.json resumido)
  → Marcar con cache_control: { type: "ephemeral" }

[BLOQUE 2 — variable, NO cacheable]
  Historial de la conversacion actual
  Input del usuario en este turno
  Resultado de herramientas del turno anterior
```

El ahorro esperado con cache activo en sesiones largas: 60-80% del costo de input tokens.

### Verificacion de cache hits

En proyectos con API directa de Anthropic, verificar en la respuesta:
```json
"usage": {
  "cache_read_input_tokens": N,   // tokens leidos del cache — costo 0.1x
  "cache_creation_input_tokens": N, // tokens escritos al cache — costo 1.25x
  "input_tokens": N               // tokens nuevos — costo 1x
}
```

Si `cache_read_input_tokens` es 0 en el segundo turno de una sesion larga, el cache no esta funcionando. Revisar la estructura de los bloques.

## Prefill de Respuestas

El prefill fuerza al modelo a iniciar la respuesta con un texto especifico, eliminando la introduccion verbosa. Reduce el costo de output y la latencia del primer token.

### Uso correcto

```python
# Sin prefill — el modelo puede responder con introduccion
messages = [{"role": "user", "content": "Genera la funcion calcularIVA en TypeScript"}]

# Con prefill — la respuesta empieza directamente con el codigo
messages = [
  {"role": "user", "content": "Genera la funcion calcularIVA en TypeScript"},
  {"role": "assistant", "content": "```typescript\n"}  # prefill
]
```

Aplicar prefill siempre que:
- La tarea es generacion de codigo (prefill con el bloque de apertura del lenguaje).
- La tarea requiere JSON estructurado (prefill con `{`).
- La tarea es una lista de items (prefill con `1.` o `-`).

No aplicar prefill en tareas de razonamiento libre donde la estructura no esta predefinida.

## Batch Inference

Para tareas identicas o similares ejecutadas en secuencia (ej: evaluar 50 PRs, analizar 30 archivos de log, generar tests para 20 funciones), usar la Batch API de Anthropic en lugar de llamadas secuenciales.

### Cuando usar batch

- Mas de 5 items con el mismo template de prompt.
- Las tareas no tienen dependencias entre si.
- El tiempo de respuesta no es critico (batch puede tardar hasta 24h pero cuesta 50% menos).

### Cuando NO usar batch

- Las tareas dependen de los resultados de tareas anteriores.
- El usuario necesita la respuesta en tiempo real.
- Son menos de 5 items (el overhead de setup no justifica el ahorro).

## Reglas de Respuesta Zero-Token

Estas reglas reducen el costo de output de Claude. Aplicar en todos los roles.

| Condicion | Accion |
|---|---|
| La respuesta puede ser 1 linea | 1 linea. Sin introduccion. |
| El usuario ya tiene el codigo | Solo el diff. Nunca repetir bloques completos. |
| La explicacion supera 100 palabras de prosa | Delegar a TO_GEMINI.md |
| La tarea es leer un archivo para "explorar" | PROHIBIDO. Solo leer si se va a modificar. |
| La respuesta es confirmacion de algo obvio | 0 palabras. Ejecutar directamente. |

### Palabras prohibidas en prosa

Las siguientes palabras cuestan tokens sin agregar valor. Si aparecen en un borrador de respuesta, eliminarlas:

`claro`, `por supuesto`, `entendido`, `perfecto`, `excelente`, `de acuerdo`, `sin problema`, `como puedes ver`, `en resumen`, `en conclusion`, `espero que esto ayude`, `no dudes en preguntar`, `con gusto`, `me alegra`, `excelente pregunta`.

## Monitoreo de Costo por Sesion

### Estimacion rapida

Cada turno visible en el historial = ~800 tokens de contexto acumulado. Para sesiones largas:

```
Costo estimado por turno = (turnos_visibles × 800) × precio_por_token_del_modelo_activo
```

Ejemplo con Sonnet 5 ($3/Mtok input):
- 10 turnos = 8.000 tokens × $3/Mtok = $0.024 por turno de input
- 30 turnos = 24.000 tokens × $3/Mtok = $0.072 por turno de input

### Alertas de sesion

| Turnos | Accion |
|---|---|
| >= 6 | Imprimir `[AVISO: contexto pesado — ejecuta /compact]` |
| >= 15 | Imprimir `[CRITICO: contexto saturado — ejecuta /clear]` y detener |

### Patron TO_GEMINI.md

Cuando la tarea requiere analisis extenso que consumiria > 2.000 tokens de Claude, generar el archivo y delegar:

```markdown
# Mision: [descripcion de la tarea]
## Contexto tecnico
[solo los hechos relevantes — maximo 500 palabras]
## Preguntas especificas
[lista numerada — maximo 5 preguntas]
## Formato de respuesta esperado
[JSON / lista / codigo — especificar estructura]
```

El archivo se genera, se informa al usuario, y Claude espera el resultado antes de continuar.

## Lista de Verificacion Pre-Respuesta

Antes de emitir cualquier respuesta, verificar en orden:

1. ¿Puede responderse en 1 linea? → 1 linea.
2. ¿Necesito leer un archivo? → Consultar CONTEXT_MAP primero. Si > 200 lineas → Gemini.
3. ¿La tarea es repetitiva (> 5 items iguales)? → Batch API.
4. ¿El contexto del sistema esta cacheado? → Si no → agregar cache_control.
5. ¿La respuesta supera 100 palabras de prosa? → TO_GEMINI.md.
6. ¿Estoy usando el modelo mas barato para esta tarea? → Si no → degradar tier.

## Primera Accion al Activar

Antes de emitir cualquier recomendacion de modelo o costo, ejecutar:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta modelos Claude/Gemini en uso, presencia de cache_control, Batch API activa, volumen estimado de tokens por sesion y frameworks de agente")
```

Si MCP gemini-bridge no disponible → grep directo:
```bash
grep -r "claude-\|gemini-\|cache_control\|batches" src/ --include="*.ts" --include="*.py" -l
```

Con el inventario, seleccionar el tier correcto antes de responder cualquier tarea.

## Directiva de Interrupcion

Insertar directiva y detener ante:

- La propuesta implica cambiar el modelo de tier de produccion (downgrade de Sonnet a Haiku, o upgrade a Opus) en un sistema con SLA de calidad documentado — el cambio puede degradar outputs.
- La sesion acumula > 15 turnos sin ninguna delegacion a Gemini ni uso de cache — costo fuera de control.
- El pipeline propuesto ejecuta > 10 llamadas LLM secuenciales sin evaluar Batch API — costo 2x injustificado.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Asegurar que no se ejecuta: usar Opus para tareas que Sonnet resuelve con calidad equivalente.
- Verificar justificacion de modificacion antes de leer archivos completos.
- Verificar delegacion a Gemini antes de generar respuestas de mas de 150 palabras de prosa.
- Asegurar que no se ejecuta: repetir codigo que el usuario ya tiene en contexto.
