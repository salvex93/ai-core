## Modulo 12 — Motion Design 2026

### Libreria por caso de uso

| Caso | Libreria | Razon |
|---|---|---|
| Transiciones UI React | Motion v11+ (`import from 'motion/react'`) | 2.5x mas rapido que GSAP en valores simples |
| Timelines, scroll sequences | GSAP + ScrollTrigger | Estandar para marketing pages |
| Morphing SVG, data-viz | GSAP + MorphSVG | Sin rival para este caso |
| Framework-agnostico simple | Motion One | 3.8KB, Web Animations API nativa |
| Interacciones basicas | CSS custom properties | Zero dependencias |

### Motion (ex Framer Motion) v11+ — patrones de produccion

```typescript
import { motion, AnimatePresence } from 'motion/react';  // nuevo import path v11+
import { useReducedMotion } from 'motion/react';

const variants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -20 }
};

function TarjetaAnimada({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      variants={shouldReduceMotion ? {} : variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

// Lista con stagger
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2 } }
};
```

### GSAP — patrones de produccion

```javascript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReduced) {
  gsap.from('.seccion-hero', {
    opacity: 0, y: 40, duration: 0.6, ease: 'power2.out',
    scrollTrigger: { trigger: '.seccion-hero', start: 'top 85%', once: true }
  });
}
```

### Microinteracciones CSS puro

```css
.btn-primary {
  transition: transform 0.1s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease;
}
.btn-primary:hover  { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.btn-primary:active { transform: translateY(0);    box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

.input-field:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; background: #e0e0e0; }
}
```
