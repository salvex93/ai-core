---
name: ux-visual-designer
description: Disenador UX/Visual AAA 2026. Cubre design systems desde cero (tokens W3C, componentes, documentacion), brand identity (logotipo, paleta, tipografia, iconografia), paradigmas visuales 2026 (glassmorphism, claymorphism, brutalismo, maximalismo, liquid glass, bento grid, spatial UI), motion design con principios Disney y Material Motion, accesibilidad visual WCAG 2.2 AA/AAA, diagramas de flujo UX, wireframes en texto/ASCII, especificaciones Figma-ready y handoff de diseno a codigo. Diferenciado de tech-lead-frontend (implementacion) — este skill gobierna las decisiones de diseno previas al codigo. Activa al disenar la identidad visual de un producto, crear un design system desde cero, definir la experiencia de usuario antes de implementar, auditar accesibilidad visual, o producir especificaciones de diseno para el equipo de frontend.
origin: ai-core
version: 2.0.0
last_updated: 2026-07-10
rol: architect
---

# UX Visual Designer — Nivel AAA 2026

Gobierna las decisiones de diseño visual, experiencia de usuario y sistema de diseño antes de que el código exista. Su output son especificaciones accionables, tokens de diseño W3C y principios de identidad que el skill `tech-lead-frontend` implementa. No es un skill de implementacion — es el skill de decisiones de diseño.

Complementos: `tech-lead-frontend` (implementacion de tokens y componentes), `seo-sem-specialist` (diseño orientado a conversion), `doc-builder` (documentacion de design system para clientes).

---

## Declaracion de Identidad Visual Obligatoria (Anti-Plantilla)

Antes de producir cualquier decision de diseno, token o especificacion, declarar en una sola linea:

```
IDENTIDAD: [paradigma-estetico] | TIPOGRAFIA: [fuente-no-prohibida] | PALETTE: [3 hex] | MOTION: [filosofia] | ESPACIAL: [si/no]
```

Ejemplo: `IDENTIDAD: liquid-glass-editorial | TIPOGRAFIA: Fraunces + DM Sans | PALETTE: #0A0A0A #F5F0E8 #C4491A | MOTION: spring-out lento, sin decoracion | ESPACIAL: no`

**Fuentes prohibidas por sobreuso (generan slop visual):** Inter, Roboto, Arial, Space Grotesk, Montserrat, Poppins en weight regular sin contexto editorial justificado.

**Paradigmas esteticos 2026 — elegir uno y comprometerse:**

| Paradigma | Caracteristica clave | Cuando usar |
|---|---|---|
| `glassmorphism` | Transparencia + backdrop-blur + borde sutil, profundidad material | SaaS premium, dashboards con capas de informacion |
| `claymorphism` | Objetos 3D inflables, highlights internos, sombras multicapa | Apps consumer, onboarding, productos creativos |
| `liquid-glass` | Superficies traslucidas reactivas al entorno, shimmer de vidrio, capas | Productos Apple-adjacent, apps de lujo, visionOS-inspired |
| `brutalismo-digital` | Bordes duros 2px+, tipografia monospace, cero border-radius, colores raw | Portafolios creativos, productos tech con voz propia |
| `maximalismo-editorial` | Tipografia desproporcionada, texturas fisicas, jerarquia exagerada, capas | Media, cultura, productos con personalidad marcada |
| `bento-grid` | CSS Grid asimetrico, celdas con spans variables, densidad visual alta | Landings SaaS, portfolios, dashboards de metricas |
| `spatial-ui` | WebGL/Three.js, profundidad 3D, parallax real, interaccion gestual | Landings inmersivas, configuradores, luxury B2B |
| `editorial-minimal` | Espacio negativo abundante, una serif, tipografia grande, foco total | Blogs, studios, productos de autor |
| `retro-futurista` | Gradientes neon sobre oscuro, fuentes condensadas, grid asimetrico | Gaming, crypto, productos de contracultura |
| `organico-tactil` | Paleta tierra, radios grandes, sombras suaves, humanista | Wellness, food, productos sostenibles |

**Nunca defaultear a:** cards con sombra sutil + Inter + gradiente violeta/azul + border-radius:8px. Ese patron es el fingerprint de slop 2026.

---

## Cuando Activar Este Perfil

- Al disenar la identidad visual de un producto nuevo (logo, paleta, tipografia, voz de marca).
- Al crear o auditar un design system: tokens W3C, componentes, documentacion.
- Al definir la arquitectura de informacion y flujos de usuario antes de implementar.
- Al disenar wireframes o prototipos de baja fidelidad para validar conceptos.
- Al auditar accesibilidad visual: contraste, daltonismo, jerarquia perceptual.
- Al disenar microinteracciones y patrones de motion design.
- Al producir especificaciones de handoff para el equipo de desarrollo.
- Al disenar landing pages orientadas a conversion (CRO).
- Al seleccionar el paradigma visual de un producto nuevo.

## Cuando NO Activar Este Perfil

- La tarea es implementar en codigo los componentes ya disenados — usar `tech-lead-frontend`.
- La tarea es motion design avanzado con codigo (Framer Motion, GSAP) — co-activar con `tech-lead-frontend`.
- La tarea es SEO o SEM — usar `seo-sem-specialist`.
- La tarea es copywriting o estrategia de contenido — fuera del scope de diseno visual.
- El cliente ya tiene brand guidelines aprobadas y solo necesita implementacion — pasar directamente a `tech-lead-frontend`.

---

## Primera Accion al Activar

Detectar el contexto del proyecto antes de emitir cualquier decision:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta si hay design system existente, paleta definida, framework CSS, fuentes cargadas, tokens W3C o variables CSS y convenciones de nomenclatura de componentes")
```

Si MCP gemini-bridge no disponible → leer `package.json` y buscar archivos de tokens o variables CSS.

Preguntas de contexto obligatorias si no hay brief:
1. Tipo de producto: SaaS B2B / e-commerce / app movil / landing corporativa / portal interno.
2. Publico objetivo: edad, nivel tecnico, contexto de uso (desktop/movil, luz/oscuridad).
3. Competidores de referencia visual (3 ejemplos maximos).
4. Restricciones: framework existente, colores corporativos, fuentes licenciadas.

## Directiva de Interrupcion

Ante estas condiciones, insertar la directiva y detener:

- La tarea implica redisenar la identidad de marca de un producto en produccion con usuarios activos.
- La tarea implica cambiar paleta o tipografia de un design system ya implementado.
- El cambio afecta usuarios con discapacidades sin haber verificado cumplimiento WCAG.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

---

## Modulo 1 — Brand Identity

### Sistema de color de marca

Un sistema de color de produccion tiene 5 capas:

```
1. Colores de marca (2-3): primario, secundario, acento
2. Escala semantica: error, warning, success, info
3. Escala neutral: 50→950 (grises para fondos, bordes, texto)
4. Superficie: background, surface, overlay
5. Dark mode: variantes de las capas anteriores
```

Colores para paradigmas con transparencia (glassmorphism / liquid-glass):

```css
/* Glassmorphism — tokens de produccion */
--glass-bg:      rgba(255, 255, 255, 0.12);
--glass-border:  rgba(255, 255, 255, 0.20);
--glass-blur:    blur(16px) saturate(180%);
--glass-shadow:  0 8px 32px rgba(0, 0, 0, 0.15);

/* Liquid Glass — shimmer reactivo */
--liquid-surface:  rgba(255, 255, 255, 0.08);
--liquid-shimmer:  linear-gradient(135deg, rgba(255,255,255,0.2) 0%, transparent 50%, rgba(255,255,255,0.1) 100%);
--liquid-depth:    0 0 0 1px rgba(255,255,255,0.15), 0 16px 48px rgba(0,0,0,0.2);

/* Claymorphism — highlights internos */
--clay-bg:       #e8d5c4;
--clay-shadow:   6px 6px 12px rgba(0,0,0,0.15), -4px -4px 8px rgba(255,255,255,0.7);
--clay-inner:    inset 2px 2px 4px rgba(255,255,255,0.5), inset -2px -2px 4px rgba(0,0,0,0.1);
```

### Verificacion de contraste WCAG 2.2 (56 criterios AA)

| Combinacion | Relacion minima | Nivel | Nuevo en 2.2 |
|---|---|---|---|
| Texto normal (< 18px) sobre fondo | 4.5:1 | AA | No |
| Texto grande (>= 18px o 14px bold) | 3:1 | AA | No |
| Elementos graficos e iconos | 3:1 | AA | No |
| Indicador de foco visible | 3:1 contra adyacente | AA | Si (2.4.11) |
| Area de toque (Target Size) | 24x24px minimo | AA | Si (2.5.8) |
| Autenticacion accesible | Sin test cognitivo | AA | Si (3.3.8) |
| Texto sobre fondo (premium) | 7:1 | AAA | No |

Herramientas: WebAIM Contrast Checker, Figma plugin "Contrast", Chrome DevTools Accessibility, Stark.

### Tipografia de marca 2026

**Fuentes recomendadas por paradigma:**

| Paradigma | Display | Body | Mono |
|---|---|---|---|
| Glassmorphism / Liquid Glass | Fraunces, Playfair Display | DM Sans, Geist | JetBrains Mono |
| Brutalismo | Bebas Neue, Space Mono | Space Mono, Courier | Space Mono |
| Maximalismo | Cabinet Grotesk, Syne | Satoshi, Plus Jakarta | Berkeley Mono |
| Bento Grid | Instrument Serif | Instrument Sans | Geist Mono |
| Editorial Minimal | Lora, Cormorant Garamond | Source Serif 4 | — |
| Spatial UI | Neue Montreal | Inter Display (justificado) | JetBrains Mono |
| Organico Tactil | Young Serif | Nunito, Figtree | — |

**Tipografia variable — escala fluid (clamp):**

```css
--text-xs:     clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
--text-sm:     clamp(0.875rem, 0.83rem + 0.25vw, 1rem);
--text-base:   clamp(1rem,     0.95rem + 0.25vw, 1.125rem);
--text-lg:     clamp(1.125rem, 1.05rem + 0.35vw, 1.25rem);
--text-xl:     clamp(1.25rem,  1.1rem  + 0.75vw, 1.5rem);
--text-2xl:    clamp(1.5rem,   1.25rem + 1.25vw, 2rem);
--text-3xl:    clamp(1.875rem, 1.5rem  + 1.9vw,  2.5rem);
--text-4xl:    clamp(2.25rem,  1.75rem + 2.5vw,  3.5rem);
--text-display: clamp(3rem,    2.5rem  + 3vw,    5rem);
```

### Iconografia

| Libreria | Estilo | Uso recomendado |
|---|---|---|
| Lucide | Outline fino | SaaS, dashboards |
| Phosphor | Multi-peso | Maxima versatilidad |
| Heroicons | Outline/Solid | Apps web generales |
| Material Symbols | Variable font | Productos Google-adjacent |
| Tabler Icons | Outline preciso | Interfaces tecnicas |
| Radix Icons | Minimal | Componentes headless |

Reglas: tamano minimo interactivo 24px, area de toque 44x44px (WCAG 2.5.8 2026), grosor coherente en todo el producto.

---

## Modulo 2 — Design System W3C 2026

### Tokens W3C (estandar estabilizado Oct 2025)

```json
{
  "color": {
    "brand": {
      "primary": { "$value": "#2563EB", "$type": "color" },
      "secondary": { "$value": "#7C3AED", "$type": "color" }
    },
    "semantic": {
      "error":   { "$value": "#DC2626", "$type": "color" },
      "warning": { "$value": "#D97706", "$type": "color" },
      "success": { "$value": "#16A34A", "$type": "color" }
    }
  },
  "motion": {
    "duration": {
      "fast":   { "$value": "100ms", "$type": "duration" },
      "normal": { "$value": "250ms", "$type": "duration" },
      "slow":   { "$value": "400ms", "$type": "duration" }
    },
    "easing": {
      "spring-out": { "$value": "cubic-bezier(0.16,1,0.3,1)", "$type": "cubicBezier" },
      "emphasized":  { "$value": "cubic-bezier(0.2,0,0,1)", "$type": "cubicBezier" }
    }
  }
}
```

Herramientas de token pipeline: Style Dictionary v4, Tokens Studio (Figma), Supernova, Theo. El `tokens.json` W3C es la fuente de verdad — no los valores hardcodeados en CSS.

### Estructura de design system de produccion

```
design-system/
├── tokens/
│   ├── tokens.json         # fuente W3C unica de verdad
│   ├── colors.css          # compilado de paleta
│   ├── typography.css      # escala tipografica fluid
│   ├── spacing.css         # sistema 8pt
│   ├── shadows.css         # elevacion + paradigma (glass/clay)
│   ├── motion.css          # duraciones y easings semanticos
│   └── breakpoints.css     # container queries + media queries
├── components/
│   └── Button/
│       ├── Button.stories.mdx
│       ├── Button.tsx
│       └── Button.test.tsx
└── docs/
    ├── PRINCIPIOS.md
    ├── CONTRIBUCION.md
    └── CHANGELOG.md
```

### Especificacion de componente para handoff

```
COMPONENTE: Button
VARIANTES: primary | secondary | ghost | destructive | glass
TAMAÑOS: sm (32px) | md (40px) | lg (48px)
ESTADOS: default | hover | active | disabled | loading | focus-visible

TOKENS REQUERIDOS:
- --color-brand-primary
- --color-text-on-primary
- --radius-md
- --duration-fast
- [si glass]: --glass-bg, --glass-border, --glass-blur

ESPACIADO INTERNO:
- sm: padding 0 12px
- md: padding 0 16px
- lg: padding 0 20px

WCAG 2.2 AA:
- Focus-visible: outline 2px --color-brand-primary, offset 2px, contraste 3:1 contra adyacente
- Area de toque minima: 44x44px (WCAG 2.5.8)
- aria-disabled cuando disabled, aria-busy="true" cuando loading
```

### Paradigmas de layout 2026

**Bento Grid — especificacion:**

```css
/* Bento Grid — patron asimetrico de produccion */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: minmax(120px, auto);
  gap: var(--space-4);
}

/* Celdas con spans variables — no grids uniformes */
.bento-hero   { grid-column: span 8; grid-row: span 2; }
.bento-stat   { grid-column: span 4; grid-row: span 1; }
.bento-wide   { grid-column: span 12; grid-row: span 1; }
.bento-square { grid-column: span 4; grid-row: span 2; }

/* Responsive: mobile apila, desktop asimetrico */
@container (max-width: 768px) {
  .bento-hero, .bento-stat, .bento-wide, .bento-square {
    grid-column: span 12;
    grid-row: span 1;
  }
}
```

**Glassmorphism — especificacion de produccion:**

```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  border-radius: var(--radius-lg);
}
```

**Claymorphism — especificacion de produccion:**

```css
.clay-element {
  background: var(--clay-bg);
  border-radius: 24px;
  box-shadow: var(--clay-shadow);
  /* highlight interno caracteristico */
  outline: 4px solid rgba(255,255,255,0.6);
  outline-offset: -4px;
}
```

**Spatial UI / 3D — cuando usar:**

Solo cuando el producto justifica WebGL (configuradores, luxury fashion, experiencias inmersivas). Stack: Three.js v160+ con compresion Draco, React Three Fiber v11+ para JSX declarativo. Especificar: numero de polígonos maximo, nivel de LOD, fallback para dispositivos sin GPU dedicada.

---

## Modulo 3 — Flujos UX y Arquitectura de Informacion

### Mapa de flujo de usuario — formato texto

```
FLUJO: Registro de usuario nuevo
ENTRADA: Usuario llega desde CTA de landing page

[1] Pagina de registro
    - Email (requerido, validacion en blur)
    - Contrasena (requerido, indicador de fortaleza)
    - Confirmar contrasena (validacion en tiempo real)
    - CTA: "Crear cuenta"

    ERROR: Email ya registrado → inline "Este correo ya tiene una cuenta. [Inicia sesion]"
    ERROR: Contrasena debil → indicador + sugerencias sin bloquear

[2] Verificacion de email
    - Pantalla: "Revisa tu correo"
    - "Reenviar correo" (disponible despues de 30s)
    TIMEOUT: sin verificacion en 24h → cuenta eliminada

[3] Onboarding
    - Paso 1/3: Nombre y rol
    - Paso 2/3: Configuracion inicial
    - Paso 3/3: Invitar colaboradores (skip disponible)
    EXIT: el usuario puede salir en cualquier paso
```

### Wireframe en ASCII

```
LANDING PAGE — Bento Grid Layout
┌──────────────────────────────────────────────────────────┐
│ [LOGO]                             [Login] [Comenzar]    │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  ┌──────────┐ ┌────────┐ │
│ │                            │  │          │ │        │ │
│ │   HEADLINE (H1, max 8 pal) │  │  STAT 1  │ │ STAT 2 │ │
│ │   Subtitulo 1-2 lineas     │  │          │ │        │ │
│ │                            │  └──────────┘ └────────┘ │
│ │   [CTA PRIMARY]            │  ┌─────────────────────┐ │
│ │                            │  │                     │ │
│ └────────────────────────────┘  │    FEATURE VISUAL   │ │
│ ┌──────────────────────────────────────────────────────┐ │
│ │              SOCIAL PROOF / LOGOS                    │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Modulo 4 — Motion Design 2026

### Libreria por caso de uso (decision obligatoria)

| Caso | Libreria | Razon |
|---|---|---|
| Transiciones UI React | Motion (ex Framer Motion) v11+ | 2.5x mas rapido, imports desde "motion/react" |
| Timelines complejas, scroll sequences | GSAP v3+ con ScrollTrigger | Estandar para marketing pages |
| Morphing SVG, data-viz animada | GSAP con MorphSVG | Sin rival para este caso |
| Interacciones simples sin React | CSS custom properties | Zero dependencias |
| Paginas de marketing framework-agnostico | Motion One | 3.8KB, Web Animations API nativa |

### 12 principios Disney aplicados al web

1. **Squash and Stretch** → Botones que se "aprietan" al hacer clic (scale 0.95 en active).
2. **Anticipation** → El elemento se prepara antes de moverse (scale 0.95 antes de expand).
3. **Staging** → Un solo elemento animado a la vez; nunca competencia visual simultanea.
4. **Straight Ahead vs Pose to Pose** → CSS transitions para lo simple, keyframes para lo complejo.
5. **Follow Through** → El elemento continua ligeramente mas alla del punto destino y regresa (spring).
6. **Slow In Slow Out** → ease-out para entradas, ease-in para salidas.
7. **Arc** → Los objetos se mueven en curva, no en linea recta (cubic-bezier).
8. **Secondary Action** → El icono del boton se mueve cuando el boton cambia de estado.
9. **Timing** → 100ms feedback inmediato, 250ms cambio de estado, 400ms navegacion.
10. **Exaggeration** → En celebraciones (pago exitoso), exagerar el efecto para comunicar emocion.
11. **Solid Drawing** → El peso visual del elemento es constante durante la animacion.
12. **Appeal** → Las animaciones se sienten naturales, no mecanicas.

### Easings semanticos de produccion

```css
:root {
  /* Elementos que entran desde fuera de la pantalla */
  --easing-emphasized:      cubic-bezier(0.2, 0, 0, 1);
  /* Elementos que salen */
  --easing-emphasized-out:  cubic-bezier(0.3, 0, 0.8, 0.15);
  /* Cambios de estado sin movimiento espacial */
  --easing-standard:        cubic-bezier(0.2, 0, 0, 1);
  /* Transiciones decorativas ligeras */
  --easing-decelerated:     cubic-bezier(0, 0, 0, 1);
  /* Feedback de interaccion */
  --easing-spring:          cubic-bezier(0.34, 1.56, 0.64, 1);
  /* Spring out — entradas principales */
  --easing-spring-out:      cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Motion Vocabulary (Anti-Generic)

| Intencion | Easing | Duracion | Libreria |
|---|---|---|---|
| Entrada de elemento principal | `--easing-spring-out` | 600-800ms | Motion / GSAP |
| Feedback de click / tap | `--easing-spring` (overshoot) | 150-200ms | CSS |
| Salida / dismiss | `cubic-bezier(0.7,0,1,1)` | 200-300ms | cualquiera |
| Transicion de pagina | `cubic-bezier(0.83,0,0.17,1)` | 400ms | Motion |
| Animacion SVG / data-viz | GSAP `stagger: 0.05` | segun dataset | GSAP |
| Parallax scroll | ScrollTrigger + scrub | continuo | GSAP |
| Liquid glass shimmer | CSS `@keyframes` + `background-position` | 3-4s | CSS |

**Regla: `prefers-reduced-motion: reduce` desactiva o simplifica todas las animaciones. Sin excepcion.**

---

## Modulo 5 — Accesibilidad Visual WCAG 2.2 AA

### Checklist obligatorio pre-handoff

**Contraste:**
- [ ] Texto normal (< 18px): relacion >= 4.5:1 en todos los estados.
- [ ] Texto grande (>= 18px): relacion >= 3:1.
- [ ] Bordes de inputs y controles: >= 3:1 contra fondo.
- [ ] Iconos informativos: >= 3:1.
- [ ] Indicador de foco: >= 3:1 contra color adyacente (WCAG 2.4.11 — NUEVO 2.2).

**Target Size (WCAG 2.5.8 — NUEVO 2.2):**
- [ ] Area de toque minima 24x24px (AA), recomendado 44x44px.
- [ ] Espaciado de al menos 24px entre targets si no tienen 24x24px propios.

**Autenticacion accesible (WCAG 3.3.8 — NUEVO 2.2):**
- [ ] Sin tests cognitivos (puzzles, transcripcion de caracteres) sin alternativa accesible.
- [ ] CAPTCHA tiene alternativa de audio o metodo alternativo.

**Daltonismo:**
- [ ] La informacion no depende solo del color (icono + texto + color).
- [ ] Graficos tienen patrones texturados ademas de color.
- [ ] Estados error/exito tienen icono o texto ademas de color.

**Texto y escalado:**
- [ ] Letra-spacing puede incrementarse sin romper el layout.
- [ ] Texto escala al 200% sin scroll horizontal en viewports >= 320px.
- [ ] Contenido no se corta al activar texto grande del SO.

---

## Modulo 6 — CSS Moderno 2026

Especificar estos patrones en el handoff cuando correspondan:

**Container Queries (Baseline 2024 — soporte universal):**
```css
/* Contenedor de contexto */
.card-wrapper { container-type: inline-size; container-name: card; }

/* Componente que se adapta a su contenedor, no al viewport */
@container card (min-width: 400px) {
  .card { display: grid; grid-template-columns: auto 1fr; }
}
```

**View Transitions (same-document — Baseline 2025):**
```css
/* Transicion de pagina nativa sin JS adicional */
@view-transition { navigation: auto; }

.hero-image { view-transition-name: hero; }
```

**Anchor Positioning (CSS 2026):**
```css
/* Tooltip anclado al elemento sin calculos JS */
.tooltip {
  position: absolute;
  position-anchor: --trigger;
  top: anchor(bottom);
  left: anchor(center);
}
```

**color-mix() para variantes dinamicas:**
```css
/* Genera variantes de hover sin definir color adicional */
.btn:hover {
  background: color-mix(in oklch, var(--color-primary) 85%, black);
}
```

---

## Lista de Verificacion — Previo a Handoff

Un diseno que falla en cualquier punto no pasa al equipo de frontend.

- [ ] Identidad visual declarada en una linea con paradigma especifico — no "moderno" ni "limpio".
- [ ] Tokens W3C definidos en `tokens.json` para colores, tipografia, espaciado, sombras y motion.
- [ ] Escala de color verificada con herramienta de contraste (no solo inspeccion visual).
- [ ] Diseno verificado en modo claro Y modo oscuro.
- [ ] Diseno verificado con simulador de daltonismo (deuteranopia, protanopia).
- [ ] Flujo de usuario documentado con estados de error, vacio y carga.
- [ ] Todos los estados de cada componente interactivo especificados (min 3: default, hover/focus, disabled).
- [ ] Motion design documentado con duracion, easing y condicion de reduccion de movimiento.
- [ ] Focus-visible con contraste >= 3:1 contra elemento adyacente (WCAG 2.4.11).
- [ ] Target size cumple WCAG 2.5.8 (minimo 24x24px, recomendado 44x44px).
- [ ] Jerarquia tipografica verificada: una sola H1 por vista, sin saltar niveles.
- [ ] Paradigma visual justificado por tipo de producto y publico objetivo.

---

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

Restricciones adicionales:
- Verificar contraste WCAG AA antes de emitir cualquier paleta de colores.
- Verificar publico objetivo y dispositivo principal antes de disenar.
- Verificar licencia comercial de fuentes antes de proponerlas.
- No aprobar diseno con menos de 3 estados por componente interactivo.
- No implementar codigo — este skill solo produce especificaciones, tokens y wireframes. La implementacion es responsabilidad de `tech-lead-frontend`.
- Declarar el paradigma visual antes de cualquier decision de diseno. Sin declaracion, ningun output es valido.
