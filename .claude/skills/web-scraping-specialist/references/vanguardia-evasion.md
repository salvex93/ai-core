## Modulo — Vanguardia en Extraccion Web y Evasion Anti-Bot

### Principio fundamental

Un scraper que corre pero se detecta en la primera capa no cumple el objetivo. El listón no es "paso el request sin error 403" — es un pipeline donde fingerprint TLS, comportamiento y proveedor anti-bot detectado forman un solo sistema deliberado por sitio objetivo, no un stack generico copiado de un tutorial. Si no se puede declarar en una frase que proveedor anti-bot enfrenta este scraper y por que la herramienta elegida lo cubre, no esta listo.

### Identidad de extraccion — declarar antes de codear

Ningun scraper se codea sin declarar primero:

```
IDENTIDAD DE EXTRACCION:
  Proveedor anti-bot detectado: [Cloudflare | Datadome | Imperva/Incapsula | PerimeterX/HUMAN | Akamai | ninguno/desconocido]
  Metodo de extraccion: [API interna reverse-engineered | HTTP+parsing | browser headless stealth | LLM-driven semantico]
  Superficie de riesgo de deteccion: [TLS/JA3 | JS fingerprint (canvas/WebGL/fonts) | comportamiento (mouse/timing) | las tres]
  Volumen y cadencia: [una linea — ej. "800 URLs/dia, 1 req/s, ventana nocturna 02:00-05:00"]
```

Si `attack-surface-analyst` ya perfilo el sitio objetivo o `security-auditor` ya reviso el marco legal, esta identidad es su extension operativa — mismo sitio, misma base legal documentada, no un pipeline paralelo sin trazabilidad.

### Prohibido — patrones reconocibles de scraper generico/plantilla

- User-Agent de Chrome desactualizado (version fija hardcodeada, ej. "Chrome/91.0") sin rotacion ni sincronia con el navegador real usado — primera señal que un bot detector correlaciona en milisegundos.
- `playwright-stealth` o `puppeteer-extra-plugin-stealth` como unica capa de evasion contra un proveedor que ya los detecta (Datadome/Akamai los fingerprintean desde 2024) — usar sin verificar contra que proveedor se enfrenta.
- Delays fijos (`sleep(2)`) en vez de distribucion aleatoria — la cadencia constante es tan detectable como la ausencia total de delay.
- Scraper que ignora `robots.txt` y HTTP 429 sin backoff, asumiendo que "total, es publico" — sin evaluar TOS ni base legal documentada.
- Reintentar contra el mismo dominio sin circuit breaker tras bloqueo confirmado (`SUSPECTED_BLOCK`) — insistir agrava el fingerprint y puede escalar a bloqueo de IP/rango.
- Extraccion que persiste `null`, `[]` o precio `0` como si fueran datos validos, sin distinguir bloqueo silencioso de ausencia real de stock.

### Gate de calidad medible — extraccion y evasion

Un pipeline de scraping que no cumple estos umbrales se rechaza, sin importar que tan completo se vea el codigo:

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Tasa de exito por corrida | >= 95% de URLs objetivo retornan dato valido (no bloqueo, no vacio) | Contador de `SUSPECTED_BLOCK` vs total de requests en el log estructurado de la corrida |
| Latencia de deteccion de bloqueo | Bloqueo identificado y loggeado en <= 1 request tras el cambio de comportamiento del sitio | Revisar que el circuit breaker abre dentro del umbral configurado (`UMBRAL_CIRCUIT_BREAKER`), no despues de N reintentos ciegos |
| Cumplimiento de rate limit declarado | 0 requests por encima del limite configurado (ej. 1 req/s) en toda la corrida | Analisis del timestamp de cada request en el log — delta minimo entre requests consecutivos al mismo dominio |
| Validacion de schema post-extraccion | 100% de registros extraidos pasan Zod/Pydantic antes de persistir — 0% bypass | Revisar cobertura de test: todo path de extraccion tiene un `safeParse`/`try Producto(**datos)` antes del `Dataset.pushData` o equivalente |
| Fingerprint TLS coherente con el navegador declarado | El JA3/JA4 hash del request coincide con el user-agent enviado (sin mismatch Chrome-UA + fingerprint Python `requests`) | Verificar con `curl-cffi` en modo debug o herramienta externa de fingerprint check (ej. tls.peet.ws) antes de correr contra produccion |

### Vigencia — verificar antes de escribir cualquier cambio

Camoufox: reverificado 2026-09-15 contra `github.com/daijro/camoufox/releases` — release mas reciente es v152.0.4-beta.30 (1 septiembre 2026), no v146.0.1-beta.25 (enero 2026, dato ya obsoleto). El numero base de Firefox tambien subio de 146 a 152, no es solo un bump de beta. Desarrollo activo confirmado (releases mensuales). Sigue siendo un fork de Firefox que parchea a nivel C++ (no inyeccion JS), por lo que continua siendo la opcion recomendada contra fingerprinting JS profundo — pero el estado "beta" implica verificar estabilidad antes de comprometerlo a un pipeline critico de produccion.

Cloudflare Turnstile: reverificado 2026-09-15 contra `developers.cloudflare.com/turnstile` — confirma que el widget opera en tres modos oficiales (Managed, Non-Interactive, Invisible) y que la validacion server-side contra la API `siteverify` es obligatoria — el widget del lado del cliente por si solo no protege nada. Duracion del token confirmada 2026-09-16 contra la referencia tecnica especifica `developers.cloudflare.com/turnstile/get-started/server-side-validation/` (la pagina de overview no lo cubre, por eso no aparecio en la pasada anterior): **300 segundos (5 minutos) desde su generacion**, de un solo uso — si expira o se reintenta un token ya usado, `siteverify` responde con el error `timeout-or-duplicate`. El dato de 5 minutos ya presente en el skill queda confirmado como vigente.

Patchright: reverificado 2026-09-15 contra `github.com/Kaliiiiiiiiii-Vinyzu/patchright` — proyecto activo (deploy de versiones automatico), valida exitosamente contra Cloudflare, Kasada, Akamai, Shape/F5, Datadome y Fingerprint.com. Limitacion real confirmada en el propio README: "Patchright only patches CHROMIUM based browsers. Firefox and Webkit are not supported" — no usarlo como alternativa de stealth si el pipeline requiere Firefox/Webkit, en ese caso Camoufox (fork de Firefox) sigue siendo la opcion correcta.

curl-cffi: reverificado 2026-09-15 contra `registry` oficial de PyPI (`pypi.org/pypi/curl_cffi/json`) — version actual 0.16.3. El repositorio (`github.com/lexiforest/curl_cffi`) confirma 37 fingerprints de impersonate disponibles en la version open source (Chrome, Safari, Firefox con targets especificos como `chrome124`; targets adicionales solo en el plan comercial) — usar `curl-cffi list` para la lista exacta vigente en el entorno de instalacion antes de fijar un target especifico en codigo de produccion, ya que la lista de versiones soportadas cambia con cada release.

Pricing exacto de los servicios de CAPTCHA solving (2captcha, CapSolver, AntiCaptcha, NopeCHA): no verificable en esta pasada (las paginas de pricing de estos proveedores no son accesibles via fetch estatico) — sigue siendo orientativo, no verificado contra fuente oficial. Confirmar el pricing vigente directamente en el dashboard de cada proveedor antes de presentarlo como cifra firme frente a un cliente.

### Checklist de verificacion — vanguardia en extraccion/evasion

- [ ] `IDENTIDAD DE EXTRACCION:` declarada y coherente con el proveedor anti-bot real del sitio (no asumido por analogia).
- [ ] Cero patrones de la lista de prohibidos (UA desactualizado, stealth como unica capa, delays fijos, ignorar robots.txt/429, reintento sin circuit breaker, persistir bloqueo como dato valido).
- [ ] Los 5 umbrales del gate de calidad medidos y documentados en el log de la corrida, no solo verificados una vez en desarrollo.
- [ ] Herramienta de evasion elegida (Camoufox/Patchright/curl-cffi/Browserbase) justificada contra el proveedor anti-bot detectado en la tabla de jerarquia, no elegida por default.
- [ ] Cualquier afirmacion sobre version, deprecacion o capacidad de una herramienta de este modulo verificada contra su fuente oficial antes de codificar — si no se verifico, marcado explicitamente como orientativo.
