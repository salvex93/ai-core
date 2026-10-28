# Apple HIG y Material Design 3 (opcional)

Cargar solo para justificar decisiones ante cliente o si el paradigma es Apple-adjacent.

Vocabulario formal para justificar decisiones de diseno ante un cliente o equipo tecnico con el mismo estandar que usan los dos sistemas de diseno de mayor adopcion del mercado — no reemplaza los paradigmas esteticos 2026 de la Declaracion de Identidad Visual, es un lente adicional de coherencia quando el producto es Apple-adjacent (paradigma `liquid-glass`) o cuando se necesita justificar jerarquia visual con lenguaje que un equipo de producto reconozca.

### Apple HIG — 3 principios core + Consistency como tejido conectivo

Verificado 2026-09-18 contra `developer.apple.com/design/human-interface-guidelines/foundations`: son **3 principios**, no 4 — la version popularizada como "4 pilares" (con Consistency como cuarto principio paralelo) no corresponde a la estructura vigente de la fuente oficial. Consistency es tejido conectivo entre los tres, no un pilar independiente.

| Principio | Definicion oficial | Aplicacion practica en este skill |
|---|---|---|
| **Clarity** | Texto legible en cualquier tamano, iconos precisos y nitidos, adornos minimos | Auditar contra la tabla de tipografia fluid (Modulo 1) y el checklist WCAG (Modulo 5) — un diseno "claro" ya cumple contraste y jerarquia tipografica |
| **Deference** | La interfaz queda en segundo plano; el contenido del usuario (fotos, mensajes, trabajo) permanece en primer plano | Revisar que el paradigma estetico elegido (Modulo Declaracion de Identidad) no compita visualmente con el contenido — glassmorphism y liquid-glass son los paradigmas de este catalogo mas alineados con Deference por diseno |
| **Depth** | Capas visuales y movimiento realista comunican jerarquia entre elementos de interfaz | Se traduce directo a los tokens de elevacion (`--glass-shadow`, `--liquid-depth`, `--clay-shadow` del Modulo 1) y a los principios Disney de Depth-adyacentes del Modulo 4 (Staging, Arc) |

Uso: al declarar `IDENTIDAD: liquid-glass-editorial` (o cualquier paradigma Apple-adjacent), verificar los 3 principios como gate adicional antes del handoff — no sustituye el checklist de Lista de Verificacion existente, lo precede como criterio de intencion.

### Material Design 3 — Color Roles (vocabulario de tokens semanticos)

Verificado 2026-09-18 contra `m3.material.io/styles/color/roles`: el sistema de color de M3 no asigna valores hex sueltos, asigna **roles semanticos** que despues se mapean a tonos. Estructura de roles:

- **Accent roles** (`primary`, `secondary`, `tertiary`): para enfatizar o desenfatizar elementos de primer plano — no son solo "color de marca", son roles con proposito de enfasis relativo.
- **Surface role** (`surface`): fondos y areas de baja emphasis de la pantalla.
- **Roles `on-*`** (`on-primary`, `on-surface`, etc.): color de texto/iconos que va ENCIMA de su color pareja — nunca se elige un color de texto suelto, se deriva del rol contenedor.
- **Roles `*-container`** (`primary-container`, etc.): variante de superficie del color de acento, para contenedores que necesitan el tono de marca sin la intensidad del rol base.

Comparacion con el sistema de color de este skill (Modulo 1, "5 capas"): el sistema propio ya cubre brand/semantic/neutral/surface/dark-mode, pero no exige explicitamente el patron `on-*` derivado — **gap real de nomenclatura**, no de cobertura. Al definir `tokens.json` (Modulo 2), evaluar si el proyecto necesita adoptar el patron `on-*` de M3 (recomendado cuando el design system debe interoperar con componentes Material o cuando el equipo de frontend ya conoce ese vocabulario) versus mantener nomenclatura propia (`--color-text-on-primary`, ya usado en la Especificacion de Componente del Modulo 2 — compatible en intencion, distinto en convencion de nombre).

### Gate de vigencia — mismo criterio que Modulo 7

| Verificacion | Umbral | Metodo |
|---|---|---|
| Estructura de principios HIG citada (3 + Consistency) | Coincide con `developer.apple.com/design/human-interface-guidelines/foundations` al momento del proyecto | WebSearch o WebFetch dirigido antes de citarla ante cliente |
| Lista de color roles M3 citada | Coincide con `m3.material.io/styles/color/roles` | Idem — Google puede agregar roles nuevos sin aviso previo en este archivo |
