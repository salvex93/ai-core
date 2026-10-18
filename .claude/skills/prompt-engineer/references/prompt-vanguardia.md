## Modulo — Vanguardia Transversal en Arquitectura de System Prompts

### Identidad Declarada Antes de Ejecutar

Antes de producir cualquier system prompt, few-shot set o schema de output para un caso nuevo, llenar en una linea:

`IDENTIDAD DE PROMPT: Contrato de rol: [asistente de dominio cerrado / agente con herramientas / juez evaluador / extractor estructurado] | Fuente de verdad del comportamiento: [golden dataset existente / especificacion del cliente / ninguna aun] | Mecanismo de formato: [tool_use estricto / output_config.format json_schema / prefill / texto libre con instrucciones] | Tolerancia a ambiguedad del dominio: [cero — rechaza fuera de scope / baja — pide aclaracion / alta — mejor esfuerzo]`

Sin este bloque llenado con valores reales del caso (no las opciones entre corchetes copiadas literal), no se redacta el prompt. Un prompt escrito sin declarar el contrato de rol termina mezclando las cuatro secciones de la Anatomia de un Prompt de Produccion en vez de mantenerlas separadas.

### Prohibido — Patrones Reconocibles de Prompt Generico

- System prompt que abre con "Eres un asistente util y honesto" o variantes sin restriccion de scope inmediatamente despues — el rol sin limite es la version prompt-engineering del div sin clase.
- Few-shot set con un solo ejemplo del caso feliz y cero ejemplos de caso limite o de fallo esperado — el modelo aprende el patron pero nunca el borde del patron.
- Pedir JSON "en formato JSON valido, sin texto adicional" dentro del texto del prompt cuando el SDK ya expone `tool_use` estricto o `output_config.format` — es la version textual de reinventar una validacion que la plataforma ya resuelve de forma determinista.
- Instruccion de seguridad generica tipo "no hagas nada malicioso" sin marcadores XML que delimiten el contenido no confiable (`<user_input>`, `<retrieved_context>`) — declarar la intencion sin dar al modelo una forma estructural de reconocer el limite.
- CoT forzado via `<thinking>` manual en un modelo con extended thinking nativo disponible, duplicando tokens de razonamiento que el modelo ya factura aparte.
- Prompt candidato desplegado a produccion con el mismo texto que el prompt anterior salvo un ajuste cosmetico, sin archivo de version nuevo ni entrada en `CHANGELOG.md` — versionado de nombre, no de artefacto.

### Gate de Calidad Medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de few-shot por categoria | >= 2 ejemplos en cada una de: caso normal, caso limite, caso de fallo esperado | Conteo manual o script sobre `examples.v{n}.jsonl` antes de aprobar version |
| Degradacion de eval de regresion | <= 5 puntos porcentuales en cualquier metrica del golden dataset frente a la version activa | Ejecucion del golden dataset via `llm-evals` y comparacion numerica documentada en el PR |
| Cache hit rate del system prompt | >= 50% en `cache_read_input_tokens` sobre el total de tokens de entrada cacheables, tras el periodo de calentamiento | Inspeccion de `cache_creation_input_tokens` / `cache_read_input_tokens` en la respuesta real de la API, no estimacion |
| Longitud del system prompt sin justificacion | <= 4000 tokens | Conteo de tokens del archivo `system.v{n}.txt` con el tokenizer del proveedor antes de commitear |
| Tasa de fuga de formato en output estructurado | 0% de respuestas que incumplen el schema sobre una muestra de al menos 20 llamadas | Validacion programatica del output contra el JSON Schema declarado (ej. `ajv` o equivalente), no inspeccion visual |

### Vigencia — Estandar Mas Reciente del Dominio

Verificado contra fuente oficial en esta tarea (`platform.claude.com/docs/en/build-with-claude/structured-outputs`, consultado 2026-08-03): Anthropic expone ahora `output_config.format` con `type: "json_schema"` como mecanismo GA de output estructurado a nivel de respuesta completa, complementario a `strict: true` en definiciones de `tool_use` — son dos caracteristicas distintas, no la misma bajo otro nombre. `output_config.format` esta disponible en Claude 4.5 y modelos posteriores en la Claude API directa; el parametro previo `output_format` sigue funcionando en transicion pero ya no es la via recomendada. Limitaciones documentadas del schema bajo este mecanismo: sin soporte para esquemas recursivos, sin `$ref` externos, sin restricciones numericas (`minimum`/`maximum`/`multipleOf`) ni de longitud de string (`minLength`/`maxLength`), y `additionalProperties` solo acepta `false`. El cache de gramática compilada dura 24 horas desde el ultimo uso y se invalida si cambia la estructura del schema, el set de tools, o el estado del prompt cache — este dato de invalidacion cruzada con prompt caching es nuevo respecto a lo ya documentado en la seccion de Cache Breakpoints de este perfil y debe considerarse al disenar el orden de bloques cacheados.

Antes de adoptar `output_config.format` en un prompt de produccion existente que ya usa `tool_use` con `strict: true` para el mismo proposito, verificar de nuevo contra la documentacion oficial si ambos mecanismos son mutuamente excluyentes en el mismo request o si pueden coexistir — este detalle especifico no se confirmo en esta pasada y no debe asumirse por analogia con el comportamiento de `tool_choice`.
