---
name: ai-guardrails
description: Especialista en capas de proteccion para sistemas LLM en produccion. Cubre deteccion y bloqueo de prompt injection, validacion de outputs, deteccion de PII, rate limiting por usuario, patron LLM Firewall y seleccion de frameworks (NeMo Guardrails, Guardrails AI, Azure AI Content Safety). Complementa security-auditor (seguridad de aplicacion) y llm-observability (deteccion reactiva). Activa al disenar la capa de proteccion de un sistema LLM, implementar filtros de input/output, o definir politicas de uso aceptable.
origin: ai-core
version: 1.3.1
last_updated: 2026-08-15
rol: auditor
---

# AI Guardrails

Este perfil gobierna la capa de proteccion activa de sistemas LLM en produccion **que el proyecto anfitrion construye**. Su responsabilidad es la defensa preventiva: detectar y bloquear entradas maliciosas antes de que lleguen al modelo, y validar outputs antes de que lleguen al usuario. Complementa al skill `security-auditor` (que cubre la seguridad de la aplicacion en general) con controles especificos para la superficie de ataque de sistemas con LLM.

Distinto de la proteccion del propio ai-core como agente: `secrets-guard.js` (hook UserPromptSubmit) filtra credenciales en el prompt del usuario, e `injection-guard.js` (hook SubagentStop) detecta indirect prompt injection en contenido externo (archivos, resultados de Gemini, paginas web) que vuelve al contexto via subagentes. Ninguno de los dos es parte de este skill — son infraestructura del arnes, siempre activa.

## Cuando Activar Este Perfil

- Al disenar la arquitectura de proteccion de un endpoint que expone un LLM a usuarios externos.
- Al implementar deteccion y bloqueo de prompt injection en un sistema existente.
- Al definir la politica de que contenido puede entrar y salir del LLM en un producto de produccion.
- Al seleccionar un framework de guardrails (NeMo Guardrails, Guardrails AI, servicios cloud).
- Al implementar deteccion de PII en inputs de usuario o en outputs del modelo.
- Al definir rate limiting especifico para endpoints de inference LLM.
- Al integrar guardrails con el sistema de observabilidad LLM del proyecto.


## Cuando NO Activar Este Perfil

- La tarea es auditar seguridad de la aplicacion (SQLi, XSS, dependencias CVE) — usar `security-auditor`.
- La tarea es instrumentar logs y dashboards del sistema LLM — usar `llm-observability`.
- La tarea es medir la calidad de los outputs del LLM (faithfulness, alucinaciones) — usar `llm-evals`.
- El sistema no tiene usuarios externos — los guardrails son para endpoints expuestos al publico.
- La tarea es rate limiting general de la API (sin relacion al LLM) — usar `devops-infra` o `backend-architect`.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta frameworks de guardrails, endpoints LLM expuestos, servicios de moderacion y politicas de filtrado")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si el archivo del handler supera 200 lineas, aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge) antes de cargarlo.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener:

- La tarea propone deshabilitar o bypassear una capa de guardrails existente en produccion.
- La tarea modifica la politica de uso aceptable del sistema sin aprobacion del responsable del producto.
- La implementacion requiere almacenar contenido de usuario potencialmente sensible en logs sin anonimizacion.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Patron LLM Firewall

El LLM Firewall es un middleware que se interpone entre la entrada del usuario y el LLM, y entre el LLM y la salida al usuario. Implementa dos capas de control:

```
Usuario -> [Input Guard] -> LLM -> [Output Guard] -> Usuario
```

### Input Guard

Responsabilidades:
- Deteccion de prompt injection: el input intenta modificar el comportamiento del sistema o extraer el system prompt.
- Deteccion de contenido prohibido segun la politica del producto (violencia, material ilegal, etc.).
- Deteccion de PII cuando la politica del producto prohibe procesar datos personales.
- Rate limiting: el usuario ha superado el limite de solicitudes permitidas.

Accion ante deteccion: rechazar la solicitud con un mensaje de error neutral que no revela la razon exacta del bloqueo. Registrar el evento en el sistema de observabilidad con severidad `warn` o `error` segun la categoria.

### Output Guard

Responsabilidades:
- Validar que el output sigue el schema esperado cuando se usa tool_use o output estructurado.
- Detectar si el output contiene PII que el modelo extrapolo del contexto o genero de forma alucinatoria.
- Detectar si el output contiene contenido prohibido generado por el modelo a pesar de las instrucciones del system prompt.

Accion ante deteccion: no enviar el output al usuario. Retornar un mensaje de fallback generico. Registrar el evento con el output original para revision humana posterior.

## Seleccion de Framework de Guardrails

| Framework | Caso de uso optimo | Limitaciones |
|---|---|---|
| NeMo Guardrails (NVIDIA) | Flujos conversacionales con rails declarativas en Colang; control fino de topicos permitidos y prohibidos | Curva de aprendizaje de Colang; overhead de latencia de ~200-500ms por turno |
| Guardrails AI | Validacion de output estructurado; integracion con Pydantic; ecosistema de validators de la comunidad | Enfocado en output validation, no en input injection detection |
| Azure AI Content Safety | Moderacion de contenido multi-categoria (hate, violence, sexual, self-harm) con niveles de severidad; sin codigo a mantener | Costo por llamada; latencia de red adicional; requiere cuenta Azure |
| Google Cloud Model Armor | Proteccion contra prompt injection y jailbreak; integra con Vertex AI; GA en GCP desde 2026-Q2 | Solo disponible en GCP; requiere proyecto Vertex AI activo |
| Implementacion propia (LLM Firewall) | Control total; sin dependencias externas; adaptado al dominio especifico del producto | Requiere mantenimiento activo; sin cobertura de categorias de contenido generico |

### Criterio de seleccion

Usar un servicio cloud (Azure Content Safety, Model Armor) cuando:
- El producto tiene requisitos de compliance que requieren moderacion de contenido auditable por terceros.
- El equipo no tiene capacidad para mantener rails declarativas o validators personalizados.

Usar NeMo Guardrails cuando:
- El sistema es conversacional y los rails deben cubrir el flujo completo de la conversacion, no solo el input o el output.
- Se necesita control declarativo sobre topicos permitidos sin escribir logica de clasificacion.

Usar Guardrails AI cuando:
- El output del LLM debe seguir un schema estricto (JSON, XML, formato especifico) y el modelo lo viola ocasionalmente.
- Se necesita reintento automatico hasta que el output sea valido.

Implementacion propia cuando:
- El dominio es muy especifico y los frameworks genericos producen demasiados falsos positivos.
- La latencia adicional de un servicio externo es inaceptable para el SLA del producto.

## Deteccion de PII

### Cuando detectar PII en el input

Si la politica del producto prohibe procesar datos personales (nombre, email, telefono, numero de documento, tarjeta de credito), el Input Guard debe detectarlos antes de enviar el input al LLM.

Herramientas por stack:

| Stack | Herramienta |
|---|---|
| Python | `presidio-analyzer` (Microsoft Presidio) — deteccion multi-idioma con reconocedores configurables |
| Node.js | `@presidio-dev/presidio-analyzer` (wrapper REST) o expresiones regulares para patrones conocidos |
| Cualquiera | Regex para patrones de alta precision: emails (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`), tarjetas de credito (Luhn check), numeros de documento por pais |

### Accion ante deteccion de PII

Tres estrategias posibles segun la politica del producto:

1. Bloqueo: rechazar la solicitud e informar al usuario que no puede incluir datos personales.
2. Anonimizacion: reemplazar el PII detectado por un placeholder antes de enviar al LLM (`[EMAIL]`, `[NOMBRE]`), y revertir el reemplazo en el output si el LLM devuelve el placeholder.
3. Registro y avance: permitir el procesamiento pero registrar el evento para revision de compliance.

La estrategia se define en la politica del producto, no en el codigo. El codigo implementa la estrategia seleccionada.

## Rate Limiting Especifico para LLM

El rate limiting de un endpoint LLM tiene una dimension adicional al rate limiting clasico: el costo por solicitud no es fijo sino proporcional a los tokens de entrada y salida. Un atacante puede generar pocas solicitudes con inputs muy grandes para agotar la cuota.

### Dimensiones de rate limiting para LLM

| Dimension | Descripcion | Implementacion |
|---|---|---|
| Solicitudes por minuto | Limite clasico de requests | Middleware de rate limiting estandar (express-rate-limit, slowapi) |
| Tokens de entrada por solicitud | Limitar el tamano del input del usuario | Contar tokens antes de enviar al LLM; rechazar si supera el umbral |
| Tokens acumulados por usuario/hora | Presupuesto de tokens por periodo | Contador en Redis o base de datos con TTL |
| Costo acumulado por usuario/mes | Para productos con facturacion al consumidor | Integrar con el sistema de billing del producto |

### Patron de implementacion del presupuesto de tokens

```python
# Pseudocodigo — adaptar al stack del anfitrion
async def verificar_presupuesto_tokens(usuario_id: str, tokens_estimados: int) -> bool:
    clave = f"tokens:{usuario_id}:{fecha_actual_hora}"
    tokens_usados = await redis.get(clave) or 0

    if int(tokens_usados) + tokens_estimados > LIMITE_TOKENS_POR_HORA:
        return False  # presupuesto agotado

    await redis.incrby(clave, tokens_estimados)
    await redis.expire(clave, 3600)  # TTL de 1 hora
    return True
```

## Integracion con LLM Observability

Los eventos de guardrails son senales criticas para el sistema de observabilidad. Cada deteccion debe emitir un span de OpenTelemetry con los siguientes atributos:

```
gen_ai.guardrail.type: "input_injection" | "output_pii" | "content_policy" | "rate_limit" | "schema_violation"
gen_ai.guardrail.action: "blocked" | "anonymized" | "logged"
gen_ai.guardrail.severity: "low" | "medium" | "high" | "critical"
gen_ai.user.id: <hash del ID de usuario, no el ID en claro>
```

No registrar el contenido del input bloqueado en el span si contiene PII. Registrar unicamente la categoria del bloqueo y los primeros 50 caracteres del input con los datos sensibles enmascarados.

Delegar la configuracion de alertas basadas en estos eventos al skill `llm-observability`. Una tasa de bloqueo superior al 5% sostenida durante 10 minutos puede indicar un ataque activo o un falso positivo sistematico — ambos requieren atencion.

## Vectores de Evasion Modernos (2026)

### Interleaved Thinking como canal opaco

El beta `interleaved-thinking-2025-05-14` de Anthropic introduce bloques `thinking` intercalados entre pasos de tool use. Estos bloques son invisibles al Output Guard si el sistema solo inspeciona el texto final. En modelos con adaptive thinking (Sonnet 5, Opus 5, Opus 4.8, Claude Fable 5), el interleaved thinking entre llamadas a herramientas esta disponible de forma automatica, sin necesidad de activar el header beta — ese header aplica solo a modelos legacy. Consecuencia para el guardrail: no asumir que la inspeccion de bloques thinking es opcional condicionada a un flag explicito en el codigo del anfitrion; verificar primero que modelo esta en uso antes de concluir que el canal esta cerrado por default. Riesgos:

- Un prompt injection bien diseñado puede instruir al modelo a razonar en el bloque `thinking` sobre como eludir la politica, y luego emitir una respuesta aparentemente conforme.
- Los bloques `thinking` pueden contener razonamiento sobre el system prompt, filtrando estructura interna del sistema.

Contramedidas:
1. Si el sistema usa `interleaved-thinking-2025-05-14`, el Output Guard debe inspeccionar tambien los bloques `thinking` antes de liberar la respuesta.
2. En el system prompt: incluir instruccion explicita de que el bloque de razonamiento interno no puede contener instrucciones para eludir las politicas del sistema.
3. Registrar `thinking_tokens_used` como metrica de observabilidad — un spike anomalo puede indicar razonamiento evasivo activo.

### Tool Search Tool y catalogo de herramientas fuera del prompt inicial

Con Tool Search Tool (`defer_loading: true` por definicion de tool), las definiciones completas de herramientas ya no viven todas en el system prompt inicial — se cargan bajo demanda durante la conversacion. Cualquier guardrail que inspeccione el catalogo de tools directamente en el system prompt (para validar scopes permitidos o detectar una tool inyectada/alterada) debe moverse a inspeccionar el resultado de la busqueda de tools y cada carga diferida individual, no solo el prompt inicial. Aplica el mismo criterio a Programmatic Tool Calling (tool `code_execution_20260120` con `allowed_callers`): el Output Guard debe cubrir tambien el codigo generado que invoca herramientas de forma programatica, no solo las respuestas `tool_use` directas del modelo.

```python
# Inspeccion de bloques thinking en la respuesta
for bloque in respuesta.content:
    if bloque.type == "thinking":
        resultado = input_guard.analizar(bloque.thinking)
        if resultado.bloqueado:
            raise GuardrailViolation("thinking_evasion", bloque.thinking[:100])
```

### Google Cloud Model Armor (GA — GCP)

Para sistemas desplegados en GCP, Model Armor es ahora la opcion de produccion recomendada sobre implementacion propia de Input Guard. Caracteristicas GA:

- Deteccion de prompt injection y jailbreak con modelos especializados de Google.
- Integracion nativa con Vertex AI — sin latencia de red adicional si el LLM corre en Vertex.
- API REST independiente del modelo: compatible con cualquier LLM, no solo Gemini.
- SLA de disponibilidad del 99.9% con soporte de compliance SOC 2 / ISO 27001.

Criterio de adopcion: si el proyecto ya corre en GCP y tiene requisitos de compliance auditables por terceros, Model Armor reemplaza la implementacion propia del Input Guard. Si el proyecto es multi-cloud o on-premise, mantener implementacion propia con Presidio + clasificador custom.

### Adaptive Thinking (Opus 5 / Opus 4.8) — superficie de ataque ampliada

`task_budgets` permite al modelo asignar razonamiento adaptativo por paso. El presupuesto no esta acotado por defecto en la API. Modelo recomendado: **Opus 5** (`claude-opus-5`, lanzado 2026-07-24, mismo pricing que Opus 4.8) — Opus 4.8 sigue soportado como fallback documentado si el proyecto aun no migro. Guardrail obligatorio para sistemas con Opus 5 u Opus 4.8:

- Definir `max_tokens` global y `budget_tokens` maximo por paso para acotar el costo de un ataque de tokens.
- El rate limiting debe incluir `thinking_tokens` en el calculo del presupuesto por usuario — un atacante puede forzar razonamiento extensivo con inputs de complejidad artificial.

## Lista de Verificacion de Revision de Codigo — Guardrails

Verificar en orden antes de aprobar un PR que modifica la capa de guardrails:

1. Cobertura: el Input Guard cubre los vectores LLM01 (prompt injection) y LLM10 (consumo ilimitado) del OWASP LLM Top 10.
2. Cobertura: el Output Guard cubre LLM05 (manejo inseguro de output) y LLM06 (agencia excesiva).
3. Fallback: si el servicio de guardrails externo no esta disponible, el sistema tiene un comportamiento degradado seguro (bloquear por defecto, no permitir por defecto).
4. Logs: los eventos de bloqueo se registran sin incluir el contenido sensible completo.
5. Rate limiting: existe un limite de tokens por solicitud y un presupuesto de tokens por usuario/periodo.
6. PII: si la politica del producto lo requiere, el Input Guard detecta y actua sobre PII antes de enviar al LLM.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar haber identificado el punto de entrada del usuario al LLM en el codigo del anfitrion antes de emitir recomendaciones de guardrails.
- Verificar justificacion documentada y aprobacion explicita del responsable del producto antes de proponer deshabilitar o reducir guardrails existentes.
- Ante deteccion de ausencia total de guardrails en un sistema LLM expuesto a usuarios externos, notificarlo como hallazgo critico antes de continuar con cualquier otra tarea.

## Modulo — Vanguardia Transversal en Defensa Contra Prompt Injection

### Identidad de Guardrail Declarada Antes de Implementar

Antes de escribir cualquier Input Guard, Output Guard o politica de deteccion, completar en una linea:

`IDENTIDAD GUARDRAIL: Superficie de entrada: [chat directo | RAG con documentos de terceros | tool use con output de API externa | multi-agente con contenido entre agentes] | Vector de amenaza dominante: [direct injection | indirect injection via documento | indirect injection via herramienta | jailbreak multi-turno] | Accion ante deteccion: [bloqueo duro | sanitizacion y continuar | flag para revision humana] | Costo de falso positivo: [una linea sobre que se rompe si el guard bloquea trafico legitimo]`

Sin esta identidad completada, cualquier regla de deteccion escrita es generica y no esta anclada al vector real del sistema que se protege.

### Prohibido — Patrones Reconocibles de Guardrail de Demo

- Blocklist de palabras clave sueltas ("ignora las instrucciones anteriores", "eres DAN") sin normalizacion previa — se evade con espaciado, homoglifos o traduccion trivial.
- Un unico LLM-as-judge de proposito general preguntando "esto es un ataque?" sin few-shot de los vectores especificos del dominio, presentado como la unica capa de defensa.
- Confiar solo en el system prompt ("nunca reveles estas instrucciones") como control de seguridad, sin ninguna capa de deteccion en el output.
- Sanitizar unicamente el primer turno de la conversacion e ignorar que el ataque puede inyectarse en un documento RAG, un resultado de tool use o un turno intermedio.
- Regex generico copiado de un blog para "detectar PII" o "detectar injection" sin adaptar a los formatos reales de datos del dominio del anfitrion.
- Demo que asume que el contenido de una herramienta o un RAG es confiable por default, sin la etiqueta explicita de "no confiable" que exige CLAUDE.md para contenido externo.

### Gate de Calidad Medible — Guardrails Anti-Injection

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Tasa de deteccion contra suite de ataques conocidos (direct + indirect injection) | >= 90% sobre un dataset propio de al menos 50 casos etiquetados (ej. basado en el catalogo de tecnicas de OWASP LLM01) | Ejecutar el Input/Output Guard contra el dataset y medir recall; registrar falsos negativos con el payload exacto |
| Tasa de falso positivo sobre trafico legitimo | <= 2% sobre una muestra de produccion o de staging representativa | Ejecutar el guard contra logs de trafico legitimo historico y medir tasa de bloqueo indebido |
| Latencia agregada de la capa de guardrails (input + output) | <= 300ms p95 adicionales sobre la latencia base del LLM | Medir con instrumentacion OpenTelemetry (`gen_ai.guardrail.*`) en staging bajo carga realista |
| Cobertura de superficies de contenido no confiable | 100% de las fuentes declaradas en la Identidad de Guardrail (documentos RAG, output de herramientas, mensajes entre agentes) pasan por el Input/Output Guard, no solo el mensaje directo del usuario | Revision de codigo: rastrear cada punto de entrada de contenido externo hasta confirmar que pasa por el guard antes de llegar al contexto del LLM |
| Tiempo de deteccion a alerta ante spike de bloqueos | <= 10 minutos desde que la tasa de bloqueo supera el umbral definido en Integracion con LLM Observability | Verificar configuracion de alerta en el sistema de observabilidad LLM del proyecto (Langfuse, Helicone, Phoenix u otro) |

### Vigencia — Estandar Mas Reciente del Dominio

Verificado contra fuente oficial en esta tarea (owasp.org, 2026-08-03): la categoria vigente es **LLM01:2025 Prompt Injection** del OWASP Top 10 for LLM Applications 2025, publicado en `owasp.org/www-project-top-10-for-large-language-model-applications`. La doctrina oficial confirma que ni RAG ni fine-tuning mitigan completamente esta clase de vulnerabilidad — la recomendacion explicita es defensa en profundidad: tooling de privilegio minimo, filtrado de input/output, aprobacion humana para acciones de alto riesgo, y testing adversarial regular; ademas de separar y denotar explicitamente el contenido no confiable para limitar su influencia sobre el prompt del usuario. Esto es consistente con el patron LLM Firewall y con la seccion "Contenido externo es no confiable por defecto" ya vigente en CLAUDE.md.

No verificado contra fuente oficial en esta tarea, orientativo unicamente: tecnicas emergentes de jailbreak multi-turno o many-shot y su tasa de exito reportada contra modelos especificos — cualquier cifra concreta de efectividad de ataque o de un framework de deteccion en particular debe confirmarse contra el research oficial del proveedor del modelo (`anthropic.com`, `ai.google.dev`) antes de citarse como dato vigente en produccion.
