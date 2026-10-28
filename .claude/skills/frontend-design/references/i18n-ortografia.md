# i18n y ortografia de interfaces (opcional)

Cargar solo si el proyecto declara mas de un idioma o se revisa texto visible. No es parte del nucleo de frontend-design.

## Modulo 1 — Ortografia y Redaccion de Interfaces

### Principio fundamental

Todo texto visible al usuario es parte del producto. Un error ortografico en la interfaz destruye la credibilidad del sistema igual que un bug funcional. Este modulo aplica sin excepcion a cualquier texto que el usuario final pueda leer.

### Deteccion automatica de idioma

Al recibir una tarea de frontend, detectar el idioma de la interfaz antes de generar texto:

1. Leer los strings existentes en el proyecto (i18n files, componentes, constantes de mensajes).
2. Identificar el idioma predominante.
3. Aplicar las reglas ortograficas y tipograficas especificas de ese idioma.
4. Si el proyecto es multiidioma: respetar el idioma de cada archivo de traduccion por separado.

### Reglas ortograficas universales

- Mayusculas iniciales segun la convencion del idioma (title case en ingles, solo primera letra en español).
- Puntuacion correcta: mensajes de error terminan en punto. Labels de formulario sin punto. Placeholders son ejemplos.
- Sin abreviaciones informales: "info" → "informacion", "config" → "configuracion", "msg" → "mensaje".
- Sin texto en MAYUSCULAS COMPLETAS para frases largas (reservado para siglas).
- Coherencia de tratamiento al usuario: "tu" o "usted" en todo el producto, no mezclado.

### Reglas especificas por idioma

**Español:**
- Tildes obligatorias: accion, informacion, configuracion, autenticacion, validacion, sesion, conexion, pagina, numero.
- Signos de apertura obligatorios: ¿Estas seguro? / ¡Operacion exitosa!
- Gerundios solo para estado en progreso: "Cargando...", "Guardando..."
- Errores: "No se pudo completar la operacion." (pasado). Botones: infinitivo o imperativo.

**Ingles:**
- Title Case para titulos de pagina: "User Settings", "Payment History".
- Sentence case para mensajes: "Something went wrong. Please try again."
- No apostrophes en plurales: "IDs" no "ID's".
- Error messages accionables: "Invalid email address" no "Error 422".

### Tipos de texto y sus convenciones

| Tipo | Convencion | Ejemplo |
|---|---|---|
| Titulo de pagina | Describe el contexto actual | "Configuracion de cuenta" |
| Label de campo | Sustantivo descriptivo, sin dos puntos | "Correo electronico" |
| Placeholder | Ejemplo del formato esperado | "usuario@empresa.com" |
| Mensaje de error inline | Especifico, accionable, sin culpar al usuario | "El correo debe tener formato valido." |
| Notificacion de exito | Confirma la accion completada | "Los cambios se guardaron correctamente." |
| Boton primario | Verbo infinitivo que describe la accion | "Guardar cambios" |
| Boton destructivo | Verbo + objeto para forzar confirmacion | "Eliminar cuenta" |
| Estado vacio | Explica por que esta vacio y que hacer | "No tienes proyectos aun. Crea el primero." |

### Lista de verificacion de texto en PR

- [ ] Ortografia correcta en el idioma detectado.
- [ ] Tildes y caracteres especiales presentes y correctos.
- [ ] Coherencia de tratamiento al usuario.
- [ ] Labels sin puntuacion final. Mensajes de error con punto final.
- [ ] Placeholders son ejemplos, no instrucciones.
- [ ] Botones usan infinitivo o imperativo, no gerundio.
- [ ] Mensajes de error accionables, no tecnicos.

### Internacionalizacion Real de Producto (i18n/l10n)

Lo anterior en este modulo cubre ortografia y tono dentro de un idioma. Esta seccion cubre la infraestructura para soportar multiples idiomas y locales en el mismo producto — no es opcional en cuanto el proyecto declara mas de un idioma en `CLAUDE.md` o en los archivos de traduccion existentes.

**Extraccion de strings — nunca texto hardcodeado en componentes:**

```tsx
// PROHIBIDO — string hardcodeado, no traducible
<button>Guardar cambios</button>

// CORRECTO — clave de traduccion, el valor vive en el archivo de idioma
<button>{t('cuenta.guardar_cambios')}</button>
```

| Framework | Libreria | Formato de archivo |
|---|---|---|
| React / Next.js | `next-intl` (App Router) o `react-i18next` | JSON por idioma, namespaced por seccion |
| Vue / Nuxt | `vue-i18n` / `@nuxtjs/i18n` | JSON o YAML por idioma |
| Svelte | `svelte-i18n` | JSON por idioma |
| Flutter | `intl` + `.arb` (ARB format) | Ver `mobile-engineer` para el detalle de implementacion |

**Pluralizacion — nunca concatenar numero + string singular:**

```tsx
// PROHIBIDO — no funciona en idiomas con reglas de plural distintas al ingles/español simple
`${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`

// CORRECTO — Intl.PluralRules o el helper de la libreria de i18n resuelve la regla real del idioma
new Intl.PluralRules('es').select(cantidad); // 'one' | 'many' | 'other'
t('carrito.productos', { count: cantidad }); // la libreria resuelve el plural correcto internamente
```

Idiomas como arabe o polaco tienen mas de dos formas de plural (singular/dual/plural/pocos/muchos) — el patron ternario `? :` de JavaScript nunca es correcto para i18n real.

**Formato de fecha, moneda y numero — nunca construir el string manualmente:**

```typescript
new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(fecha);
new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);
new Intl.NumberFormat('de-DE').format(1234.5); // "1.234,5" — separadores distintos por locale
```

**RTL (Right-to-Left) — si el proyecto soporta arabe, hebreo u otro idioma RTL:**

- Usar propiedades logicas de CSS (`margin-inline-start`, `padding-inline-end`) en vez de fisicas (`margin-left`, `padding-right`) — se invierten automaticamente con `dir="rtl"`.
- El atributo `dir` se fija en `<html>` segun el idioma activo, no se simula solo con CSS de un contenedor interno.
- Iconos direccionales (flechas de "siguiente/anterior") se espejan en RTL; iconos de marca o contenido (logos, fotos) no.

### Lista de verificacion i18n en PR

- [ ] Cero strings de texto visible hardcodeados en componentes — todo pasa por la capa de traduccion.
- [ ] Pluralizacion usa `Intl.PluralRules` o el helper de la libreria, nunca un ternario manual.
- [ ] Fechas, moneda y numeros usan `Intl.*` con el locale activo, nunca concatenacion manual de string.
- [ ] Si el proyecto soporta RTL: propiedades logicas de CSS, `dir` en el elemento raiz, iconos direccionales espejados.
