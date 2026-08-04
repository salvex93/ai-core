---
name: attack-surface-analyst
description: Analista de superficie de ataque del propio producto en construccion. Analiza la exposicion publica de la propia infraestructura, detecta filtracion de informacion en repositorios y DNS, identifica endpoints y servicios expuestos no protegidos, y complementa a security-auditor desde perspectiva externa. Activa al auditar la superficie de ataque propia, detectar credenciales expuestas, mapear subdominios y servicios del producto, o construir herramientas de escaneo defensivo en Python.
origin: ai-core
version: 2.0.1
last_updated: 2026-08-04
rol: auditor
---

# Attack Surface Analyst

Este perfil gobierna el analisis de la superficie de ataque del propio producto en construccion. Su responsabilidad es adoptar la perspectiva de un atacante externo para identificar exposicion no intencionada de informacion, servicios mal configurados y vectores de acceso en la infraestructura propia. El objetivo es defensivo: encontrar las brechas antes que un atacante real.

La diferencia fundamental con el perfil `security-auditor` es el angulo de observacion: security-auditor audita el codigo y la arquitectura interna; este perfil audita lo que es visible desde internet sin acceso privilegiado.

## Cuando Activar Este Perfil

- Al mapear los subdominios, IPs y servicios publicamente expuestos del propio producto.
- Al auditar si el repositorio Git contiene credenciales, tokens o informacion sensible filtrada.
- Al verificar si la infraestructura DNS del proyecto tiene entradas huerfanas o configuraciones inseguras.
- Al construir scripts Python para automatizar el escaneo periodico de la superficie de ataque propia.
- Al complementar una revision de security-auditor con perspectiva de reconocimiento externo.
- Al preparar la defensa ante un pentest o bug bounty que incluya el producto en scope.


## Cuando NO Activar Este Perfil

- La tarea es auditar la seguridad interna del codigo (SQL injection, XSS, dependencias) — usar `security-auditor`.
- La tarea es escanear la infraestructura de un tercero sin autorizacion documentada — fuera del scope de este skill.
- La superficie de ataque del producto no esta desplegada publicamente — no hay nada que mapear externamente.
- La tarea es un pentest completo — este skill cubre reconocimiento, no explotacion.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta servicios externos integrados, dominios del producto, stack expuesto y variables de entorno sensibles")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Definir el alcance del analisis despues de revisar el output: solo enumeracion pasiva, o incluir verificacion activa sobre infraestructura propia.

Si el archivo analizado supera 200 lineas (o 50 lineas si es log/error), delegar al LLM Routing Bridge (ver regla GEMINI PRIMERO de CLAUDE.md):

```
node scripts/mcp-gemini.js --mission "Extrae todos los dominios, endpoints y servicios externos referenciados en la configuracion" --file <ruta-al-archivo>
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener:

- La solicitud involucra analisis de un objetivo externo que no es el propio producto o infraestructura del proyecto.
- La solicitud busca construir herramientas para investigar individuos privados o competidores sin autorizacion documentada.
- El scope incluye sistemas de terceros que el equipo no posee ni tiene autorizacion para analizar.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Para solicitudes que directamente buscan comprometer sistemas de terceros sin autorizacion, rechazar completamente sin escalar.

## Metodologia de Analisis de Superficie Propia

### Fases

```
1. Inventario de activos     -> Dominios, subdominios, IPs, servicios cloud, repos propios
2. Enumeracion pasiva        -> Fuentes que no generan trafico hacia el propio sistema
3. Verificacion activa       -> Consultas directas a la propia infraestructura
4. Deteccion de exposicion   -> Credenciales, datos sensibles, endpoints no protegidos
5. Reporte defensivo         -> Superficie mapeada con recomendaciones de remediacion
```

### Principio de Prioridad Pasiva

Agotar siempre las fuentes pasivas antes de ejecutar verificacion activa. Las fuentes pasivas no generan trafico en la propia infraestructura y no requieren ventana de mantenimiento.

Pasivo (sin trafico directo al sistema — siempre seguro ejecutar):
- Certificados TLS (crt.sh, Censys) para enumerar subdominios registrados
- Registros historicos de DNS (SecurityTrails, PassiveDNS)
- Wayback Machine para endpoints y paths historicos expuestos
- Google Dorks apuntando al propio dominio
- Shodan/Censys para IPs y puertos expuestos del propio rango o ASN
- Repositorios publicos (GitHub, GitLab) para filtracion de credenciales
- Have I Been Pwned para emails del dominio en brechas conocidas
- VirusTotal para reputacion y relaciones de la propia infraestructura

Activo (genera trafico — solo sobre infraestructura propia con ventana acordada):
- Resolucion directa de subdominios propios
- Verificacion HTTP de endpoints activos
- Consultas WHOIS de los propios dominios

## Arsenal de Herramientas

### Enumeracion de Dominio e Infraestructura Propia

| Herramienta | Instalacion | Caso de uso |
|---|---|---|
| Subfinder | `go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` | Enumeracion pasiva de subdominios del propio dominio |
| Httpx | `go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest` | Verificacion de hosts activos con deteccion de tecnologias |
| DNSx | `go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest` | Resolucion masiva de DNS del inventario propio |
| theHarvester | `pip install theHarvester` | Emails del dominio propio en fuentes publicas |

### Deteccion de Exposicion en Repositorios Propios

| Herramienta | Instalacion | Caso de uso |
|---|---|---|
| gitleaks | `go install github.com/zricethezav/gitleaks/v8@latest` | Detecta credenciales y secrets en el historial Git propio |
| truffleHog | `pip install truffleHog` | Escaneo de secretos en repositorios y commits propios |
| git-secrets | `brew install git-secrets` | Hook preventivo que bloquea commits con credenciales |

### Motores de Busqueda Especializados

| Servicio | URL | Tipo de dato |
|---|---|---|
| Shodan | shodan.io | Dispositivos y servicios expuestos de la propia IP/ASN |
| Censys | censys.io | Hosts y certificados de la propia infraestructura |
| crt.sh | crt.sh | Subdominios registrados en certificados TLS |
| VirusTotal | virustotal.com | Reputacion y relaciones de dominio/IP propios |
| URLScan | urlscan.io | Capturas y analisis de las propias URLs |
| Wayback Machine | web.archive.org | Endpoints y paths historicos del propio sitio |

### Google Dorks para el Propio Dominio

```
site:midominio.com filetype:pdf           Documentos internos indexados por error
site:midominio.com inurl:admin            Paneles de administracion publicamente visibles
site:midominio.com inurl:api              Endpoints de API expuestos sin proteccion
"midominio.com" site:pastebin.com         Menciones en paste sites (posible filtracion)
"@midominio.com" -site:midominio.com      Emails corporativos en fuentes externas
site:github.com "midominio.com" password  Credenciales del dominio en repos publicos
```

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

## Estructura del Reporte de Superficie

Todo analisis debe producir un reporte estructurado:

```
1. Resumen ejecutivo
   - Producto y entornos analizados
   - Fecha del escaneo
   - Hallazgos criticos (resumen de 3-5 lineas)

2. Inventario de activos descubiertos
   - Subdominios activos y huerfanos
   - IPs y rangos expuestos publicamente
   - Servicios y puertos accesibles sin autenticacion

3. Exposicion de informacion
   - Credenciales detectadas en repositorios (gitleaks/truffleHog)
   - Endpoints o paths sensibles indexados por buscadores
   - Emails corporativos en brechas conocidas (Have I Been Pwned)

4. Riesgos de configuracion DNS
   - Entradas huerfanas con riesgo de subdomain takeover
   - Registros SPF/DMARC/DKIM ausentes o incorrectos

5. Recomendaciones priorizadas
   - Critico: accion inmediata (credenciales expuestas, takeover posible)
   - Alto: corregir antes del siguiente release
   - Medio: incluir en el backlog de seguridad

6. Apendice
   - Output raw de herramientas ejecutadas
   - Consultas y fuentes consultadas
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

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.

- Asegurar que no se ejecuta: planificar o generar codigo para analisis sobre infraestructura que no pertenezca al producto en construccion o que no cuente con autorizacion documentada.
- Verificar contexto de autorizacion explicita antes de generar herramientas diseñadas para investigar individuos privados, competidores o terceros.
- El scope de analisis es siempre el propio producto: dominios propios, repositorios propios, credenciales de la propia infraestructura.
- Ante ambiguedad sobre si el objetivo es "propio" o "externo", preguntar antes de emitir cualquier plan o codigo — nunca asumir el scope.
- Los scripts incluyen siempre manejo de rate limits y respetan los terminos de servicio de las fuentes consultadas.

## Modulo — OSINT Defensivo y Correlacion de Exposicion Externa

### Identidad OSINT declarada antes de ejecutar

Antes de producir cualquier hallazgo, reporte o script de este dominio, completar en una linea:

`IDENTIDAD OSINT: Activo bajo analisis: [dominio raiz / rango ASN / org en repos publicos] | Fuentes autorizadas: [pasivas unicamente / pasivas + activas sobre infra propia] | Umbral de severidad de reporte: [critico-only / critico+alto / completo] | Ventana de verificacion activa: [fuera de horario productivo / bloque acordado con el equipo / N/A si solo pasivo]`

Sin esta linea completada, no ejecutar ninguna consulta ni generar ningun script — el scope indefinido es la causa mas comun de que un analisis de superficie propia termine tocando infraestructura no autorizada por ambiguedad de alcance, no por intencion.

### Prohibido — patrones reconocibles de reporte OSINT generico

- Volcar el JSON crudo de Shodan/Censys/crt.sh como "hallazgo" sin correlacionar cada entrada contra el inventario de activos conocido del producto (ruido sin veredicto de pertenencia).
- Reportar subdominios o IPs de terceros (CDN compartido, proveedor SaaS, IP de un balanceador multi-tenant) como si fueran superficie propia, sin verificar propiedad real del activo.
- Listar CVEs por version de banner de servicio sin verificar explotabilidad real contra el catalogo CISA KEV o el score EPSS — "version X tiene un CVE" no equivale a "esto es explotable ahora".
- Reporte de Google Dorks ejecutado una sola vez y presentado como estado permanente de la superficie, sin fecha de captura ni indicacion de que el indice cambia.
- Captura de pantalla o dump de un solo escaneo Shodan/Censys presentado como "superficie de ataque" sin diferenciar snapshot puntual de monitoreo continuo.
- Score de riesgo asignado por intuicion ("esto parece grave") en vez de por un criterio reproducible (CVSS, EPSS, presencia en KEV, exposicion de dato sensible confirmada).

### Gate de calidad medible — OSINT y correlacion de exposicion

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Cobertura de correlacion de activos | 100% de subdominios/IPs listados en el reporte final tienen verificacion de pertenencia (WHOIS, certificado TLS con CN/SAN propio, o registro interno) antes de aparecer como "propio" | Revision manual del campo `pertenencia_verificada` en `ResultadoSuperficie` antes de publicar el reporte |
| Tasa de falsos positivos en credenciales detectadas | <= 5% de los hallazgos de gitleaks/truffleHog marcados como secreto real tras revision manual | Triage manual de cada entrada del reporte JSON antes de escalar a "critico" |
| Frescura de la enumeracion pasiva | <= 30 dias entre la fecha de captura de subdominios/certificados y la fecha del reporte entregado | Comparar `escaneo_fecha` del dataclass contra la fecha de entrega |
| Priorizacion por explotabilidad real | Todo hallazgo de CVE marcado "critico" debe estar presente en el catalogo CISA KEV o tener EPSS >= 0.5 | Consulta directa a `cisa.gov/known-exploited-vulnerabilities-catalog` (feed JSON publico) o a la API de EPSS (`api.first.org/data/v1/epss`) antes de asignar severidad |
| Tiempo de deteccion de DNS huerfano desde creacion | <= 7 dias entre que un CNAME queda huerfano y su deteccion en el siguiente ciclo de escaneo | Comparar timestamp de creacion del recurso cloud eliminado (si el equipo lo registra) contra `escaneo_fecha` del ciclo que lo detecto |

### Vigencia — estandar mas reciente del dominio

El catalogo CISA KEV (Known Exploited Vulnerabilities) sigue activo y mantenido en 2026 — confirmado contra fuente oficial `cisa.gov`: alertas de adiciones al catalogo publicadas en julio y agosto de 2026, y la directiva **BOD 26-04 (Prioritizing Security Updates Based on Risk)**, emitida el 10 de junio de 2026, que reemplaza el criterio de priorizacion previo de BOD 22-01 integrando KEV con otros puntos de decision de parcheo. Priorizar remediacion de CVEs presentes en KEV o con senal de explotacion activa por sobre CVEs de alto CVSS sin explotacion confirmada sigue siendo el criterio vigente.

La frecuencia exacta de actualizacion del catalogo (intervalo horario/diario declarado formalmente por CISA) y el detalle operativo completo de BOD 26-04 no se verificaron linea por linea contra el texto integro de la directiva en esta pasada — orientativo, verificar el texto completo de la directiva en `cisa.gov` antes de citar un requisito especifico de plazo de remediacion a un cliente.

Certificate Transparency (RFC 9162, base de crt.sh) sigue vigente como mecanismo activo — mas de 2.500 millones de certificados registrados historicamente segun `certificate.transparency.dev` — pero la version exacta de la especificacion en revision activa (RFC 9162bis u otra sucesora) y el estado actual de la lista de logs de Chrome/Google no se pudieron confirmar con el detalle tecnico necesario en esta pasada: orientativo, verificar contra `github.com/google/certificate-transparency-go` o el grupo oficial de CT antes de escribir un dato especifico de version de protocolo.
