## OWASP Top 10 — Verificacion por Capa

Los diez controles del OWASP Top 10:2025 (edicion vigente, publicada enero 2026). Cambios respecto a la edicion 2021: SSRF se fusiono dentro de Control de Acceso Roto (A01), Security Misconfiguration subio de #5 a #2, aparece A03 Software Supply Chain Failures (reemplaza y amplia el antiguo A06 de componentes vulnerables) y aparece A10 Mishandling of Exceptional Conditions como categoria nueva — ver [[silent-failure-hunter]] para el detalle de deteccion de catch vacios y errores tragados que caen bajo esta categoria.

### A01 — Control de acceso roto (incluye SSRF)

- Verificar que cada endpoint protegido valida el token o sesion antes de ejecutar logica de negocio.
- Prohibido confiar en el ID de usuario enviado por el cliente. El ID se extrae del token validado en el servidor.
- Los recursos de un usuario no deben ser accesibles por otro usuario sin verificacion explicita de pertenencia.
- SSRF (fusionado desde la edicion 2021): prohibido realizar peticiones HTTP a URLs proporcionadas directamente por el usuario sin validacion estricta. Lista blanca de dominios o rangos de IP; bloquear explicitamente rangos privados (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16) y localhost.
- Los clientes HTTP internos usados para webhooks, importaciones de URL o integraciones externas tienen timeout configurado y no siguen redirecciones a dominios fuera de la lista blanca.
- En entornos cloud, el endpoint de metadatos de instancia (ej: 169.254.169.254 en AWS) debe estar explicitamente bloqueado en el firewall de red si el servicio recibe URLs de usuarios.

### A02 — Configuracion incorrecta de seguridad

Subio de posicion #5 (2021) a #2 (2025) — la categoria de mayor crecimiento en incidentes reales. Headers HTTP obligatorios para cualquier API o aplicacion web:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: <politica especifica del proyecto>
```

La politica CSP depende del stack del anfitrion. Nunca usar `Content-Security-Policy: default-src *`.

### A03 — Fallos en la cadena de suministro de software (Software Supply Chain Failures)

Reemplaza y amplia el antiguo A06 "Componentes vulnerables y desactualizados" de la edicion 2021 — ya no es solo dependencias con CVEs, es toda la cadena de suministro del build.

- Ver seccion "Auditoria de Dependencias" de este skill para el protocolo de herramientas y criterios de severidad por CVSS.
- Las imagenes de contenedor base se actualizan en cada release. Usar tags fijos de version, no `latest`.
- Los componentes de infraestructura (bases de datos gestionadas, proxies, brokers de mensajes) tienen un ciclo de actualizacion documentado igual que las dependencias de aplicacion.
- Los artefactos de build (imagenes Docker, paquetes npm/pypi, binarios) se firman y su firma se verifica antes del despliegue.
- Las dependencias se fijan con lockfiles (`package-lock.json`, `poetry.lock`, `go.sum`). Prohibido usar rangos de version sin limite superior en dependencias de produccion.
- Los workflows de CI/CD que usan Actions de terceros fijan la version al SHA del commit, no a un tag flotante.

#### Seguridad del Pipeline CI/CD

El pipeline de CI/CD es superficie de ataque de supply chain. Un atacante que compromete un step del pipeline puede inyectar codigo malicioso en todos los artefactos producidos sin acceso directo al repositorio.

Controles obligatorios:

- Principio de minimo privilegio en tokens CI/CD: los tokens de acceso usados por el pipeline tienen solo los permisos estrictamente necesarios para el step que los usa. Un token de despliegue no tiene permiso de lectura de secretos de produccion.
- Separacion de entornos en el pipeline: los steps de build no tienen acceso a credenciales de produccion. Las credenciales de produccion solo se inyectan en el step de despliegue, despues de que el artefacto ha pasado todas las verificaciones.
- Auditoria de Actions de terceros: antes de agregar una Action de GitHub o equivalente, verificar el codigo fuente del repositorio y su historial de cambios. Una Action con acceso a `secrets` tiene el mismo nivel de privilegio que el pipeline completo.
- SLSA (Supply chain Levels for Software Artifacts): para proyectos con requisitos de compliance, documentar el nivel SLSA alcanzado. El nivel 2 (firma de artefactos con identidad del builder) es el minimo recomendado para pipelines de produccion.
- Escaneo de secretos en el pipeline: integrar un step de deteccion de secretos (ej: `truffleHog`, `gitleaks`) que bloquee el pipeline si detecta credenciales en el codigo o en los artefactos de build.

### A04 — Diseño inseguro

- Los flujos criticos de negocio (pagos, cambios de contrasena, exportacion masiva de datos) requieren modelado de amenazas STRIDE antes de implementarse.
- Prohibido asumir que la validacion en el cliente es suficiente. Toda validacion de negocio ocurre en el servidor.
- Los limites de tasa (rate limiting) se definen en el diseño, no como parche posterior: cuantas peticiones por segundo puede emitir un usuario legitimo en cada endpoint.
- Los flujos de recuperacion de cuenta y onboarding son superficie de ataque. Disenarlos con el adversario en mente desde el primer borrador.

### A05 — Fallos criptograficos

- Prohibido almacenar contrasenas en texto plano o con hashing reversible (MD5, SHA-1 sin salt).
- Usar bcrypt, argon2id o scrypt para hashing de contrasenas. El factor de costo debe ser >= 12 para bcrypt.
- Las claves de API y tokens de larga duracion se almacenan como hash, no en texto plano.
- TLS 1.2 minimo en transporte. TLS 1.3 preferido.

### A06 — Inyeccion

- Toda entrada del usuario que llega a una query de base de datos usa parametros vinculados (prepared statements). Prohibido interpolar directamente.
- Toda entrada que se renderiza en HTML debe ser escapada para prevenir XSS. Confiar en el motor de plantillas del framework detectado; no construir HTML concatenando strings.
- Toda entrada que llega a comandos del sistema operativo debe ser validada contra una lista blanca. En general, evitar llamadas al shell con datos de usuario.

### A07 — Fallos de autenticacion

- Los tokens JWT se validan completamente: firma, expiracion, algoritmo (prohibido aceptar `alg: none`).
- Los tokens de refresh tienen rotacion activa: al usar uno, se invalida y se emite uno nuevo.
- Las rutas de recuperacion de contrasena no revelan si un email existe o no en el sistema (respuesta identica para ambos casos).

### A08 — Fallos de integridad de software y datos

- El pipeline de CI/CD tiene controles de integridad: los pasos de build y despliegue no pueden ser modificados por codigo del repositorio sin revision humana.
- Deserializacion de datos no confiables: prohibido deserializar objetos de fuentes no confiables sin validacion de tipo estricta.
- Actualizaciones automaticas de software (auto-update) verifican firma criptografica antes de aplicar el paquete descargado.

### A09 — Registro y monitoreo insuficientes

- Los eventos de seguridad criticos se registran siempre: intentos de autenticacion fallidos, cambios de contrasena, elevacion de privilegios, acceso a recursos sensibles.
- Los logs de seguridad no contienen datos sensibles: contrasenas, tokens completos, numeros de tarjeta.
- Los logs incluyen: timestamp ISO 8601, identificador de usuario o sesion, IP de origen, accion ejecutada, resultado.

### A10 — Manejo incorrecto de condiciones excepcionales (categoria nueva en 2025)

Cubre el patron de fallo silencioso: errores capturados y descartados sin registro, sin propagacion y sin contexto — el mismo dominio que [[silent-failure-hunter]] ya audita en detalle para Node.js y Python.

- Prohibido `catch {}` vacio o `except: pass` — todo error capturado se registra con contexto (tipo, mensaje, stack) o se re-lanza.
- Los errores de negocio (fondos insuficientes, recurso no encontrado) no se confunden con errores de sistema (timeout, conexion perdida) en el mismo tipo de excepcion generica.
- Las respuestas de error hacia el cliente no filtran stack traces, rutas de archivo del servidor ni detalles de implementacion interna.
- Los estados excepcionales de integraciones externas (API de terceros caida, respuesta malformada) tienen manejo explicito — nunca un fallback silencioso a `null` o `undefined` sin registrar por que.
