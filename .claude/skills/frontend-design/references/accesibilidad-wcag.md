# Accesibilidad visual WCAG 2.2 (checklist pre-handoff)

## Modulo 5 — Accesibilidad Visual WCAG 2.2 AA

### Checklist obligatorio pre-handoff

**Contraste:**
- [ ] Texto normal: relacion >= 4.5:1 en todos los estados.
- [ ] Texto grande (>= 18pt = 24px, o >= 14pt = 18.66px en negrita, segun WCAG 1.4.3): relacion >= 3:1.
- [ ] Bordes de inputs y controles: >= 3:1 contra fondo.
- [ ] Iconos informativos: >= 3:1.
- [ ] Indicador de foco: >= 3:1 contra color adyacente (WCAG 1.4.11). El foco no queda totalmente oculto por contenido fijo (2.4.11 Focus Not Obscured, AA, nuevo en 2.2). Apariencia reforzada del foco: 2.4.13 Focus Appearance, AAA.

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

## Checklist previo a handoff (modo especificar)

Un diseno que falla en cualquier punto no pasa al equipo de frontend.

- [ ] Identidad visual declarada en una linea con paradigma especifico — no "moderno" ni "limpio".
- [ ] Tokens W3C definidos en `tokens.json` para colores, tipografia, espaciado, sombras y motion.
- [ ] Escala de color verificada con herramienta de contraste (no solo inspeccion visual).
- [ ] Diseno verificado en modo claro Y modo oscuro.
- [ ] Diseno verificado con simulador de daltonismo (deuteranopia, protanopia).
- [ ] Flujo de usuario documentado con estados de error, vacio y carga.
- [ ] Todos los estados de cada componente interactivo especificados (min 3: default, hover/focus, disabled).
- [ ] Motion design documentado con duracion, easing y condicion de reduccion de movimiento.
- [ ] Focus-visible con contraste >= 3:1 contra elemento adyacente (WCAG 1.4.11) y sin quedar oculto por headers o banners fijos (2.4.11).
- [ ] Target size cumple WCAG 2.5.8 (minimo 24x24px, recomendado 44x44px).
- [ ] Jerarquia tipografica verificada: una sola H1 por vista, sin saltar niveles.
- [ ] Paradigma visual justificado por tipo de producto y publico objetivo.
