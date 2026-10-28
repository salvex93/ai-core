# Seguridad, componentes, estado, renderizado y contrato con la API

## Modulo 3 — Seguridad Frontend

### XSS

```typescript
// PROHIBIDO
element.innerHTML = userInput;
dangerouslySetInnerHTML={{ __html: userInput }};

// CORRECTO
element.textContent = userInput;
// Si HTML es necesario:
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userInput, { USE_PROFILES: { html: true } });
```

### Almacenamiento seguro

| Tipo de dato | Almacenamiento correcto |
|---|---|
| JWT de acceso | Memory (variable JS) |
| JWT de refresh | HttpOnly cookie |
| Preferencias de UI | localStorage (no sensibles) |
| Datos sensibles | Nunca en localStorage/sessionStorage |

### Headers de seguridad HTTP obligatorios

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## Modulo 4 — Arquitectura de Componentes

### Regla de responsabilidad unica

```
// 1. Hook / Composable: logica de datos
useProducto(id) -> { producto, cargando, error }

// 2. Componente de presentacion: solo renderiza
ProductoVista({ producto }) -> <article>...</article>

// 3. Contenedor: composicion
ProductoContenedor({ id }) -> useProducto + ProductoVista
```

Limite: 150 lineas por componente — mas estricto que el limite general de 300 lineas de CLAUDE.md porque un componente de presentacion mezcla JSX/template, estilos y logica de UI en el mismo archivo; esa densidad hace que 150 lineas de componente equivalgan a mucho mas contenido real que 150 lineas de un modulo de logica pura. Si supera, dividir antes de aprobar el PR.

---

## Modulo 5 — Gestion de Estado

| Tipo de estado | Ubicacion |
|---|---|
| UI efimero (modal, tab activa) | Estado local del componente |
| Compartido entre 2-3 hermanos | Estado elevado al padre comun |
| Datos remotos (cache, revalidacion) | TanStack Query, SWR, Apollo |
| Estado global de sesion | Zustand, Pinia, NgRx, Context |
| Estado de formulario con validacion | React Hook Form, VeeValidate |

---

## Modulo 7 — Estrategias de Renderizado 2026

| Estrategia | Cuando usar |
|---|---|
| CSR | Apps autenticadas sin SEO. |
| SSR | Contenido dinamico con SEO o datos frescos por request. |
| SSG | Contenido que cambia raramente. |
| ISR | Contenido semi-estatico con revalidacion periodica. Next.js/Nuxt. |
| PPR | Paginas con shell estatico + agujeros dinamicos aislados. Estable en Next.js 16+ via `cacheComponents` (reemplaza el flag `experimental.ppr`), verificado 2026-08-03. |
| Edge SSR | Latencia minima global, personalización por region. Vercel Edge, Cloudflare Workers. |
| Islands (Astro) | Mayoria de contenido estatico + islas interactivas hidratadas bajo demanda. |

## Modulo 8 — Contrato con la API

Prohibido usar tipos genericos (`any`, `object`, `unknown` sin narrowing) para datos remotos.

Todo flujo que depende de datos remotos modela cuatro estados:

```
1. Cargando   — indicador visible, no pantalla en blanco
2. Error      — mensaje accionable, no el error tecnico
3. Vacio      — diferente al estado de carga
4. Con datos  — el caso exitoso
```
