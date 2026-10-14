## Modulo 2 — Design System W3C 2026

### Design Tokens DTCG (primera version estable 2025.10)

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
