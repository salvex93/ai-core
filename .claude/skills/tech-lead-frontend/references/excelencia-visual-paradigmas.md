## Modulo 2 — Excelencia Visual y Paradigmas 2026

### Anti-slop visual (implementacion)

- Si `ux-visual-designer` produjo una `IDENTIDAD:` declarada, implementarla exactamente. No sustituir por defaults.
- Fuentes prohibidas sin justificacion: Inter, Roboto, Arial, Space Grotesk, Montserrat en weight regular.
- Patron prohibido: `card + box-shadow sutil + border-radius:8px + gradiente azul/violeta + Inter`.
- Antes de escribir CSS de layout: verificar si existe `tokens.json` o `tokens.css`. Si no existe, crearlo primero.

### Implementacion de paradigmas visuales 2026

**Glassmorphism:**

```css
.glass-card {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.20);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  border-radius: var(--radius-lg);
}
/* Nota: requiere fondo con contenido detras para el efecto blur */
```

**Claymorphism:**

```css
.clay-element {
  background: #e8d5c4;
  border-radius: 24px;
  box-shadow: 6px 6px 12px rgba(0,0,0,0.15), -4px -4px 8px rgba(255,255,255,0.7);
  outline: 4px solid rgba(255,255,255,0.6);
  outline-offset: -4px;
}
```

**Liquid Glass (Apple Vision Pro aesthetic):**

```css
.liquid-surface {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px) saturate(200%) brightness(1.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.1),
    0 16px 48px rgba(0,0,0,0.2),
    inset 0 1px 0 rgba(255,255,255,0.2);
  /* shimmer animado */
  position: relative;
  overflow: hidden;
}
.liquid-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
  animation: liquid-shimmer 4s ease-in-out infinite;
}
@keyframes liquid-shimmer {
  0%, 100% { opacity: 0.5; transform: translateX(-10%) skewX(-5deg); }
  50%       { opacity: 1;   transform: translateX(10%)  skewX(5deg); }
}
@media (prefers-reduced-motion: reduce) {
  .liquid-surface::before { animation: none; }
}
```

**Brutalismo digital:**

```css
.brutalist-card {
  background: #ffffff;
  border: 3px solid #000000;
  border-radius: 0;
  box-shadow: 6px 6px 0 #000000;
  font-family: 'Space Mono', 'Courier New', monospace;
}
.brutalist-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 9px 9px 0 #000000;
  transition: all 0.1s ease-out;
}
```

**Bento Grid:**

```css
.bento-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  grid-auto-rows: minmax(120px, auto);
  gap: var(--space-4);
  container-type: inline-size;
}
.bento-hero   { grid-column: span 8; grid-row: span 2; }
.bento-stat   { grid-column: span 4; }
.bento-wide   { grid-column: span 12; }
.bento-square { grid-column: span 4; grid-row: span 2; }

@container (max-width: 768px) {
  .bento-hero, .bento-stat, .bento-wide, .bento-square {
    grid-column: span 12;
    grid-row: span 1;
  }
}
```

### Stack de UI recomendado por framework (2026)

| Framework | Componentes | Iconos | Animaciones |
|---|---|---|---|
| React / Next.js 15+ | shadcn/ui + Radix UI | Lucide React | Motion (ex Framer Motion) v11+ |
| Vue 3 / Nuxt 3+ | Nuxt UI v3 / PrimeVue | Iconify | VueUse Motion |
| Svelte 5 / SvelteKit | shadcn-svelte | Lucide Svelte | Svelte transitions nativas |
| Angular 22+ | Angular Material v22+ | Material Symbols | Angular Animations |
| Astro 5+ | Astro Islands + cualquiera | Astro Icons | GSAP / Motion One |
| Sin framework / Vanilla | Tailwind CSS + Headless UI | Heroicons | CSS custom properties |

### Responsividad con Container Queries (estandar 2026)

```css
/* Container queries — componente se adapta a su contenedor, no al viewport */
.card-wrapper {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card { display: grid; grid-template-columns: auto 1fr; gap: var(--space-4); }
}

@container card (min-width: 600px) {
  .card { grid-template-columns: 200px 1fr; }
}
```

Media queries solo para breakpoints globales. Container queries para componentes portables.
