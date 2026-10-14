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
