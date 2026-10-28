# Scripts de escaneo defensivo

## Scripting Python para Escaneo Defensivo Propio

### Estructura Base

```python
# estructura base para escaneo defensivo de superficie propia
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class ProductoObjetivo:
    dominio_primario: str
    dominios_adicionales: list[str] = field(default_factory=list)
    entornos: dict[str, str] = field(default_factory=dict)  # {"prod": "app.com", "staging": "staging.app.com"}
    repositorios: list[str] = field(default_factory=list)
    escaneo_fecha: str = field(default_factory=lambda: datetime.now().isoformat())

@dataclass
class ResultadoSuperficie:
    producto: ProductoObjetivo
    subdominios: list[str] = field(default_factory=list)
    endpoints_activos: list[str] = field(default_factory=list)
    exposiciones: list[dict] = field(default_factory=list)  # {"tipo": "credencial", "fuente": "github", "detalle": "..."}
    emails_filtrados: list[str] = field(default_factory=list)
    # Metodo de verificacion citado por el Gate de calidad medible (metrica 1,
    # cobertura de correlacion de activos): registra por que se confirmo cada
    # subdominio/IP como propio antes de listarlo (WHOIS, TLS CN-SAN, registro
    # interno) -- gap de scaffolding cerrado 2026-08-15: el gate referenciaba
    # este campo sin que el dataclass lo declarara.
    pertenencia_verificada: dict = field(default_factory=dict)  # {"<subdominio>": "whois" | "tls-cn-san" | "registro-interno"}

    def to_json(self) -> str:
        return json.dumps(self.__dict__, default=str, indent=2)
```

### Enumeracion de Subdominios via crt.sh

```python
import httpx

async def subdominios_propios(dominio: str) -> list[str]:
    """
    Consulta crt.sh para subdominios del propio dominio via certificados TLS.
    Fuente pasiva: no genera trafico hacia la propia infraestructura.
    """
    url = f"https://crt.sh/?q=%.{dominio}&output=json"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url)
        response.raise_for_status()
        datos = response.json()

    subdominios = set()
    for entrada in datos:
        nombre = entrada.get("name_value", "")
        for sub in nombre.splitlines():
            sub = sub.strip().lstrip("*.")
            if sub.endswith(dominio) and sub != dominio:
                subdominios.add(sub)

    return sorted(subdominios)
```

### Deteccion de Credenciales en el Repositorio Propio

```python
import subprocess
from pathlib import Path

def escanear_credenciales_git(ruta_repo: str = ".") -> dict:
    """
    Ejecuta gitleaks sobre el repositorio propio para detectar credenciales filtradas.
    Escanea todo el historial Git, no solo el estado actual del working tree.
    Requiere: go install github.com/zricethezav/gitleaks/v8@latest
    """
    resultado = subprocess.run(
        [
            "gitleaks", "detect",
            "--source", ruta_repo,
            "--report-format", "json",
            "--report-path", "/tmp/gitleaks-report.json"
        ],
        capture_output=True,
        text=True
    )

    reporte_path = Path("/tmp/gitleaks-report.json")
    if reporte_path.exists():
        import json
        return json.loads(reporte_path.read_text())

    # exit code 1 indica que encontro secretos pero no genero reporte JSON
    if resultado.returncode == 1:
        return {"error": "gitleaks_encontro_secretos", "raw": resultado.stdout}

    return {"limpio": True}
```

### Deteccion de Entradas DNS Huerfanas

Las entradas DNS huerfanas (dangling DNS) apuntan a recursos cloud ya eliminados y pueden ser tomadas por un atacante para ejecutar subdomain takeover.

```python
import dns.resolver

def verificar_dns_huerfanos(subdominios: list[str]) -> list[dict]:
    """
    Detecta subdominios propios que resuelven a servicios cloud eliminados.
    Patron clasico: CNAME a *.azurewebsites.net o *.s3.amazonaws.com inexistente.
    """
    proveedores_cloud = [
        "azurewebsites.net", "cloudapp.net",          # Azure
        "s3.amazonaws.com", "elasticbeanstalk.com",   # AWS
        "appspot.com", "storage.googleapis.com",       # GCP
        "github.io", "netlify.app", "vercel.app"       # Hosting estatico
    ]

    huerfanos = []
    resolver = dns.resolver.Resolver()

    for subdominio in subdominios:
        try:
            respuestas = resolver.resolve(subdominio, "CNAME")
            for r in respuestas:
                cname_destino = str(r.target).rstrip(".")
                for proveedor in proveedores_cloud:
                    if cname_destino.endswith(proveedor):
                        try:
                            resolver.resolve(cname_destino, "A")
                        except dns.resolver.NXDOMAIN:
                            # el recurso cloud ya no existe: riesgo de takeover
                            huerfanos.append({
                                "subdominio": subdominio,
                                "cname_destino": cname_destino,
                                "proveedor": proveedor,
                                "riesgo": "subdomain_takeover"
                            })
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.DNSException):
            continue

    return huerfanos
```

### Pipeline de Analisis de Superficie Completo

```python
async def analizar_superficie(producto: ProductoObjetivo) -> ResultadoSuperficie:
    """
    Pipeline de analisis de superficie defensivo.
    Fase pasiva primero; verificacion activa solo sobre infraestructura propia.
    """
    resultado = ResultadoSuperficie(producto=producto)

    # Fase 1: subdominios via certificados TLS (pasivo)
    subs = await subdominios_propios(producto.dominio_primario)
    resultado.subdominios.extend(subs)

    # Fase 2: entradas DNS huerfanas (activo sobre infraestructura propia)
    huerfanos = verificar_dns_huerfanos(resultado.subdominios)
    for h in huerfanos:
        resultado.exposiciones.append({
            "tipo": "dns_huerfano",
            "fuente": "dns_propio",
            "detalle": h
        })

    # Fase 3: credenciales en historial Git (local, sin trafico externo)
    hallazgos_git = escanear_credenciales_git(".")
    if not hallazgos_git.get("limpio"):
        resultado.exposiciones.append({
            "tipo": "credencial_en_git",
            "fuente": "historial_repositorio",
            "detalle": hallazgos_git
        })

    return resultado

if __name__ == "__main__":
    producto = ProductoObjetivo(
        dominio_primario="miproducto.com",
        entornos={"prod": "miproducto.com", "staging": "staging.miproducto.com"},
        repositorios=["github.com/mi-org/mi-producto"]
    )
    resultado = asyncio.run(analizar_superficie(producto))
    print(resultado.to_json())
```

## Librerias Python Recomendadas

| Libreria | Instalacion | Uso |
|---|---|---|
| `httpx` | `pip install httpx` | Requests async con soporte HTTP/2 |
| `dnspython` | `pip install dnspython` | Resolucion y verificacion DNS |
| `python-whois` | `pip install python-whois` | Consultas WHOIS de los propios dominios |
| `shodan` | `pip install shodan` | Consulta Shodan API para IPs propias |
| `networkx` | `pip install networkx` | Grafo de relaciones entre activos descubiertos |
| `pandas` | `pip install pandas` | Consolidacion de hallazgos multi-fuente |

