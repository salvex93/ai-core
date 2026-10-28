# Source maps y tiempo real en el cliente (opcional)

Cargar al configurar el build de produccion o consumir WebSocket/SSE. El diseno del servidor vive en backend-architect.

## Modulo 7B — Build de Produccion y Source Maps

### Regla de exposicion de source maps

Prohibido publicar source maps (`.map`) en el bundle servido al cliente en produccion — exponen el codigo fuente original completo (rutas de archivo, logica de negocio, comentarios) a cualquier visitante que inspeccione el bundle.

| Herramienta | Configuracion correcta en produccion |
|---|---|
| Vite | `build.sourcemap: 'hidden'` (genera `.map` para error-tracking, no lo referencia en el bundle publico) o `false` si no hay integracion de error-tracking |
| Webpack | `devtool: 'hidden-source-map'` en `mode: 'production'` — nunca `'source-map'` a secas |
| Next.js | `productionBrowserSourceMaps: false` (default) en `next.config.js` — no activar salvo que el `.map` se suba solo al proveedor de error-tracking y se excluya del deploy publico |
| Rollup | `output.sourcemap: 'hidden'` |

### Patron correcto: hidden source maps + error tracking

```javascript
// vite.config.js — genera el .map pero no lo referencia en el bundle publico
export default {
  build: { sourcemap: 'hidden' }
};
```

El `.map` generado se sube unicamente al proveedor de error-tracking (Sentry, Datadog RUM) via su CLI de build, y se borra del directorio de salida antes de desplegar los assets estaticos. Nunca queda accesible en una ruta publica del sitio.

### Verificacion antes de desplegar

- [ ] `curl -I https://dominio.com/assets/main.js.map` devuelve 404, no 200.
- [ ] El bundle minificado no contiene comentarios `//# sourceMappingURL=` que apunten a una ruta publica.
- [ ] Minificacion activa (`terser`/`esbuild` en modo produccion) — variables renombradas, sin espacios ni comentarios de desarrollo.

## Modulo 8B — Tiempo Real en el Cliente (WebSocket / SSE)

Ver `backend-architect` para el diseno del servidor. Este modulo cubre el consumo desde el cliente.

### SSE — consumo con reconexion nativa

```typescript
const eventos = new EventSource('/api/notificaciones/stream');
eventos.onmessage = (evento) => {
  const payload = JSON.parse(evento.data);
  actualizarEstado(payload);
};
eventos.onerror = () => {
  // EventSource reintenta la conexion automaticamente — no implementar backoff manual
};
```

### WebSocket — patron de reconexion con backoff exponencial

```typescript
function conectarWebSocket(url: string, onMensaje: (data: unknown) => void) {
  let intentos = 0;
  let socket: WebSocket;

  function conectar() {
    socket = new WebSocket(url);
    socket.onopen = () => { intentos = 0; };
    socket.onmessage = (e) => onMensaje(JSON.parse(e.data));
    socket.onclose = () => {
      const espera = Math.min(1000 * 2 ** intentos, 30000);
      intentos++;
      setTimeout(conectar, espera);
    };
  }
  conectar();
  return () => socket.close();
}
```

Al reconectar tras una desconexion, el cliente debe re-sincronizar estado (pedir el estado actual completo o los eventos perdidos) — no asumir que no se perdio nada durante el tiempo desconectado.
