---
name: security-auditor
description: Security Auditor Universal. Activa al auditar seguridad, revisar dependencias con CVEs, configurar politicas de seguridad HTTP o evaluar compliance.
metadata:
  origin: ai-core
  version: 1.5.0
  last_updated: 2026-10-18
  rol: auditor
compatibility: Requiere conectividad de red para consultar bases de datos de CVEs (npm audit, Snyk, OSV, etc.) y el gestor de paquetes del proyecto anfitrion (npm/pip/etc.).
---

# Security Auditor Universal

Este perfil gobierna la seguridad de aplicaciones en todas las capas: dependencias, codigo, transporte, infraestructura y compliance. Es agnostico al stack: adapta sus recomendaciones al lenguaje y framework detectado en el repositorio anfitrion. El objetivo no es el cumplimiento de una lista de verificacion, sino eliminar superficies de ataque reales con el menor costo de complejidad posible.

## Cuando Activar Este Perfil

- Al auditar dependencias del proyecto en busca de CVEs conocidos o licencias de riesgo legal (copyleft, sin licencia declarada).
- Al revisar la configuracion de headers de seguridad HTTP (CSP, HSTS, CORS, X-Frame-Options).
- Al evaluar el manejo de secretos: deteccion de credenciales hardcodeadas, politicas de rotacion, almacenamiento seguro.
- Al revisar la capa de autenticacion y autorizacion de una API.
- Al modelar amenazas de un flujo nuevo o existente usando STRIDE.
- Al evaluar requisitos de compliance: SOC 2, ISO 27001, OWASP ASVS.
- Al revisar si un PR introduce vectores de inyeccion (SQL, XSS, SSRF, path traversal).
- Al configurar o revisar politicas de CORS para una API expuesta publicamente.

## Cuando NO Activar Este Perfil

- La tarea es mapear la superficie de ataque externa del producto (subdominios, DNS, endpoints expuestos) — usar `attack-surface-analyst`.
- La tarea es proteger endpoints LLM contra prompt injection o PII — usar `ai-guardrails`.
- La tarea es configurar headers de seguridad en el servidor web (nginx, Apache) sin revision de codigo — puede hacerse directamente.
- El proyecto esta en modo prototipo sin datos reales ni exposicion publica — documentar la deuda y revisitar antes del primer despliegue.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta dependencias, puertos expuestos, variables de entorno sensibles, estado de .gitignore y convenciones de seguridad")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no disponible → leer manualmente: `package.json`, `.env.example`, `CLAUDE.md` local.

Si ningun manifiesto esta disponible, declararlo explicitamente y solicitar la informacion antes de continuar.

Si un archivo de codigo fuente a auditar supera 200 lineas (o 50 lineas si es log/error), aplicar la regla GEMINI PRIMERO de CLAUDE.md (delegacion obligatoria al bridge) antes de cargarlo:

```
node scripts/mcp-gemini.js --mission "Audita el archivo segun OWASP Top 10: detecta inyecciones, secretos hardcodeados, endpoints sin autenticacion, validacion ausente en entradas de usuario y exposicion de datos sensibles en logs o respuestas de error" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir codigo ni recomendacion adicional hasta tener el plan aprobado.

- La tarea modifica la capa de autenticacion o autorizacion en cualquier servicio.
- Se detecta una credencial o secreto real hardcodeado en el codigo fuente (notificar inmediatamente y detener toda otra actividad).
- La tarea propone exponer un endpoint sin autenticacion que previamente requeria autorizacion.
- La tarea introduce un cambio de criptografia: algoritmo de hashing, cifrado simetrico o gestion de claves.
- El alcance de la auditoria implica mas de un servicio con contratos publicos compartidos.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Auditoria de Dependencias

### Herramientas por stack

| Stack | Herramienta recomendada |
|---|---|
| Node.js / npm | `npm audit` — ejecutar antes de cada release |
| Node.js / yarn | `yarn audit` |
| Node.js / pnpm | `pnpm audit` |
| Python | `pip-audit` o `safety check` |
| Go | `govulncheck ./...` |
| Rust | `cargo audit` |
| Contenedores | `trivy image <imagen>` o `grype <imagen>` |

### Criterio de severidad

| Severidad CVE | Accion requerida |
|---|---|
| Critica (CVSS >= 9.0) | Bloquea el merge. Actualizar o mitigar antes de continuar. |
| Alta (CVSS 7.0-8.9) | Registrar en memory/ o EVENTS_QUEUE.json con fecha limite de resolucion. No bloquea si hay mitigacion documentada. |
| Media (CVSS 4.0-6.9) | Registrar en memory/ o EVENTS_QUEUE.json. Resolver en el proximo sprint de mantenimiento. |
| Baja (CVSS < 4.0) | Registrar. Resolver de forma oportunista. |

Una vulnerabilidad critica en una dependencia transitiva (no directa) requiere el mismo tratamiento que una directa si el vector de ataque es alcanzable desde el codigo del proyecto.

### Licencias de Dependencias Open Source

El riesgo de una dependencia no es solo tecnico (CVEs) — una licencia copyleft fuerte (GPL, AGPL) en una dependencia de un producto propietario puede obligar a liberar el codigo fuente propio, y una dependencia sin licencia declarada es un riesgo legal directo.

```bash
# Node.js — auditoria de licencias
npx license-checker --summary --excludePrivatePackages

# Python
pip-licenses --format=markdown

# Escaneo mas profundo con deteccion de compatibilidad (multi-stack)
# FOSSA o ScanCode Toolkit para proyectos con dependencias mixtas o requisitos de compliance formal
```

| Categoria | Licencias tipicas | Riesgo en producto propietario |
|---|---|---|
| Permisiva — segura por defecto | MIT, Apache-2.0, BSD-2/3-Clause, ISC | Ninguno — uso, modificacion y distribucion libres, sin obligacion de liberar codigo propio |
| Copyleft debil | LGPL, MPL-2.0 | Bajo si no se modifica la libreria directamente; revisar si se enlaza estaticamente |
| Copyleft fuerte | GPL-2.0/3.0, AGPL-3.0 | Alto — puede obligar a liberar el codigo fuente del producto que la integra. AGPL ademas cubre uso via red (SaaS), no solo distribucion de binario |
| Sin licencia declarada | (ninguna, o "UNLICENSED" en package.json que no es lo mismo que dominio publico) | Alto — sin licencia explicita, el default legal es todos los derechos reservados por el autor; no hay permiso de uso claro |

Regla: bloquear en CI cualquier dependencia nueva con licencia copyleft fuerte o sin licencia declarada, salvo excepcion documentada y aprobada explicitamente (ej. la dependencia corre solo en tooling de desarrollo, nunca se distribuye con el producto).

## Gate de Calidad Medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| CVEs criticos sin mitigar en dependencias directas o transitivas alcanzables | 0 (CVSS >= 9.0) | `npm audit --audit-level=critical` / `pip-audit` / `govulncheck ./...` segun stack — bloquea merge si el conteo es mayor a 0 |
| Secretos detectables en codigo o historial de Git | 0 coincidencias | `gitleaks detect --source . --verbose` o `trufflehog git file://. --only-verified` — cualquier coincidencia verificada detiene la tarea de inmediato |
| Headers de seguridad HTTP obligatorios presentes en respuesta real | 5/5 (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, CSP sin wildcard) | `curl -I https://<host>` contra el entorno desplegado, o `securityheaders.com` para verificacion externa |
| Endpoints protegidos que rechazan peticion sin token valido | 100% de los endpoints marcados como protegidos | Peticion HTTP directa sin header `Authorization` contra cada endpoint listado como protegido — debe responder 401/403, nunca 200 ni 500 |
| Hallazgos de revision citados con ruta relativa y numero de linea exacto | 100% de los hallazgos reportados | Revision manual del reporte final — un hallazgo sin `archivo:linea` se descarta, no se cuenta como cobertura |

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/sec-owasp-top10.md` — OWASP Top 10, verificacion por capa.
- `references/sec-owasp-llm-agentic.md` — OWASP LLM Top 10 y OWASP Top 10 for Agentic Applications.
- `references/sec-vanguardia.md` — Vanguardia transversal en seguridad de aplicaciones.

## Gestion de Secretos

### Reglas absolutas

- Ningun secreto (contrasena, clave de API, certificado privado, token) se comitea al repositorio en ninguna rama.
- Los secretos se leen exclusivamente desde variables de entorno o desde un gestor de secretos (Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault).
- El archivo `.env` esta en `.gitignore`. El archivo `.env.example` existe y lista todas las variables necesarias con valores de ejemplo no reales.

### Deteccion de secretos en codigo

Antes de aprobar cualquier PR, verificar con una herramienta de deteccion de secretos:

| Herramienta | Uso |
|---|---|
| `git-secrets` | Previene commits con patrones de secretos conocidos |
| `truffleHog` | Escanea el historial de Git en busca de secretos |
| `gitleaks` | Escaneo estatico de secretos en el codigo y el historial |
| GitHub Advanced Security | Deteccion nativa si el repositorio esta en GitHub |

Si se detecta un secreto real en el historial de Git, el proceso de remediacion es:
1. Revocar el secreto expuesto de inmediato en el sistema que lo emitio.
2. Generar uno nuevo y actualizarlo en el gestor de secretos.
3. Usar `git filter-repo` para eliminar el secreto del historial (requiere force push coordinado con el equipo).
4. Notificar al responsable de seguridad del proyecto.

## Modelado de Amenazas (STRIDE)

Aplicar para cada flujo nuevo que involucre datos sensibles o acceso privilegiado:

| Amenaza | Descripcion | Control tipico |
|---|---|---|
| Spoofing (suplantacion) | El atacante se hace pasar por otro usuario o servicio | Autenticacion robusta, validacion de tokens |
| Tampering (manipulacion) | El atacante modifica datos en transito o en reposo | Firmas digitales, integridad via HMAC, TLS |
| Repudiation (repudio) | El usuario niega haber ejecutado una accion | Logs de auditoria inmutables con firma |
| Information disclosure (divulgacion) | Exposicion de datos sensibles | Cifrado, control de acceso, logs sin datos sensibles |
| Denial of service | Agotamiento de recursos | Rate limiting, validacion de entrada, timeouts |
| Elevation of privilege | Obtener acceso mayor al autorizado | Principio de minimo privilegio, validacion de roles |

## Lista de Verificacion de Revision de Codigo — Seguridad

Verificar en orden antes de aprobar un PR. Un PR con observacion en cualquier punto no se aprueba.

1. Dependencias: no se agregaron dependencias con CVEs conocidos de severidad alta o critica.
2. Inyeccion: toda entrada del usuario que llega a queries, comandos o templates esta parametrizada o escapada.
3. Autenticacion: los endpoints protegidos validan el token antes de ejecutar logica.
4. Autorizacion: los recursos se verifican como pertenecientes al usuario autenticado antes de devolverlos o modificarlos.
5. Secretos: no hay credenciales, tokens ni claves hardcodeadas en el codigo ni en los tests.
6. Logs: los eventos de seguridad criticos se registran sin incluir datos sensibles.
7. Headers: los headers de seguridad HTTP estan configurados si el PR afecta la capa de transporte.
8. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables. Ver seccion 'Protocolo de Ahorro de Tokens' en CLAUDE.md.
- Verificar haber leido los manifiestos del anfitrion antes de emitir recomendaciones de seguridad.
- Ante la deteccion de un secreto real en el codigo, detener toda otra actividad y notificar al usuario de forma inmediata como primera accion.
- Verificar justificacion documentada y aprobacion explicita antes de proponer reducir controles de seguridad existentes.
