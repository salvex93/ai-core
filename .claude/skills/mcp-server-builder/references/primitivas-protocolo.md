## Primitivas Adicionales del Protocolo

El protocolo MCP define tres tipos de primitivas que un servidor puede exponer: Tools, Resources y Prompts. La seccion anterior cubre Tools. A continuacion se describen Resources y Prompts.

### Resources

Un Resource es un dato o documento que el servidor expone para que el cliente lo lea. No ejecuta logica: es un endpoint de lectura de contenido estructurado.

Casos de uso tipicos: exponer archivos de configuracion, esquemas de base de datos, documentacion interna o cualquier dato de referencia que el modelo necesita leer antes de razonar.

```typescript
// TypeScript — registro de un recurso estatico
server.resource(
  'esquema-base-de-datos',                          // nombre del recurso
  'db://schema',                                    // URI del recurso (scheme propio)
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'application/json',
      text: JSON.stringify(await obtenerEsquemaDB()),
    }],
  })
);

// Recurso con plantilla URI parametrizada (ResourceTemplate)
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/index.js';

server.resource(
  new ResourceTemplate('archivo://{ruta}', { list: undefined }),
  async (uri, { ruta }) => ({
    contents: [{
      uri: uri.href,
      mimeType: 'text/plain',
      text: await fs.readFile(ruta, 'utf-8'),
    }],
  })
);
```

Reglas de seguridad para Resources:
- Los recursos que exponen rutas del sistema de archivos deben validar que la ruta esta dentro del directorio permitido. Prohibido path traversal (`../`).
- Los recursos que exponen datos de base de datos deben respetar los mismos controles de autorizacion que las herramientas.
- No exponer secretos ni credenciales como recursos legibles.

### Prompts

Un Prompt es una plantilla de mensaje reutilizable que el servidor expone para que el cliente la instancie con argumentos. Permite estandarizar la forma en que el modelo aborda tareas recurrentes.

```typescript
// TypeScript — registro de un prompt
server.prompt(
  'analizar-error',                                 // nombre del prompt
  'Genera un analisis tecnico estructurado de un error de aplicacion.',
  {
    mensaje_error: {
      type: 'string',
      description: 'El mensaje de error completo incluyendo el stack trace.',
    },
    contexto: {
      type: 'string',
      description: 'Contexto adicional: que operacion se estaba ejecutando.',
      required: false,
    },
  },
  async ({ mensaje_error, contexto }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Analiza el siguiente error de aplicacion:\n\n${mensaje_error}${contexto ? `\n\nContexto: ${contexto}` : ''}`,
      },
    }],
  })
);
```

La diferencia entre un Prompt y una Tool: una Tool ejecuta una accion y devuelve un resultado. Un Prompt devuelve un mensaje estructurado listo para ser enviado al modelo. Los Prompts no ejecutan logica de negocio; solo estructuran la entrada al LLM.
