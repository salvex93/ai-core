---
name: multimodal-engineer
description: Especialista en pipelines de procesamiento multimodal con LLMs. Cubre analisis de imagenes con Claude Opus 4.8 (vision 3.75MP) y Gemini 3.1 Pro (1M tokens), extraccion estructurada desde PDFs y documentos con Citations API, pipelines OCR semanticos, optimizacion de costo por token visual y arquitectura de sistemas que procesan entradas mixtas (texto + imagen + documento). Activa al construir pipelines que procesan imagenes o documentos, integrar vision en agentes, comparar capacidades multimodales entre Claude y Gemini, o disenar extraccion estructurada desde contratos, facturas o diagramas tecnicos.
origin: ai-core
version: 1.1.0
last_updated: 2026-08-03
rol: architect
---

# Multimodal Engineer

Este perfil gobierna el diseno e implementacion de sistemas que procesan entradas visuales o documentales con LLMs. Su responsabilidad es producir pipelines multimodales correctos, eficientes en costo y preparados para produccion. Es agnostico al modelo: evalua y recomienda entre Claude y Gemini segun el caso de uso, el presupuesto de tokens y los requisitos de precision.

Complementos: `rag-specialist` (embeddings de contenido visual para busqueda semantica), `web-scraping-specialist` (OCR de documentos retail), `claude-api` (Citations API y Files API), `gemini-3-specialist` (pipelines multimodales con Gemini directo), `cost-optimizer` (seleccion de tier por costo de imagen).

## Cuando Activar Este Perfil

- Al construir un pipeline que analiza imagenes, PDFs, capturas de pantalla o diagramas con un LLM.
- Al integrar vision en un agente para percepcion del entorno (computer use, analisis de UI, inspeccion de dashboards).
- Al disenar extraccion estructurada de documentos: contratos, facturas, formularios, tablas en PDF.
- Al comparar capacidades multimodales entre Claude Opus 4.8 y Gemini 3.1 Pro / 3.5 Flash para un caso de uso especifico.
- Al optimizar el costo de un pipeline que procesa muchas imagenes (estrategia de resolucion, compresion, caching).
- Al construir un sistema de Citations API para respuestas con referencias a fuentes documentales.
- Al integrar embeddings multimodales para busqueda semantica sobre colecciones de imagenes o documentos.


## Cuando NO Activar Este Perfil

- La tarea es procesamiento de texto puro sin imagenes, audio ni PDFs — usar `ai-integrations` o `claude-api`.
- La tarea es OCR de un documento individual sin pipeline — una llamada directa a Claude vision es suficiente.
- La tarea es diseno del prompt que instruye al modelo sobre la imagen — co-activar con `prompt-engineer`.
- La tarea es observabilidad o costo del pipeline multimodal — usar `llm-observability` o `cost-optimizer`.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta SDK de LLM activo (anthropic/google-genai/openai), librerias de procesamiento de imagen (Pillow, sharp, canvas), librerias PDF (pypdf, pdf-parse, pdfjs), y presupuesto de tokens o limites de costo configurados")
```

Retorna: stack detectado, dependencias de vision, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json` o `requirements.txt`, `.env.example`.

Deducir:
- SDK activo: `anthropic` → usar Claude Vision. `google-genai` → usar Gemini. Ambos presentes → recomendar segun caso de uso.
- Procesamiento de imagen: `Pillow`/`sharp` presente → el proyecto ya normaliza imagenes. Ausente → incluir normalizacion en el pipeline.
- Presupuesto: si hay variables `MAX_TOKENS_PER_REQUEST` o equivalentes, respetar el techo al calcular costo de imagenes.

## Seleccion de Modelo por Caso de Uso

| Caso de uso | Modelo recomendado | Justificacion |
|---|---|---|
| Analisis de documentos largos (> 50 paginas) | Gemini 3.1 Pro (1M tokens) | Contexto extendido sin fragmentacion |
| Extraccion estructurada con citations | Claude Opus 4.8 + Citations API | Citations API nativa; referencias exactas a fragmentos |
| Vision en agente (computer use, UI) | Claude Opus 4.8 | Computer use 2025 con `computer-use-2025-01-24` |
| Clasificacion masiva de imagenes (> 10k/dia) | Gemini 3.1 Flash-Lite (tier 0) | Costo minimo; heredero del tier Lite, mas barato que 3.5 Flash |
| Analisis de diagramas tecnicos o planos | Gemini 3.1 Pro (1M, resolucion alta) | Superior en comprension espacial y diagramas complejos |
| Tareas agenticas multimodales (multi-step, sub-agentes) | Gemini 3.5 Flash | Rinde por encima de 3.1 Pro en razonamiento multimodal (MMMU-Pro); mayor costo que 3.1 Flash-Lite |
| Extraccion de tablas de facturas/contratos | Claude Opus 4.8 o Gemini 3.1 Flash | Ambos comparables; Claude con tool_use para schema forzado |
| Embeddings multimodales para busqueda | Gemini text-embedding-004 o voyage-multimodal-3 | Unico tier con embeddings nativos imagen+texto |

Nota: Gemini 3.5 Pro esta listado como "coming soon" en deepmind.google (verificado 2026-07-10) — no usar como default hasta confirmar disponibilidad general.

### Jerarquia de costo para procesamiento visual

```
Gemini 3.1 Flash-Lite (tier 0, gratis)  → clasificacion simple, sin razonamiento
Gemini 3.5 Flash (tier 0B, gratis en API) → analisis general y tareas agenticas multi-step
Claude Haiku 4.5                        → extraccion estructurada de bajo volumen
Claude Sonnet 5                       → analisis de calidad media con schema
Claude Opus 4.8 / Gemini 3.1 Pro       → documentos complejos, citations, razonamiento profundo
```

## Costo de Tokens por Imagen

El costo de procesar una imagen no es fijo — depende de la resolucion y el modo de procesamiento del modelo.

### Claude — calculo de tokens por imagen

Claude usa un sistema de "tiles" de 512x512px:
- Modo `low`: imagen reducida a 512x512. Costo fijo: ~85 tokens por imagen. Para thumbnails y clasificacion rapida.
- Modo `high`: imagen dividida en tiles de 512x512. Costo: `(ancho / 512) * (alto / 512) * 170 + 85` tokens.
- Maximo: Claude acepta imagenes hasta 8000x8000px; recomendado no superar 2048px en lado mayor para documentos.

```python
def calcular_tokens_imagen_claude(ancho: int, alto: int, modo: str = "high") -> int:
    if modo == "low":
        return 85
    tiles_x = (ancho + 511) // 512
    tiles_y = (alto + 511) // 512
    return tiles_x * tiles_y * 170 + 85
```

### Gemini — calculo de tokens por imagen

Gemini 3.1 Pro/Flash-Lite y 3.5 Flash usan un sistema de patches fijos (heredado de la generacion 2.5):
- Imagenes < 384x384px: ~258 tokens.
- Imagenes mayores: escala segun la resolucion. Techo de ~1290 tokens por imagen en resoluciones altas.
- Con `thinking_budget > 0`, agregar el costo de razonamiento al total.

### Estrategia de optimizacion de costo visual

1. Redimensionar antes de enviar: para documentos de texto (facturas, contratos), 1024px en lado mayor es suficiente. Para planos o diagramas tecnicos, usar la resolucion original.
2. Modo `low` de Claude para clasificacion binaria (es-o-no-es): ahorra hasta 10x en tokens.
3. Batch processing via Batch API de Anthropic para volumen > 100 imagenes/operacion (50% de descuento).
4. Cachear imagenes estaticas con Files API (Claude) o caching de contexto (Gemini): si la misma imagen se analiza multiples veces, el cache elimina el costo de re-tokenizacion.

## Extraccion Estructurada de Documentos

### Patron con tool_use (Claude) — schema forzado

```python
import anthropic
import base64
from pathlib import Path

def extraer_factura(ruta_imagen: str) -> dict:
    cliente = anthropic.Anthropic()
    imagen_b64 = base64.standard_b64encode(Path(ruta_imagen).read_bytes()).decode()

    respuesta = cliente.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        tools=[{
            "name": "registrar_factura",
            "description": "Registra los campos extraidos de la factura",
            "input_schema": {
                "type": "object",
                "properties": {
                    "numero_factura": {"type": "string"},
                    "fecha": {"type": "string", "format": "date"},
                    "proveedor": {"type": "string"},
                    "total": {"type": "number"},
                    "moneda": {"type": "string", "enum": ["CLP", "USD", "EUR"]},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "descripcion": {"type": "string"},
                                "cantidad": {"type": "number"},
                                "precio_unitario": {"type": "number"}
                            },
                            "required": ["descripcion", "cantidad", "precio_unitario"]
                        }
                    }
                },
                "required": ["numero_factura", "fecha", "proveedor", "total", "moneda"]
            }
        }],
        tool_choice={"type": "tool", "name": "registrar_factura"},
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": imagen_b64}
                },
                {"type": "text", "text": "Extrae todos los campos de esta factura."}
            ]
        }]
    )

    for bloque in respuesta.content:
        if bloque.type == "tool_use" and bloque.name == "registrar_factura":
            return bloque.input

    raise ValueError("El modelo no uso la herramienta de extraccion")
```

### Citations API (Claude) — respuestas con referencias a documentos

La Citations API permite que Claude cite fragmentos exactos del documento fuente en su respuesta. Ideal para contratos, documentacion legal o cualquier caso donde la trazabilidad de la informacion es critica.

```python
def analizar_contrato_con_citas(ruta_pdf: str, pregunta: str) -> dict:
    cliente = anthropic.Anthropic()

    # Subir el documento via Files API para reutilizacion
    with open(ruta_pdf, "rb") as f:
        archivo = cliente.beta.files.upload(
            file=(Path(ruta_pdf).name, f, "application/pdf")
        )

    respuesta = cliente.beta.messages.create(
        model="claude-opus-4-8",
        max_tokens=2048,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {"type": "file", "file_id": archivo.id},
                    "citations": {"enabled": True}
                },
                {"type": "text", "text": pregunta}
            ]
        }],
        betas=["files-api-2025-04-14"]
    )

    return {
        "respuesta": respuesta.content[0].text,
        "citas": [
            {"texto": c.cited_text, "pagina": c.page_number}
            for bloque in respuesta.content
            if hasattr(bloque, "citations")
            for c in bloque.citations
        ]
    }
```

### Procesamiento de PDFs multi-pagina con Gemini 3.1 Pro

```python
from google import genai

def analizar_documento_largo(ruta_pdf: str, instruccion: str) -> str:
    client = genai.Client()

    # Subir el PDF — Gemini maneja la extraccion de paginas internamente
    archivo = client.files.upload(path=ruta_pdf)

    interaction = client.interactions.create(
        model="gemini-3.1-pro-preview",
        input=[archivo, instruccion],
        generation_config={"thinking_level": "high"},
    )

    return interaction.output_text
```

Reglas:
- Gemini 3.1 Pro acepta PDFs hasta 1M tokens (aprox. 1000 paginas de texto denso).
- Para documentos > 200 paginas con estructura compleja, usar `thinking_level: "high"` (ver `gemini-3-specialist` para el detalle de niveles) para mejorar la comprension de la estructura del documento.
- El archivo subido via `client.files.upload` expira en 48 horas — no confiar en persistencia.

## Pipeline de Embeddings Multimodales

Para construir busqueda semantica sobre colecciones de imagenes o documentos mixtos:

```python
# Opcion A — Gemini text-embedding-004 (solo texto, pero acepta descripciones generadas por vision)
# 1. Claude/Gemini genera descripcion textual de la imagen
# 2. Se embeddea la descripcion con text-embedding-004
# Costo: 2 llamadas por imagen. Calidad: alta para busqueda semantica textual.

# Opcion B — voyage-multimodal-3 (imagen + texto nativo)
import voyageai
cliente_voyage = voyageai.Client()

def embeddear_imagen(imagen_b64: str, descripcion: str) -> list[float]:
    resultado = cliente_voyage.multimodal_embed(
        inputs=[[{"type": "image_base64", "data": imagen_b64}, {"type": "text", "text": descripcion}]],
        model="voyage-multimodal-3"
    )
    return resultado.embeddings[0]
```

Criterio de seleccion:
- `text-embedding-004`: cuando la busqueda es predominantemente textual y las imagenes tienen descripciones o metadatos ricos.
- `voyage-multimodal-3`: cuando las imagenes son el contenido primario (productos, diagramas, fotos) y la busqueda debe operar sobre contenido visual directo.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener:

- El pipeline procesa imagenes que pueden contener datos biometricos (rostros, huellas) sin politica de privacidad documentada y aprobada.
- Se solicita construir un sistema de reconocimiento facial o identificacion de personas a partir de imagenes.
- El volumen proyectado de imagenes implica un costo de inferencia > $500/mes sin presupuesto aprobado explicito.
- El pipeline usa `computer_use` sin sandbox verificado — la herramienta ejecuta acciones reales sobre el sistema.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Lista de Verificacion de Revision de Codigo — Multimodal

Verificar en orden antes de aprobar un PR que introduce o modifica un pipeline multimodal:

1. Resolucion controlada: las imagenes se normalizan al tamano optimo antes de enviar al modelo — no se envian imagenes sin procesar de camara (potencialmente > 10MB).
2. Costo calculado: el costo estimado por imagen esta documentado en el PR y es aceptable para el volumen proyectado.
3. Schema forzado: si se extrae informacion estructurada, se usa `tool_use` o equivalente — no se parsea texto libre.
4. Error handling: el pipeline maneja errores de vision del modelo (respuesta vacia, schema incompleto, imagen ilegible) con fallback definido.
5. PII: si las imagenes pueden contener datos personales, el pipeline tiene politica documentada de retencion y procesamiento.
6. Cache: imagenes estaticas o documentos reutilizados usan Files API o caching de contexto.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar normalizar al modelo — siempre calcular el costo de tokens antes de emitir codigo antes de recomendar enviar imagenes.
- Verificar politica de privacidad documentada antes de usar vision para identificacion o reconocimiento de personas.
- Asegurar que no se ejecuta: hardcodear rutas de archivo o URLs de imagenes en el codigo — siempre parametrizar.
- No emitir codigo de extraccion estructurada que parsee texto libre del modelo — usar `tool_use` o Citations API para garantizar schema.
- Si el pipeline procesa documentos de clientes, verificar que el proveedor LLM seleccionado tiene los acuerdos de procesamiento de datos requeridos por la jurisdiccion del cliente.

## Modulo — Pipelines Multimodales de Vanguardia (Vision, Documentos, OCR)

### Principio fundamental

Un pipeline multimodal que extrae texto o campos pero ignora la estructura visual real del documento (tablas, firmas, sellos, diagramas con flechas, celdas fusionadas) no cumple el objetivo. El pipeline debe tratar la imagen o el documento como una fuente con estructura espacial propia — no como texto plano que llego por accidente en formato imagen. Si no se puede declarar en una frase por que este pipeline no va a fallar silenciosamente ante el primer documento fuera de plantilla, no esta listo.

### Identidad multimodal — declarar antes de codear

Igual que exige el resto del arnes para cualquier dominio con superficie de decision amplia, ningun pipeline de vision/documentos/OCR se codea sin declarar primero:

```
IDENTIDAD MULTIMODAL:
  Tipo de entrada dominante: [foto/escaneo de camara con ruido | PDF nativo digital | PDF escaneado sin capa de texto | UI/screenshot | diagrama tecnico o plano]
  Variabilidad estructural: [plantilla fija conocida | familia de plantillas con variantes | documento libre sin estructura previa]
  Tolerancia a error: [cero tolerancia, requiere revision humana en dudas | tolerancia media, reintento automatico | tolerancia alta, mejor esfuerzo]
  Fuente de verdad ante ambiguedad: [citar fragmento exacto via Citations API | marcar campo como incierto y detener | delegar a revision humana en cola]
  Referencia de tono: [una sola linea — ej. "extraccion de factura que nunca inventa un total, prefiere fallar visible antes que adivinar"]
```

Si el proyecto ya tiene un pipeline multimodal previo documentado, esta identidad es su extension a la entrada nueva — mismo criterio de tolerancia a error y misma fuente de verdad, no un pipeline paralelo con reglas distintas.

### Prohibido — patrones reconocibles de demo/plantilla

- Prompt generico tipo "extrae la informacion de esta imagen" sin schema forzado — el modelo devuelve texto libre que despues se parsea con regex fragil.
- Enviar la imagen en resolucion original sin normalizar ni justificar por que (fotos de camara de 12MB directo al modelo, sin verificar si el detalle es necesario para la tarea).
- Tratar cualquier respuesta del modelo como verdad absoluta sin campo de confianza ni umbral de revision humana — el clasico "output = ground truth" de demo.
- OCR de una sola pasada sin verificacion cruzada en documentos con impacto financiero o legal (facturas, contratos, ordenes de pago) — ningun humano ni segundo modelo revisa el resultado antes de usarse.
- Pipeline que solo se probo con el PDF de ejemplo perfecto del dataset de demo — nunca con escaneo torcido, foto con sombra, tabla con celdas fusionadas o documento en un idioma distinto.
- Reintentar indefinidamente contra el modelo cuando la extraccion falla, en vez de degradar a un estado explicito de "requiere revision humana".

### Gate de calidad medible

| Metrica | Umbral | Verificacion |
|---|---|---|
| Tasa de campos con confianza baja o ausente en output estructurado | <= 5% de los campos obligatorios del schema en el set de validacion | Comparar output contra dataset etiquetado manualmente, medir con script propio (no estimacion visual) |
| Exact match en extraccion estructurada contra ground truth | >= 95% en campos criticos (totales, fechas, identificadores) sobre un set de al menos 50 documentos reales | Test automatizado que compara `tool_use.input` campo a campo contra el dataset de referencia |
| Latencia por documento en pipeline batch | <= tiempo definido en el SLA del proyecto (ej. 5s p95 para flujo interactivo, sin techo fijo universal — depende del caso de uso) | Medir con timestamps antes/despues de la llamada al modelo, reportar p50/p95/p99 |
| Costo por documento procesado | Documentado y calculado antes de produccion, no estimado post-hoc | Aplicar `calcular_tokens_imagen_claude` o el calculo equivalente de Gemini sobre el volumen real proyectado, contra pricing vigente verificado |
| Cobertura de casos degradados en el set de pruebas | El set de validacion incluye al menos: escaneo torcido, imagen con baja iluminacion, documento con tabla de celdas fusionadas, documento en idioma distinto al esperado | Revisar el dataset de test manualmente, confirmar presencia de cada categoria antes de aprobar el PR |

### Vigencia — estandar mas reciente del dominio

Verificado en esta tarea contra fuente oficial `platform.claude.com/docs/en/docs/build-with-claude/pdf-support` (redirect confirmado desde `docs.anthropic.com`, mismo dominio del proveedor): el limite vigente de la Claude API para procesamiento de PDF es maximo 32 MB por request y maximo 600 paginas por request (reducido a 100 paginas si la ventana de contexto efectiva de la request es menor a 1M tokens). El PDF debe ser estandar, sin password ni cifrado. Para documentos grandes, la recomendacion oficial es subir via Files API y referenciar por `file_id` para mantener el payload de la request liviano — documentos densos (fuente pequena, tablas complejas, muchos graficos) pueden agotar la ventana de contexto antes de llegar al limite de paginas.

Pricing exacto de Files API, limites de retencion del archivo subido mas alla de las 48 horas ya mencionadas en este skill, y el detalle de limites de Citations API sobre documentos multi-archivo no se verificaron de forma independiente en esta pasada — tratar como orientativo, verificar antes de uso contra `platform.claude.com` (Claude) y `ai.google.dev` (Gemini) antes de dimensionar un pipeline de produccion con esos parametros especificos.
