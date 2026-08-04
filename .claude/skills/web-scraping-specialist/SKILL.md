---
name: web-scraping-specialist
description: Especialista en extraccion de datos desde plataformas web y aplicaciones retail. Herramientas 2026: Stagehand (IA-nativo), browser-use (Python/LLM-driven), Crawlee (Node.js profesional), Browserbase (headless cloud), Camoufox, curl-cffi. Estrategias por proveedor anti-bot: Cloudflare, Datadome, Imperva, PerimeterX. Session state pooling, storage state reutilizable, OCR con Google Vision y Tesseract, rotacion de proxies residenciales. Activa al extraer datos de plataformas sin API oficial, construir monitores de precios, implementar pipelines OCR, o disenar scrapers resilientes con evasion avanzada.
origin: ai-core
version: 2.1.0
last_updated: 2026-08-04
rol: architect
---

# Web Scraping Specialist — Extraccion de Datos desde Plataformas Web

Gobierna el diseno e implementacion de pipelines de extraccion de datos desde sitios web, plataformas retail y documentos escaneados. Cubre el ciclo completo: deteccion del metodo optimo de extraccion, evasion de protecciones anti-scraping, normalizacion de datos y entrega al pipeline de datos del anfitrion.

Complementos: `data-engineer` (pipeline Medallion para los datos extraidos), `backend-architect` (APIs de exposicion de los datos), `security-auditor` (revision de riesgos legales y tecnicos), `attack-surface-analyst` (fingerprinting y deteccion de exposicion).

IMPORTANTE — Marco legal y etico: antes de implementar cualquier scraping, verificar los Terminos de Servicio del sitio objetivo. El scraping de datos publicos es generalmente legal en muchas jurisdicciones, pero puede violar TOS y generar bloqueos o acciones legales. Siempre implementar con rate limiting respetuoso. Nunca extraer datos protegidos por login sin autorizacion explicita del propietario.

## Cuando Activar Este Perfil

- Al construir un monitor de precios para plataformas retail (Amazon, MercadoLibre, Falabella, etc.).
- Al extraer catalogo de productos, stock o descripciones de un marketplace sin API oficial.
- Al implementar OCR para procesar facturas, guias de despacho, ordenes de compra o catalogos escaneados.
- Al disenar un pipeline de inteligencia competitiva desde sitios web publicos.
- Al integrar datos de un ERP o plataforma SaaS que no expone API pero tiene interfaz web.
- Al diagnosticar por que un scraper existente esta siendo bloqueado.


## Cuando NO Activar Este Perfil

- El sitio tiene API oficial disponible — usar la API directamente es siempre preferible al scraping.
- La tarea es extraccion de datos de una BD o sistema interno propio — usar `database-ops` o `backend-architect`.
- La tarea es web scraping de un sitio sin protecciones (HTML estatico, sin JS, sin anti-bot) — `axios` + `cheerio` es suficiente sin necesitar este skill.
- La tarea viola los terminos de servicio del sitio objetivo o leyes de proteccion de datos aplicables — detener y documentar.

## Primera Accion al Activar

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta dependencias de scraping (playwright, puppeteer, selenium, scrapy, beautifulsoup), configuraciones de proxy, variables de entorno CAPTCHA_API_KEY, y pipelines de datos existentes")
```

Si MCP gemini-bridge no disponible:
```bash
grep -r "playwright\|puppeteer\|selenium\|scrapy\|beautifulsoup\|tesseract\|captcha" . --include="*.json" --include="*.txt" --include="*.py" --include="*.ts" -l
```

Verificar adicionalmente:
1. Si el sitio objetivo tiene API oficial documentada — siempre preferir API sobre scraping.
2. Revisar `robots.txt` del sitio para identificar rutas permitidas y restricciones de crawling.
3. Verificar si el sitio usa renderizado SPA (React/Vue/Angular) — determina si se necesita browser automation o basta con requests HTTP.

## Directiva de Interrupcion

Insertar directiva y detener ante:

- El sitio objetivo requiere autenticacion con credenciales de un usuario final sin su consentimiento explicito documentado.
- La tarea implica extraer datos personales identificables de usuarios del sitio (PII) sin base legal documentada.
- El volumen de requests propuesto puede causar degradacion de servicio al sitio objetivo (> 10 req/s sin throttling).
- El cliente ha firmado contrato de exclusividad o NDA con el sitio objetivo que prohibe extraccion automatizada.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Seleccion de Metodo de Extraccion

Jerarquia de metodos (usar el mas simple que funcione):

| Metodo | Cuando usar | Herramienta | Deteccion anti-bot |
|---|---|---|---|
| API oficial | El sitio la ofrece | requests/axios | Nula |
| HTTP + parsing | Sitio renderizado en servidor (SSR) | httpx + BeautifulSoup / cheerio | Baja |
| LLM-driven (IA-nativo) | Flujos complejos con navegacion semantica | Stagehand / browser-use | Media |
| Browser headless | SPA (React/Vue/Angular), AJAX | Playwright / Crawlee | Media |
| Browser con stealth DataDome/Akamai | Sitios con DataDome v3 o Akamai Bot Manager | **Camoufox** (Firefox anti-detection nativo) | Alta |
| Browser con stealth Cloudflare | Sitios con Cloudflare Turnstile v2 / JS Challenge | **Patchright** (Playwright parcheado) | Alta |
| Browser cloud | Entorno sin IP propia, alta escala | Browserbase | Alta |
| API interna (reverse engineer) | El sitio hace llamadas XHR a una API JSON interna | httpx + analisis de Network tab | Media |

Regla: revisar el Network tab del sitio antes de implementar browser headless. Muchos sitios que parecen requerir browser en realidad exponen una API JSON interna (XHR/Fetch) que es mas eficiente y menos detectable.

### Las 4 Capas de Deteccion Anti-Bot 2026

Fallar en UNA SOLA capa = flaggeado, sin importar cuantas otras se pasen. Diagnosticar en este orden:

| Capa | Que verifica el anti-bot | Herramienta de mitigacion |
|---|---|---|
| 1. TLS fingerprint | Firma de la libreria TLS (JA3/JA4 hash) | curl-cffi, Camoufox, Patchright |
| 2. HTTP/2 frame order | Orden de frames SETTINGS/HEADERS en H2 | curl-cffi (impersona Chrome/Firefox nativo) |
| 3. JavaScript fingerprint | navigator, canvas, WebGL, fonts, AudioContext | Camoufox (parchea Firefox), Patchright |
| 4. Comportamiento | Timing de clicks, scroll, movimiento de mouse, cadencia de requests | Delays aleatorios, simulacion de interaccion humana |

**Jerarquia de herramienta por proveedor anti-bot:**
- DataDome v3 / Akamai → **Camoufox** (primera opcion)
- Cloudflare Turnstile v2 → **Patchright**
- Imperva Neuro / PerimeterX → **Browserbase** (IP residencial + stealth)
- Sin anti-bot o bajo → **Crawlee** + Playwright estandar

## Herramientas 2026 — Punta de Lanza

### Stagehand (IA-nativo, Node.js)

Stagehand convierte instrucciones en lenguaje natural en acciones de browser. Ideal para flujos con navegacion semantica compleja o cuando el DOM cambia frecuentemente.

```typescript
import Stagehand from '@browserbasehq/stagehand';

const stagehand = new Stagehand({ env: 'LOCAL' }); // o 'BROWSERBASE' para cloud
await stagehand.init();

const page = stagehand.page;
await page.goto('https://sitio.com');

// Extraccion semantica — no requiere conocer los selectores
const productos = await stagehand.extract({
  instruction: 'Extrae todos los productos con nombre, precio y disponibilidad',
  schema: z.array(z.object({
    nombre: z.string(),
    precio: z.number(),
    disponible: z.boolean()
  }))
});

// Navegacion semantica — resiste cambios de DOM
await stagehand.act({ action: 'Hacer clic en el boton de siguiente pagina' });
```

### browser-use (Python, LLM-driven)

Framework Python que conecta un LLM directamente al browser para ejecutar tareas de alto nivel.

```python
from browser_use import Agent
from langchain_anthropic import ChatAnthropic

async def extraer_con_ia():
    agent = Agent(
        task="Ir a amazon.com, buscar 'auriculares bluetooth', "
             "extraer los primeros 10 resultados con nombre y precio",
        llm=ChatAnthropic(model='claude-haiku-4-5'),  # usar Haiku para reducir costo
    )
    result = await agent.run()
    return result
```

### Crawlee (Node.js — crawling profesional con anti-ban integrado)

```typescript
import { PlaywrightCrawler, Dataset } from 'crawlee';

const crawler = new PlaywrightCrawler({
  maxRequestsPerCrawl: 100,
  maxConcurrency: 5,
  // Anti-ban integrado: delays aleatorios, rotacion de User-Agent, retry automatico
  requestHandlerTimeoutSecs: 30,
  async requestHandler({ request, page, enqueueLinks }) {
    const title = await page.title();
    const precios = await page.$$eval('.precio', els => els.map(e => e.textContent));
    await Dataset.pushData({ url: request.url, title, precios });
    await enqueueLinks({ globs: ['https://tienda.com/categoria/**'] });
  },
});

await crawler.run(['https://tienda.com/']);
```

### Browserbase (headless cloud — sin IP propia)

```typescript
import { Browserbase } from '@browserbasehq/sdk';
import { chromium } from 'playwright';

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
const session = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID });

const browser = await chromium.connectOverCDP(session.connectUrl);
const page = await browser.newPage();
await page.goto('https://sitio-con-cloudflare.com');
// Browserbase gestiona la IP, los proxies y el fingerprint automaticamente
```

### Session State Pooling — reutilizar autenticacion

```python
# Guardar estado de sesion autenticada (evita re-login en cada corrida)
async def guardar_sesion(page, ruta: str = 'session.json'):
    await page.context.storage_state(path=ruta)

async def cargar_sesion(playwright, ruta: str = 'session.json') -> Page:
    import os
    browser = await playwright.chromium.launch()
    context_kwargs = {}
    if os.path.exists(ruta):
        context_kwargs['storage_state'] = ruta
    context = await browser.new_context(**context_kwargs)
    return await context.new_page()

# Patron de pool: N sesiones paralelas con storage_state diferente por cuenta
async def pool_sesiones(cuentas: list[dict]) -> list[Page]:
    pages = []
    async with async_playwright() as p:
        for cuenta in cuentas:
            page = await cargar_sesion(p, f'session_{cuenta["id"]}.json')
            pages.append(page)
    return pages
```

## Estrategias por Proveedor Anti-Bot

| Proveedor | Señales que detecta | Estrategia recomendada |
|---|---|---|
| **Cloudflare** | TLS fingerprint, JS challenges, IP reputation, Canvas/WebGL | Camoufox (Firefox fingerprint) + proxy residencial o Browserbase |
| **Datadome** | Comportamiento de mouse, timing de teclado, Canvas hash | Playwright-stealth + delays humanos + proxy ISP |
| **Imperva/Incapsula** | IP reputation, cookie validation, JS fingerprint | curl-cffi para HTTP, Playwright-stealth para browser |
| **PerimeterX/HUMAN** | Behavioral biometrics, device fingerprint | Stagehand con LLM guidance + proxy residencial rotativo |
| **Akamai Bot Manager** | TLS fingerprint, device ID, behavioral analytics | curl-cffi (TLS replica Chrome) + Browserbase |

### Deteccion de proveedor antes de implementar

```python
import httpx

async def detectar_proteccion(url: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
    headers = dict(r.headers)
    
    if 'cf-ray' in headers or 'cf-cache-status' in headers:
        return 'cloudflare'
    if '__ddg' in str(r.cookies) or 'datadome' in str(headers):
        return 'datadome'
    if 'x-iinfo' in headers or 'incap_ses' in str(r.cookies):
        return 'imperva'
    if '_px' in str(r.cookies):
        return 'perimeterx'
    if 'x-check-cacheable' in headers:
        return 'akamai'
    return 'desconocido'
```

## Stack Gratuito Recomendado (2026)

### Python

```bash
pip install playwright playwright-stealth httpx beautifulsoup4 lxml pytesseract pillow browser-use crawlee
playwright install chromium firefox  # instalar navegadores
```

### Node.js / TypeScript

```bash
npm install playwright crawlee puppeteer-extra puppeteer-extra-plugin-stealth cheerio @browserbasehq/stagehand
```

### Herramientas especializadas

| Herramienta | Tipo | Gratuito | Uso |
|---|---|---|---|
| Stagehand | IA-nativo scraping | OSS + cloud | Flujos con navegacion semantica, extraccion sin selectores fragiles |
| browser-use | LLM-driven scraping | OSS | Automatizacion compleja dirigida por LLM en Python |
| Crawlee | Spider framework | OSS | Crawling masivo Node.js con anti-ban, retry y Dataset integrado |
| Browserbase | Browser cloud | Pago (free tier) | Headless sin IP propia, Cloudflare/anti-bot gestionado |
| Playwright | Browser automation | OSS | Base de Stagehand y Crawlee, control total de bajo nivel |
| Camoufox | Browser stealth | OSS | Firefox con fingerprint aleatorio — superior contra Cloudflare |
| curl-cffi | HTTP stealth | OSS | Replica fingerprint TLS de Chrome/Firefox — sin browser |
| playwright-stealth | Plugin Playwright | OSS | Parchea 20+ señales headless, compatible con Chromium |

## Evasion de Deteccion Anti-Bot

### Fingerprinting de Navegador

Los sitios modernos detectan bots por: User-Agent, headers HTTP, fingerprint TLS, WebGL, Canvas, fuentes instaladas, resolucion de pantalla, comportamiento del mouse.

```python
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

async def crear_browser_stealth():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="es-419",
            timezone_id="America/Mexico_City",
            # Simular perfil de usuario real
            extra_http_headers={
                "Accept-Language": "es-419,es;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124"',
                "sec-ch-ua-platform": '"Windows"',
            }
        )
        page = await context.new_page()
        await stealth_async(page)   # parchea navigator.webdriver y 20+ señales
        return browser, context, page
```

### Rotacion de Headers y User-Agents

```python
import random

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
]

def headers_aleatorios() -> dict:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.8,en-US;q=0.5,en;q=0.3",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
```

### Fingerprint TLS con curl-cffi

```python
from curl_cffi.requests import AsyncSession

async def fetch_stealth(url: str) -> str:
    """Replica el fingerprint TLS de Chrome 120 — invisible para Cloudflare y Akamai."""
    async with AsyncSession(impersonate="chrome120") as session:
        resp = await session.get(url, headers=headers_aleatorios())
        return resp.text
```

### Comportamiento Humano — Delays y Mouse

```python
import asyncio
import random

async def comportamiento_humano(page):
    """Simula patron de lectura humana para evadir deteccion comportamental."""
    # Scroll aleatorio antes de interactuar
    await page.evaluate("window.scrollTo(0, Math.random() * document.body.scrollHeight * 0.3)")
    await asyncio.sleep(random.uniform(0.5, 1.5))

    # Movimiento de mouse no lineal antes de click
    await page.mouse.move(
        random.randint(100, 800),
        random.randint(100, 600),
        steps=random.randint(5, 15)
    )
    await asyncio.sleep(random.uniform(0.2, 0.8))
```

## Rotacion de Proxies

### Proxies Gratuitos (baja fiabilidad, solo para desarrollo)

```python
# Fuentes de proxies gratuitos (rotan rapidamente — verificar disponibilidad)
FUENTES_PROXIES_GRATUITOS = [
    "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
    "https://www.proxy-list.download/api/v1/get?type=http",
]

import httpx
import asyncio

async def obtener_proxies_gratuitos() -> list[str]:
    proxies = []
    async with httpx.AsyncClient() as client:
        for url in FUENTES_PROXIES_GRATUITOS:
            try:
                r = await client.get(url, timeout=10)
                proxies.extend(r.text.strip().split("\n"))
            except Exception:
                continue
    return [f"http://{p.strip()}" for p in proxies if p.strip()]

async def verificar_proxy(proxy: str, url_test: str = "https://httpbin.org/ip") -> bool:
    try:
        async with httpx.AsyncClient(proxies={"http://": proxy, "https://": proxy}, timeout=5) as client:
            r = await client.get(url_test)
            return r.status_code == 200
    except Exception:
        return False
```

### Proxies de Pago (alta fiabilidad, produccion)

| Proveedor | Tipo | Precio estimado | Recomendado para |
|---|---|---|---|
| Bright Data | Residential / ISP / Datacenter | $5-15/GB | Retail masivo, anti-bot fuerte |
| Oxylabs | Residential / Datacenter | $8-15/GB | E-commerce, SERP |
| Smartproxy | Residential | $7/GB | Balance precio/calidad |
| IPRoyal | Residential estatico | $2-4/proxy/mes | IPs fijas de larga duracion |
| Webshare | Datacenter | $5/100 proxies | Sitios sin anti-bot sofisticado |

Para proyectos retail con Cloudflare/Akamai: proxies residenciales o ISP obligatorios. Datacenter son detectados por estos sistemas en > 90% de los casos.

```python
# Patron de rotacion de proxies en pool
import itertools

class ProxyPool:
    def __init__(self, proxies: list[str]):
        self._pool = itertools.cycle(proxies)
        self._lock = asyncio.Lock()

    async def siguiente(self) -> str:
        async with self._lock:
            return next(self._pool)

    async def fetch_con_rotacion(self, url: str) -> str:
        proxy = await self.siguiente()
        async with httpx.AsyncClient(
            proxies={"http://": proxy, "https://": proxy},
            timeout=15
        ) as client:
            resp = await client.get(url, headers=headers_aleatorios())
            resp.raise_for_status()
            return resp.text
```

## Bypass de CAPTCHA

### Servicios de CAPTCHA Solving (2026)

| Servicio | Precio aprox. | CAPTCHAs soportados | Gratuito trial |
|---|---|---|---|
| 2captcha | $1-3/1000 | reCAPTCHA v2/v3, hCaptcha, Cloudflare, imagen | No (recarga minima $3) |
| CapSolver | $0.6-2/1000 | reCAPTCHA, hCaptcha, Cloudflare Turnstile, DataDome | Si (creditos gratuitos al registro) |
| AntiCaptcha | $1-2/1000 | reCAPTCHA v2/v3, hCaptcha, imagen | No |
| NopeCHA | $1/1000 | reCAPTCHA v2/v3, hCaptcha | Si (50/dia gratuitos) |
| CaptchaAI | $0.8/1000 | reCAPTCHA, hCaptcha, Cloudflare | Si (trial limitado) |

Recomendacion para retail: **CapSolver** tiene el mejor soporte para Cloudflare Turnstile y DataDome (los mas comunes en e-commerce 2026) y el trial gratuito permite validar sin costo inicial.

### Integracion CapSolver con Playwright

```python
import capsolver
import asyncio

capsolver.api_key = os.environ["CAPSOLVER_API_KEY"]

async def resolver_cloudflare_turnstile(page, sitekey: str, url: str) -> str:
    """Resuelve Cloudflare Turnstile y retorna el token."""
    solution = capsolver.solve({
        "type": "AntiCloudflareTask",
        "websiteURL": url,
        "websiteKey": sitekey,
    })
    return solution["token"]

async def resolver_recaptcha_v3(url: str, sitekey: str, action: str = "submit") -> str:
    """Resuelve reCAPTCHA v3 con score esperado > 0.7."""
    solution = capsolver.solve({
        "type": "ReCaptchaV3TaskProxyless",
        "websiteURL": url,
        "websiteKey": sitekey,
        "pageAction": action,
        "minScore": 0.7
    })
    return solution["gRecaptchaResponse"]
```

### Cloudflare — Estrategia de Bypass sin Servicio Externo

Para Cloudflare sin Turnstile activo (solo challenge de JS):

```python
from curl_cffi.requests import AsyncSession

async def bypass_cloudflare(url: str) -> str:
    """curl-cffi replica el fingerprint TLS de Chrome, evitando Cloudflare JS challenge."""
    async with AsyncSession(impersonate="chrome120") as session:
        resp = await session.get(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "cf-turnstile-response": "",
            }
        )
        return resp.text
```

Para Cloudflare con Turnstile activo → usar CapSolver o Camoufox (navegador Firefox parchado con fingerprint real).

## OCR — Extraccion de Texto desde Imagenes y PDFs

### Tesseract OCR (gratuito, open source)

```python
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import cv2
import numpy as np

def preprocesar_imagen_ocr(imagen_path: str) -> Image.Image:
    """Mejora calidad de imagen antes de OCR: contraste, binarizacion, denoising."""
    img = cv2.imread(imagen_path)
    gris = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Binarizacion adaptativa para documentos con iluminacion no uniforme
    binaria = cv2.adaptiveThreshold(
        gris, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    # Denoising
    limpia = cv2.fastNlMeansDenoising(binaria, h=10)
    return Image.fromarray(limpia)

def extraer_texto_factura(imagen_path: str, idioma: str = "spa") -> str:
    """Extrae texto de factura o documento de retail con Tesseract."""
    imagen = preprocesar_imagen_ocr(imagen_path)
    config = "--oem 3 --psm 6"   # OEM 3: LSTM+legacy; PSM 6: bloque uniforme de texto
    return pytesseract.image_to_string(imagen, lang=idioma, config=config)

def extraer_datos_estructurados(imagen_path: str) -> dict:
    """Extrae datos en formato estructurado (bounding boxes + texto) para parsing posterior."""
    imagen = preprocesar_imagen_ocr(imagen_path)
    datos = pytesseract.image_to_data(imagen, output_type=pytesseract.Output.DICT)
    return {
        "textos": datos["text"],
        "confianzas": datos["conf"],
        "coordenadas": list(zip(datos["left"], datos["top"], datos["width"], datos["height"]))
    }
```

### Google Vision API (alta precision, pago pero con capa gratuita)

```python
from google.cloud import vision

def ocr_google_vision(imagen_path: str) -> str:
    """Vision API: precision superior a Tesseract para documentos complejos o mala calidad."""
    client = vision.ImageAnnotatorClient()
    with open(imagen_path, "rb") as f:
        content = f.read()
    image = vision.Image(content=content)
    response = client.text_detection(image=image)
    return response.text_annotations[0].description if response.text_annotations else ""
```

Capa gratuita Google Vision: 1000 unidades/mes. Para > 1000 documentos/mes → Tesseract con preprocesamiento es mas economico.

### OCR para PDFs con pypdf2 + fallback a Vision

```python
import pypdf
from pathlib import Path

def extraer_texto_pdf(pdf_path: str) -> str:
    """Extrae texto de PDF: nativo primero, OCR como fallback para PDFs escaneados."""
    reader = pypdf.PdfReader(pdf_path)
    texto = ""
    for pagina in reader.pages:
        texto_pagina = pagina.extract_text() or ""
        if len(texto_pagina.strip()) < 50:
            # PDF escaneado — convertir pagina a imagen y aplicar OCR
            import pdf2image
            imagenes = pdf2image.convert_from_path(pdf_path, first_page=pagina.page_number+1, last_page=pagina.page_number+1)
            texto_pagina = extraer_texto_factura_desde_imagen(imagenes[0])
        texto += texto_pagina + "\n"
    return texto
```

## Rate Limiting Respetuoso

```python
import asyncio
import time
from dataclasses import dataclass

@dataclass
class RateLimiter:
    requests_por_segundo: float = 1.0
    _ultimo_request: float = 0.0

    async def esperar(self):
        """Garantiza el intervalo minimo entre requests."""
        ahora = time.monotonic()
        intervalo_minimo = 1.0 / self.requests_por_segundo
        tiempo_desde_ultimo = ahora - self._ultimo_request
        if tiempo_desde_ultimo < intervalo_minimo:
            await asyncio.sleep(intervalo_minimo - tiempo_desde_ultimo)
        self._ultimo_request = time.monotonic()

# Uso: 1 request/segundo para sitios normales, 0.2/seg para sitios sensibles
limiter = RateLimiter(requests_por_segundo=1.0)
```

Guia de rate limiting por tipo de sitio:
- Sitios institucionales o gubernamentales: max 0.2 req/s.
- E-commerce grande (Amazon, MercadoLibre): max 1 req/s con delays aleatorios.
- APIs internas descubiertas: max 2 req/s.
- Nunca ejecutar sin rate limiter — la saturacion es detectada y puede ser ilegal.

## Patrones para Retail Especifico

### Monitor de Precios (Amazon / MercadoLibre)

```python
import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
import json

async def extraer_precio_amazon(asin: str) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport={"width": 1366, "height": 768}
        )
        page = await context.new_page()
        await stealth_async(page)

        await page.goto(f"https://www.amazon.com/dp/{asin}", wait_until="domcontentloaded")
        await comportamiento_humano(page)

        precio = await page.query_selector("#priceblock_ourprice, .a-price .a-offscreen")
        titulo = await page.query_selector("#productTitle")
        stock = await page.query_selector("#availability span")

        return {
            "asin": asin,
            "precio": await precio.inner_text() if precio else None,
            "titulo": await titulo.inner_text() if titulo else None,
            "en_stock": "En stock" in (await stock.inner_text() if stock else ""),
            "timestamp": time.time()
        }
```

### Extraccion de Catalogo con Scrapy (crawling masivo)

```python
# catalogo_spider.py
import scrapy

class CatalogoRetailSpider(scrapy.Spider):
    name = "catalogo_retail"
    custom_settings = {
        "DOWNLOAD_DELAY": 1.5,              # 1.5s entre requests
        "RANDOMIZE_DOWNLOAD_DELAY": True,    # delay aleatorio 0.5x-1.5x
        "AUTOTHROTTLE_ENABLED": True,        # ajuste automatico segun latencia del servidor
        "ROBOTSTXT_OBEY": True,              # respetar robots.txt
        "USER_AGENT": "Mozilla/5.0 (compatible; PriceBot/1.0; +https://tuempresa.com/bot)",
        "CONCURRENT_REQUESTS_PER_DOMAIN": 2, # max 2 requests paralelos por dominio
    }

    def start_requests(self):
        for url in self.start_urls:
            yield scrapy.Request(url, headers=headers_aleatorios())

    def parse(self, response):
        for producto in response.css(".product-card"):
            yield {
                "nombre": producto.css(".product-title::text").get(),
                "precio": producto.css(".price::text").get(),
                "sku": producto.css("[data-sku]::attr(data-sku)").get(),
                "url": response.urljoin(producto.css("a::attr(href)").get()),
            }

        # Paginacion automatica
        siguiente = response.css("a.next-page::attr(href)").get()
        if siguiente:
            yield response.follow(siguiente, self.parse, headers=headers_aleatorios())
```

## Lista de Verificacion — Pipeline de Scraping

1. TOS verificados: los terminos del sitio objetivo permiten extraccion automatizada de datos publicos.
2. robots.txt respetado: el spider obedece las restricciones del archivo robots.txt.
3. Rate limiting implementado: max 1 req/s salvo que el sitio indique mas.
4. User-Agent identificatorio: el bot se identifica con URL de contacto en caso de sitios institucionales.
5. Stealth activo: playwright-stealth o curl-cffi para sitios con deteccion de headless.
6. Proxies configurados: pool con rotacion para volumenes > 1000 requests/dia.
7. CAPTCHA: servicio configurado (CapSolver recomendado) o estrategia de bypass sin servicio.
8. OCR: preprocesamiento de imagen implementado (binarizacion, denoising) antes de Tesseract.
9. Error handling: reintentos con backoff para HTTP 429, 503, timeout de red.
10. Storage: datos extraidos pasan a pipeline Medallion (ver `data-engineer`) — no se almacenan en raw sin normalizacion.
11. PII: si los datos extraidos contienen informacion personal, documentar base legal y politica de retencion.

## Portales con iframe anidado Azure Static Apps + Power BI Embedded

Patron detectado en portales retail mexicanos (Soriana, patron extensible a Chedraui/Sears):

### Arquitectura tipica
```
page (SAP UI5 / shell principal)
  frame[N] — Azure Static Apps (brave-flower.azurestaticapps.net o similar)
    frame[M] — Power BI reportEmbed (app.powerbi.com/reportEmbed)
              Aqui viven TODOS los controles interactivos: dropdowns, checkboxes,
              inputs de fecha, botones, tabla de resultados y tres puntitos de exportar.
```

### Regla de localizacion de frames

```python
async def _esperar_pbi_frame(page, timeout_s: int = 60):
    """Itera page.frames() hasta encontrar el frame de Power BI reportEmbed."""
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        for f in page.frames:
            if "reportEmbed" in f.url or "powerbi.com" in f.url:
                return f
        await asyncio.sleep(1)
    return None
```

### Interaccion con controles dentro de pbi_frame

Todos los clicks deben ser con coordenadas absolutas de pagina, NO con Playwright locators relativos al frame. El sandbox de Power BI ignora eventos sinteticos inyectados directamente en el frame.

```python
async def _frame_offset(frame) -> tuple[float, float]:
    """Devuelve el offset absoluto (x, y) del frame en la pagina."""
    el = await frame.frame_element()
    bb = await el.bounding_box()
    return (bb["x"] if bb else 0, bb["y"] if bb else 0)

async def click_en_frame(page, frame, selector_js: str):
    """
    Ejecuta JS en el frame para obtener bounding box del elemento,
    luego hace click con page.mouse usando coordenadas absolutas.
    """
    bb = await frame.evaluate(f"""() => {{
        const el = {selector_js};
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {{ x: r.x, y: r.y, w: r.width, h: r.height }};
    }}""")
    if not bb:
        return False
    ox, oy = await _frame_offset(frame)
    await page.mouse.click(ox + bb["x"] + bb["w"] / 2, oy + bb["y"] + bb["h"] / 2)
    return True
```

### Dropdowns con lista fuera del viewport del frame

Algunos dropdowns de Power BI abren su lista de opciones en coordenadas y > bounding_box_del_trigger + altura_trigger. La lista sigue dentro del mismo pbi_frame pero en posicion desplazada. Estrategia:

```python
async def encontrar_item_dropdown(frame, page, trigger_y: float, trigger_h: float, texto: str):
    """
    Busca items de lista que aparezcan debajo del trigger (y > trigger_y + trigger_h).
    Util para dropdowns Power BI que renderizan su lista fuera del area visible del trigger.
    """
    ox, oy = await _frame_offset(frame)
    for intento in range(3):
        items = await frame.evaluate(f"""() => {{
            const target = {repr(texto)};
            const results = [];
            for (const el of document.querySelectorAll('[role="option"], li, [role="listitem"]')) {{
                const t = (el.innerText || el.textContent || '').trim();
                if (t.includes(target)) {{
                    const bb = el.getBoundingClientRect();
                    if (bb.y > {trigger_y + trigger_h} && bb.width > 0)
                        results.push({{ x: bb.x, y: bb.y, w: bb.width, h: bb.height }});
                }}
            }}
            return results;
        }}""")
        if items:
            bb = items[0]
            await page.mouse.click(ox + bb["x"] + bb["w"] / 2, oy + bb["y"] + bb["h"] / 2)
            return True
        await asyncio.sleep(1)
    return False
```

### Descarga de XLSX desde Power BI Embedded

El boton de exportacion ("Mas opciones" / tres puntitos) solo es visible cuando el mouse esta hovering sobre la tabla. Hacer hover antes de buscar el boton:

```python
async def exportar_tabla_pbi(page, pbi_frame, staging_dir: str, nombre: str) -> str | None:
    el = await pbi_frame.frame_element()
    bb = await el.bounding_box()
    ox, oy = (bb["x"], bb["y"]) if bb else (76, 338)
    # Hover sobre centro de la tabla para revelar el boton
    await page.mouse.move(ox + 450, oy + 450)
    await asyncio.sleep(0.8)
    # Buscar por aria-label que contenga "opciones"
    btn = await pbi_frame.evaluate("""() => {
        for (const b of document.querySelectorAll('button[aria-label*="opciones"], button[title*="opciones"]')) {
            const bb = b.getBoundingClientRect();
            if (bb.width > 0) return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
        }
        return null;
    }""")
    if not btn:
        return None
    await page.mouse.click(ox + btn["x"] + btn["w"] / 2, oy + btn["y"] + btn["h"] / 2)
    await asyncio.sleep(0.8)
    # Clic en "Exportar datos" del menu contextual
    item = pbi_frame.locator('[role="menuitem"]:has-text("Exportar datos")').first
    await item.click(timeout=5_000)
    # Esperar modal y confirmar con boton "Exportar"
    destino = f"{staging_dir}/{nombre}.xlsx"
    async with page.expect_download(timeout=90_000) as dl:
        await pbi_frame.locator('button:has-text("Exportar")').first.click(timeout=10_000)
    download = await dl.value
    await download.save_as(destino)
    return destino
```

### Orden de seleccion de filtros en Power BI Embedded

El portal resetea el combobox de Dimensiones al cambiar las Metricas. Orden obligatorio para evitar el reset:

1. Seleccionar mes (dropdown Meses)
2. Escribir fechas en inputs texto (triple-clic + type + Tab)
3. Seleccionar Metricas (checkboxes panel derecho) — primero
4. Seleccionar Dimensiones (combobox) — DESPUES de metricas
5. Aplicar Filtros (boton amarillo)
6. Segunda pasada de fechas + Aplicar Filtros nuevamente

## Resiliencia y Deteccion de Fallos Silenciosos

Co-activa con `silent-failure-hunter` siempre que se construya o revise un scraper.

El fallo silencioso mas peligroso en scrapers: el servidor retorna HTTP 200, no se lanza excepcion, pero el dato extraido es `null`, `[]` o `""`. El pipeline downstream consume datos corruptos sin saberlo.

### Patron 1 — Validacion de schema post-extraccion (obligatorio)

Usar Zod (Node.js) o Pydantic (Python) para validar el dato extraido antes de persistirlo:

```typescript
import { z } from 'zod';

const ProductoSchema = z.object({
  nombre: z.string().min(1),
  precio: z.number().positive(),
  disponible: z.boolean()
});

// Despues de extraer — NUNCA persistir sin validar
const resultado = ProductoSchema.safeParse(datosExtraidos);
if (!resultado.success) {
  logger.error({ nivel: 'error', herramienta: 'scraper', error: resultado.error.flatten(), url });
  throw new Error(`Schema invalido en ${url}`, { cause: resultado.error });
}
```

```python
from pydantic import BaseModel, validator

class Producto(BaseModel):
    nombre: str
    precio: float
    disponible: bool

    @validator('precio')
    def precio_positivo(cls, v):
        if v <= 0:
            raise ValueError('precio debe ser positivo')
        return v

# Post-extraccion
try:
    producto = Producto(**datos_extraidos)
except ValidationError as e:
    logger.error({'herramienta': 'scraper', 'error': e.errors(), 'url': url})
    raise
```

### Patron 2 — Assertion de plausibilidad semantica (obligatorio)

Un bloqueo disfrazado de datos validos es mas peligroso que un error explicito:

```typescript
function validarPlausibilidad(datos: Producto[], url: string): void {
  // Precio cero en un marketplace = bloqueo, no dato real
  if (datos.some(p => p.precio === 0)) {
    logger.warn({ nivel: 'warn', tipo: 'SUSPECTED_BLOCK', url, razon: 'precio=0 detectado' });
    throw new Error(`SUSPECTED_BLOCK: precio=0 en ${url}`);
  }
  // Lista vacia en horario de operacion = selectores rotos o bloqueo
  if (datos.length === 0) {
    logger.warn({ nivel: 'warn', tipo: 'SUSPECTED_BLOCK', url, razon: 'lista vacia' });
    throw new Error(`SUSPECTED_BLOCK: lista vacia en ${url}`);
  }
}
```

### Patron 3 — Circuit breaker por dominio (obligatorio en pipelines de produccion)

```typescript
const erroresPorDominio: Map<string, number> = new Map();
const UMBRAL_CIRCUIT_BREAKER = 5;

async function fetchConCircuitBreaker(url: string): Promise<string> {
  const dominio = new URL(url).hostname;
  const errores = erroresPorDominio.get(dominio) ?? 0;

  if (errores >= UMBRAL_CIRCUIT_BREAKER) {
    logger.error({ nivel: 'error', tipo: 'CIRCUIT_OPEN', dominio });
    throw new Error(`Circuit breaker abierto para ${dominio} — demasiados fallos consecutivos`);
  }

  try {
    const resultado = await fetchPagina(url);
    erroresPorDominio.set(dominio, 0); // reset en exito
    return resultado;
  } catch (error) {
    erroresPorDominio.set(dominio, errores + 1);
    logger.error({ nivel: 'error', dominio, intentos: errores + 1, error: error.message });
    throw error; // SIEMPRE propagar — nunca silenciar
  }
}
```

### Checklist de revision de fallos silenciosos para scrapers

Antes de mergear cualquier scraper, verificar:
- [ ] Todo `catch` tiene logging estructurado con `url`, `herramienta` y `error.message`
- [ ] Ningun `catch` retorna `null`, `[]` o `{}` sin loggear primero como WARNING
- [ ] Datos extraidos pasan validacion de schema (Zod/Pydantic) antes de persistirse
- [ ] Lista vacia o precio=0 lanza `SUSPECTED_BLOCK`, no se persiste silenciosamente
- [ ] Circuit breaker activo para dominios con reintentos en produccion
- [ ] `throw error` o `throw new Error(msg, { cause: error })` en todos los catch que no son terminales

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion. Adicionales:
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar autorizacion explicita del propietario del sistema antes de implementar scraping de sitios que requieren autenticacion.
- Verificar throttling puede ser considerado un ataque de denegacion de servicio antes de disenar un scraper sin rate limiting — el scraping.
- Verificar base legal documentada (consentimiento, interes legitimo, contrato) antes de extraer, almacenar o procesar datos de usuarios finales.
- Asegurar que no se ejecuta: recomendar herramientas de bypass que violen los TOS del sitio en contextos donde el cliente tiene contrato con ese sitio.
- Asegurar que no se ejecuta: ignorar respuestas HTTP 429 — implementar backoff exponencial siempre.
- Toda extraccion de datos a escala debe pasar por el skill `data-engineer` para normalizacion y calidad antes de llegar a produccion.

---

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

Camoufox: confirmado via `camoufox.com` y el repositorio oficial `github.com/daijro/camoufox` que el proyecto retomo desarrollo activo tras una pausa de mantenimiento de un año, con release publica v146.0.1-beta.25 (enero 2026) donde el codigo fuente completo se hizo publico. Sigue siendo un fork de Firefox que parchea a nivel C++ (no inyeccion JS), por lo que continua siendo la opcion recomendada contra fingerprinting JS profundo — pero el estado "beta" implica verificar estabilidad antes de comprometerlo a un pipeline critico de produccion.

Cloudflare Turnstile: confirmado via `developers.cloudflare.com/turnstile` que el widget opera en tres modos oficiales (Managed, Non-Interactive, Invisible) y que la validacion server-side contra la API `siteverify` es obligatoria — el widget del lado del cliente por si solo no protege nada. El token de validacion expira a los 5 minutos; cualquier flujo de bypass que asuma un token reutilizable esta desactualizado.

Patchright, curl-cffi (impersonate de versiones especificas de Chrome/Firefox), y el pricing exacto de los servicios de CAPTCHA solving (2captcha, CapSolver, AntiCaptcha, NopeCHA) listados en este skill: orientativo, no verificado contra fuente oficial en esta pasada — confirmar version vigente y disponibilidad de impersonate targets contra el repositorio oficial de cada proyecto antes de fijar una version en codigo de produccion.

### Checklist de verificacion — vanguardia en extraccion/evasion

- [ ] `IDENTIDAD DE EXTRACCION:` declarada y coherente con el proveedor anti-bot real del sitio (no asumido por analogia).
- [ ] Cero patrones de la lista de prohibidos (UA desactualizado, stealth como unica capa, delays fijos, ignorar robots.txt/429, reintento sin circuit breaker, persistir bloqueo como dato valido).
- [ ] Los 5 umbrales del gate de calidad medidos y documentados en el log de la corrida, no solo verificados una vez en desarrollo.
- [ ] Herramienta de evasion elegida (Camoufox/Patchright/curl-cffi/Browserbase) justificada contra el proveedor anti-bot detectado en la tabla de jerarquia, no elegida por default.
- [ ] Cualquier afirmacion sobre version, deprecacion o capacidad de una herramienta de este modulo verificada contra su fuente oficial antes de codificar — si no se verifico, marcado explicitamente como orientativo.
