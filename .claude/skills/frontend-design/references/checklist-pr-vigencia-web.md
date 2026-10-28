# Checklist de revision de PR y vigencia de estandares web

## Lista de Verificacion de Revision de PR — Frontend AAA

Un PR con observacion en cualquier punto no se aprueba.

**Texto y redaccion:**
- [ ] Ortografia correcta en el idioma del proyecto.
- [ ] Tildes y caracteres especiales presentes.
- [ ] Mensajes de error accionables, no tecnicos.
- [ ] Botones con verbo en infinitivo o imperativo.

**Visual y UX:**
- [ ] Contraste WCAG AA 2.2 cumplido (4.5:1 texto, 3:1 elementos graficos).
- [ ] Focus-visible con contraste >= 3:1 contra color adyacente (WCAG 1.4.11) y sin quedar oculto por headers o banners fijos (2.4.11).
- [ ] Area de toque >= 24x24px (WCAG 2.5.8) — recomendado 44x44px.
- [ ] Cuatro estados de UI modelados (cargando, error, vacio, con datos).
- [ ] Animaciones respetan `prefers-reduced-motion`.
- [ ] Diseno responsive verificado en movil, tablet y desktop.
- [ ] Design tokens W3C usados — sin valores magicos de color, espaciado o duracion.
- [ ] Paradigma visual declarado e implementado coherentemente (no slop).
- [ ] Si hay contenido 3D/WebGL: `IDENTIDAD 3D:` declarada, fallback de 3 niveles implementado, FPS verificado en hardware de gama media (ver Modulo 14).

**SEO y performance:**
- [ ] `<title>` y `<meta name="description">` unicos por pagina.
- [ ] Open Graph y Twitter Card en paginas publicas.
- [ ] Schema.org/JSON-LD segun tipo de pagina.
- [ ] Lighthouse CI pasa todos los gates.
- [ ] Imagenes: `alt` descriptivo, formato WebP/AVIF, `loading="lazy"` en below-the-fold.

**Seguridad:**
- [ ] Sin `innerHTML` con datos no sanitizados.
- [ ] URLs validadas antes de usarse en `href` o `src`.
- [ ] Datos sensibles no en localStorage.
- [ ] `npm audit` sin severidad alta o critica.
- [ ] Source maps ocultos u omitidos en el build de produccion — sin `.map` accesible en ruta publica.

**Calidad de codigo:**
- [ ] Componentes < 150 lineas.
- [ ] Sin tipos genericos en datos remotos.
- [ ] Tests de integracion cubren flujos con DOM real.
- [ ] Tests de accesibilidad automatizados pasan.
- [ ] Container queries para componentes portables (no media queries).

**Precision:**
- [ ] Cada hallazgo cita ruta relativa + numero de linea. Sin esta referencia, el hallazgo no es accionable.

## Modulo 15 — Vigencia de Estandares Web Citados

Verificado 2026-09-15 contra fuente primaria (Protocolo de Vigencia Tecnologica, CLAUDE.md):

| Afirmacion | Estado confirmado | Fuente |
|---|---|---|
| Container Queries — Baseline widely available | Correcto. Soporte desde Chrome 106 / Firefox 110 / Safari 16 (2022-2023), ~95% global | developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries, caniuse.com/css-container-queries |
| `@view-transition { navigation: auto; }` (cross-document/MPA) — corregido de "same-document Baseline 2025" | Error corregido: es sintaxis cross-document, estado **Limited Availability**, sin soporte en Firefox | developer.mozilla.org/en-US/docs/Web/CSS/@view-transition |
| Same-document View Transitions (`document.startViewTransition()`) | Si es Baseline: Chrome/Edge 111+, Safari 18+, Firefox 144+ | developer.chrome.com/docs/web-platform/view-transitions |
| WCAG 2.2 — nuevos: 2.4.11 Focus Not Obscured, 2.5.7 Dragging Movements, 2.5.8 Target Size, 3.3.8 Accessible Authentication (AA); 3.2.6 Consistent Help y 3.3.7 Redundant Entry (A); 2.4.13 Focus Appearance (AAA); 4.1.1 Parsing eliminado | Confirmado por el agente de auditoria contra w3.org/TR/WCAG22/. W3C Recommendation 2024-12-12 | w3.org/TR/WCAG22/ |

Proxima verificacion: si pasan 90+ dias desde 2026-09-15, o si se cita una capacidad de CSS/HTML nueva no listada aqui, reverificar contra MDN/web.dev antes de asumir vigencia por analogia.
