# Reglas de revision de interfaz

Categorias propias para auditar codigo de UI. Cada regla es verificable leyendo el diff. Reportar hallazgos como ruta:linea y la regla violada.

## Animacion
- Animar solo `transform` y `opacity`; mover `top`, `left`, `width` o `height` fuerza layout en cada fotograma. Para tamano usar `transform: scale` o la tecnica de grid `0fr -> 1fr`.
- Nunca `transition: all`. Listar las propiedades exactas que cambian.
- Toda animacion declara duracion y easing desde tokens y tiene rama bajo `prefers-reduced-motion: reduce`.
- Definir `transform-origin` donde el punto de anclaje importe (menus, popovers).
- Animaciones interrumpibles: una transicion nueva no debe esperar a que termine la anterior.

## Controles y semantica
- Accion = `<button>`; navegacion = `<a href>`. Un `div` o `span` con `onClick` no recibe foco ni responde a teclado: rechazar.
- Controles solo con icono llevan `aria-label`; los iconos decorativos, `aria-hidden="true"`.
- Todo campo con `<label>` asociado; no usar el placeholder como etiqueta.
- Jerarquia de encabezados sin saltos y con una sola H1 por vista; landmarks (`main`, `nav`) presentes.
- Actualizaciones asincronas (toasts, validacion) anunciadas con `aria-live="polite"`.
- Nunca quitar el outline de foco sin reemplazo visible (`:focus-visible`).

## Zoom, tacto y gestos
- No deshabilitar el zoom (`user-scalable=no`, `maximum-scale=1`).
- `touch-action: manipulation` en controles para evitar el retardo de doble toque; `overscroll-behavior: contain` en modales y paneles con scroll propio.
- Area tactil minima 24x24 px (44x44 recomendado); espaciar controles contiguos.
- Evitar seleccion de texto accidental durante arrastres (`user-select: none` solo en la zona de arrastre).

## Estado en la URL
- Filtros, orden, pagina, pestana activa y busqueda viven en la URL (query string) para poder compartir, recargar y usar atras/adelante.
- Navegacion interna con enlaces reales, no con handlers que cambian estado sin ruta.
- Acciones destructivas piden confirmacion o permiten deshacer.

## Formatos e internacionalizacion
- Fechas, numeros, monedas y listas via `Intl.*` con el locale activo; nunca concatenar manualmente.
- Texto largo no rompe el layout: `min-width: 0` en hijos flex, truncado o `overflow-wrap` explicito.
- Estados vacio, cargando y error disenados para cada lista y formulario.

## Pantalla, tema y safe areas
- Declarar `color-scheme` (CSS y `<meta name="color-scheme">`) para que controles nativos y scrollbars sigan el tema.
- Definir `theme-color` coherente con el fondo.
- Respetar safe areas con `env(safe-area-inset-*)` y `viewport-fit=cover` en pantallas con notch.
- Usar `100dvh` en lugar de `100vh` para alturas completas en movil.

## Hidratacion y renderizado
- El primer render del cliente debe coincidir con el HTML del servidor: nada de `Date.now()`, `Math.random()` ni lectura de `localStorage` durante el render inicial.
- Inputs controlados con `onChange` y `value` coherentes; no mezclar con valores por defecto no controlados.
- Imagenes con `width` y `height` (o `aspect-ratio`) para evitar CLS; las que estan bajo el pliegue con `loading="lazy"`, la imagen LCP con `fetchpriority="high"`.
- Listas largas virtualizadas o paginadas; evitar renderizar miles de nodos.

## Contraste y legibilidad
- Texto 4.5:1, componentes graficos y foco 3:1; verificar en modo claro y oscuro.
- No transmitir informacion solo con color.
- Unidades relativas (`rem`) para tipografia; respetar el tamano de fuente del usuario.
