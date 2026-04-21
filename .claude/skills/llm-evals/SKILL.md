---
name: llm-evals
description: Especialista en evaluacion sistematica de outputs de LLM. Cubre diseno de datasets de evaluacion, metricas automatizadas (faithfulness, answer relevancy, hallucination rate), LLM-as-judge, integracion de evals en CI/CD y frameworks de evaluacion (deepeval, promptfoo, RAGAS). Activa al disenar un pipeline de evals, detectar regresiones en calidad de outputs, evaluar cambios de modelo o prompt, o medir la calidad de un sistema RAG.
origin: ai-core
version: 1.2.3
last_updated: 2026-04-16
---

# LLM Evals — Especialista en Evaluacion Sistematica de Outputs

Este perfil gobierna la medicion objetiva de la calidad de outputs de LLM en sistemas de produccion. Su dominio no es el modelo en si, sino el ciclo de evaluacion: definir que medir, construir los datasets de prueba, ejecutar las metricas y detectar regresiones antes de que lleguen a produccion. Complementa al skill `ai-integrations`, que cubre la integracion del LLM como feature; este skill cubre como saber si esa feature funciona correctamente.

## Cuando Activar Este Perfil

- Al disenar un pipeline de evaluacion para un sistema que usa LLMs como parte de la logica de producto.
- Al medir la calidad de un sistema RAG: faithfulness, relevancia de recuperacion, tasa de alucinaciones.
- Al comparar dos versiones de prompt o dos modelos distintos sobre el mismo dataset de referencia.
- Al detectar regresiones de calidad despues de un cambio de modelo, prompt o configuracion.
- Al integrar evals automatizados en el pipeline de CI/CD como gate de calidad antes del despliegue.
- Al definir el golden dataset de una operacion critica de IA.
- Al evaluar la efectividad de las defensas contra prompt injection en el sistema.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta frameworks de evaluacion (deepeval/promptfoo/RAGAS/langsmith), datasets existentes y API keys de evaluacion")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si ningun framework ni dataset esta disponible, declararlo y proponer la estrategia de evaluacion minima viable antes de continuar.

Si archivos de dataset superan 500 lineas o 50 KB, aplicar Regla 9:

```
node scripts/mcp-gemini.js --mission "Analiza este dataset de evaluacion e identifica: distribucion de casos por categoria, casos sin ground truth definido, casos duplicados o contradictorios, y cobertura de los escenarios criticos del sistema" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir recomendaciones hasta tener el plan aprobado.

- La tarea propone eliminar o reducir el conjunto de evals de regresion existente sin justificacion documentada.
- La tarea integra evals en CI/CD bloqueando deploys basandose en una metrica sin umbral acordado y documentado.
- La tarea cambia el modelo LLM-as-judge en un pipeline de evaluacion de produccion (afecta a todas las metricas historicas comparables).
- La tarea introduce cambios en el golden dataset de produccion sin proceso de revision humana documentado.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Tipos de Evaluacion

### Por automatizacion

| Tipo | Descripcion | Cuando usar |
|---|---|---|
| Eval por schema | Valida que el output cumpla un formato estructurado (JSON, campos obligatorios) | Siempre que el LLM produce output estructurado |
| Eval determinista | Compara el output contra un valor exacto esperado | Clasificaciones con categorias fijas, extraccion de datos con ground truth |
| LLM-as-judge | Un modelo evaluador puntua el output del modelo evaluado segun criterios de calidad | Outputs de texto libre donde la calidad es subjetiva |
| Eval humana | Revisores humanos puntuan outputs usando una rubrica | Flujos criticos de negocio, validacion inicial de metricas automatizadas |

### Por proposito

| Tipo | Descripcion |
|---|---|
| Eval de regresion | Detectar degradacion de calidad despues de un cambio (modelo, prompt, configuracion) |
| Eval A/B | Comparar dos variantes (prompt v1 vs v2, modelo A vs modelo B) sobre el mismo dataset |
| Eval de estrés | Evaluar el comportamiento ante inputs edge case, prompt injection y entradas malformadas |
| Eval de sistema RAG | Medir faithfulness, relevancia de recuperacion y completitud de la respuesta generada |

## Metricas Estandar

### Para sistemas RAG (RAGAS)

| Metrica | Descripcion | Umbral minimo recomendado |
|---|---|---|
| Faithfulness | La respuesta generada es factualmente consistente con los chunks recuperados | 0.85 |
| Answer Relevancy | La respuesta responde directamente la pregunta del usuario | 0.80 |
| Context Precision | Los chunks recuperados son relevantes para la pregunta | 0.75 |
| Context Recall | La informacion necesaria para responder esta en los chunks recuperados | 0.80 |
| Hallucination Rate | Porcentaje de respuestas con afirmaciones sin soporte en el contexto recuperado | < 5% |

Un cambio que degrada cualquiera de estas metricas en mas de 5 puntos porcentuales requiere revision antes del despliegue.

Alternativa nativa para Faithfulness: la Citations API de Anthropic (`claude-sonnet-4-6` y superiores) devuelve junto a cada fragmento de respuesta la cita exacta del documento fuente que lo respalda. Esto convierte la verificacion de faithfulness en una operacion determinista en lugar de una evaluacion LLM-as-judge sujeta a variabilidad. Cuando el sistema RAG usa Claude como modelo de generacion, usar Citations API como primera capa de verificacion antes de aplicar RAGAS o un juez LLM externo.

```python
# La respuesta incluye citas estructuradas: cada afirmacion tiene una referencia al chunk fuente
respuesta = cliente.messages.create(
    model="claude-sonnet-4-6",
    messages=[{
        "role": "user",
        "content": [{"type": "document", "source": {"type": "text", "media_type": "text/plain", "data": chunk}, "citations": {"enabled": True}} for chunk in chunks_recuperados]
        + [{"type": "text", "text": pregunta}]
    }]
)
# Verificar que cada afirmacion en el output tiene una cita: ausencia de cita es un indicador de alucinacion
```

### Para outputs de texto libre (LLM-as-judge)

| Metrica | Descripcion |
|---|---|
| Correctitud | El output es factualmente correcto respecto al ground truth o contexto dado |
| Completitud | El output cubre todos los puntos requeridos por la instruccion |
| Formato | El output sigue el formato esperado (longitud, estructura, idioma) |
| Seguridad | El output no contiene contenido danino, instrucciones de sistema filtradas ni datos sensibles |

## Golden Dataset

El golden dataset es el conjunto de referencia que define el comportamiento correcto esperado del sistema para los casos de uso criticos. Es el artefacto central de cualquier estrategia de evals.

### Estructura de un item del golden dataset

```json
{
  "id": "eval-001",
  "categoria": "resumen_contrato",
  "input": {
    "sistema": "<system_prompt de referencia>",
    "usuario": "<input del caso de prueba>",
    "contexto": "<chunks RAG si aplica>"
  },
  "ground_truth": "<respuesta de referencia aprobada por un experto>",
  "criterios": ["cita al menos dos clausulas", "no alucina terminos no presentes en el contrato"],
  "umbral_minimo": 0.80,
  "ultima_revision": "2026-03-26",
  "revisor": "salvex93"
}
```

### Protocolo de mantenimiento del golden dataset

- Todo item del golden dataset tiene un `revisor` humano identificado que aprobo el ground truth.
- Cuando cambia el comportamiento esperado del sistema (cambio de requisito de negocio), los items afectados se actualizan con un nuevo ground truth y una nueva fecha de `ultima_revision`.
- Los items con mas de 6 meses sin revision se marcan como candidatos a re-validacion.
- El golden dataset se versiona en Git igual que el codigo. Cada cambio va con un commit que describe el motivo del cambio de comportamiento esperado.

## Integracion en CI/CD

La evaluacion automatizada se ejecuta como paso del pipeline antes del despliegue a produccion. Un fallo en el gate de calidad bloquea el merge igual que un test unitario que falla.

### Estructura del paso de evals en CI/CD

```yaml
# Ejemplo de paso en un pipeline CI/CD generico
evals:
  stage: quality-gate
  script:
    - python -m deepeval test run tests/evals/  # o el comando del framework detectado
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  artifacts:
    reports:
      junit: eval-results.xml  # para visualizacion en la UI del CI/CD
```

### Umbrales de bloqueo

Los umbrales se definen por metrica y por operacion. Un umbral global unico para todo el sistema no es accionable; una operacion de clasificacion simple y un sistema RAG complejo tienen tolerancias distintas.

```json
{
  "operacion": "resumen_contrato",
  "umbrales_bloqueo": {
    "faithfulness": 0.85,
    "answer_relevancy": 0.80,
    "schema_conformidad": 1.00
  },
  "accion_si_falla": "bloquear_merge"
}
```

## Frameworks de Evaluacion

### deepeval (Python)

Framework orientado a test unitarios de LLM. Permite definir metricas como clases de Python y ejecutarlas con pytest.

```python
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import AnswerRelevancyMetric, FaithfulnessMetric

def test_resumen_contrato():
    caso = LLMTestCase(
        input="Resume las clausulas de penalizacion",
        actual_output=sistema_rag.consultar("Resume las clausulas de penalizacion"),
        retrieval_context=["...chunk 1...", "...chunk 2..."],
        expected_output="El contrato establece una penalizacion del 10%..."  # ground truth
    )
    assert_test(caso, [
        AnswerRelevancyMetric(threshold=0.80),
        FaithfulnessMetric(threshold=0.85),
    ])
```

### promptfoo (Node.js / CLI)

Framework de evaluacion basado en configuracion YAML. Ejecuta un conjunto de casos de prueba contra multiples variantes de prompt o modelos y compara resultados.

```yaml
# promptfooconfig.yaml
prompts:
  - prompts/resumen-contrato/v1.txt
  - prompts/resumen-contrato/v2.txt

providers:
  - anthropic:claude-sonnet-4-6
  - anthropic:claude-haiku-4-5-20251001

tests:
  - vars:
      documento: "{{contrato_ejemplo}}"
    assert:
      - type: llm-rubric
        value: "La respuesta cita al menos dos clausulas del documento y no inventa terminos"
      - type: javascript
        value: "output.length > 100 && output.length < 1000"
```

```bash
# Ejecutar la evaluacion
npx promptfoo eval

# Ver los resultados comparativos en la UI web
npx promptfoo view
```

### RAGAS (Python)

Framework especializado en evaluacion de pipelines RAG. Requiere el dataset con las columnas `question`, `answer`, `contexts` y opcionalmente `ground_truth`.

```python
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision

datos = Dataset.from_list([
    {
        "question": "Cual es la penalizacion por incumplimiento?",
        "answer": respuesta_del_sistema,
        "contexts": chunks_recuperados,
        "ground_truth": "La penalizacion es del 10% del valor total del contrato.",
    }
])

resultado = evaluate(
    dataset=datos,
    metrics=[faithfulness, answer_relevancy, context_precision],
)

print(resultado)  # DataFrame con puntuaciones por metrica
```

### Langfuse (Python / TypeScript — self-hosteable)

Plataforma de observabilidad y evaluacion open-source. Combina trazabilidad de producccion con evals online (LLM-as-judge ejecutado sobre traces en tiempo real) y offline (batch evals sobre datasets almacenados). Se integra directamente con el skill `llm-observability`.

```python
import langfuse
from langfuse import Langfuse

cliente = Langfuse()

# Registrar un dataset de evaluacion en Langfuse
dataset = cliente.create_dataset(name="resumen-contratos-v1")
cliente.create_dataset_item(
    dataset_name="resumen-contratos-v1",
    input={"pregunta": "Resume las clausulas de penalizacion"},
    expected_output="El contrato establece una penalizacion del 10%...",
)

# Ejecutar evals sobre el dataset y registrar resultados
for item in cliente.get_dataset("resumen-contratos-v1").items:
    respuesta = sistema_rag.consultar(item.input["pregunta"])

    # LLM-as-judge: el score se registra en Langfuse vinculado al item del dataset
    item.link(
        trace_or_observation=cliente.trace(name="eval-run"),
        run_name="eval-run-2026-03-28",
    )
    cliente.score(
        trace_id=item.trace_id,
        name="faithfulness",
        value=evaluar_faithfulness(respuesta, item.input),
        comment="Evaluacion automatica via LLM-as-judge",
    )
```

Langfuse es la opcion recomendada para proyectos que ya instrumentan observabilidad con el skill `llm-observability`. Un eval registrado en Langfuse es un score vinculado a un trace de produccion: la trazabilidad y la evaluacion comparten la misma fuente de verdad.

### Braintrust (Python / TypeScript — SaaS)

Plataforma de evals orientada a flujos de trabajo A/B entre versiones de prompt y modelos. Su diferenciador es el playground integrado con scoring en tiempo real y el SDK ligero que no requiere infraestructura propia.

```typescript
import { Eval } from "braintrust";

Eval("resumen-contratos", {
  data: () => [
    {
      input: "Resume las clausulas de penalizacion",
      expected: "El contrato establece una penalizacion del 10%...",
    },
  ],
  task: async (input) => sistema_rag.consultar(input),
  scores: [
    // LLM-as-judge usando el modelo juez configurado en el proyecto
    async ({ input, output, expected }) => ({
      name: "faithfulness",
      score: await evaluar_faithfulness(output, input),
    }),
  ],
});
```

```bash
# Ejecutar y publicar resultados al dashboard de Braintrust
npx braintrust eval src/evals/resumen-contratos.eval.ts
```

Braintrust es preferible cuando el equipo no puede operar infraestructura propia y necesita un dashboard de comparacion A/B entre versiones de prompt con historial persistente. Langfuse es preferible cuando la organizacion requiere self-hosting por requisitos de compliance o ya tiene observabilidad instrumentada.

## Lista de Verificacion de Revision de Codigo — LLM Evals

Verificar en orden antes de aprobar un PR que introduce o modifica un sistema de evaluacion.

1. Golden dataset: cada caso tiene ground truth aprobado por un revisor humano identificado, con fecha de revision.
2. Metricas: cada metrica tiene un umbral numerico definido y documentado. Sin umbral, la metrica no es accionable.
3. Cobertura: el dataset cubre los escenarios criticos del sistema (casos normales, edge cases, casos de fallo esperado).
4. CI/CD: el gate de calidad esta integrado en el pipeline y bloquea el merge si los umbrales no se cumplen.
5. LLM-as-judge: si se usa un modelo como juez, el modelo y el prompt del juez estan versionados y documentados.
6. Regresion: existe un mecanismo para comparar los resultados actuales contra el historial de evals anteriores.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido proponer un umbral de bloqueo en CI/CD sin haber ejecutado al menos una ejecucion de referencia sobre el dataset actual para calibrarlo.
- Prohibido modificar el golden dataset sin proceso de revision humana documentado.
- Prohibido usar el mismo modelo como generador del output y como juez LLM-as-judge en el mismo pipeline de evaluacion sin declarar el conflicto de interes y mitigarlo.
- Prohibido desplegar un cambio de modelo o prompt en produccion sin comparar sus metricas contra la linea base del golden dataset.
