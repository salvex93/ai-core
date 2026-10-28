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

### Principios Disney aplicados al web, easings semanticos y vocabulario

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
