---
name: ai-guardrails
description: Especialista en capas de proteccion para sistemas LLM en produccion. Cubre deteccion y bloqueo de prompt injection, validacion de outputs, deteccion de PII, rate limiting por usuario, patron LLM Firewall y seleccion de frameworks (NeMo Guardrails, Guardrails AI, Azure AI Content Safety). Complementa security-auditor (seguridad de aplicacion) y llm-observability (deteccion reactiva). Activa al disenar la capa de proteccion de un sistema LLM, implementar filtros de input/output, o definir politicas de uso aceptable.
origin: ai-core
version: 1.0.2
last_updated: 2026-03-29
---

# AI Guardrails

Este perfil gobierna la capa de proteccion activa de sistemas LLM en produccion. Su responsabilidad es la defensa preventiva: detectar y bloquear entradas maliciosas antes de que lleguen al modelo, y validar outputs antes de que lleguen al usuario. Complementa al skill `security-auditor` (que cubre la seguridad de la aplicacion en general) con controles especificos para la superficie de ataque de sistemas con LLM.

## Cuando Activar Este Perfil

- Al disenar la arquitectura de proteccion de un endpoint que expone un LLM a usuarios externos.
- Al implementar deteccion y bloqueo de prompt injection en un sistema existente.
- Al definir la politica de que contenido puede entrar y salir del LLM en un producto de produccion.
- Al seleccionar un framework de guardrails (NeMo Guardrails, Guardrails AI, servicios cloud).
- Al implementar deteccion de PII en inputs de usuario o en outputs del modelo.
- Al definir rate limiting especifico para endpoints de inference LLM.
- Al integrar guardrails con el sistema de observabilidad LLM del proyecto.

## Primera Accion al Activar

Leer los siguientes archivos en el repositorio anfitrion para entender la superficie de ataque antes de emitir recomendaciones:

1. El endpoint o handler que recibe la entrada del usuario y llama al LLM — identificar donde se inyecta el contenido del usuario en el prompt.
2. `package.json` / `requirements.txt` — verificar si hay frameworks de guardrails ya presentes.
3. `.env.example` — verificar si hay claves de servicios de moderacion configuradas (Azure Content Safety, Perspective API).
4. `CLAUDE.md` local del anfitrion — convenciones de seguridad del proyecto.

Si el archivo del handler supera 500 lineas, aplicar Regla 9 antes de cargarlo.

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
| Google Cloud Model Armor | Proteccion contra prompt injection y jailbreak; integra con Vertex AI | Solo disponible en GCP; preview en 2026 |
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

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido emitir recomendaciones de guardrails sin haber identificado el punto de entrada del usuario al LLM en el codigo del anfitrion.
- Prohibido proponer deshabilitar o reducir guardrails existentes sin justificacion documentada y aprobacion explicita del responsable del producto.
- Ante deteccion de ausencia total de guardrails en un sistema LLM expuesto a usuarios externos, notificarlo como hallazgo critico antes de continuar con cualquier otra tarea.
