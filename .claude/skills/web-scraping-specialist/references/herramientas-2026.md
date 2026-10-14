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
