## Modulo 13 — Design Tokens W3C y Tipografia Variable

### tokens.json (fuente unica de verdad W3C)

```json
{
  "color": {
    "primary": { "$value": "#3b82f6", "$type": "color" },
    "error":   { "$value": "#dc2626", "$type": "color" },
    "success": { "$value": "#16a34a", "$type": "color" }
  },
  "motion": {
    "duration": {
      "fast":   { "$value": "100ms", "$type": "duration" },
      "normal": { "$value": "250ms", "$type": "duration" },
      "slow":   { "$value": "400ms", "$type": "duration" }
    }
  }
}
```

### CSS compilado desde tokens

```css
:root {
  --color-primary-500: #3b82f6;
  --color-error:       #dc2626;
  --color-success:     #16a34a;

  --font-sans: 'Geist Variable', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', monospace;

  --text-xs:     clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
  --text-base:   clamp(1rem,     0.95rem + 0.25vw, 1.125rem);
  --text-xl:     clamp(1.25rem,  1.1rem  + 0.75vw, 1.5rem);
  --text-display: clamp(3rem,    2.5rem  + 3vw,    5rem);

  --space-1: 0.25rem; --space-2: 0.5rem; --space-4: 1rem;
  --space-6: 1.5rem;  --space-8: 2rem;   --space-12: 3rem;

  --duration-fast:   100ms;
  --duration-normal: 250ms;
  --duration-slow:   400ms;

  --radius-sm: 0.25rem; --radius-md: 0.5rem;
  --radius-lg: 1rem;    --radius-full: 9999px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:      #0f172a;
    --color-surface: #1e293b;
    --color-text:    #f1f5f9;
    --color-muted:   #94a3b8;
  }
}
```

### CSS Moderno 2026 — View Transitions y Anchor Positioning

```css
/* View Transitions cross-document (MPA) — limited availability, sin Firefox */
/* verificado 2026-09-15: developer.mozilla.org/en-US/docs/Web/CSS/@view-transition */
@view-transition { navigation: auto; }
.hero-image { view-transition-name: hero; }
/* Same-document (SPA), via document.startViewTransition() en JS, si es Baseline:
   Chrome/Edge 111+, Safari 18+, Firefox 144+ — preferir esa via si el proyecto es SPA */

/* Anchor Positioning — tooltips sin JS */
.tooltip {
  position: absolute;
  position-anchor: --trigger;
  top: anchor(bottom);
  left: anchor(center);
  margin-top: var(--space-2);
}

/* color-mix() para variantes dinamicas */
.btn:hover {
  background: color-mix(in oklch, var(--color-primary-500) 85%, black);
}
```
