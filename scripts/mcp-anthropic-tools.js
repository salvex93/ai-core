'use strict';

// Definicion de herramientas expuestas por mcp-anthropic.js (datos puros, sin logica).
const TOOLS = [
  {
    name: 'completar_tarea',
    description:
      'Delega una tarea al modelo Anthropic correcto via Model Router automatico. ' +
      'Haiku para parseo/resumen/validacion, Sonnet para analisis/debug/codigo, ' +
      'Opus para arquitectura compleja/diseño/auditoria critica. ' +
      'El router escala automaticamente por tamano de contexto. ' +
      'Usar para conservar cuota de Claude Code delegando subtareas al tier mas economico posible.',
    inputSchema: {
      type: 'object',
      properties: {
        herramienta: {
          type: 'string',
          description:
            'Nombre de la tarea para routing. Valores validos: ' +
            'resumir_backlog, analizar_contenido (Haiku) | ' +
            'analizar_archivo, analizar_repositorio, buscar_web (Sonnet) | ' +
            'refactorizar_arquitectura, disenar_sistema, auditar_seguridad_critica (Opus). ' +
            'Si la tarea no encaja en ninguna, usa "analizar_contenido" como fallback economico.',
        },
        mensaje: {
          type: 'string',
          description: 'El mensaje o tarea a ejecutar por el modelo seleccionado.',
        },
        historial: {
          type: 'array',
          description: 'Historial previo de la conversacion [{role, content}]. Opcional.',
          items: {
            type: 'object',
            properties: {
              role:    { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
            required: ['role', 'content'],
          },
        },
        skills: {
          type: 'array',
          description: 'Nombres de skills a inyectar en el system prompt. Opcional.',
          items: { type: 'string' },
        },
        session_id: {
          type: 'string',
          description: 'ID de sesion para trazabilidad de costos. Opcional.',
        },
      },
      required: ['herramienta', 'mensaje'],
    },
  },
  {
    name: 'estimar_costo',
    description:
      'Estima el costo en USD de una llamada al modelo dado el conteo de tokens. ' +
      'Usar antes de delegar tareas grandes para validar que el costo es aceptable.',
    inputSchema: {
      type: 'object',
      properties: {
        modelo: {
          type: 'string',
          description: 'ID del modelo. Usar los IDs exactos: claude-haiku-4-5-20251001, claude-sonnet-5, claude-opus-4-8',
        },
        tokens_input:  { type: 'number', description: 'Tokens de entrada estimados' },
        tokens_output: { type: 'number', description: 'Tokens de salida estimados' },
        tokens_cache_hit: {
          type: 'number',
          description: 'Tokens servidos desde cache (90% descuento). Opcional, default 0.',
        },
      },
      required: ['modelo', 'tokens_input', 'tokens_output'],
    },
  },
  {
    name: 'routing_info',
    description:
      'Consulta que modelo y tier usaria el ModelRouter para una herramienta y contexto dados. ' +
      'Usar para planificar la estrategia de delegacion antes de ejecutar.',
    inputSchema: {
      type: 'object',
      properties: {
        herramienta: {
          type: 'string',
          description: 'Nombre de la herramienta/tarea',
        },
        tokens_contexto: {
          type: 'number',
          description: 'Tokens estimados del contexto actual. Default 0.',
        },
      },
      required: ['herramienta'],
    },
  },
  {
    name: 'cuota_estado',
    description:
      'Muestra el uso actual de rate limits en la ventana de 1 minuto: ' +
      'requests, input tokens y output tokens consumidos vs limite. ' +
      'Invocar cuando el modelo avise de rate limit o para monitorear el consumo.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

module.exports = { TOOLS };
