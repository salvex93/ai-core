## Modulo 10 — SEO Tecnico

### Meta tags obligatorios (toda pagina publica)

```html
<title>Titulo de pagina | Nombre del sitio</title>
<meta name="description" content="Descripcion de 150-160 caracteres con keyword primaria.">
<link rel="canonical" href="https://dominio.com/url-canonica/">
<meta property="og:title" content="Titulo">
<meta property="og:description" content="Descripcion hasta 200 caracteres.">
<meta property="og:image" content="https://dominio.com/og-image.jpg">
<meta property="og:url" content="https://dominio.com/url-canonica/">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
```

### Lighthouse CI como gate de PR

```yaml
ci:
  assert:
    assertions:
      'categories:performance':    ['error', { minScore: 0.85 }]
      'categories:accessibility':  ['error', { minScore: 0.95 }]
      'categories:best-practices': ['error', { minScore: 0.90 }]
      'categories:seo':            ['error', { minScore: 0.90 }]
      'largest-contentful-paint':  ['error', { maxNumericValue: 2500 }]
      'cumulative-layout-shift':   ['error', { maxNumericValue: 0.1 }]
      'total-blocking-time':       ['error', { maxNumericValue: 300 }]
```

TBT es solo el proxy de laboratorio de la interactividad: Lighthouse en modo navegacion no mide INP. El criterio real de Core Web Vitals se evalua con datos de campo en el percentil 75 (CrUX o RUM propio con `web-vitals`): LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. Un PR que pasa Lighthouse CI pero degrada INP en campo no cumple el gate; en el release agregar la lectura de INP p75 como verificacion posterior al despliegue. Fuente: web.dev/articles/vitals y web.dev/articles/inp.

