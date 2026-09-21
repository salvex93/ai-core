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
