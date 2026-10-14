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
