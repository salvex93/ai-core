## Modulo 14 — 3D Web, Shaders y Experiencias Inmersivas

### Principio fundamental

Una escena 3D que corre pero se ve generica no cumple el objetivo. El listón es el nivel Apple/Awwvards: geometria, iluminacion, movimiento de camara y timing de scroll trabajando como un solo sistema deliberado — no una libreria con sus defaults encendidos. Si no se puede declarar en una frase por que esta escena se ve distinta a cualquier demo de Three.js, no esta lista.

### Identidad 3D — declarar antes de codear

Igual que el Modulo 2 exige una `IDENTIDAD:` visual antes de escribir CSS, ninguna escena 3D se codea sin declarar primero:

```
IDENTIDAD 3D:
  Geometria: [organica/procedural | solidos geometricos precisos | escaneo/fotogrametria | abstracto low-poly]
  Paleta y luz: [estudio fotografico alto-contraste | atmosferico/volumetrico | neon/emisivo | monocromo con un acento]
  Movimiento de camara: [orbit suave con easing | scroll-locked path | parallax de profundidad | estatico con objeto rotando]
  Referencia de tono: [una sola linea — ej. "producto flotando en vacio de estudio, como un anuncio de reloj de lujo"]
```

Si `ux-visual-designer` ya declaro una `IDENTIDAD:` 2D para el proyecto, la identidad 3D es su extension al espacio — misma paleta, mismo lenguaje de movimiento, no un sistema visual paralelo.

### Prohibido — patrones reconocibles de demo/plantilla

- Esfera de particulas default sin proposito narrativo (el "particle sphere" de portfolio generico).
- Torus knot, Suzanne (mono de Blender) o geometrias de ejemplo de Three.js sin transformar.
- Post-processing con presets sin ajustar (bloom a maxima intensidad, vignette generico de `postprocessing`).
- Modelo 3D iluminado solo con `ambientLight` — sin key light, sin sombras, se ve plano y falso.
- Rotacion automatica infinita sin easing ni proposito (`mesh.rotation.y += 0.01` en el render loop, sin mas).
- Skybox/HDRI de stock reconocible (los presets default de `@react-three/drei` Environment: `city`, `sunset`, `dawn` sin personalizar) usado como fondo final de produccion.

### Stack recomendado 2026

| Necesidad | Herramienta | Razon |
|---|---|---|
| Escenas 3D en React | React Three Fiber (R3F) + `@react-three/drei` | Declarativo, se integra con el arbol de componentes y el ciclo de vida de React. Estandar de facto 2026. |
| Escenas 3D sin framework | Three.js directo | Control total del render loop cuando no hay React o se necesita máximo rendimiento. |
| Física (colisiones, gravedad) | `@react-three/rapier` (R3F) o `cannon-es` | Rapier es mas rapido (WASM); usar solo si la escena requiere fisica real, no para efectos que se pueden fakear con easing. |
| Post-processing | `@react-three/postprocessing` | Bloom, DoF, chromatic aberration — ajustar cada valor a la identidad declarada, nunca dejar el default. |
| Shaders custom | GLSL + `THREE.ShaderMaterial`, o `@react-three/drei`'s `shaderMaterial` | Cuando el efecto no existe como material estandar: distorsion, gradientes generativos, disolucion, transiciones de pagina. |
| Modelos 3D optimizados | `.glb`/`.gltf` comprimido con Draco o Meshopt | Nunca cargar `.obj`/`.fbx` sin comprimir en produccion — el peso de archivo mata el LCP. |
| Scroll storytelling | GSAP ScrollTrigger controlando camara/uniforms de R3F, o `@react-three/drei`'s `ScrollControls` | Sincronizar el progreso de scroll con posicion de camara, no con posicion del DOM. |
| Model viewer de producto | `@google/model-viewer` (web component, sin necesidad de R3F) o R3F custom si se necesita interaccion mas alla de orbit/zoom | `model-viewer` cubre el 80% de casos de e-commerce con AR incluido, sin escribir Three.js. |
| WebXR / AR | `@react-three/xr` sobre WebXR API nativo | Solo si el proyecto confirma soporte de dispositivo objetivo — WebXR no esta disponible en todos los navegadores/dispositivos. |

### Patron de escena base con identidad e iluminacion deliberada

```tsx
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, PerspectiveCamera } from '@react-three/drei';

function EscenaProducto({ children }: { children: React.ReactNode }) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 35 }}>
      {/* Key light — define la identidad de iluminacion, nunca solo ambient */}
      <directionalLight
        position={[4, 6, 4]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <ambientLight intensity={0.15} />
      {/* HDRI custom subido al proyecto, no el preset default de drei */}
      <Environment files="/hdri/estudio-custom.hdr" />
      <ContactShadows position={[0, -1, 0]} opacity={0.5} blur={2.4} far={2} />
      {children}
    </Canvas>
  );
}
```

### Presupuesto de performance — gate obligatorio, no sugerencia

Una escena 3D que no cumple estos umbrales en hardware medio se rechaza, sin importar que tan bien se vea en la maquina del desarrollador:

| Metrica | Umbral | Verificacion |
|---|---|---|
| FPS en escena interactiva | >= 60fps en GPU integrada de gama media (ej. Intel Iris, Apple M1 base) | Chrome DevTools Performance panel, grabar 10s de interaccion real |
| Peso de modelos 3D | < 5MB por modelo `.glb` comprimido (Draco/Meshopt) | `ls -la` sobre el asset final, no el original sin comprimir |
| Draw calls por escena | < 100 en escenas con multiples objetos | `renderer.info.render.calls` en runtime |
| Tiempo hasta interactivo de la escena | < 2s desde que el Canvas entra al viewport | Marcar con `performance.mark()` al primer frame renderizado |
| Impacto en LCP de la pagina | La escena 3D no es el elemento de LCP, o si lo es, cumple el mismo umbral de 2.5s del Modulo 10 | Lighthouse con la escena en el viewport inicial |

### Fallback obligatorio para dispositivos de gama baja

Ninguna escena 3D se entrega sin un plan para hardware que no puede sostenerla. Detectar capacidad antes de montar el Canvas, no despues de que el usuario ya sufrio el frame drop:

```tsx
import { useEffect, useState } from 'react';

function useCapacidad3D() {
  const [nivel, setNivel] = useState<'completo' | 'reducido' | 'estatico'>('completo');

  useEffect(() => {
    const prefiereReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = document.createElement('canvas').getContext('webgl2');
    const memoria = (navigator as any).deviceMemory ?? 8;

    if (prefiereReducido || !gl) setNivel('estatico');
    else if (memoria < 4) setNivel('reducido');
  }, []);

  return nivel;
}

// 'completo'   -> escena 3D full con post-processing
// 'reducido'   -> misma escena, sin post-processing, sombras simplificadas, dpr fijo en 1
// 'estatico'   -> imagen/video pre-renderizado de la escena como fallback, cero WebGL
```

`prefers-reduced-motion: reduce` es la misma señal que ya gobierna las animaciones CSS del Modulo 12 — la escena 3D respeta la preferencia del usuario igual que cualquier otra animacion.

### Shaders custom — patron minimo

```glsl
// vertex.glsl — desplazamiento basado en ruido, controlado por uniform de scroll
uniform float uProgreso;
uniform float uTiempo;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  pos.z += sin(pos.x * 4.0 + uTiempo) * uProgreso * 0.3;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

```tsx
// Uniform sincronizado con scroll — no con setInterval ni valores fijos
const uniforms = useMemo(() => ({
  uProgreso: { value: 0 },
  uTiempo: { value: 0 },
}), []);

useFrame((state) => {
  uniforms.uTiempo.value = state.clock.elapsedTime;
});
```

Regla: todo shader custom declara sus uniforms con nombres descriptivos (no `u1`, `u2`) y documenta en un comentario de una linea que efecto visual controla cada uno.

### Checklist de verificacion — 3D/Inmersivo en PR

- [ ] `IDENTIDAD 3D:` declarada y coherente con la identidad 2D del proyecto (si existe).
- [ ] Cero patrones de la lista de prohibidos (particle sphere generico, torus knot, HDRI preset sin editar, ambient-only lighting).
- [ ] Iluminacion con al menos una key light direccional/puntual ademas de ambient — nunca solo ambient.
- [ ] Modelos `.glb`/`.gltf` comprimidos (Draco o Meshopt), peso verificado < 5MB por asset.
- [ ] FPS medido en hardware de gama media, no solo en la maquina de desarrollo.
- [ ] Fallback de 3 niveles implementado (completo/reducido/estatico) segun capacidad del dispositivo y `prefers-reduced-motion`.
- [ ] La escena 3D no degrada el LCP de la pagina por debajo del umbral del Modulo 10.
- [ ] Si hay scroll storytelling: el progreso de scroll controla camara/uniforms directamente, no clases CSS que disparan animaciones independientes.
