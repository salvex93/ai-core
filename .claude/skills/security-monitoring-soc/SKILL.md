---
name: security-monitoring-soc
description: Monitorizacion de seguridad continua en produccion (SOC operativo) para la infraestructura del proyecto anfitrion. Cubre arquitectura SIEM (ingestion y correlacion de eventos de seguridad), deteccion de intrusiones IDS/IPS de red y de host, gestion de vulnerabilidades continua con SLA de remediacion por severidad, runbooks tecnicos de incident response (deteccion-contencion-erradicacion-recuperacion-post-mortem) y threat intelligence aplicado a deteccion proactiva. Agnostico de proveedor cloud. Activa al disenar o configurar deteccion de ataques en tiempo real, correlacionar eventos de seguridad de multiples fuentes, definir el proceso de respuesta a incidentes de seguridad, o establecer un programa de gestion de vulnerabilidades continua sobre infraestructura en produccion.
origin: ai-core
version: 1.0.0
last_updated: 2026-08-28
rol: auditor
compatibility: Requiere acceso a los logs/eventos de la infraestructura del anfitrion (aplicacion, red, host, cloud audit logs) para cualquier trabajo de correlacion o deteccion real. Sin esa fuente de datos, el perfil solo puede asesorar en diseno de arquitectura.
---

# Security Monitoring SOC — Monitorizacion de Seguridad Continua en Produccion

Este perfil gobierna la deteccion y respuesta a amenazas de seguridad EN TIEMPO REAL sobre infraestructura ya desplegada en produccion. Su unidad de trabajo es el evento de seguridad correlacionado (log de autenticacion, alerta de red, syscall anomalo, hallazgo de vulnerabilidad con ventana de remediacion vencida), no el codigo fuente ni un snapshot puntual de reconocimiento externo.

La diferencia con los tres perfiles de seguridad ya existentes es de cadencia y capa, no de tema:

| Perfil | Cadencia | Capa | Pregunta que responde |
|---|---|---|---|
| `security-auditor` | Puntual, por PR o release | Codigo y dependencias | ¿Este cambio introduce una vulnerabilidad? |
| `attack-surface-analyst` | Periodico (ciclo de dias/semanas) | Reconocimiento externo (OSINT) | ¿Que es visible desde internet sobre el propio producto? |
| `ciso` | Puntual, por auditoria/cuestionario | Gobierno, politica, evidencia documental | ¿Los controles declarados estan documentados y vigentes? |
| `security-monitoring-soc` (este perfil) | Continua, 24/7 | Infraestructura en runtime | ¿Hay un ataque ocurriendo ahora, y como se responde? |

No reemplaza a ninguno de los tres — los complementa. Un hallazgo de este perfil (ej. "IDS detecto trafico de escaneo de puertos desde una IP") puede escalar a `ciso` si dispara una obligacion de notificacion regulatoria, o retroalimentar a `attack-surface-analyst` si revela un activo no inventariado. Tampoco es `llm-observability`: ese perfil cubre telemetria de costo/calidad de llamadas a LLM, no deteccion de amenazas de seguridad.

## Cuando Activar Este Perfil

- Al disenar la arquitectura de ingestion y correlacion de eventos de seguridad (SIEM) para un proyecto que ya esta en produccion.
- Al evaluar o configurar deteccion de intrusiones de red (IDS/IPS) o de host (HIDS) sobre infraestructura real.
- Al establecer un programa de gestion de vulnerabilidades CONTINUA (no un escaneo puntual) con cadencia de re-escaneo y SLA de remediacion por severidad.
- Al escribir o revisar un runbook tecnico de respuesta a incidentes: que comando ejecutar, como aislar un host comprometido, como rotar credenciales bajo sospecha de compromiso.
- Al disenar reglas de correlacion o alertas que reduzcan ruido (fatiga de alertas) sin perder cobertura de deteccion real.
- Al incorporar feeds de threat intelligence (IOCs, TTPs) para deteccion proactiva en vez de solo reactiva.

## Cuando NO Activar Este Perfil

- La tarea es auditar el codigo o las dependencias del propio repositorio antes de un merge — usar `security-auditor`.
- La tarea es reconocimiento externo periodico (subdominios, DNS, credenciales filtradas en repos publicos) sin datos de runtime — usar `attack-surface-analyst`.
- La tarea es responder un cuestionario de un cliente/banco, evaluar un proveedor (VRA) o redactar politicas de gobierno — usar `ciso`.
- La tarea es instrumentar costo o calidad de llamadas a un LLM — usar `llm-observability`.
- La tarea es configurar observabilidad tecnica generica (metricas/trazas/logs de aplicacion sin foco de seguridad) — usar `devops-infra`.
- No hay infraestructura en produccion todavia (proyecto en desarrollo sin usuarios reales) — no hay eventos que monitorizar; revisar de nuevo al acercarse al primer despliegue.

## Primera Accion al Activar

Invocar MCP `analizar_repositorio` antes de leer ningun archivo del anfitrion:

```
analizar_repositorio(ruta_raiz: ".", mision: "Detecta plataforma de despliegue, proveedor cloud, stack de logging existente, y si ya hay algun agente de seguridad (EDR, IDS, agente de log shipping) configurado")
```

Retorna: stack detectado, dependencias IA, variables de entorno, convenciones del proyecto.

Si MCP gemini-bridge no esta disponible, leer manualmente: `docker-compose.yml`, manifiestos de Kubernetes si existen, `.env.example`, `CLAUDE.md` local.

Antes de proponer cualquier arquitectura de deteccion, confirmar con el usuario:

1. Volumen aproximado de eventos/dia (determina si un SIEM open source autogestionado es viable o si conviene una plataforma gestionada).
2. Presupuesto operativo (un SOC 24/7 con analista humano tiene costo de personal que ninguna herramienta reemplaza sola).
3. Requisito regulatorio si existe (PCI-DSS exige ciertos controles de monitorizacion especificos — coordinar con `ciso` si aplica).

Si un archivo de configuracion o log analizado supera 200 lineas (50 si es log de error), delegar al LLM Routing Bridge (regla GEMINI PRIMERO de CLAUDE.md):

```
node scripts/mcp-gemini.js --mission "Extrae patrones de autenticacion fallida, IPs de origen repetidas, y anomalias de volumen de requests" --file <ruta-al-log>
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir cambios ni ejecutar acciones de contencion hasta tener el plan aprobado.

- La tarea implica una accion de contencion irreversible sobre un sistema en produccion (aislar un host, revocar credenciales activas, bloquear un rango de IP que podria incluir trafico legitimo) sin confirmacion humana explicita.
- Se detecta evidencia de un incidente de seguridad ya en curso (no hipotetico) durante el analisis — reportar de inmediato al usuario en vez de continuar con la tarea original.
- La tarea requiere acceso a logs o sistemas de un tercero sin autorizacion documentada.
- El diseno propuesto de SIEM/IDS implica recolectar datos personales o PII en los eventos de seguridad sin que el anfitrion tenga base legal o politica de retencion definida — coordinar con `ciso` antes de continuar.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

Para un incidente de seguridad activo confirmado, la prioridad es contencion segura, no elegancia de la solucion — comunicar esto explicitamente al usuario y priorizar el runbook de la seccion correspondiente.

## SIEM — Arquitectura de Ingestion y Correlacion

Un SIEM (Security Information and Event Management) centraliza eventos de multiples fuentes (aplicacion, red, host, cloud) y los correlaciona para detectar patrones que ninguna fuente aislada revela por si sola (ej. un login fallido no es una alerta; 50 logins fallidos desde 10 IPs distintas contra la misma cuenta en 2 minutos si lo es).

### Componentes de la arquitectura

```
Fuentes de eventos -> Agente de recoleccion -> Pipeline de normalizacion -> Motor de correlacion -> Alertas + Dashboard
```

| Capa | Funcion | Sin esta capa |
|---|---|---|
| Fuentes | Aplicacion (logs estructurados), red (firewall/WAF), host (syscalls, auth), cloud (CloudTrail/Activity Log) | Puntos ciegos — un ataque que solo toca una fuente no monitorizada pasa desapercibido |
| Agente de recoleccion | Reenvia eventos desde cada fuente hacia el pipeline central | Los logs quedan aislados en cada host, sin correlacion posible entre fuentes |
| Normalizacion | Homogeneiza formato (timestamps, campos) entre fuentes heterogeneas | Cada fuente en su propio formato hace la correlacion manual e inviable a escala |
| Correlacion | Reglas o modelos que detectan patrones entre eventos (no eventos aislados) | Solo se detecta lo que ya esta en un log individual, no el patron compuesto |
| Alertas | Notificacion accionable con contexto suficiente para triage | Un evento detectado que nadie ve no genera respuesta |

### Opciones de plataforma

| Plataforma | Tipo | Cuando conviene |
|---|---|---|
| Wazuh | Open source, self-hosted (fork de OSSEC con capacidades SIEM+XDR) | Presupuesto limitado, equipo con capacidad de operar infraestructura propia, control total de los datos |
| Elastic Security (stack ELK/Elastic) | Open source con tier gestionado opcional | Ya se usa Elasticsearch/Kibana en el stack, se necesita flexibilidad de query sobre volumen alto |
| Plataforma SIEM gestionada del proveedor cloud (ej. Microsoft Sentinel, AWS Security Hub, Google Chronicle) | Gestionada, integrada nativamente | Infraestructura ya concentrada en un solo proveedor cloud, se prioriza integracion nativa sobre portabilidad |

Verificar siempre la vigencia de nombre/tier/pricing de la plataforma elegida contra su fuente oficial antes de comprometerse — ver Protocolo de Vigencia Tecnologica de CLAUDE.md. Este skill no fija una eleccion por defecto: la decision depende del volumen de eventos, presupuesto y el criterio de portabilidad del proyecto anfitrion.

### Reglas de correlacion — ejemplos de patrones de alto valor

```
1. Fuerza bruta de autenticacion:
   >= 10 intentos fallidos desde la misma IP hacia la misma cuenta en <= 5 minutos

2. Credential stuffing (distinto de fuerza bruta):
   >= 5 IPs distintas con intentos fallidos hacia >= 20 cuentas distintas en <= 10 minutos

3. Escalada de privilegios sospechosa:
   Cuenta que nunca uso un rol administrativo ejecuta una accion de ese rol
   dentro de los 5 minutos posteriores a un cambio de permisos sobre esa misma cuenta

4. Exfiltracion de datos por volumen:
   Transferencia saliente de un host que supera 3 desviaciones estandar
   sobre su propio promedio de 30 dias, fuera de ventana de backup programado

5. Movimiento lateral:
   Una misma credencial de servicio autentica exitosamente contra
   >= 3 hosts distintos que normalmente no se comunican entre si, en <= 15 minutos
```

Cada regla de correlacion nueva se prueba primero en modo "solo alerta silenciosa" (sin notificar) durante al menos 7 dias para medir su tasa de falsos positivos real contra el trafico normal del anfitrion, antes de promoverla a alerta activa. Una regla con alta tasa de falsos positivos entrena al equipo a ignorar alertas (fatiga de alertas), que es peor que no tener la regla.

## IDS/IPS — Deteccion de Intrusiones de Red y de Host

### IDS/IPS de red (NIDS/NIPS)

| Herramienta | Tipo | Funcion |
|---|---|---|
| Suricata | Open source, IDS/IPS/NSM | Inspeccion de trafico de red basada en firmas (reglas tipo Snort/ET) y deteccion de anomalias de protocolo, con capacidad de bloqueo inline (IPS) |
| Zeek (ex-Bro) | Open source, Network Security Monitor | Genera logs de red ricos en contexto (conexiones, DNS, HTTP, certificados TLS) para investigacion forense, mas que bloqueo en tiempo real |

Diferencia IDS vs IPS: un IDS detecta y alerta (pasivo, no interrumpe el trafico); un IPS detecta y bloquea inline (activo, requiere estar en la ruta del trafico y tiene riesgo de falso positivo bloqueando trafico legitimo). Empezar en modo IDS (solo alerta) hasta validar la tasa de falsos positivos de las reglas antes de pasar a modo IPS activo en produccion.

### IDS de host (HIDS)

| Herramienta | Funcion |
|---|---|
| Wazuh agent (basado en OSSEC) | Monitorizacion de integridad de archivos (FIM), analisis de logs del sistema, deteccion de rootkits, cumplimiento de politicas (CIS Benchmarks) |
| Falco (CNCF) | Deteccion de comportamiento anomalo a nivel de syscall en contenedores y Kubernetes (ej. shell interactivo abierto dentro de un contenedor, escritura en directorio sensible, escalada de privilegios en un pod) |

Falco es especificamente relevante para infraestructura containerizada/Kubernetes: complementa el hardening de manifiestos que ya cubre `devops-infra` (resource limits, probes, secretos) con deteccion de comportamiento anomalo en tiempo de ejecucion, que ningun manifiesto estatico puede prevenir por si solo.

### Regla de despliegue

Nunca desplegar un IPS (bloqueo activo) directamente en produccion sin antes correrlo en modo deteccion (IDS) durante un periodo de calibracion — un IPS mal calibrado bloqueando trafico legitimo es una autodenegacion de servicio.

## Gestion de Vulnerabilidades Continua

Distinta de una auditoria de dependencias puntual (`security-auditor`, que corre por PR o release): este proceso corre sobre la infraestructura de produccion desplegada (hosts, imagenes de contenedor en el registry, superficie cloud) de forma recurrente, con tracking de remediacion hasta cierre.

### Componentes del programa

| Componente | Sin esto |
|---|---|
| Cadencia de escaneo definida (ej. semanal para hosts, en cada build para imagenes de contenedor) | Vulnerabilidades nuevas permanecen sin detectar entre auditorias puntuales espaciadas |
| SLA de remediacion por severidad | Una vulnerabilidad critica permanece abierta indefinidamente sin presion de cierre |
| Tracking de remediacion hasta cierre verificado (no solo "reportado") | El hallazgo se reporta pero nadie confirma que se corrigio realmente |
| Priorizacion por explotabilidad real, no solo CVSS | Se gasta esfuerzo en CVEs de alto CVSS sin explotacion conocida mientras una vulnerabilidad de CVSS medio pero activamente explotada queda sin atender |

### SLA de remediacion por severidad (punto de partida, ajustar segun criticidad real del anfitrion)

| Severidad | Criterio | SLA de remediacion sugerido |
|---|---|---|
| Critica | CVSS >= 9.0, o presente en el catalogo CISA KEV, o EPSS >= 0.5 | 7 dias o menos |
| Alta | CVSS 7.0-8.9 sin explotacion activa conocida | 30 dias |
| Media | CVSS 4.0-6.9 | 90 dias |
| Baja | CVSS < 4.0 | Siguiente ciclo de mantenimiento planificado |

El catalogo CISA KEV (`cisa.gov/known-exploited-vulnerabilities-catalog`) y el score EPSS (`api.first.org/data/v1/epss`) son las mismas fuentes de priorizacion por explotabilidad real que ya usa `attack-surface-analyst` — mantener el mismo criterio entre ambos perfiles evita que una misma vulnerabilidad reciba prioridad distinta segun quien la reporto.

### Herramientas de escaneo continuo de infraestructura

| Herramienta | Cubre |
|---|---|
| Trivy | Imagenes de contenedor, IaC (Terraform/Kubernetes), filesystems — integrable en CI/CD para bloquear un build con vulnerabilidad critica antes del despliegue |
| Grype | Imagenes de contenedor y SBOMs, alternativa a Trivy |
| OpenVAS / Greenbone | Escaneo de vulnerabilidades de red y host a nivel de infraestructura (no solo contenedores) |

## Runbooks de Incident Response

Complementa la POLITICA de gestion de incidentes que define `ciso` (taxonomia, plazos de notificacion, roles) con el PROCEDIMIENTO TECNICO: que comando o accion concreta ejecutar en cada fase.

### Ciclo de vida del incidente

```
1. Deteccion       -> El SIEM/IDS genera una alerta o un humano reporta comportamiento anomalo
2. Triage          -> Confirmar si es incidente real o falso positivo, clasificar severidad
3. Contencion      -> Detener la propagacion sin destruir evidencia forense
4. Erradicacion    -> Eliminar la causa raiz (credencial comprometida, backdoor, vulnerabilidad explotada)
5. Recuperacion    -> Restaurar el servicio a operacion normal, con monitorizacion reforzada temporal
6. Post-mortem     -> Documentar linea de tiempo, causa raiz y accion correctiva -- sin buscar culpables
```

### Runbook — Host comprometido (contencion)

```
1. Identificar el host exacto (hostname/IP/instance-id) desde la alerta -- nunca actuar sobre un host adyacente por asociacion sin confirmar.
2. Aislar de red SIN apagar el host (apagar destruye evidencia volatil en memoria):
   - Cloud: mover a un security group/NSG que solo permite trafico hacia el equipo de respuesta.
   - On-premise: aislar el puerto del switch o mover a una VLAN de cuarentena.
3. Capturar evidencia volatil antes de cualquier otra accion: memoria (si la politica de forensia lo exige), procesos activos, conexiones de red abiertas, usuarios logueados.
4. Preservar snapshot del disco/volumen para analisis forense posterior.
5. Notificar segun el plazo y canal que defina la politica de `ciso` para este nivel de severidad -- no improvisar el plazo de notificacion.
6. Recien despues de capturar evidencia: proceder a erradicacion (rotar credenciales expuestas, parchear la vulnerabilidad explotada, reconstruir el host desde una imagen limpia conocida -- nunca "limpiar" un host comprometido y reutilizarlo como si nada hubiera pasado).
```

### Runbook — Credencial comprometida (contencion)

```
1. Revocar la credencial especifica de inmediato (API key, token de sesion, credencial de servicio) -- no esperar a completar la investigacion antes de revocar.
2. Identificar el alcance real: que se hizo con esa credencial mientras estuvo comprometida (logs de acceso, acciones ejecutadas).
3. Rotar cualquier credencial derivada o relacionada (si la credencial comprometida podia generar otras, ej. un token de servicio que emite tokens de corta duracion).
4. Emitir credencial nueva por el canal seguro habitual del proyecto -- nunca reenviar la credencial nueva por el mismo canal que pudo estar comprometido.
5. Revisar si la credencial comprometida tenia permisos mas amplios de los necesarios (principio de minimo privilegio) -- corregir el alcance de la credencial nueva, no solo rotarla con los mismos permisos excesivos.
```

### Post-mortem — estructura minima

Todo incidente cerrado produce un documento con: linea de tiempo (deteccion, contencion, recuperacion, con timestamps reales), causa raiz tecnica verificada (no supuesta), que fallo en la deteccion (si la alerta tardo o no existia una regla para ese patron), accion correctiva especifica con responsable y fecha, y si aplica, la regla de correlacion nueva que se agrega al SIEM para detectar el mismo patron mas rapido la proxima vez. Sin la regla nueva, el incidente se repite exactamente igual.

## Threat Intelligence Aplicado

Uso proactivo (alimentar reglas de deteccion antes de un ataque), no solo reactivo (consultar despues de un incidente para entender que paso).

- Indicadors of Compromise (IOCs): hashes de archivos maliciosos conocidos, IPs/dominios de infraestructura de ataque conocida, patrones de User-Agent de herramientas de escaneo automatizado. Se cargan como listas de bloqueo/alerta en el SIEM o IDS.
- MITRE ATT&CK como vocabulario comun de tacticas y tecnicas (`attack.mitre.org`): al escribir una regla de correlacion, mapearla a la tecnica ATT&CK que detecta (ej. T1110 Brute Force, T1078 Valid Accounts) facilita medir cobertura real -- que tecnicas del framework tienen deteccion y cuales son puntos ciegos conocidos.
- El catalogo CISA KEV (ya referenciado en Gestion de Vulnerabilidades) es en si mismo una forma de threat intelligence: confirma explotacion activa en el mundo real, no solo teorica.

No sustituye contratar un feed comercial de threat intelligence si el presupuesto y el perfil de riesgo del anfitrion lo justifican -- este skill cubre el uso tecnico de la senal, no la evaluacion comercial de proveedores (eso es un caso de VRA, coordinar con `ciso`).

## Gate de Calidad Medible

| Metrica | Umbral | Metodo de verificacion |
|---|---|---|
| Tiempo medio de deteccion (MTTD) de un patron con regla de correlacion activa | <= 5 minutos desde que el evento ocurre hasta que la alerta se genera | Comparar timestamp del evento fuente contra timestamp de generacion de la alerta en el SIEM |
| Tasa de falsos positivos de una regla de correlacion nueva antes de promoverla a alerta activa | <= 10% durante el periodo de calibracion de 7 dias en modo silencioso | Triage manual de cada alerta silenciosa generada durante el periodo de calibracion |
| Cumplimiento de SLA de remediacion por severidad | 100% de hallazgos criticos cerrados dentro del SLA de 7 dias definido en este documento (o el que el anfitrion haya calibrado) | Comparar fecha de deteccion vs fecha de cierre verificado en el tracker de vulnerabilidades |
| Cobertura de mapeo a MITRE ATT&CK de las reglas de correlacion activas | 100% de reglas de correlacion documentadas con al menos una tecnica ATT&CK asociada | Revision del catalogo de reglas contra `attack.mitre.org` |
| Completitud del post-mortem tras un incidente cerrado | 100% de incidentes con severidad alta/critica tienen post-mortem con las 5 secciones minimas (linea de tiempo, causa raiz, gap de deteccion, accion correctiva, regla nueva si aplica) | Revision manual del documento de post-mortem contra la estructura minima de este SKILL |

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil.
> Reglas de sesion activas: CLAUDE.md > este skill. Ver seccion 'Protocolo de Ahorro de Tokens' y 'Protocolo de Vigencia Tecnologica' en CLAUDE.md.

- Prohibido ejecutar una accion de contencion irreversible (aislar host, revocar credencial activa, bloquear rango de IP) sin confirmacion humana explicita, salvo que el usuario haya declarado autonomia total para ese runbook especifico por adelantado.
- Prohibido presentar un umbral de SLA o una regla de correlacion generica de este documento como si fuera el requisito exacto del anfitrion sin haberlo calibrado contra su volumen y tolerancia de riesgo real.
- Prohibido inventar nombres de herramientas, versiones o capacidades no verificadas -- si no se conoce con confianza el estado actual de una herramienta citada, declararlo explicitamente y remitir a su fuente oficial antes de que el usuario tome una decision de adopcion.
- Ante evidencia de un incidente real durante cualquier tarea de este dominio, priorizar comunicarlo de inmediato sobre continuar con la tarea original.

## Vigencia — estandar mas reciente del dominio

MITRE ATT&CK (`attack.mitre.org`) y el catalogo CISA KEV (`cisa.gov/known-exploited-vulnerabilities-catalog`, mismo criterio ya verificado en `attack-surface-analyst` con adiciones registradas en julio y agosto de 2026) son marcos activamente mantenidos. Wazuh, Suricata, Zeek, Falco (proyecto CNCF), Trivy y Grype son herramientas open source activamente mantenidas a la fecha de redaccion de este skill.

No se verifico en esta sesion contra fuente primaria oficial el numero de version exacto ni el detalle de licenciamiento actual de cada herramienta listada (Wazuh, Suricata, Elastic Security, plataformas SIEM gestionadas de cada proveedor cloud) -- orientativo. Antes de comprometerse con una version, tier de pricing o capacidad especifica de cualquiera de estas herramientas en un entregable real, verificar contra su documentacion oficial siguiendo el Protocolo de Vigencia Tecnologica de CLAUDE.md: los nombres y el rol funcional de cada herramienta en este documento tienen alta confianza, la superficie exacta de su ultima version no.
