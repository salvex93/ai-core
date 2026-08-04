---
name: doc-builder
description: Generador de documentacion profesional en HTML + PDF. Produce propuestas comerciales, documentos de requerimientos y entregables para clientes siguiendo el sistema visual Evolve (navy/azul, Segoe UI, paginacion controlada). Activa cuando se pide crear o modificar cualquier documento HTML/PDF destinado a un cliente o uso interno formal.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-04
rol: architect
---

# Doc Builder — Generador de Documentacion Profesional

Este perfil gobierna la creacion y modificacion de documentos HTML y PDF para clientes o uso interno formal. Produce entregables con sistema visual consistente, paginacion controlada y exportacion PDF via Puppeteer.

## Cuando Activar Este Perfil

- Al crear cualquier documento nuevo destinado a un cliente (propuesta, requerimientos, brief, reporte).
- Al modificar un documento HTML existente del sistema visual Evolve.
- Al exportar un HTML a PDF con Puppeteer.
- Al agregar o quitar secciones de documentos formales.
- Al definir que informacion va en un documento separado vs. dentro de la propuesta principal.


## Cuando NO Activar Este Perfil

- La tarea es documentacion tecnica interna del proyecto (README, ARCHITECTURE.md, comentarios) — escribir directamente en Markdown.
- La tarea es un mensaje o email informal — no requiere el sistema visual Evolve.
- El destinatario es el equipo tecnico, no un cliente — no es un entregable formal.
- La tarea es solo actualizar una tabla de precios o una seccion de texto en un documento existente — editar directamente sin regenerar el HTML completo.

## Primera Accion al Activar

Verificar si ya existe un documento HTML de referencia en el proyecto:

```bash
find . -maxdepth 2 -name "*.html" | grep -v node_modules
```

Si existe un documento previo del sistema visual Evolve, usarlo como base de estilos. No inventar un sistema visual nuevo.

Si no existe ningun documento previo, usar el sistema visual base definido en este skill.

## Sistema Visual Base — Tokens de Diseno

```css
:root {
  --primary:       #0f172a;   /* navy oscuro — fondos portada, tablas header, arcos */
  --accent:        #3b82f6;   /* azul — etiquetas, acentos, badges, numeros */
  --accent-light:  #eff6ff;   /* azul palido — fondos nota, badge-blue */
  --gray:          #64748b;   /* gris medio — texto secundario */
  --gray-light:    #f8fafc;   /* gris muy claro — fondos de cards y tablas */
  --border:        #e2e8f0;   /* borde estandar */
  --success:       #10b981;   /* verde — condiciones, estado recibido */
  --text:          #1e293b;   /* texto principal */
}
```

Tipografia: `'Segoe UI', system-ui, -apple-system, sans-serif`. Tamano base: 15px. Line-height: 1.65.

## Estructura Obligatoria de Todo Documento

### 1. Portada

Siempre como primera seccion, ocupa 100vh, con `page-break-after: always`:

```html
<div class="cover">
  <div class="cover-logo"><!-- tipo de documento — confidencialidad --></div>
  <div class="cover-center">
    <div class="cover-tag"><!-- categoria / ambito --></div>
    <div class="cover-title"><!-- titulo en 2-3 lineas con <span> de color en el punto final --></div>
    <div class="cover-subtitle"><!-- descripcion en 1-2 oraciones, max 580px --></div>
    <div class="cover-divider"></div>
  </div>
  <div class="cover-meta">
    <!-- siempre 3 columnas: cliente, consultor, fecha --></div>
  </div>
</div>
```

### 2. Contenido

Dentro de `<div class="page">`. Cada bloque tematico en `<div class="section">`.

Cada seccion lleva:
1. `<div class="section-label">NN — Nombre Seccion</div>` — etiqueta en mayusculas, color acento
2. `<h2>` — titulo de la seccion (max 1 linea preferible)
3. Cuerpo: parrafos, tablas, grids o cards segun la naturaleza del contenido

### 3. Firma

Siempre al final del documento, con `page-break-inside: avoid`:

```html
<div class="signature">
  <div class="sig-left">
    <h3>Andrew Arizmendi</h3>
    <p>Consultor Freelance — Inteligencia Artificial</p>
    <p>salvex93@gmail.com</p>
  </div>
  <div class="sig-right">
    <div class="sig-line"></div>
    <p><!-- descripcion del documento --></p>
    <p style="font-size:11px;">Fecha: <!-- fecha completa en espanol --></p>
  </div>
</div>
```

## Componentes Disponibles

### Nota informativa (azul)
Para contexto importante que el lector debe leer antes de continuar:
```html
<div class="intro-note"><!-- contenido --></div>
```

### Nota de advertencia (naranja)
Para acciones requeridas, pendientes criticos o advertencias tecnicas:
```html
<div class="warn-note"><!-- contenido --></div>
```

### Tabla estandar
```html
<table class="portal-table">
  <thead><tr><th>Columna</th>...</tr></thead>
  <tbody><tr><td>Dato</td>...</tr></tbody>
</table>
```

### Grid de variables (2 columnas)
Para listas de items enumerados con numero de acento:
```html
<div class="var-grid">
  <div class="var-item"><span class="var-num">01</span>Descripcion del item</div>
</div>
```

### Badges de estado
```html
<span class="badge badge-blue">Fase 1</span>      <!-- informativo -->
<span class="badge badge-orange">Pendiente</span>  <!-- atencion -->
<span class="badge badge-green">Recibido</span>    <!-- completado -->
<span class="badge badge-gray">Opcional</span>     <!-- neutro -->
```

### Grid de cards 3 columnas
Para resumenes de estado, KPIs o grupos de 3 conceptos:
```html
<div class="card-grid">
  <div class="card">
    <h4>Titulo</h4>
    <p>Descripcion</p>
  </div>
</div>
```

### Separador horizontal
Entre secciones principales:
```html
<div class="divider"></div>
```

## Reglas de Paginacion (Anti-Corte)

Aplicar en el CSS de cada documento. Sin excepcion:

```css
@media print {
  .cover { min-height: 100vh; page-break-after: always; }
  .page  { padding: 40px 48px; }
  .portal-table, .var-grid, .card-grid, .intro-note,
  .warn-note, .section, .signature, .payment-grid,
  .pricing-table, .op-grid, .conditions { page-break-inside: avoid; break-inside: avoid; }
  h2, h3 { page-break-after: avoid; break-after: avoid; }
  p { orphans: 3; widows: 3; }
}
```

Ademas, en los elementos mismos (no solo en @media print):

```css
.section    { page-break-inside: avoid; break-inside: avoid; }
.var-grid   { page-break-inside: avoid; break-inside: avoid; }
.portal-table { page-break-inside: avoid; break-inside: avoid; }
.intro-note, .warn-note { page-break-inside: avoid; break-inside: avoid; }
h2, h3      { page-break-after: avoid; break-after: avoid; }
```

## Exportacion a PDF

El proyecto anfitrion usa `exportar_pdf.js` con Puppeteer. El script acepta el nombre del HTML como argumento:

```bash
node exportar_pdf.js <nombre-archivo.html>
```

El PDF se genera con el mismo nombre en la misma carpeta.

Configuracion Puppeteer estandar (no modificar sin razon justificada):

```js
await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  preferCSSPageSize: false,
  scale: 0.9,
});
```

Siempre generar el PDF inmediatamente despues de crear o modificar el HTML. Nunca entregar solo el HTML sin su PDF correspondiente.

## Reglas de Contenido

### Que incluir en cada tipo de documento

| Tipo | Secciones obligatorias | Lo que NO incluye |
|---|---|---|
| Propuesta comercial | Resumen ejecutivo, arquitectura, plan de trabajo, cronograma, inversion, pagos, costos operativos, condiciones, firma | Requerimientos tecnicos del cliente — van en documento separado |
| Documento de requerimientos | Contexto/estado, bloques de requerimientos por categoria, tabla de prioridades, firma | Precios, honorarios, esquema de pagos |
| Brief interno | Objetivo, alcance, supuestos, criterios de exito | Precios ni condiciones comerciales |

### Ortografia y estilo

- Documentos en espanol estricto con ortografia perfecta incluyendo acentos y signos de puntuacion.
- Lenguaje ejecutivo: neutro, orientado a resultado, sin jerga tecnica con el cliente.
- Sin emojis, iconos decorativos ni adornos visuales fuera del sistema de diseno.
- Sin referencias a herramientas de IA, automatizacion interna ni nombres de sistemas que el cliente no haya mencionado.
- Frases prohibidas: "no paga por promesas", "sin deuda tecnica", "alguien del equipo", "sin que nadie lo haga".

### Nombres de plataformas y sistemas (verificar siempre)

| Incorrecto | Correcto |
|---|---|
| Heins | Hanes |
| Suru | Zuru |
| Lighthouse | ClickHouse |

Si el cliente menciona un nombre nuevo en sesion, registrarlo aqui antes de usarlo en documentos.

## Flujo de Trabajo Estandar

1. Identificar el tipo de documento (propuesta / requerimientos / otro).
2. Verificar si ya existe un HTML de referencia para reusar estilos.
3. Construir el HTML con portada, secciones y firma.
4. Aplicar todas las reglas de paginacion en CSS (screen + print).
5. Generar el PDF: `node exportar_pdf.js <archivo.html>`.
6. Confirmar al usuario: paths de HTML y PDF generados.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener toda generacion de contenido hasta recibir confirmacion:

- El documento incluye precios, plazos o alcance que no fueron confirmados explicitamente en el brief.
- Se pide modificar la propuesta comercial principal en una seccion que afecta los totales o el esquema de pagos.
- El cliente tiene un nombre o sistema que no aparece en la tabla de nombres verificados y podria estar mal escrito.
- Se solicita incluir comparativas con competidores, garantias de resultado o afirmaciones legales sin respaldo documental del cliente.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Asegurar que no se ejecuta: crear documentos con informacion inventada o asumida que no provenga del brief del cliente.
- Prohibido modificar `exportar_pdf.js` sin instruccion explicita — es infraestructura compartida.
- Asegurar que no se ejecuta: omitir la exportacion a PDF al finalizar cualquier tarea de creacion o modificacion de documento.
- Verificar antes validar que no se cortan en impresion A4 antes de usar tablas con mas de 6 columnas.
- Las Reglas Globales de CLAUDE.md aplican sin excepcion a este perfil.

## Modulo — Identidad Editorial, Anti-Plantilla y Gate de PDF

### Principio fundamental

Un documento que abre correctamente en el navegador pero se ve como una plantilla de propuesta descargada no cumple el objetivo. El listón es que un cliente reconozca el documento como hecho a medida para su marca y su caso, no como un tema generico de Bootstrap con el logo cambiado. Si no se puede declarar en una frase por que este documento se distingue de cualquier plantilla de propuesta de stock, no esta listo para exportar.

### Identidad Editorial — declarar antes de codear

Ningun documento HTML/PDF se codea sin declarar primero:

```
IDENTIDAD EDITORIAL:
  Sistema visual: [Evolve navy/azul (default de este skill) | sistema visual de marca del cliente ya provisto | variante monocromatica para documento interno]
  Densidad de contenido: [alta — informe tecnico con tablas densas | media — propuesta comercial estandar | baja — brief ejecutivo de una pagina por seccion]
  Tono de portada: [corporativo serio, sin imagen — solo tipografia y acento de color | portada con imagen de producto/proyecto provista por el cliente | portada minimal solo con wordmark]
  Referencia de tono: [una sola linea — ej. "documento que un banco recibiria de su propia area de cumplimiento, no de una agencia de marketing"]
```

Si el proyecto ya tiene un HTML de referencia (ver "Primera Accion al Activar"), la identidad editorial hereda su paleta y tipografia — no se declara un sistema visual paralelo solo porque el modulo lo permite.

### Prohibido — patrones reconocibles de plantilla/demo

- Portada con foto de stock generica (personas en oficina sonriendo, apreton de manos, skyline corporativo sin relacion al cliente).
- Iconos de Font Awesome o Material Icons por defecto pegados junto a cada titulo de seccion sin proposito informativo — decoracion, no dato.
- Paleta "tema de PDF gratuito de Canva": degradado azul-morado en la portada, tipografia display para el titulo del documento.
- Tablas de precios con filas cebra (zebra striping) de color por defecto del framework CSS, sin alinear al sistema de tokens del documento.
- Numeracion de secciones con emojis o simbolos decorativos en vez de `section-label` numerico tipografico.
- Firma o cierre generico tipo "Gracias por su atencion" sin los datos de contacto y rol reales del consultor.

### Gate de calidad medible (no solo estetico)

| Metrica | Umbral | Verificacion |
|---|---|---|
| Paginacion sin cortes de tabla/card | 0 elementos de `.portal-table`, `.var-grid`, `.card-grid`, `.section` partidos entre paginas | Abrir el PDF generado pagina por pagina y confirmar contra la regla `page-break-inside: avoid` del CSS |
| Contraste de texto sobre fondo de portada y badges | >= 4.5:1 para texto normal, >= 3:1 para texto grande (18px+/bold 14px+) | Verificar los pares de color reales (`--primary`/blanco, `--accent`/`--accent-light`) con un contrastador WCAG (ej. WebAIM Contrast Checker) antes de fijar el token |
| Peso de archivo del PDF final | < 3MB para documentos de hasta 15 paginas sin imagenes de alta resolucion | `ls -la` sobre el PDF exportado, no el HTML fuente |
| Huerfanas y viudas de parrafo | 0 parrafos con 1-2 lineas separadas de su bloque al cruzar pagina | Revision visual del PDF pagina por pagina; confirmar que `orphans: 3; widows: 3;` esta activo en el CSS de impresion |
| Consistencia de numeracion de secciones | 100% de secciones con `section-label` correlativo sin saltos ni duplicados | Grep de `section-label` sobre el HTML final antes de exportar |

### Vigencia — estandar mas reciente del dominio

Verificado contra fuente oficial en esta tarea (`pptr.dev/api/puppeteer.pdfoptions`, dominio oficial del proyecto Puppeteer): `page.pdf()` expone la propiedad `tagged` (booleano, experimental, default `true` en la version documentada actualmente) para generar PDF etiquetado/accesible — es decir, Chrome ya adjunta estructura semantica (roles, alt text) al PDF exportado por defecto desde que esta opcion se activo, no solo un render plano de imagen de texto. Esto habilita lectores de pantalla sobre el PDF entregado sin herramienta adicional. Antes de desactivar `tagged` en `exportar_pdf.js` (ej. por peso de archivo), confirmar que el documento no requiere ese nivel de accesibilidad — desactivarlo es una regresion de capacidad, no una limpieza neutra.

El resto del comportamiento fino de `page.pdf()` (compresion de imagenes, page ranges, headers/footers) esta documentado en la misma pagina oficial referenciada arriba; cualquier dato adicional sobre limites de tamano o comportamiento de compresion que no se haya verificado en esta pasada es orientativo, no verificado contra fuente oficial — confirmar en `pptr.dev` antes de escribirlo como definitivo en este skill.
