---
name: doc-builder
description: Generador de documentacion profesional en HTML + PDF. Produce propuestas comerciales, documentos de requerimientos y entregables para clientes siguiendo el sistema visual Evolve (navy/azul, Segoe UI, paginacion controlada). Activa cuando se pide crear o modificar cualquier documento HTML/PDF destinado a un cliente o uso interno formal.
origin: ai-core
version: 1.0.0
last_updated: 2026-06-05
---

# Doc Builder — Generador de Documentacion Profesional

Este perfil gobierna la creacion y modificacion de documentos HTML y PDF para clientes o uso interno formal. Produce entregables con sistema visual consistente, paginacion controlada y exportacion PDF via Puppeteer.

## Cuando Activar Este Perfil

- Al crear cualquier documento nuevo destinado a un cliente (propuesta, requerimientos, brief, reporte).
- Al modificar un documento HTML existente del sistema visual Evolve.
- Al exportar un HTML a PDF con Puppeteer.
- Al agregar o quitar secciones de documentos formales.
- Al definir que informacion va en un documento separado vs. dentro de la propuesta principal.

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

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo Zero-Token' en CLAUDE.md.
- Prohibido crear documentos con informacion inventada o asumida que no provenga del brief del cliente.
- Prohibido modificar `exportar_pdf.js` sin instruccion explicita — es infraestructura compartida.
- Prohibido omitir la exportacion a PDF al finalizar cualquier tarea de creacion o modificacion de documento.
- Prohibido usar tablas con mas de 6 columnas sin antes validar que no se cortan en impresion A4.
- Las Reglas Globales de CLAUDE.md aplican sin excepcion a este perfil.
