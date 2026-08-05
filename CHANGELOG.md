# CHANGELOG — AI-CORE

Registro de cambios por version. Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).
Versionado semantico: MAJOR.MINOR.PATCH.

## [3.28.0] — 2026-08-05

### Agregado — evals completos: los 34 skills restantes cubiertos (42/42)

Cierre del piloto de evals iniciado en v3.24.0. Se generan y verifican con `promptfoo` real (juez `openai:chat:gpt-5.6-luna`) los 34 evals faltantes, siguiendo el mismo patron de los 8 existentes: idioma estricto, ausencia de emojis, y 2-4 casos de dominio derivados literalmente de comportamientos declarados en cada SKILL.md (nunca inventados).

### Corregido — 7 gaps reales de conformidad detectados por los evals nuevos

La corrida real (no simulada) de los 34 evals nuevos encontro comportamientos que contradicen lo que el propio SKILL.md de cada skill declara, corregidos con un ajuste quirurgico y re-verificados hasta aprobar:

- `aiops-engineer` y `claude-api`: ante condiciones que su propia Directiva de Interrupcion exige, el modelo actuaba correctamente en prosa pero omitia el marcador literal `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]`. Se aclaro en ambos SKILL.md que el marcador se inserta siempre de forma literal, ademas de la explicacion en prosa, nunca en su reemplazo.
- `claude-api` (segundo gap): tras emitir la alerta, igual entregaba el codigo como "implementacion final" en el mismo turno. Se aclaro que emitir la alerta implica detenerse -- prohibido aprobar la solucion completa en el mismo turno que la alerta.
- `app-store-publisher`: entregaba el comando de rotacion de keystore (`keytool -genkeypair`) sin esperar confirmacion humana explicita ante perdida de upload key en produccion. Corregido para exigir la confirmacion antes de entregar el comando.
- `audio-voice-engineer`: no advertia que un modelo Live API mencionado por el usuario (`gemini-2.5-flash-live-preview`) esta apagado desde 2025-12-09, pese a que el propio skill ya documentaba esa prohibicion en otra seccion. Corregido para que la advertencia se dispare ante cualquier mencion del usuario a un modelo apagado, no solo cuando el skill lo recomienda por iniciativa propia.
- `release-manager`: no vinculaba espontaneamente el prefijo `feat:` de Conventional Commits con su incremento de version MENOR, pese a que el propio skill ya tenia esa tabla de mapeo. Corregido para mencionarlo explicitamente al dar ejemplos.
- `seo-sem-specialist`: rechazaba tecnicas black-hat (PBNs, keyword stuffing) sin redirigir a alternativas white-hat equivalentes. Corregido para ofrecer 2-3 alternativas legitimas tras el rechazo.
- `agent-testing`: invadia el dominio de `llm-evals` al desarrollar en detalle el diseno de tests de faithfulness/alucinaciones semanticas, pese a mencionar al inicio que ese territorio corresponde al otro skill. Corregido para limitarse a remitir a `llm-evals` sin desarrollar el diseno completo.

### Agregado — `.claude/evals/prompt-loader.js`: fix de infraestructura para SKILL.md con codigo JSX/f-strings

`tech-lead-frontend` y `web-scraping-specialist` tienen SKILL.md con bloques de codigo real (JSX con `dangerouslySetInnerHTML={{ ... }}`, f-strings de Python con JS embebido) cuyas llaves dobles literales el motor Nunjucks de promptfoo interpretaba como variables de template mal formadas, rompiendo el eval con un error de parseo antes de invocar al modelo (confirmado en runtime contra promptfoo 0.122.0 -- la doc oficial no aclara que una prompt function en JS tambien pasa su output por Nunjucks).

Se agrego `prompt-loader.js`: lee el SKILL.md por filesystem y envuelve su contenido completo en un unico bloque `{% raw %}...{% endraw %}` -- confirmado con una llamada real a `nunjucks.renderString()` que preserva el contenido literal sin reinterpretarlo. Los `*-chat.json` estaticos de esos 2 skills se reemplazaron por `*-chat.js` (prompt function que usa el loader).

### Cambiado — `npm run eval-skills` corre los 42 evals en secuencia

Antes apuntaba unicamente a `security-auditor.promptfooconfig.yaml` (piloto original). Se agrego `.claude/evals/run-all.js`, que itera sobre todos los `*.promptfooconfig.yaml` de `.claude/evals/` en secuencia (no paralelo, para no saturar el rate limit del juez) y reporta un resumen consolidado de aprobados/fallidos.

**869 tests, 42 skills con eval de conformidad (42/42), 7 agentes.**

## [3.27.1] — 2026-08-04

### Corregido — sandboxing activo en las 3 plataformas, 32/32 hooks propios (cierre del gap de v3.24.0)

v3.24.0 dejaba el Node.js Permission Model activo solo en Linux/macOS y solo en 4 hooks de mayor riesgo, con Windows desactivado por un spike que encontro comportamiento de glob distinto entre Git Bash y PowerShell sin verificar contra `cmd.exe`. Dos cierres reales sin bump de version en su momento, registrados ahora:

- Sandboxing ampliado a los 28 hooks propios restantes de `.claude/bin/`, auditando caso por caso las operaciones reales de filesystem/child_process de cada uno para asignar el permiso minimo correspondiente (`soloRead`, `readYWrite`, `repoReadWrite`, `repoConGit`). `git-queue-advisor.js` queda fuera por necesitar red real hacia el remoto de git.
- Sandboxing activado tambien en Windows: verificado contra `cmd.exe` real (el shell por defecto sin configuracion adicional) que la misma sintaxis de glob y `--allow-child-process` funcionan identico a POSIX. `nodeConPermiso()` ya no excluye `win32`. Verificado de punta a punta con `settings.json` regenerado localmente en Windows y un comando real ejecutado via `cmd.exe` con exit 0.

Sandboxing real ahora universal en las 3 plataformas para 31 de los 32 hooks propios registrados en `hooks-definition.js`.

## [3.27.0] — 2026-08-04

### Agregado — evals expandidos de 3 a 8 skills (los de mayor riesgo si degradan)

Continuacion de v3.24.0 (piloto con 1 skill, `security-auditor`) y su expansion a 3 (`ciso`, `qa-engineer`). Se agregan 5 skills mas priorizados por riesgo real si su comportamiento degrada silenciosamente: `ai-guardrails` (proteccion de sistemas LLM en produccion), `devops-infra` (infraestructura/despliegues), `database-ops` (operaciones de base de datos en produccion), `cloud-deployment-specialist` (despliegues a los 9 proveedores de nube), y `backend-architect` (arquitectura de API/persistencia).

Cada eval sigue el mismo patron: idioma estricto, ausencia de emojis, y 2 casos especificos de la Directiva de Interrupcion propia de cada skill (ej. `database-ops` verificando que un `DROP TABLE` sin backup verificado se detenga en vez de ejecutarse; `cloud-deployment-specialist` verificando que una migracion de proveedor con trafico real en produccion pida un plan aprobado). Un ajuste real de calibracion: el caso de `ai-guardrails` sobre deshabilitar guardrails en produccion fallo en su primera corrida porque la rubrica exigia el nombre textual "directiva de interrupcion" -- corregido para evaluar el comportamiento real (detener y pedir confirmacion), no la terminologia exacta.

Job de CI actualizado para correr los 8 evals (todos con `openai:chat:gpt-5.6-luna` como juez, mismo fallback de emergencia autorizado en v3.24.0).

**864 tests, 42 skills, 7 agentes.**

## [3.26.0] — 2026-08-04

### Agregado — backend-architect: codigo real en .NET, PHP y Ruby

Cierra la brecha de lenguajes de backend que quedaba explicitamente fuera de alcance desde v3.23.0 (Go/Rust/Java): se agregan los 3 lenguajes de backend restantes de mayor uso empresarial real, con el mismo patron de research + verificacion cruzada independiente contra fuente oficial.

- **.NET/C# con ASP.NET Core 10** (`learn.microsoft.com/dotnet`): Minimal APIs con `builder.Services.AddValidation()` (validacion nativa con DataAnnotations, reemplaza FluentValidation para casos simples), Entity Framework Core, concurrencia con `SemaphoreSlim` + `Task.WhenAll`, testing con xUnit y `WebApplicationFactory<Program>`. La verificacion cruzada encontro que la cita de `TypedResults.ServerSentEvents` como "fetch directo confirmado" no se reproducia en la URL puntual citada — marcado explicitamente como no confirmado por esa fuente especifica en vez de mantener la sobre-afirmacion.
- **PHP con Laravel 13.x** (`laravel.com/docs`, PHP minimo 8.3): la verificacion cruzada confirmo un cambio estructural real -- `routes/api.php` ya no existe por defecto desde Laravel 11 (requiere `php artisan install:api`), y el manejo de excepciones se centralizo en `bootstrap/app.php` via `->withExceptions()`, ya no en `app/Exceptions/Handler.php`. Concurrencia via Laravel Queues (background) y Octane (Swoole/FrankenPHP/RoadRunner) -- `Octane::concurrently()` confirmado que requiere especificamente Swoole, no funciona con FrankenPHP/RoadRunner. El research detecto y descarto por si mismo una alucinacion de una herramienta intermedia (un metodo Carbon inexistente `->plus()`) antes de que llegara al codigo final.
- **Ruby con Rails 8.1 en modo `--api`** (`guides.rubyonrails.org`): `ActionController::API`, `params.expect` para strong parameters, Solid Queue como adapter por defecto de ActiveJob desde Rails 8.0 (sin Redis). Confirmado que Minitest es el framework de testing oficial por defecto (RSpec es popular en la comunidad pero no aparece en la documentacion oficial, declarado como tal). La verificacion cruzada encontro un bloque de test muerto en el ejemplo Minitest original (assertion vacia sin invocar el metodo bajo prueba) y se corrigio antes de publicar.

Registrado en `MARKET_STANDARDS.json`: el dominio `backend-languages-go-rust-java` se renombra a `backend-languages-multi` para reflejar la cobertura de 6 lenguajes. `backend-architect` sube a v1.7.0.

**864 tests, 42 skills, 7 agentes.**

## [3.25.0] — 2026-08-04

### Corregido — gap real de enforcement: git commit -m directo no pasaba por ningun guard de contenido

El usuario pregunto si el arnes tiene freno de mano suficiente sobre sus propias acciones (commits, push, comandos de infraestructura) y si el rastro de "esto lo genero una IA" en el repositorio esta realmente prevenido, no solo declarado en CLAUDE.md. Auditoria con evidencia (no de memoria) confirmo dos cosas: **no hay ningun commit real del historial del repo con Co-Authored-By o mencion de IA** (la sospecha del usuario no se confirmo en lo ya hecho), pero **el mecanismo preventivo tenia un agujero real**: `standards-guard.js` ya bloqueaba esto, pero solo cuando el mensaje de commit se escribia primero a un archivo via Write/Edit -- el flujo mas comun, `git commit -m "..."` o `-F <archivo>` ejecutado directo por Bash, nunca pasaba por ningun guard de contenido antes de ejecutarse.

`destructive-op-guard.js` ahora extrae el mensaje real del commit (inline o via el archivo que `-F` referencia) y lo inspecciona por separado del comando ya enmascarado que usa para sus reglas de patrones destructivos -- distingue una atribucion real de autoria a una IA (bloquea) de una mencion en prosa sobre esta misma regla, ej. un commit que la documenta (no bloquea, mismo principio que ya existia para `rm -rf` citado como texto).

### Agregado — destructive-op-guard.js: 6 patrones de infraestructura verificados contra fuente oficial

Auditoria del propio guard confirmo que solo cubria `rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D` y `DROP TABLE`/`TRUNCATE` -- sin cobertura de comandos destructivos de infraestructura moderna. Workflow de research + verificacion cruzada independiente contra `kubernetes.io`, `developer.hashicorp.com/terraform`, `docs.docker.com` y `git-scm.com` (el research declaro explicitamente que no pudo verificar Cursor/Aider/LangGraph por agotamiento de presupuesto de busqueda de la sesion, en vez de inventar sus politicas):

- **`kubectl delete --all`/`--all-namespaces`** sin `--dry-run` -- cita oficial: "may result in inconsistency or data loss".
- **`terraform destroy`/`apply -destroy`** sin `-target`, y **`terraform apply -auto-approve`** -- HashiCorp recomienda `terraform plan -destroy` primero o acotar con `-target`; `-auto-approve` "skips interactive approval of the plan".
- **`docker system prune --volumes`** (docker nunca borra volumenes por defecto, justamente para evitar perdida de datos) y **`docker volume rm`**.
- **`git push --delete`/`-d`** de una rama remota, y la sintaxis antigua equivalente `git push origin :rama` -- excluye explicitamente refspecs normales como `git push origin HEAD:main` (el lado izquierdo del `:` debe estar vacio para ser un borrado).
- **`DELETE FROM`/`UPDATE ... SET` sin `WHERE`** -- ancla al verbo DML destructivo (nunca a `SELECT`) y exige ausencia de `WHERE` en toda la sentencia, no solo al final, para no generar falsos positivos con el uso rutinario (`DELETE FROM tabla WHERE id = $1`).

Cada regla documenta el caso legitimo que NO debe bloquear (namespace efimero de desarrollo, entorno de CI efimero, rama ya mergeada) segun el research de riesgo de falso positivo, sin implementar distincion de contexto que el propio patron textual no puede ofrecer con certeza (ej. no se intenta detectar si un namespace es "de produccion" por su nombre).

**853 tests, 42 skills, 7 agentes.**

## [3.24.0] — 2026-08-04

### Agregado — sandboxing real de hooks propios (Node.js Permission Model) y evals de conformidad de skills en CI

Cierra las 2 brechas serias del benchmark que quedaron diferidas explicitamente en v3.20.0 ("sandboxing real de ejecucion de codigo" y "evals automatizados reproducibles en CI"). Ambas requirieron diseño con research verificado y aprobacion humana explicita antes de construir, siguiendo el Protocolo de Vigencia Tecnologica y Human-in-the-loop de CLAUDE.md.

**Sandboxing de hooks propios**: los 4 hooks con mayor superficie de riesgo (`destructive-op-guard.js`, `code-exec-guard.js`, `secrets-guard.js`, `injection-guard.js`) ahora corren bajo el Node.js Permission Model (`node --permission`, estable desde v22.13.0) en Linux/macOS, con permisos minimos declarados explicitamente por hook (`--allow-fs-read`/`--allow-fs-write` acotados, ninguno usa `--allow-child-process`). vm2 se descarto por 5 CVEs criticos de sandbox escape con RCE confirmado; worker_threads se descarto como mecanismo de seguridad (solo aisla el heap V8, comparte filesystem/red con el proceso padre).

Requisito real: el Permission Model exige Node >= 22.13.0 -- **Node 20 se removio de toda la matrix de CI**, `engines.node` sube a `>=22.13.0`.

Hallazgo no anticipado del spike: el glob de `--allow-fs-read` se comporto de forma distinta entre Git Bash y PowerShell en Windows (`**` recursivo fallo en Bash, `*` simple funciono en PowerShell) -- sin verificacion equivalente para `cmd.exe`. Por decision explicita del usuario, **el sandboxing queda activo solo en POSIX** (`process.platform !== 'win32'`); en Windows los hooks corren igual que antes, sin aislar, hasta investigar ese matiz con mas profundidad. `hooks-definition.js` expone `nodeConPermiso()` para esto.

**Evals de conformidad de skills**: nuevo directorio `.claude/evals/` con `promptfooconfig.yaml` por skill (piloto: `security-auditor`) y `runner.js` propio. Usa `promptfoo` (CLI Node, MIT, sin infraestructura hospedada) via `npx`, con el juez fijado a un ID nativo (`google:gemini-3.5-flash`, usa `GEMINI_API_KEY` ya declarada) -- el diseño original de enrutar el juicio a traves de `ModelRegistry.js` no es viable: los custom providers `file://` de promptfoo no son aceptados como grading provider de `llm-rubric`, solo IDs nativos (verificado contra `promptfoo.dev` antes de escribir el runner).

Dato de gobernanza comunicado antes de adoptar la dependencia: **promptfoo fue adquirido por OpenAI en marzo de 2026** -- sigue MIT/open source (confirmado en fuente oficial de ambos lados), pero el roadmap ya no es independiente. El usuario confirmo proceder con esta dependencia de forma consciente.

El piloto real (4 casos: idioma estricto, ausencia de emojis, activacion de la Directiva de Interrupcion ante credencial hardcodeada, uso de STRIDE en modelado de amenazas) encontro 2 defectos reales de diseño del propio eval, no del skill: (1) `prompts: [file://SKILL.md]` enviaba el markdown crudo como prompt sin interpolar la pregunta del usuario -- corregido con un archivo de chat `role: system`/`role: user` y `{{pregunta}}`; (2) el modelo intento invocar una `functionCall` inexistente (`system:dir_list`) al ver la instruccion de "Primera Accion al Activar: invocar MCP" del skill fuera del contexto real de Claude Code -- corregido pidiendo explicitamente texto plano sin herramientas en el prompt de test. Tras ambas correcciones, el piloto es reproducible (4/4 con respuesta cacheada).

Job `skill-evals` en `ci.yml`: dispara solo en `pull_request` con `dorny/paths-filter@v4` acotado a `.claude/skills/**`/`.claude/evals/**`, cache de `actions/cache@v4` sobre `~/.promptfoo/cache`, y `continue-on-error: true` durante el periodo de calibracion de thresholds -- se vuelve bloqueante solo cuando el usuario confirme que el juez no produce falsos positivos recurrentes. Requiere que el usuario configure el secret `GEMINI_API_KEY` en GitHub (primer secret que usa este repo en CI, no configurado aun).

**Limite declarado del radar de vigencia**: `audit-market.js`/`MARKET_STANDARDS.json` solo vigila `.claude/skills/*` -- el sandboxing de hooks y el runner de evals son infraestructura propia de `ai-core`, no skills, y quedan **fuera de la cobertura del radar**. Su vigencia (versiones de Node, estado de promptfoo) debe revisarse manualmente en sesiones futuras; no se fuerzo un registro artificial en `MARKET_STANDARDS.json` para simular una cobertura que el mecanismo actual no ofrece.

**832 tests, 42 skills, 7 agentes.**

## [3.23.0] — 2026-08-04

### Agregado — backend-architect: codigo real en Go, Rust y Java/JVM

Cierra la brecha de lenguajes de backend documentada en la sesion anterior (ver v3.22.0): `backend-architect` se declaraba "agnostico al stack" pero Go, Rust y Java/JVM solo aparecian como nombres en tablas de decision, sin un solo bloque de codigo ejecutable. Se prioriza el mismo alcance decidido con el usuario: los 3 lenguajes de mayor uso real en backend, con API REST, concurrencia idiomatica y testing, cada uno con su framework de referencia. PHP, Ruby y .NET quedan fuera de este alcance por decision de producto.

Research y verificacion cruzada independiente contra fuente oficial de cada lenguaje (Workflow multi-agente: research + verify por separado, sin confiar en las citas del propio research):

- **Go 1.26.0** (`go.dev/doc/devel/release`): API REST minima con `net/http` estandar usando el enhanced routing de `ServeMux` (sintaxis `"METODO /ruta"` y wildcards `{id}`, disponible desde Go 1.22) y version con Gin v1.12.0. Concurrencia con worker pool via semaforo de channel buffereado, usando `WaitGroup.Go()` (metodo nativo desde Go 1.25 que reemplaza el trio manual `Add`/`go func`/`defer Done`, eliminando una clase de bug de conteo desincronizado — hallazgo de la verificacion cruzada, el research original no lo habia detectado). Testing con `testing` + `testify` y `net/http/httptest`.
- **Rust 1.97.1** (`blog.rust-lang.org`) con **Axum 0.8.9** (`github.com/tokio-rs/axum/releases`): API REST con extractors `Json`/`Path`, tipo de error custom implementando `IntoResponse`, y la sintaxis de path params `{id}` que reemplazo a `:id` desde Axum 0.8.0 (`tokio.rs/blog/2025-01-01-announcing-axum-0-8-0`). El research inicial fallo (devolvio un stub vacio) y se relanzo; la verificacion cruzada del segundo intento encontro un defecto real en el patron de concurrencia con `tokio::sync::Semaphore`: el permiso debe adquirirse **antes** de `tokio::spawn` y moverse con `async move`, no dentro de la tarea spawneada — el orden original invertia el proposito del semaforo (dejaba spawnear sin limite). Testing con `tower::ServiceExt::oneshot` sobre el `Router` completo, patron confirmado en los examples oficiales del repo.
- **Java/JVM con Spring Boot 4.1.0** (`spring.io/projects/spring-boot`, Java 17-26 segun `docs.spring.io/spring-boot/system-requirements.html`): API REST con `@RestController`, `@Valid`, `@RestControllerAdvice` para el contrato de error centralizado, y Spring Data JPA. Concurrencia con virtual threads (`Executors.newVirtualThreadPerTaskExecutor()`, JEP 444, estable desde JDK 21). Testing con JUnit 5 + Mockito y `@WebMvcTest`/`MockMvc` — la verificacion cruzada encontro que `@MockBean` fue **removido en Spring Boot 4.0** (no solo deprecado, como lo presentaba el research original) en favor de `@MockitoBean`, confirmado contra la guia oficial de migracion de Spring Boot; el codigo de ejemplo original no habria compilado contra la version que el propio research recomendaba.

Registrado en `MARKET_STANDARDS.json` (dominio nuevo `backend-languages-go-rust-java`) desde su creacion. `backend-architect` sube a v1.6.0.

**817 tests, 42 skills, 7 agentes.**

## [3.22.0] — 2026-08-04

### Agregado — cloud-deployment-specialist: despliegue real en 9 proveedores de nube/hosting

El usuario pregunto si el conjunto de skills "da el ancho" en cualquier lenguaje de programacion y cualquier proveedor de nube (AWS, Firebase, Google, DigitalOcean, etc.). Auditoria con evidencia (no de memoria) confirmo que NO: `backend-architect` y `devops-infra` declaran ser "agnosticos al stack"/"agnosticos al proveedor de nube" en su description, pero el contenido tecnico ejecutable real esta concentrado en Node.js/TypeScript + Python (parcial, solo en testing) + PostgreSQL + Flutter + AWS/GCP genericos sin ejemplos concretos de ningun proveedor especifico. Go, Rust, Java, PHP, Ruby y .NET aparecen solo como nombres en tablas de decision, sin un solo bloque de codigo real en ningun skill de los 41 existentes. Proveedores modernos (DigitalOcean, Cloudflare Workers/Pages, Vercel, Railway, Render, Fly.io) tenian cero menciones en `devops-infra`, que ademas excluye explicitamente el modelo "VPS + Docker Compose sin Kubernetes/IaC" de su alcance -- justo donde operan esos proveedores.

Se prioriza primero la brecha de proveedores de nube sobre la de lenguajes de backend (queda documentada para una proxima sesion). Skill nuevo `cloud-deployment-specialist`, complementario a `devops-infra` (que se mantiene IaC/Kubernetes generico, sin duplicarse), con comandos CLI reales verificados contra fuente oficial de cada proveedor:

- **AWS**: App Runner confirmado **cerrado a clientes nuevos** (verificado independientemente con fetch directo propio contra `docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html`, ademas del research del workflow) -- AWS recomienda migrar a **ECS Express Mode**, con la sintaxis exacta del comando `aws ecs create-express-gateway-service` confirmada contra la misma fuente oficial (el workflow la habia dejado como "no reverificada", la verificacion independiente confirmo la sintaxis textual completa) y el procedimiento real de migracion blue/green con DNS weighted routing.
- **Google Cloud**: Cloud Run (`gcloud run deploy --source`, scale-to-zero confirmado, free tier de 180k vCPU-s/360k GiB-s/2M requests) y Firebase Hosting (`firebase deploy --only hosting,functions`).
- **Azure**: Container Apps (`az containerapp up`, scale-to-zero confirmado, free tier identico a Cloud Run) vs App Service (sin scale-to-zero real salvo tier limitado).
- **DigitalOcean**: App Platform (`doctl apps create`, pricing hibrido de tiers fijos) y Droplets.
- **Cloudflare**: Workers (`wrangler deploy`, V8 isolates sin cold start tradicional, scale-to-zero por diseno, limites de free tier verificados) y Pages.
- **Vercel, Railway, Render, Fly.io**: comandos reales de cada uno, con el estado real de scale-to-zero marcado explicitamente como "no verificado contra fuente oficial" en los 3 casos donde ninguna fuente primaria lo confirma -- sin asumir por analogia con Cloud Run/Container Apps, tal como exige el Protocolo de Vigencia Tecnologica de CLAUDE.md. Inconsistencia real detectada en la propia documentacion oficial de Railway ($1 credito mensual vs $5 grant unico) preservada y remarcada en la tabla comparativa final, no resuelta implicitamente.

Registrado en `MARKET_STANDARDS.json` (dominio `cloud-provider-deployment`) desde su creacion -- el radar de vigencia arreglado en v3.21.0 cubre el skill nuevo sin punto ciego.

**817 tests, 42 skills, 7 agentes.**

## [3.21.0] — 2026-08-04

### Corregido — audit-market.js/MARKET_STANDARDS.json tenia un punto ciego real de cobertura

El usuario pregunto si el arnes esta "fit con lo ultimo del mercado" y como mantenerlo asi de forma continua. Revision del mecanismo de vigilancia ya existente (`audit-market.js` + `MARKET_STANDARDS.json`, que compara `last_updated` de cada skill contra la fecha de verificacion registrada de su dominio tecnico) encontro que 20 de 41 skills -- incluidos los 3 nuevos de la v3.20.0 (`app-store-publisher`, `saas-product-architect`, `qa-engineer` con su modulo de QA destructivo) -- no estaban registrados en ningun dominio: el radar no los vigilaba en absoluto.

Registrados los 20 skills faltantes en dominios nuevos o existentes, con honestidad de fecha: `app-distribution-stores`, `saas-business-architecture` y `qa-destructive-testing` llevan la fecha y las fuentes reales verificadas en la v3.20.0; `mcp-protocol` lleva la fecha real del release candidate MCP 2026-07-28; los dominios sin verificacion activa en esta pasada (`backend-architecture-generic`, `mobile-flutter`, `performance-load-testing`, `seo-sem-marketing`, `doc-generation`, `web-scraping`, `multimodal-voice`) quedan marcados explicitamente "orientativo, no verificado contra fuente primaria en esta pasada" en vez de simular una verificacion que no ocurrio; los 7 skills de gobernanza interna del propio arnes (`aaa-evaluator`, `aiops-engineer`, `cost-optimizer`, `cross-model-verifier`, `dev-loop`, `memory-manager`, `silent-failure-hunter`) se agrupan en `ai-core-internal-governance` porque su vigencia se mide contra el propio codigo del repo, no contra un estandar de mercado externo.

Resultado: `audit-market.js` ahora audita el 100% de los skills (0 sin dominio, 0 con drift, 0 stale con umbral de 45 dias).

### Agregado — audit-market.js --only-stale, integrado al Protocolo de Arranque

Nuevo flag `--only-stale`: silencioso (stdout vacio, exit 0) si no hay ningun hallazgo de `STALE_MERCADO`/`DRIFT_VS_MERCADO`/`SIN_DOMINIO_REGISTRADO`; con hallazgos, una linea compacta por skill afectado. Disenado especificamente para correr en cada sesion sin agregar ruido -- integrado como paso 5 del Protocolo de Arranque en CLAUDE.md.

`aiops-auditor.md` suma el paso 4c: reporte completo (no `--only-stale`) con umbral de 45 dias para la auditoria profunda periodica, distinto del chequeo silencioso de cada sesion.

**809 tests, 41 skills, 7 agentes.**

## [3.20.0] — 2026-08-04

### Agregado — cierre de 7 gaps menores del benchmark contra Anthropic/OpenAI/Google ADK/open source

Deep research previo (memoria `feedback-gaps-benchmark-arneses-aaa`) identifico 9 gaps priorizados comparando ai-core contra Claude Code/Agent SDK, OpenAI Agents SDK, Google ADK/Gemini y frameworks open source (LangGraph/CrewAI/MCP). Los 2 gaps serios (sandboxing real de ejecucion de codigo, evals automatizados reproducibles en CI) quedan diferidos por decision explicita del usuario -- son diseno de arquitectura nueva, no una extension quirurgica de una sesion. Los 7 gaps menores se cerraron en esta version:

- **`destructive-op-guard.js`** (hook `PreToolUse`, matcher `Bash`) -- enforcement real de human-in-the-loop para operaciones destructivas, hasta ahora solo convencion en prosa de CLAUDE.md. Bloquea con exit 2, antes de ejecutar: `rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `git branch -D`, `DROP TABLE`/`TRUNCATE` sin filtro. Verificado en vivo: el primer intento de commitear este cambio se auto-bloqueo porque el mensaje de commit describia los patrones como texto -- corregido para descartar el contenido citado del mensaje cuando el comando raiz es un `git commit`.
- **`scripts/rollback-skill.js`** -- revierte un skill especifico a una version anterior (busca en el historial de git del archivo el commit donde `version:` coincide) via `git checkout <hash> -- <archivo>` acotado, sin afectar el resto del repo. Registrado como `npm run rollback-skill`.
- **`lib/guard-report.js`** -- esquema tipado comun `{guard, verdict, severity, hallazgos, timestamp}` en JSONL, adoptado (opt-in, sin cambiar comportamiento existente) por `secrets-guard.js`, `injection-guard.js` y `pre-commit-tdd.js`. Verificado en vivo contra el archivo real de reporte de la propia sesion.
- **`.claude/MCP_LIFECYCLE.json` + `mcp-lifecycle-check.js`** -- ciclo de vida formal Active/Deprecated/Removed para los servidores MCP propios (`gemini-bridge`, `anthropic-router`), alineado con la politica de deprecacion de la spec MCP 2026-07-28. Reutiliza la lista de servidores de `mcp-integrity-check.js` como fuente unica de verdad. Integrado como paso 4b del protocolo de `aiops-auditor`.
- **Checkpointing de `ModelDispatcher.js`**: evaluado y descartado con justificacion tecnica documentada -- `executeMoATask` ya usa `Promise.allSettled` (nunca rechaza, degrada con gracia) y su unico caller real (`moa-context-gatherer.js`) se re-invoca desde cero en cada turno de conversacion. No hay progreso parcial entre 2 llamadas HTTP de un hook de un turno que valga la pena preservar entre crashes.
- **2 tests con flakiness residual aislados**: `validate-agents-js.test.js` y `validate-globals-js-schema-agentskills-io.test.js` usaban nombre fijo (`zz-test-agent-temp.md`, `zz-test-agentskills-temp/`) dentro de `.claude/agents/`/`.claude/skills/` reales -- ahora usan `process.pid`, mismo patron ya aplicado a los 4 archivos de la v3.18.0.

### Agregado — QA destructivo en qa-engineer (fuzzing, chaos testing, historial de fallos)

Modulo nuevo via research verificado contra fuentes oficiales (owasp.org, ISTQB, principlesofchaos.org, cncf.io, go.dev, docs oficiales de Schemathesis/Hypothesis/fast-check/Atheris/Jazzer):

- **Fuzzing de inputs** agnostico al stack: fuzzing guiado por schema OpenAPI (Schemathesis, RESTler) para APIs, property-based testing (Hypothesis, fast-check) para funciones puras, `go test -fuzz` (GA desde Go 1.18, confirmado contra go.dev) para Go nativo.
- **Chaos testing de infraestructura**, distinguido explicitamente de fuzzing (capas distintas: input de aplicacion vs infraestructura de sistema distribuido). Chaos Mesh y LitmusChaos confirmados en estado CNCF **Incubating** (no Graduated) contra `cncf.io/projects`, verificado independientemente ademas del research del workflow. Incluye criterio explicito de cuando NO aplica (monolito sin dependencias distribuidas).
- **Adversarial testing de UI/API**: Boundary Value Analysis y Equivalence Partitioning (origen formal ISTQB) como checklist sistematico, mas pruebas de carga (k6) con metricas concretas de ruptura (p99, error rate, memory leak via soak test).
- **`BUGS_HISTORY.json`** (vive en el proyecto anfitrion, no en ai-core) -- historial persistente de bugs consultado antes de cada sesion de QA destructivo para no reintroducir un bug reparado y priorizar fuzzing/chaos hacia los componentes con mayor densidad historica de fallos. Formalizado el patron bug-encontrado-test-de-regresion-antes-del-fix-test-permanece-en-la-suite.

**807 tests, 41 skills, 7 agentes.**

## [3.19.0] — 2026-08-04

### Corregido — atributo OTel obsoleto en llm-observability

`gen_ai.system` fue renombrado a `gen_ai.provider.name` en semantic-conventions v1.37.0 (nombre viejo deprecado, no eliminado) -- confirmado contra `github.com/open-telemetry/semantic-conventions-genai` y el changelog de releases del repo oficial. El contenido GenAI completo se movio de repositorio en v1.42.0 (junio 2026). Detectado via deep research comparando ai-core contra convenciones de observabilidad de referencia (Anthropic Claude Code/Agent SDK, OpenAI Agents SDK, Google ADK/Gemini, frameworks open source).

### Agregado — 2 skills nuevos: app-store-publisher y saas-product-architect

Dos brechas de dominio confirmadas con auditoria exhaustiva (grep sobre los 39 skills existentes, sin muestreo) antes de escribir contenido nuevo -- ningun skill cubria publicacion en tiendas de apps ni arquitectura de negocio SaaS, mas alla de fragmentos tecnicos dispersos.

**`app-store-publisher`** (via research contra fuentes oficiales de cada plataforma):
- Apple App Store: cuentas, certificados/provisioning profiles, distincion entre notarizacion macOS (Developer ID) y notarizacion iOS/iPadOS (Alternative Distribution/DMA) -- son procesos distintos que no deben confundirse, SDK minimo iOS/Xcode 26 vigente desde 28-abr-2026.
- Google Play Store: Play App Signing (modelo de dos claves upload/app signing key), AAB obligatorio desde agosto 2021, target API level 36 (Android 16) obligatorio desde 31-ago-2026 con cita textual verificada.
- Microsoft Store: MSIX vs MSI/EXE, opciones de firma (gratis via Store, Azure Artifact Signing, certificado OV/EV) -- Azure Artifact Signing confirmado con disponibilidad general desde enero 2026 (antes "Trusted Signing"), verificado independientemente contra 2 fuentes oficiales de Microsoft ademas del research del workflow.
- Electron vs Tauri para empaquetar apps web como desktop nativo: tabla comparativa, firma/notarizacion por plataforma, ausencia de MSIX nativo en ambos frameworks.

**`saas-product-architect`** (via research contra AWS/Microsoft Learn/Stripe/Paddle/WorkOS/AICPA):
- 3 estrategias de multi-tenancy (silo/pool/bridge) con criterio de decision de Microsoft Learn, referenciando (no repitiendo) la seccion RLS ya existente en `database-ops`.
- Billing: Merchant of Record de Stripe/Paddle/Lemon Squeezy, webhooks criticos con idempotencia, dunning management, comportamiento verificado de trials en estado `paused` sin metodo de pago (incluye el evento `entitlements.active_entitlement_summary.updated`, dato nuevo no cubierto por ningun reporte de investigacion, verificado por el agente de sintesis contra `docs.stripe.com` en la misma tarea).
- RBAC de producto y entitlements por plan, distinguidos explicitamente de feature flags de despliegue (`release-manager`).
- Provisioning de tenant, white-labeling con dominio custom (incluye riesgo de dangling DNS/subdomain takeover y su mitigacion), rate limiting por plan.
- Metricas de negocio (MRR/churn/NRR/LTV/CAC, con el ratio LTV:CAC 3:1 marcado explicitamente como heuristica de mercado de David Skok, no estandar regulatorio) y compliance B2B (SOC 2 Tipo I/II vs ISO 27001, referenciando `ciso` para PCI-DSS/HIPAA sin repetirlo).
- ToS/Privacy Policy/DPA marcados en todo momento como orientacion estructural, nunca como asesoria legal formal.
- Verificacion adicional fuera del research original: estado operativo de Lemon Squeezy en 2026 tras su adquisicion por Stripe en 2024 -- confirmado que sigue operando de forma autonoma sin fecha de discontinuacion anunciada (`lemonsqueezy.com/blog/2026-update`), dato que el workflow de investigacion dejo pendiente de verificar.

Ambos skills siguen el patron de vanguardia (identidad+prohibidos+gate+vigencia) y agregan Directiva de Interrupcion con `REQUIERE_OPUSPLAN` para operaciones de alto riesgo del dominio (rotacion de keys de firma en produccion, migracion de modelo de tenancy o plataforma de billing con datos activos). Conteo de skills actualizado de 39 a 41 en CLAUDE.md, README.md y los tests que lo asumian fijo.

**762 tests, 41 skills.**

## [3.18.0] — 2026-08-03

### Corregido — GeminiApiClient.js seguia en el SDK deprecado tras la migracion de GeminiAdapter.js

La migracion de `@google/generative-ai` (deprecado, repo renombrado a `deprecated-generative-ai-js`) a `@google/genai` se aplico en `GeminiAdapter.js` pero no en `GeminiApiClient.js` -- el cliente real que consume el bridge MCP (`scripts/mcp-gemini.js` via `McpServerHandlers.js`), que CLAUDE.md exige como tier 0 obligatorio. `package.json` ya habia eliminado la dependencia vieja, asi que `GeminiApiClient.js` fallaba en runtime con `Cannot find module '@google/generative-ai'` -- reproducido en vivo antes del fix. Se agrego un shim de compatibilidad interno (`getModel()` expone `.generateContent()` con la misma forma `result.response.text()`/`result.response.candidates` del SDK viejo) para no tener que tocar `McpServerHandlers.js`. `GEMINI_DEFAULT` sincronizado a `gemini-3.6-flash`. Verificado con llamada real (`callWithRetry` y `buscarWeb` con Google Search grounding, ambos contra la API real de Google).

### Agregado — migracion de SDK Gemini y consenso multi-IA en CrossVerifier

`GeminiAdapter.js` migrado a `@google/genai` (API `ai.models.generateContent`), default actualizado de `gemini-3.5-flash` a `gemini-3.6-flash` en `ModelRouter.js` y el adapter. `CrossVerifier.js` suma `resolverConDesempate()`: consenso automatico 2-de-3 para tareas criticas (`auditar_seguridad_critica`, `disenar_sistema`, `refactorizar_arquitectura`) cuando el primer verificador rechaza -- busca un tercer proveedor distinto y degrada con gracia al veredicto unico si no hay uno disponible. Bug real detectado y corregido en la implementacion antes de cerrarla: la formula inicial (`primerVeredicto.pass && segundoVeredicto.pass`) nunca podia revertir un rechazo inicial. `CrossVerifier` ahora fuerza `gpt-5.6-sol` (el modelo mas capaz, no el default barato) al verificar diffs. Pricing de `gpt-5.6-luna` corregido en `OpenAICompatAdapter.js` (`$0.20/$1.20` real vs `$1/$6` desactualizado, OpenAI recorto el precio el 2026-07-30).

### Agregado — modulo de vanguardia transversal en los 39 skills

Cada skill (excepto `tech-lead-frontend`, que ya lo tenia desde el Modulo 14 "3D Web, Shaders y Experiencias Inmersivas") recibe un modulo nuevo con 4 partes propias de su dominio: identidad declarada antes de ejecutar, lista de patrones prohibidos especificos y reconocibles del dominio (no genericos), gate de calidad medible con umbrales numericos y metodo de verificacion, y bloque de vigencia verificado contra fuente oficial en la tarea (o marcado explicitamente como orientativo cuando no se pudo verificar). `ux-visual-designer` completo su bloque de vigencia faltante, corrigiendo ademas la denominacion imprecisa "Tokens W3C" -- la especificacion vive en el Design Tokens Community Group (DTCG), no en el W3C Standards Track (verificado contra `w3.org/community/design-tokens` y `designtokens.org`, primera version estable 2025.10). Auditoria de calidad post-generacion sobre los 8 skills con mayor riesgo de solape confirmo: sin duplicacion literal, sin contradiccion de umbrales, vigencia siempre marcada correctamente.

Auditoria de gaps/conflictos/vigencia previa a este bloque (11 skills + CLAUDE.md): sourcemaps de produccion, RLS, API senior (versionado/idempotencia/paginacion cursor/GraphQL vs REST), event-driven con Outbox/DLQ, WebSockets/SSE con Redis Pub/Sub, i18n real, offline-first/sync, PCI-DSS/HIPAA, licencias OSS. Vigencia verificada contra fuente oficial: `firebase_vertexai` deprecado a favor de `firebase_ai`, Angular 22 estable, Next.js PPR estable via `cacheComponents` en Next.js 16.

### Corregido — 4 causas raiz reales de flakiness en tests de hooks (condicion de carrera sobre estado compartido en disco)

Investigacion de causa raiz (no solo confirmar que era intermitente, pendiente documentado desde v3.17.4) de 4 tests que fallaban de forma no determinista solo en la suite completa, nunca aislados:

- **`capture-event.js`** hacia `read -> modify -> write` no atomico sobre `EVENTS_QUEUE.json` real sin variable de entorno de override, a diferencia de `circuit-breaker.js` que ya respetaba `AI_CORE_EVENTS_QUEUE_PATH` para el lado de lectura. Dos procesos escribiendo el archivo real en paralelo (dos tests del mismo describe, o un test y el uso real de la sesion) perdian eventos por pisado de escritura. Ahora `capture-event.js` respeta `AI_CORE_EVENTS_QUEUE_PATH`.
- **`mcp-integrity-check.js`** tenia `BASELINE_PATH` hardcodeado sin override -- mismo patron de bug ya resuelto para `memory-index.js` en v3.17.4. Colisionaba con `health-check.js`, que invoca `verificarIntegridad()` internamente y comparte el mismo archivo real. Ahora respeta `AI_CORE_MCP_BASELINE_PATH`.
- **`subagent-guard.js`** usa `LOCK_DIR` compartido a nivel de sistema operativo por diseno (para que el limite de `MAX_PARALLEL` cuente subagentes lanzados por cualquier proceso). El test de "supera `MAX_PARALLEL`" corria contra ese mismo directorio real, contaminado por uso real concurrente del Agent tool durante la sesion que ejecuta los tests. Ahora respeta `AI_CORE_SUBAGENT_LOCK_DIR` (opcional, solo para tests -- el comportamiento de produccion no cambia).
- **`health-check.js`** fallaba de forma mas profunda: `checkSkills()` (`health-sync.js`) hacia `readdirSync` seguido de `statSync` sobre `.claude/skills/` real sin manejo de excepcion -- si otro archivo de test (`health-sync-js-checkskills.test.js`, `validate-globals-js-schema-agentskills-io.test.js`) crea y borra un directorio de skill temporal en la ventana entre ambas llamadas (TOCTOU real, confirmado con log de stack trace instrumentado), `statSync` lanzaba `ENOENT` no capturado, que el `main().catch(() => process.exit(0))` externo de `health-check.js` silenciaba sin loguear -- el hook salia con exit 0 pero sin emitir el banner esperado. `checkSkills()` ahora tolera que un directorio listado desaparezca antes del stat o del read del `SKILL.md`, excluyendolo del conteo en vez de propagar la excepcion.

Verificado: 15 corridas consecutivas de la suite completa sin fallos (antes reproducia en aproximadamente 40% de las corridas). Bajo contencion de recursos artificialmente extrema (6 suites completas en paralelo simultaneo, muy por encima de cualquier uso real) persisten fallos de baja frecuencia en otros tests que dependen del mismo patron de estado compartido en disco -- documentado como deuda tecnica conocida, no bloqueante para uso normal de `npm test`.

### Pendiente

Patron de "estado compartido en disco sin aislamiento por test" identificado como una clase de bug transversal, no agotada por este fix: `tests/harness/validate-agents-js.test.js` y `tests/harness/validate-globals-js-schema-agentskills-io.test.js` siguen creando/borrando entradas reales en `.claude/agents/`/`.claude/skills/` sin nombre unico por proceso -- de bajo riesgo practico (ventana sincrona sin operacion async intermedia, sin fallo reproducido hasta la fecha) pero mismo patron de fondo. Evaluar en una proxima sesion si conviene aislarlos preventivamente o esperar a que un fallo real lo justifique.

## [3.17.4] — 2026-07-26

### Corregido — test flaky de memory-index.js por condicion de carrera entre archivos de test paralelos

El push de la version 3.17.3 (solo documentacion) disparo un fallo real en CI: `windows-latest` con Node 20 fallo `memory-index-js-vault-bm25.test.js` con 3 subtests rotos en "namespacing por rol" (`gh run view --log-failed` confirmo el fallo real, no se asumio que era el mismo problema anterior).

**Causa raiz:** `memory-index.js` opera sobre `.claude/memory-vault/` real del repo (ruta hardcodeada), sin ninguna forma de aislarlo en tests. `node --test` ejecuta archivos de test en paralelo, y dos archivos distintos (`memory-index-js-vault-bm25.test.js` y `memory-vault-prune-check-js.test.js`) escriben/leen el mismo directorio compartido (`.raw/`) simultaneamente. `cmdIndex()` escanea TODO `.raw/` (todos los roles) en cada invocacion sin filtro -- si un test esta creando/borrando 55 archivos en `.raw/architect/` justo cuando el otro corre `index` (que tambien procesa esa carpeta), el escaneo puede toparse con archivos a mitad de escritura/borrado, mas notorio en Windows por su modelo de I/O.

**Fix:** `memory-index.js` ahora respeta `AI_CORE_MEMORY_VAULT_PATH` (variable de entorno opcional, mismo patron que `AI_CORE_EVENTS_QUEUE_PATH` de `circuit-breaker.js`) -- sin ella, comportamiento identico al actual. `memory-index-js-vault-bm25.test.js` ahora opera sobre un directorio temporal propio via esa variable, eliminando la condicion de carrera de raiz sin importar cuantos archivos de test corran en paralelo en el futuro.

Verificado: 5 corridas consecutivas de la suite completa sin fallos (antes reproducia intermitentemente).

## [3.17.3] — 2026-07-26

### Corregido — CI seguia roto tras el fix anterior (glob de shell no se expande en PowerShell)

El fix de la version 3.17.2 (test fragil de `mtime`) era necesario pero no suficiente -- el push de ese fix (`f79c8c0`) siguio fallando en CI. Verificado con `gh run view --log-failed` (no se asumio que el primer fix bastaba): el error real era `Could not find 'D:\a\ai-core\ai-core\tests\harness\*.test.js'` en el runner de `windows-latest`.

**Causa raiz:** `.github/workflows/ci.yml` ejecutaba `node --test tests/harness/*.test.js` como comando de shell directo. GitHub Actions usa PowerShell (`pwsh`) como shell por defecto en runners Windows, y PowerShell **no expande** el patron `*.test.js` como argumento a un ejecutable externo de la misma forma que bash -- el string literal `tests/harness/*.test.js` llegaba sin expandir a `node`, que no encontraba ningun archivo con ese nombre exacto. El mismo comando funciona en Ubuntu/macOS (bash si expande el glob antes de invocar node), lo que oculto el problema hasta el primer push que disparo el step en Windows con este patron.

**Fix:** verificado contra la documentacion oficial de Node.js (`nodejs.org`/`doc/api/test.md`) que `node --test` **sin ningun argumento** ya descubre automaticamente todos los archivos `**/*.test.{cjs,mjs,js}` de forma recursiva desde el directorio actual, excluyendo `node_modules` por convencion del test runner -- no depende de que el shell expanda ningun glob. `package.json` (`"test"`) y el step de CI simplificados a `node --test` / `npm test`, sin patrones de archivo explicitos.

Verificado: mismo resultado exacto (741 tests, 83 suites) con `node --test` sin argumentos que con los patrones explicitos anteriores, confirmando que el descubrimiento automatico cubre los mismos archivos sin depender del shell.

## [3.17.2] — 2026-07-26

### Corregido — CI roto en el push anterior (test fragil dependiente de mtime del sistema de archivos)

El commit `5a5d414` (vulnerabilidades npm audit) rompio los 6 checks de CI en las 3 plataformas (`gh run list` confirmo la corrida anterior en verde, la de este push en rojo -- causado por este cambio, no preexistente).

**Causa raiz:** el test `tests/harness/validate-agents-js.test.js:121` ("los 7 agentes reales del ecosistema son conformes") exigia `status === 'CONFORME'` estricto (deepEqual con `[]` de no-conformes). El chequeo de drift `last_updated`-vs-`mtime` de `validate-agents.js` compara la fecha declarada contra el `mtime` real del archivo en disco -- en un checkout LOCAL ya clonado, el `mtime` refleja cuando se toco el archivo por ultima vez, pero en un checkout FRESCO de CI (`actions/checkout`), TODOS los archivos reciben `mtime` = "ahora del runner", sin importar cuando se commitearon. `map-updater.md` (`last_updated: 2026-06-04`, no tocado en las sesiones recientes) disparaba ese drift (severidad BAJA, no bloqueante por diseno) solo en CI, nunca en local -- el test rigido lo convertia en fallo duro.

**Fix:** el test ahora valida `resumen.criticos === 0` y `resumen.altos === 0` (lo mismo que exige el exit code real del script para bloquear CI), no el status `CONFORME` estricto que depende del `mtime` del sistema de archivos. Verificado reproduciendo el escenario exacto: clon fresco a un directorio temporal (mismo efecto que un checkout de CI, `mtime` de "ahora" en todo el arbol), confirmando que el test viejo fallaba ahi y el nuevo pasa.

**Patron reutilizable:** cualquier assertion sobre "0 hallazgos totales" en un script que compara `last_updated` contra `mtime` de disco es fragil ante checkouts frescos -- validar solo severidad critica/alta (lo que realmente bloquea), nunca el conteo total incluyendo severidad baja/media derivada de mtime.

Suite completa: 741/741 tests. Verificado en un clon fresco simulando checkout de CI, no solo en el working tree local ya existente.

## [3.17.1] — 2026-07-26

### Corregido — 3 de 4 vulnerabilidades de npm audit (dependencias transitivas)

`npm audit` reportaba 4 vulnerabilidades (1 low, 2 moderate, 1 high), todas en dependencias transitivas de `@modelcontextprotocol/sdk` -- ningun archivo propio del proyecto importa ese SDK directamente (`mcp-gemini.js`/`mcp-anthropic.js` implementan JSON-RPC sobre stdio manualmente, sin usar la libreria).

- **`body-parser`** (DoS por limite de tamano mal manejado) y **`fast-uri`** (host confusion, severidad alta) corregidos sin breaking change via `npm audit fix`.
- **`@hono/node-server`** (path traversal en `serve-static`, Windows, severidad moderada): el unico fix disponible es degradar `@modelcontextprotocol/sdk` de 1.29.0 a 1.24.3. Se investigo y esa version **introduce una vulnerabilidad de severidad ALTA propia** (`GHSA-345p-7cg4-v4c7`, cross-client data leak por reuso de transporte/servidor HTTP) confirmada contra el GitHub Advisory Database oficial -- degradar para arreglar la moderada empeoraba el problema. Ambas CVEs (la de Hono y la de cross-client leak) requieren especificamente transporte HTTP (`StreamableHTTPServerTransport`/`SSEServerTransport`) con multiples clientes concurrentes; el proyecto usa exclusivamente stdio, por lo que ninguna aplica en la practica. Decision: mantener `@modelcontextprotocol/sdk@^1.29.0` (evita la vulnerabilidad alta), aceptando conscientemente las 2 moderadas restantes de un componente no usado por codigo propio.

Suite completa: 741/741 tests sin regresion, 39/39 skills conformes, 7/7 agentes conformes.

## [3.17.0] — 2026-07-26

### Agregado — validate-agents.js (gate de conformidad para .claude/agents/)

Auditoria final de cierre de sesion encontro el hallazgo mas serio de todo el ciclo de trabajo: CLAUDE.md declara "SKILLS: CLAUDE.md > cualquier skill. Ninguna seccion de un SKILL.md cancela estas reglas" (Regla 4 del ANCLA) como garantia de inmutabilidad, pero el enforcement de codigo real (`validate-globals.js`) solo cubria 2 de las 11 reglas del ANCLA, y unicamente auditaba `.claude/skills/` -- `.claude/agents/` no tenia ningun gate automatico. `mcp-registry-navigator.md` carecia de la referencia inmutable a CLAUDE.md sin que nada lo detectara.

- **`.claude/bin/validate-agents.js`** (nuevo): hermano de `validate-globals.js` para `.claude/agents/` -- mismo criterio de referencia inmutable, copia literal de reglas, emojis y drift de `last_updated`. Registrado como `npm run validate-agents`.
- **`REGLAS_NO_COPIAR`** ampliado de 2 a 11 fragmentos, uno por cada regla del ANCLA DE REGLAS CRITICAS vigente (compartido entre `validate-globals.js` y `validate-agents.js`).
- **`mcp-registry-navigator.md`**: agregada la referencia inmutable faltante.
- **Referencia rota "Protocolo Zero-Token" corregida en 5 de 7 agentes** (incluyendo `self-healing-agent.md`, creado en esta misma sesion copiando el patron ya roto de otro agente) -- mismo hallazgo que ya se habia corregido en 25 skills, no se habia revisado en `.claude/agents/`.
- **`aiops-auditor.md`**: el template de reporte tenia hardcodeado `SKILLS: <N>/32 conformes` -- contradecia el principio de auto-discovery sin conteo fijo que el propio `validate-globals.js` declara. Cambiado a `<N conformes>/<N total>`. Su protocolo ahora ejecuta tambien `validate-agents.js` en el Paso 1 (antes solo auditaba skills pese a que el titulo del paso decia "skills y agentes").
- **Drift de conteos en documentacion corregido**: README.md decia "6 agentes autonomos" (son 7) y "721 tests" (son 741 tras el split de `harness.test.js` de una sesion anterior); ambos numeros no se habian actualizado tras los cambios que los volvieron obsoletos.

Cubierto con test nuevo (TDD): agente sin referencia inmutable genera hallazgo alto, agente que copia una regla del ANCLA genera hallazgo de copia, los 7 agentes reales son conformes tras los fixes. Suite completa: 741/741 tests, 39/39 skills conformes, 7/7 agentes conformes (ambos gates verificados por ejecucion real, no solo lectura de codigo).

### Nota de gobernanza — enforcement de reglas globales sigue siendo parcial

Aun con la ampliacion de esta version, la deteccion de "contradiccion semantica" (ej. un skill que dijera literalmente "responde en ingles", contradiciendo la Regla 1) no es viable con string matching simple y no se implemento -- solo se detecta copia literal del texto de la regla y emojis pictograficos. La garantia de "ninguna seccion de un SKILL.md/AGENT.md cancela estas reglas" sigue dependiendo de disciplina editorial para contradicciones no literales. Documentado explicitamente como limitacion conocida, no oculto.

## [3.16.1] — 2026-07-26

### Agregado — circuit-breaker.js predictivo (distingue tasa de degradacion, no solo conteo)

`circuit-breaker.js` solo contaba fallos dentro de una ventana de 5 minutos sin distinguir su distribucion temporal — "3 fallos en 30s" (degradacion aguda, el MCP probablemente sigue caido) y "3 fallos distribuidos en 5 min" (degradacion intermitente) disparaban el mismo aviso. `evaluarCircuito()` ahora retorna un campo `severidad` (`critico` si los fallos se concentran en los ultimos 60s, `aviso` en otro caso) y el mensaje de stderr escala en consecuencia. Filosofia sin cambios: nunca bloquea la llamada, solo escala la severidad del aviso (decision explicita — un MCP externo puede recuperarse solo). Cubierto con test nuevo (TDD): degradacion aguda vs lenta, circuito cerrado sin severidad, mensaje de stderr escalado via spawnSync con cola de eventos aislada (variable `AI_CORE_EVENTS_QUEUE_PATH` nueva para testear sin tocar la cola real).

### Corregido — auditoria de contenido de los 39 skills (vigencia real, no solo last_updated)

Auditoria pedida explicitamente por el usuario: mas alla de la fecha de `last_updated`, revisar si el contenido tecnico de cada skill sigue siendo correcto. Hallazgos reales corregidos:

- **Referencia rota sistemica "Protocolo Zero-Token"**: 25 de 39 SKILL.md citaban una seccion de CLAUDE.md que no existe con ese nombre — el nombre real es "Protocolo de Ahorro de Tokens (Gestion de Cuota)". Corregido en los 25 archivos.
- **Numeracion de reglas obsoleta**: 16 skills citaban "Regla N" (Regla 1, 2, 3, 4, 5, 7, 8, 9, 10, 13, 15, 17, 18, 19) correspondiente a una version anterior de CLAUDE.md ya renumerada — el ANCLA DE REGLAS CRITICAS vigente solo tiene 11 reglas. Cada cita se remapeo contra el contenido real de CLAUDE.md de hoy (por nombre de regla, no numero fragil) o se elimino si el concepto ya no existe como regla numerada. Incluyo un hallazgo mas profundo: 14 de esos skills citaban ademas un umbral de delegacion a Gemini de "500 lineas o 50 KB", cuando el umbral vigente en CLAUDE.md (regla GEMINI PRIMERO) es 200 lineas para archivos y 50 lineas para logs — corregido el umbral ademas del numero de regla.
- **Ruta de sistema hardcodeada**: `memory-manager/SKILL.md` asumia una ruta Linux especifica (`/home/cyber/.claude/projects/...`) para el sistema de memoria de Claude Code. Corregido para ser agnostico al SO.
- **SDK legacy de Gemini en ejemplos de codigo**: `multimodal-engineer` y `rag-specialist` usaban `google.generativeai` (import legacy) en vez de `from google import genai` (SDK vigente). La sintaxis de reemplazo (incluyendo `client.models.embed_content(...)` y la estructura `response.embeddings[0].values`) se verifico contra el codigo fuente oficial del SDK (`github.com/googleapis/python-genai`, via `gh api`), no por analogia.
- **Falso positivo adicional descubierto**: el mismo patron de `Co-Authored-By` ya corregido en `standards-guard.js` (sesion anterior) tambien existia en `validate-globals.js:64` — un SKILL.md que documentaba la regla de no-atribucion a IA en commits disparaba el hallazgo. Eliminado el chequeo generico, igual que en `standards-guard.js`.
- **Aclarada ambiguedad de la regla de 300 lineas**: CLAUDE.md ahora especifica que el limite de modularidad aplica a codigo (`.js/.ts/.py`), no a documentacion (`SKILL.md`/`AGENT.md`) — 12 skills superaban las 300 lineas legitimamente (perfiles de dominio completos), y `standards-guard.js` ya reflejaba esta distincion en codigo sin que el texto de CLAUDE.md lo declarara.

Suite completa: 733/733 tests, 39/39 skills conformes.

## [3.16.0] — 2026-07-25

### Agregado — ciclo de auto-reparacion conectado (diagnostico + propuesta, sin auto-aplicar)

Auditoria profunda (agente `aiops-auditor`, verificado de forma independiente linea por linea) encontro que `scripts/services/ErrorRepairLoop.js` estaba diseñado con 3 fases (deteccion/diagnostico/reparacion) pero solo la fase 1 (`capturarError`, clasificacion por regex) estaba conectada en produccion (`scripts/mcp-gemini.js:154`). La fase 2/3 (`ejecutarCicloReparacion`, diagnostico via AUDITOR + propuesta via ARCHITECT) no tenia ningun caller fuera de su propio test — el modulo simulaba tener auto-reparacion real sin ejecutarla nunca.

- **`scripts/mcp-gemini.js`**: el bloque `catch` de `tools/call` ahora invoca `ejecutarCicloReparacion` (funcion nueva `intentarReparar`) tras clasificar el error. El resultado (diagnostico + propuesta de texto) se adjunta como `error.data.reparacion` en la respuesta JSON-RPC. Un fallo del ciclo de reparacion (sin `ANTHROPIC_API_KEY`, rate limit, red) nunca oculta ni retrasa el error original de la tool — se reporta como `{ fallo: true, motivo }`.
- **La fase de reparacion solo GENERA TEXTO** (comando o codigo sugerido) — en ningun punto se escribe a disco ni se ejecuta el fix propuesto automaticamente. Aplicar la propuesta requiere confirmacion humana explicita, segun la regla 6 de Gobierno de Agentes de CLAUDE.md.
- **`.claude/agents/self-healing-agent.md`** (nuevo): agente autonomo que recolecta errores repetidos de `EVENTS_QUEUE.json`, invoca el ciclo de diagnostico/propuesta, clasifica el riesgo de aplicacion (BAJO_RIESGO/ALTO_RIESGO, solo informativo) y produce un reporte consolidado — nunca aplica ningun fix por si solo. Cumple los 3 criterios de CLAUDE.md para justificar un agente nuevo (autonomia real, salida estructurada, recurrencia).
- Comentario de cabecera de `ErrorRepairLoop.js` actualizado para reflejar el estado real conectado y la garantia de que nunca auto-aplica.
- Cubierto con test nuevo (ciclo TDD real): rechazo determinista de `ejecutarCicloReparacion` sin API key (renombrando `.env` real y excluyendo la variable del entorno del proceso, sin gastar tokens — dos intentos previos de este test SI dispararon llamadas reales a la API por no considerar que `ANTHROPIC_API_KEY` puede estar seteada como variable de entorno del sistema ademas de en `.env`), y verificacion de que el error original de una tool siempre llega intacto al cliente MCP aunque el ciclo de reparacion falle. Suite completa: 728/728 tests.

### Nota de auditoria — arquitectura de rate limiting/circuit breaker es reactiva, no predictiva (no corregido en esta sesion)

La misma auditoria confirmo que `RateLimiter.js` y `circuit-breaker.js` reaccionan a fallos/consumo ya ocurridos (margen de seguridad estatico del 20%, ventana de conteo de fallos pasados) sin proyectar tendencia de degradacion antes de que ocurra. `circuit-breaker.js` tambien solo avisa por stderr, nunca bloquea la llamada ni reintenta con backoff (comportamiento documentado explicitamente en su propio comentario, no es un descuido). Verificado contra documentacion oficial de Anthropic (`code.claude.com/docs/en/hooks`, `platform.claude.com/docs/en/api/errors`) que el patron reactivo (retry con backoff en el SDK, sin circuit breaker predictivo built-in) es consistente con el estado del arte documentado oficialmente para 2026 — no es una brecha respecto al SDK, pero si es una limitacion real del arnes si se compara contra frameworks con checkpointing nativo (LangGraph). Queda como mejora futura, no ejecutada en esta sesion por estar fuera del alcance decidido.

## [3.15.2] — 2026-07-25

### Actualizado — @anthropic-ai/sdk 0.110.0 -> 0.115.0

Verificado contra el CHANGELOG.md oficial del repositorio (`github.com/anthropics/anthropic-sdk-typescript`, via `gh api`, no un resumen de terceros) que las 5 versiones minor entre 0.110.0 y 0.115.0 son unicamente aditivas (Features/Bug Fixes), sin breaking changes en Messages API, streaming, tool use ni prompt caching. Cambios relevantes: 0.111.0 evalua permisos de tool use del lado servidor (`evaluated_permission`); 0.114.0 agrega el stop reason `model_context_window_exceeded`; 0.115.0 agrega un modelo nuevo (`claude-opus-5`) y eventos `tool_change`.

Nota de vigencia: la entrada "add claude-opus-5 model" existe textualmente en el CHANGELOG oficial del SDK, pero no se pudo confirmar el detalle exacto (si es un identificador nuevo o un alias interno de un modelo ya conocido) contra `docs.anthropic.com` en esta sesion. No se referencia `claude-opus-5` en ningun skill ni en `ModelRegistry.js` — no se requiere accion adicional hasta verificarlo con fuente primaria completa.

Confirmado empiricamente: suite completa 725/725 tests sin regresiones tras el upgrade, `validate-globals.js` 39/39 conformes.

### Corregido — falsos positivos de standards-guard.js sobre archivos de gobernanza y tests

Auditoria de deuda tecnica documentada en sesiones previas encontro dos falsos positivos reales en `standards-guard.js` (hook `PostToolUse`, matcher `Write|Edit`):

- El chequeo generico de `Co-Authored-By` (`/Co-Authored-By/i.test(content)`) corria sobre cualquier archivo `TEXT_EXTS`, no solo sobre mensajes de commit — coincidia con la cadena literal dentro de la propia oracion que la PROHIBE en `CLAUDE.md:324,348` y con la mencion documental en `README.md:298`, bloqueando ediciones legitimas de esos archivos con `exit 2`. Eliminado el chequeo generico; el chequeo especifico sobre `COMMIT_EDITMSG` (seccion 6 del script) ya cubria el caso real y queda intacto.
- El regex de emoji pictografico (`EMOJI_RE`) marcaba como CRITICA el fixture de test con un emoji literal en `tests/harness/response-validator-js.test.js` (usado para verificar el propio detector `verificarEmojis()`), sin distinguir un literal de prueba de prosa/codigo real. Agregada excepcion para archivos bajo `tests/` o con sufijo `.test.js`.
- Ambos fixes cubiertos con test nuevo (ciclo TDD rojo/verde con `pre-commit-tdd.js`): documentar la regla en un `.md` de gobernanza ya no bloquea, un commit real con la marca de atribucion sigue bloqueado, un fixture de emoji en `tests/` ya no bloquea, un emoji real en codigo de produccion sigue bloqueado.

### Corregido — mensaje "ESTADO: OK" de validate-globals.js afirmaba conformidad total de forma incorrecta

`validate-globals.js` calculaba `totalConformes` (status `CONFORME`, cero hallazgos de cualquier severidad) y el texto `ESTADO: OK/FALLO` (solo mira criticos/altos) de forma independiente. Un skill con hallazgos unicamente `media`/`baja` cae en status `ADVERTENCIA` — el exit code correctamente no bloquea CI por eso, pero el texto seguia imprimiendo "todos los skills son conformes con CLAUDE.md" aunque `totalConformes < totalSkills`. Agregada rama intermedia: si no hay criticos/altos pero `conformes < total`, el mensaje ahora dice explicitamente que hay advertencias pendientes en vez de afirmar conformidad total falsa. El exit code no cambio (por diseño, solo bloquea por critico/alto).

### Cambiado — tests/harness.test.js (3480 lineas, 56 describe blocks) dividido en tests/harness/

El archivo superaba en mas de 11x el limite de 300 lineas que el propio `standards-guard.js` exige para `.js/.ts/.py`. Dividido mecanicamente en 56 archivos bajo `tests/harness/<modulo>.test.js` (uno por describe block de nivel superior, mismo mapeo 1:1 a modulo auditado que ya tenia el archivo original) mas un `tests/harness/_shared.js` con los helpers comunes (`runScript`, `tmpFile`, `REPO`, `BIN`, `SKILLS`, `SETTINGS`). Verificado que el split es fiel al original: mismo conteo de `test(` (339) y mismo resultado de suite (643 tests, 57 suites) antes y despues del split. `package.json` (script `test`) y `.github/workflows/ci.yml` actualizados para incluir `tests/harness/*.test.js`. Ningun archivo del split supera 300 lineas (maximo: 168). Suite completa del repo: 725/725 tests (721 originales + 4 nuevos de esta sesion).

### Corregido — documentacion de CLAUDE.md desincronizada con el estado real del ecosistema

Auditoria de conformidad AAA (agente `aiops-auditor`) encontro dos brechas menores no bloqueantes:
- CLAUDE.md mencionaba "38 skills" en dos lugares; el conteo real en disco es 39 (confirmado con `validate-globals.js --json`). Corregido en ambas menciones.
- El Protocolo de Vigencia Tecnologica solo declaraba cobertura sobre `.claude/skills/` para el chequeo de `last_updated > 60 dias`, dejando `.claude/agents/` sin cobertura explicita (5 agentes en 51 dias al momento de la auditoria, el dato mas antiguo del sistema). Ampliado el alcance del protocolo para incluir `.claude/agents/` explicitamente.

Veredicto final de la auditoria AAA: sin hallazgos criticos ni altos — 39/39 skills conformes, 725/725 tests, CONTEXT_MAP sincronizado, hooks criticos con manejo de errores explicito y documentacion honesta de bugs de produccion ya resueltos. Hallazgo adicional no corregido en esta sesion (fuera de alcance, requiere decision de gestion de dependencias): `@anthropic-ai/sdk` con 5 versiones minor de atraso (0.110.0 vs 0.115.0 disponible).

## [3.15.1] — 2026-07-24

### Corregido — dos fallos silenciosos detectados en auditoria de trazabilidad de errores

Auditoria dirigida a `catch` vacios, logs sin contexto y mecanismos de trazabilidad encontro dos fallos reales (no coneticos) en el harness.

- **`.claude/bin/hooks-definition.js`**: el hook `PostToolUse` para el matcher generico (`Bash|Read|Write|Edit|Agent`) registraba `agent-metrics.js record --status ok` de forma incondicional, sin un hook espejo en `PostToolUseFailure` para el mismo grupo (solo existian entradas para matchers especificos de MCP y Bash). Resultado verificado en `.claude/AGENT_METRICS.json`: `totals.fail` permanecia siempre en 0, y `npm run agent-report` mostraba 100% de fiabilidad sin importar fallos reales de tool calls. Confirmado contra fuente primaria (`code.claude.com/docs/en/hooks`) que `PostToolUse` y `PostToolUseFailure` son mutuamente excluyentes por invocacion — se agrego la entrada espejo con `--status fail` en `PostToolUseFailure` para el mismo matcher generico, sin riesgo de doble conteo.
- **`scripts/services/RootGuard.js`**: `_cargarRaizMapa()` descartaba con `catch (_) {}` cualquier candidato de `CONTEXT_MAP.json` con JSON invalido, sin loguear cual candidato ni por que. Si todos los candidatos existian pero estaban corruptos, el mensaje final era indistinguible de "archivo ausente" — se perdia la causa raiz real. Ahora el catch emite `console.warn` con la ruta del candidato y `e.message`; `_cargarRaizMapa` tambien acepta la lista de candidatos como parametro opcional para permitir test aislado con un archivo temporal corrupto real (sin libreria de mocking).
- Ambos fixes cubiertos con test nuevo en `tests/harness.test.js` siguiendo el ciclo TDD del propio `pre-commit-tdd.js` (test en rojo antes del fix, verde despues). Suite completa: 721/721 tests (antes 719).
- `README.md` y `CLAUDE.md`: conteo de tests actualizado de "628"/"719" a "721" en las menciones desactualizadas detectadas durante esta auditoria.

### Corregido — pipeline de CI (`.github/workflows/ci.yml`) fallaba en los 3 runners desde antes de esta sesion

El push de los fixes de arriba disparo la primera corrida de CI que se auditaba en detalle en varias versiones — resulto estar roto de forma preexistente (confirmado que ya fallaba en corridas del 2026-07-17 y 2026-07-22, antes de cualquier cambio de esta sesion). Encontrados y corregidos 2 problemas reales, mas una mitigacion de plataforma:

- **`CONTEXT_MAP.json` nunca se generaba en CI.** El archivo esta en `.gitignore` (no se versiona, es un artefacto local regenerable), pero el workflow nunca corria `npm run map` tras el checkout — un runner limpio jamas tenia el mapa, y varios tests (`ContextIndex.js`, `RootGuard.js`) lo asumen presente. Agregado el paso `node .claude/bin/generate-map.js` entre "Regenerar settings.json" y la suite de tests.
- **`spawnSync` sin `maxBuffer` truncaba JSON grande en el runner de macOS.** `runScript()` y `runValidate()` en `tests/harness.test.js` capturaban stdout de `audit-market.js --json` (~14KB) y `validate-globals.js --json` sin `maxBuffer` explicito — el output se cortaba en 8192 bytes en macOS antes de llegar al default de 1MB de Node, rompiendo `JSON.parse` con "Unterminated string". No reproducible en Windows/Ubuntu. `maxBuffer` subido a 10MB en ambos helpers.
- **macOS + Node 20 quedo fuera de la matriz de CI.** Tras los dos fixes de arriba, `node --test` seguia terminando con exit code espurio de forma intermitente en esa combinacion especifica — a veces con el TAP completo y 0 fallos reales, a veces cortado a mitad de la suite. Se probo `--test-force-exit` (flag oficial de Node desde v20.14.0, confirmado contra `nodejs.org/docs/latest-v20.x`) pero empeoro el sintoma: forzo el corte a mitad de camino (subtest 294/639) en vez de esperar el final del TAP. Revertido. GitHub Actions ya marca Node 20 como deprecado en sus runners (`forced to run on Node.js 24` en el log de `setup-node`), asi que se removio Node 20 de la matriz de macOS unicamente — la matriz paso de `os x node` cruzada a una lista `include` explicita: Ubuntu y Windows mantienen 20+22, macOS queda solo en 22.
- Confirmado en CI real (no solo local) tras cada uno de los 3 fixes: corrida final con los 6 jobs (5 de test + resumen) en `success`.

## [3.15.0] — 2026-07-22

### Agregado — SubagentGrader.js evalua cumplimiento de tarea, no solo calidad general

Ver detalle completo en el commit `d41e00c`. Confirmado empiricamente que `session_id`+`prompt_id` correlacionan `PreToolUse` con `SubagentStop` del mismo subagente (`tool_use_id`/`agent_id` no sirven para esto). Nuevo `.claude/bin/lib/subagent-task-store.js`; `subagent-guard.js` guarda la tarea, `subagent-grader.js` la recupera y consume, `SubagentGrader.calificar()` la usa cuando esta disponible.

### Agregado — ahorro real de cuota Claude via ModelRouter multi-proveedor

Hasta ahora `ModelRouter.js` solo enrutaba entre Gemini y modelos Anthropic; OpenAI/DeepSeek/Kimi solo existian como jueces de verificacion (`CrossVerifier.js`, `SubagentGrader.js`), nunca como opcion real para tareas delegables de trabajo. Un usuario con Claude + Gemini + ChatGPT reales pagados no tenia forma de que el arnes usara ChatGPT para ahorrar cuota de Claude en tareas simples.

- **`scripts/services/ModelRouter.js`**: `route()` acepta un tercer parametro opcional `{ disponibles }` (mismo patron que `CrossVerifier.seleccionarVerificador`/`SubagentGrader.seleccionarJuez`). Para tareas del tier Haiku (transformaciones simples, bajo volumen), si Gemini no aplica pero hay un proveedor delegable disponible (`PROVEEDORES_DELEGABLES`: `gemini`, `openai`, `deepseek`, `kimi`, en ese orden — gratis antes que pagados), se enruta ahi en vez de gastar cuota de Anthropic en Haiku. Sin el parametro (comportamiento default), `route()` es identico a antes de este cambio — degradacion con gracia total para quien solo tiene Claude.
- **`scripts/services/IntentClassifier.js`**: `clasificarConModelo()` (consumida por `detect-role.js`) ahora pasa `listProviders()` real a `route()`, activando el ahorro de cuota en produccion, no solo en tests.
- Claude sigue siendo la unica constante del arnes (nunca se enruta el chat principal, solo tareas delegadas/subagentes). DeepSeek y Kimi incluidos preparados en `PROVEEDORES_DELEGABLES` aunque el usuario actual no los tenga configurados — se activan solos si alguien agrega esas keys a su `.env`.
- Verificado en vivo con Claude+Gemini+OpenAI reales: `reparar_error` enruta a Gemini (gratis) cuando esta disponible, y a OpenAI cuando Gemini no aplica pero OpenAI si — confirmado con y sin Gemini simulado.

### Agregado — SubagentGrader.js evalua cumplimiento de tarea, no solo calidad general

Cierra la limitacion documentada en v3.14.0: "SubagentGrader.js no usa la tarea original". Verificado empiricamente (lanzando un subagente real e inspeccionando ambos eventos) que `tool_use_id` (PreToolUse) y `agent_id` (SubagentStop) son valores DISTINTOS y no correlacionan entre si -- pero `session_id`+`prompt_id` si son identicos en ambos eventos del mismo subagente.

- **`.claude/bin/lib/subagent-task-store.js`** (nuevo): persiste `tool_input.prompt` indexado por `session_id+prompt_id`, con TTL de 10 min como red de seguridad ante un `SubagentStop` que nunca llega. `recuperarTarea()` consume (borra) la entrada al leerla.
- **`.claude/bin/subagent-guard.js`**: ahora tambien guarda la tarea original en `PreToolUse` (ademas de su rol existente de anti-recursion/anti-paralelismo).
- **`.claude/bin/subagent-grader.js`**: recupera la tarea correlacionada en `SubagentStop` y la pasa al grader.
- **`scripts/services/SubagentGrader.js`**: `calificar()` acepta `tareaOriginal` opcional. Con ella, usa `RUBRICA_CON_TAREA` (agrega "Cumplimiento de tarea" a la rubrica existente) en vez de `RUBRICA_DEFECTO`. Sin ella, cae al comportamiento anterior (solo calidad general) -- compatible hacia atras.
- Verificado en vivo con un subagente real: el store queda vacio tras el ciclo completo (`PreToolUse` guarda -> `SubagentStop` consume), mas test de integracion end-to-end que ejercita ambos hooks reales por la misma clave.

## [3.14.0] — 2026-07-22

### Corregido — test flaky en tests/harness.test.js sobre EVENTS_QUEUE.json real

Auditoria de cierre de sesion detecto un test flaky real: `capture-event.js — sin AI_CORE_TEST_MODE, capture-event.js si encola` fallaba intermitentemente porque contaba `antes + 1` eventos en `EVENTS_QUEUE.json`, un archivo compartido con otro test del mismo describe block que tambien escribe sin `AI_CORE_TEST_MODE`. Ambos tests corregidos para buscar su evento por marcador unico en vez de contar el total -- confirmado estable en 5+ corridas consecutivas tras el fix.

### Verificado — subagent-guard.js: tool_input.subagent_type confirmado empiricamente

Pendiente de la sesion anterior: no se pudo re-verificar contra fuente oficial el nombre exacto del campo `tool_input.subagent_type` para el evento `PreToolUse(Agent)` (limite de uso de API alcanzado a mitad de esa investigacion). Cerrado con verificacion empirica directa: instrumentado `subagent-guard.js` temporalmente para volcar el JSON crudo de stdin, lanzado un subagente real, confirmado que `tool_input` trae `{ description, prompt, subagent_type, model, run_in_background }` -- el nombre de campo usado en el codigo era correcto. Instrumentacion retirada tras la verificacion. Hallazgo adicional (no implementado, oportunidad futura): `tool_input.prompt` contiene la tarea original completa del subagente, lo cual permitiria a `SubagentGrader.js` evaluar cumplimiento de tarea y no solo calidad general -- requeriria capturar ese dato en `PreToolUse` y correlacionarlo con el `SubagentStop` correspondiente via `tool_use_id`/`agent_id`.

### Corregido — auditoria de secretos y test flaky en agent-metrics.js

Auditoria de secretos hardcodeados (categoria no cubierta por la auditoria OWASP Agentic anterior): estado **SEGURO**, 0 hallazgos criticos. `.env` nunca aparecio en el historial de git (confirmado con `git log --all --diff-filter=A`), sin credenciales hardcodeadas en codigo fuente, sin logging de variables de entorno sensibles, sin API keys literales en `mcpServers` de `settings.json`. Unico hallazgo (severidad alta preventiva, no fuga confirmada): `.gitignore` no tenia el patron generico `.env*` (solo 4 variantes explicitas) ni patrones de credenciales comunes (`*.pem`, `*.key`, `*.p12`, `credentials.json`) -- ninguno existe hoy en el repo, pero faltaba la red de seguridad. Agregados ambos; confirmado que `.env.example` (placeholders, si debe versionarse) no queda excluido por el nuevo patron generico.

- **`tests/harness.test.js`**: test flaky real detectado (`agent-metrics.js — record: crea AGENT_METRICS.json con la entrada correcta`) -- `AGENT_METRICS.json` es un archivo compartido en disco namespaced solo por hora de sesion, no por test; el test verificaba `calls[0]` asumiendo ser el primero en escribir, lo cual fallaba si otro proceso escribia en la misma ventana horaria antes. Corregido para verificar el ultimo call en vez del primero.

### Corregido — 3 bugs reales en OpenAICompatAdapter.js (verificacion en vivo del grader)

Al ejercitar `subagent-grader.js` con una llamada real (no simulada) a OpenAI para cerrar deuda tecnica pendiente, se encontraron y corrigieron 3 bugs reales en `scripts/services/model-adapters/OpenAICompatAdapter.js`:

- **`max_tokens` rechazado por OpenAI**: la API actual de OpenAI RECHAZA la peticion por completo ("Unsupported parameter: 'max_tokens' is not supported with this model") si el body incluye `max_tokens` -- no lo ignora, falla la llamada entera. Agregado `maxTokensParam` por proveedor en `PROVIDER_CONFIGS` (`max_completion_tokens` para OpenAI, `max_tokens` para DeepSeek/Kimi -- estos ultimos dos no verificados contra fuente oficial por limite de uso de API, se asume que mantienen el formato clasico).
- **`options.system` nunca se usaba**: el adapter ignoraba silenciosamente el parametro `system` en toda llamada -- afecta a `CrossVerifier.js` y `SubagentGrader.js`, ambos lo pasan explicitamente. Corregido anteponiendo un mensaje `{role: "system", content}` al array `messages`.
- **OpenAI ignora instrucciones de texto plano pidiendo JSON**: confirmado en vivo que el modelo devuelve prosa libre pese a la instruccion explicita en el system prompt. Agregado `options.forzarJSON` + `providerConfig.soportaJSONMode` (activado solo para `openai`, confirmado que funciona con `response_format:{type:"json_object"}`) -- requiere ademas que la palabra "json" aparezca en algun mensaje, cumplido por el fix anterior de `system`.

`CrossVerifier.js` y `SubagentGrader.js` actualizados para pasar `forzarJSON: true`. 9 tests nuevos en `OpenAICompatAdapter.js` cubriendo cada caso.

### Agregado — SubagentGrader.js + subagent-grader.js (Performance Outcomes)

- **`scripts/services/SubagentGrader.js`** (nuevo): grader generico de calidad post-subagente via LLM-as-judge, patron "Performance Outcomes" del Claude Agent SDK (un juez separado evalua el trabajo del subagente contra una rubrica antes de aceptarlo, en vez de solo limitar cuantos corren en paralelo). Diferenciado de `CrossVerifier.js` (solo diffs de codigo de `code-reviewer`) y `subagent-review.js` (patrones via regex): este evalua CUALQUIER subagente por calidad general (completitud, coherencia, riesgos no mencionados). Alcance deliberadamente acotado: no requiere la tarea original con la que se lanzo el subagente (no confirmado si `SubagentStop` la expone, limite de investigacion de esta sesion) -- solo califica el output por si mismo.
- **`.claude/bin/subagent-grader.js`** (nuevo, hook `SubagentStop`): invoca `SubagentGrader.calificar()` con el `last_assistant_message` real (via `lib/hook-stdin.js`), informa el score al padre por stdout. Igual que `injection-guard.js`, no puede vetar el output (limitacion real de `SubagentStop`, no eleccion de diseño) -- informa para que el operador decida. Se omite sin bloquear si no hay proveedor disponible.

### Agregado — circuit-breaker.js (ASI08 — OWASP Agentic Top 10 2026)

- **`.claude/bin/circuit-breaker.js`** (nuevo, `PreToolUse` matcher `mcp__.*`): cuenta fallos `mcp_failure` consecutivos y no reportados de una herramienta MCP dentro de una ventana de 5 minutos (via `EVENTS_QUEUE.json`, ya poblado por `capture-event.js` en `PostToolUseFailure`). Si supera el umbral (3), avisa (no bloquea de forma dura -- un MCP externo puede recuperarse) sugiriendo escalar al tier de costo inmediato superior en vez de reintentar la misma llamada condenada a fallar. Cierra el gap ASI08 (Cascading Agent Failures): antes, `PostToolUseFailure` solo registraba el evento sin ningun mecanismo que evitara reintentar la misma herramienta caida turno tras turno.

Con esto quedan cerrados los 4 gaps de severidad alta/media detectados en la auditoria OWASP Top 10 for Agentic Applications 2026 de esta sesion: ASI05 (`code-exec-guard.js`), ASI03/ASI07 (`subagent-guard.js` corregido dentro del fix sistemico), ASI04 (`mcp-integrity-check.js`), ASI08 (`circuit-breaker.js`).

### Agregado — mcp-integrity-check.js (ASI04 — OWASP Agentic Top 10 2026)

- **`.claude/bin/mcp-integrity-check.js`** (nuevo): verificacion de hash SHA-256 de los 2 servidores MCP propios del arnes (`gemini-bridge`, `anthropic-router`) contra un baseline persistido en `.claude/MCP_INTEGRITY_BASELINE.json`. Alcance deliberadamente acotado tras revisar el gap generico de la auditoria OWASP: ambos servidores son propios (no de terceros), ya auditables leyendo el codigo directamente -- el riesgo real de supply-chain de MCPs de terceros ya lo cubre `mcp-registry-navigator` antes de instalar cualquier servidor externo. Solo informa, nunca bloquea. Integrado a `health-check.js` (solo en modo standalone).

### Corregido — token-metrics.js nunca encontraba sesiones reales, y estimaba en vez de medir

- **`tests/token-metrics.js`**: la ruta de sesiones (`~/.config/.claude/sessions` / `%APPDATA%/.claude/sessions`) nunca existio en esta maquina -- la ruta real confirmada es `~/.claude/projects/<proyecto-normalizado>/*.jsonl`. El script llevaba desde su implementacion reportando "sin datos" sin importar cuanto se usara el arnes. Ademas, reescrito para leer tokens REALES de `message.usage` (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens -- campos que Anthropic ya calcula) en vez de estimar 800 tokens/turno. Primera medicion real tras el fix: 98% de ahorro por prompt caching en las ultimas 3 sesiones (13.9M tokens reales facturados vs 637.7M leidos de cache).

### Agregado — code-exec-guard.js (ASI05 — OWASP Agentic Top 10 2026)

- **`.claude/bin/code-exec-guard.js`** (nuevo, `PreToolUse` matcher `Write|Edit`, sin `|| true`): bloquea (exit 2) ANTES de escribir si el contenido a escribir contiene `eval()`, `new Function()`, `exec`/`subprocess` con shell habilitado, o `pickle.load` -- en vez de solo reportarlo despues de escrito como hace `security-check.js` (`PostToolUse`, deteccion post-hoc sin bloqueo). Cierra el gap ASI05 (Unexpected Code Execution) de la auditoria OWASP Agentic previa. Exime archivos `.test.js`/`.spec.js` para no bloquear fixtures de prueba que contienen el patron como dato.
- **`.claude/bin/lib/risky-code-patterns.js`** (nuevo): subconjunto de patrones de ejecucion arbitraria compartido conceptualmente con `security-check.js` (no fusionado en codigo para no alterar su comportamiento existente).
- **`.claude/bin/lib/aiops-scorers.js`**: `code-exec-guard.js` agregado a la lista `EXCLUIR` de `scoreSeguridad()` -- el propio comentario del script que documenta que detecta `eval()` disparaba un falso positivo del scorer de seguridad, mismo criterio ya aplicado a `security-check.js`/`subagent-review.js`.

### Corregido — security-check.js y dependency-tracer.js con el mismo bug sistemico de variables inventadas

Al revisar el gap ASI05 se detecto que `security-check.js` y `dependency-tracer.js` (ambos `PreToolUse`/`PostToolUse` matcher `Write|Edit`) tambien dependian de `"$CLAUDE_TOOL_INPUT_file_path"` como argumento en `hooks-definition.js` -- la misma variable inexistente confirmada en el fix sistemico anterior. `security-check.js` nunca evaluaba un archivo real en produccion (`argv[2]` siempre vacio); `dependency-tracer.js` nunca detectaba dependientes reales. Ambos corregidos con el mismo patron: `tool_input.file_path` via `lib/hook-stdin.js`, con test de regresion cada uno.

### Corregido — bug sistemico: 14 hooks leian variables de entorno que Claude Code nunca establece

Al intentar escribir un guard nuevo de sandboxing (ASI05), se detecto que `bash-verbosity-guard.js` (ya "arreglado" hoy junto con `agent-metrics.js`) seguia leyendo `CLAUDE_TOOL_INPUT_command`, una variable que la doc oficial (code.claude.com/docs/en/hooks) confirma que nunca existio -- corroborado ademas por el issue publico `anthropics/claude-code#9567`. Esto disparo una auditoria completa de TODOS los hooks del arnes: 14 scripts dependian del mismo patron roto (variables `CLAUDE_TOOL_INPUT_*`, `CLAUDE_USER_PROMPT`, `CLAUDE_SUBAGENT_*` inventadas), varios de ellos guards de seguridad activos que llevaban toda su vida operando sobre strings vacios sin que ningun test lo detectara (los tests inyectaban la variable a mano, algo que Claude Code nunca hace).

Contrato real confirmado por evento:
- `UserPromptSubmit`: JSON por stdin, campo `prompt_text` (no `prompt`, no env var).
- `PreToolUse`/`PostToolUse`: JSON por stdin, `{tool_name, tool_input: {...}, tool_response}`.
- `SubagentStop`: JSON por stdin, campos `agent_type` y `last_assistant_message` (no `agent_output`/`result`; `transcript_path` no debe leerse por ser asincrono).

**Nuevo:** `.claude/bin/lib/hook-stdin.js` -- lectura y parseo de stdin compartida por los 14 scripts, sin bloquear si stdin es TTY o esta vacio.

**Corregidos** (todos mantienen la variable de entorno legacy como fallback compatible, agregan lectura de stdin como fuente real, y suman test de regresion que ejercita el path de stdin):
- `secrets-guard.js` (`UserPromptSubmit`) -- el bloqueo de credenciales de alta confianza agregado hoy mismo nunca se activaba en produccion real.
- `detect-role.js` (`UserPromptSubmit`) -- la clasificacion de rol siempre caia al fallback "Architect, confianza 0.3" visible en cada turno de esta sesion.
- `moa-context-gatherer.js` (`UserPromptSubmit`) -- el fan-out MoA nunca se disparaba con el prompt real.
- `injection-guard.js`, `subagent-review.js`, `cross-verify-gate.js` (`SubagentStop`) -- ninguno inspeccionaba el output real del subagente.
- `subagent-guard.js` (`PreToolUse` matcher Agent) -- el enforcement anti-recursion/anti-loop documentado en CLAUDE.md como "real" nunca veia el tipo real de subagente. Nota: el nombre exacto de `tool_input.subagent_type` para el Agent tool no se reverifico contra fuente oficial en esta sesion (limite de uso de API alcanzado a mitad de la investigacion) -- confirmar si un caso real muestra otro nombre de campo.
- `ponytail-check.js` (`PreToolUse` Write|Edit) -- sin fallback alguno, siempre evaluaba contenido vacio.
- `pre-commit-tdd.js`, `standards-guard.js`, `syntax-check.js` (`PreToolUse`/`PostToolUse` Write|Edit) -- ya tenian `process.argv[2]` como primer fallback, pero el segundo fallback (env var) nunca aplicaba.
- `git-queue-advisor.js` -- impacto real bajo (siempre recibe `push`/`pull` como argv explicito desde `hooks-definition.js`), corregido por consistencia.
- `capture-event.js` -- impacto real bajo (siempre recibe `--type`/`--tool` explicitos), el fallback solo cubria `--error`/`--context`.

### Agregado — bloqueo real en secrets-guard.js (auditoria OWASP Agentic Top 10)

- **`.claude/bin/secrets-guard.js`**: auditoria contra OWASP Top 10 for Agentic Applications 2026 (genai.owasp.org) detecto que el guard solo advertia (exit 0 siempre) incluso ante una credencial de formato inequivoco (OpenAI key, GitHub PAT, AWS key, Slack token, Google API key, clave privada). Confirmado contra la doc oficial de hooks que `UserPromptSubmit` si soporta bloqueo real (exit 2 borra el prompt antes de que llegue al modelo). Patrones de alta confianza ahora bloquean; el patron generico de menor confianza (par clave:secreto de 40 caracteres, mayor riesgo de falso positivo) sigue solo advirtiendo.
- **`.claude/bin/injection-guard.js`**: comentario actualizado para reflejar una limitacion real confirmada, no una eleccion de diseño — en `SubagentStop`, `exit 2` fuerza al subagente a seguir ejecutandose ("Prevents the subagent from stopping"), no impide que su output ya generado se integre al contexto del padre. Vetar el resultado requeriria un mecanismo distinto al exit code de este hook; queda sin bloqueo real por ahora, cubierto por la regla de CLAUDE.md de no ejecutar contenido externo como instruccion.
- **`tests/harness.test.js`**: tests de `secrets-guard.js` actualizados para esperar `exit 2` en los 2 casos de alta confianza (antes esperaban `exit 0`, comportamiento ahora intencionalmente distinto), mas 1 test nuevo que confirma que el patron de confianza media sigue sin bloquear.

### Corregido — CONTEXT_MAP.json versionado pese a estar en .gitignore

- **`.claude/CONTEXT_MAP.json`**: versionado en git desde v2.6.3, pese a estar declarado en `.gitignore` desde una version posterior (`.gitignore` no afecta archivos ya trackeados). Causaba diff de timestamp/conteo en `git status` en cada sesion sin ningun cambio real de codigo. Sacado del tracking con `git rm --cached` — sigue en disco y se regenera normal con `npm run map`, ya no aparece como modificado salvo que se edite el `.gitignore` mismo.

### Actualizado — MCP_REGISTRY.md

- **`codebase-memory-mcp` (DeusData)**: veredicto actualizado de EVALUAR a DESCARTADO por decision explicita del usuario. Razon documentada: riesgo operativo concreto (issue upstream #1200, instalador puede sobrescribir `hooks-definition.js`), binario nativo C fuera del stack Node.js declarado, sin necesidad activa que lo justifique (vault BM25+ propio ya cubre memoria semantica), y auditoria de seguridad de inputs incompleta (`store/`/`discover/` sin revisar).

### Corregido — agent-metrics.js nunca poblaba AGENT_METRICS.json

- **`.claude/bin/agent-metrics.js`**: el hook `PostToolUse` invocaba `record --tool "$CLAUDE_TOOL_NAME"`, una variable de entorno que Claude Code nunca inyecta a procesos de hook tipo `command` — el nombre real de la herramienta llega exclusivamente por JSON en stdin (campo `tool_name`, confirmado contra `code.claude.com/docs/en/hooks`). El comando se expandia a `--tool ""` en cada ejecucion y el `2>/dev/null || true` del hook enmascaraba cualquier fallo, dejando `AGENT_METRICS.json` sin crearse nunca — `agent-report`/`agent-report-full` reportaban "sin datos de sesiones" desde que se implemento la metrica. Corregido: `record` ahora lee `tool_name` de stdin cuando no recibe `--tool` explicito, sin bloquear si stdin es una TTY sin datos.
- **`.claude/bin/hooks-definition.js`**: comando del hook de `agent-metrics.js` en `PostToolUse` limpiado de la variable de entorno inexistente.
- **`tests/harness.test.js`**: 2 tests nuevos de regresion — lectura de `tool_name` desde stdin JSON, y fallback a `"unknown"` sin bloquear cuando no hay stdin ni `--tool`.

### Agregado

- **`.claude/skills/performance-engineer/SKILL.md`** (nuevo): cubre cache de aplicacion (in-memory vs Redis segun escenario), CDN para assets estaticos, y pruebas de carga (autocannon para el stack Node.js nativo del proyecto). Brecha confirmada por auditoria: ni `database-ops` (pooling/indices/BD) ni `devops-infra` (observabilidad/IaC) ni `qa-engineer` (piramide de testing) cubrian estas tres responsabilidades. No requiere AGENT.md — es un skill conversacional de dominio, no cumple los tres criterios de autonomia/salida estructurada/recurrencia.
- **`.claude/MCP_REGISTRY.md`** (nuevo): registro de evaluaciones de MCPs de terceros antes de instalacion, segun el protocolo de gobierno de MCPs. Primera entrada: `DeusData/codebase-memory-mcp` evaluado con veredicto EVALUAR (no instalar en esta pasada — binario nativo C fuera del stack Node.js declarado, instalador con riesgo de sobrescritura de hooks existentes segun issue upstream #1200, auditoria de seguridad de inputs parcial).

### Corregido — regla SOLID de 300 lineas (3 archivos en violacion)

- **`scripts/services/ModelRegistry.js`** (315 → 156 lineas): adapters de Anthropic, Gemini y OpenAI-compatible (OpenAI/DeepSeek/Kimi) extraidos a `scripts/services/model-adapters/`. El archivo raiz queda como orquestador de routing puro.
- **`.claude/bin/aiops-score.js`** (343 → 131 lineas): las 6 funciones de scoring por dimension (routing, hooks, skills, drift, seguridad, agentes) extraidas a `.claude/bin/lib/aiops-scorers.js`. El archivo raiz queda como CLI de persistencia y reporte.
- **`.claude/bin/memory-index.js`** (357 → 193 lineas): motor BM25 (tokenizacion, stemming, sinonimos, fragmentacion, indice invertido, scoring) extraido a `.claude/bin/lib/bm25-engine.js`. El archivo raiz queda como CLI de comandos `index`/`query`/`status`.
- **`tests/harness.test.js`**: conteo de skills actualizado de 38 a 39 en los dos tests que verifican el estado real del repo (`checkSkills`, `--json` de `validate-globals`).
- **`README.md`**: referencias a "38 skills" / "628 tests" actualizadas a 39 skills / 636 tests en las 6 menciones del documento.

## [3.13.0] — 2026-07-17

### Corregido — 10 bugs reales de regresion silenciosa

- **`scripts/services/ContextIndex.js`**: `listarArchivos()` y `diagnostico()` leian el esquema legacy `map.map.{root_files,directories,total_files}`, que ya no existe (el esquema real de `CONTEXT_MAP.json` es `map.host.*`). El modulo completo quedaba inerte desde el cambio de esquema — `resolver()` nunca encontraba nada, `total_archivos` siempre reportaba 0. Su proposito documentado (evitar lecturas ciegas a disco) nunca funciono en la practica hasta este fix.
- **`.claude/bin/git-queue-advisor.js`**: clasificaba severidad de eventos por `e.sev`, campo que no existe en el esquema real de `capture-event.js` (usa `type`). Todo evento pendiente caia a severidad "INFO" sin distincion real entre critico y trivial. Corregido para derivar prioridad desde `type`, igual criterio que `ISSUE_META` en `issue-reporter.js`.
- **`.claude/bin/health-worker.js`**: filtraba el string hardcodeado `'gemini-2.5-flash'` para excluir el modelo Gemini de la comparacion contra el catalogo de Anthropic — el nombre real ya es `gemini-3.5-flash` desde v3.11.0, el filtro nunca hacia match desde entonces.
- **`.claude/bin/health-sync.js` (`checkSkills`)**: dependia de una tabla de skills en CLAUDE.md eliminada en esta misma sesion (routing via frontmatter `description`, ver mas abajo) — reportaba 36/38 skills como "huerfanos" falsamente en cada `HEALTH_REPORT.md`. Reescrito para verificar conformidad estructural real (`name` coincide con la carpeta, `description` no vacia), mismo criterio que `validate-globals.js`.
- **Bug de regex compartido** en `health-sync.js` y `validate-globals.js`: `\s*` (en vez de `[ \t]*`) al extraer `name`/`description` del frontmatter cruzaba el salto de linea cuando el valor estaba vacio, capturando el contenido de la linea siguiente del YAML como si fuera el valor del campo.
- **`.claude/bin/issue-reporter.js`**: labels de GitHub inexistentes (`bug,hooks`, `bug,mcp`, `enhancement,skill`) hacian fallar `gh issue create` de forma completa y silenciosa, dejando eventos sin marcar `reported: true` indefinidamente. Reducidas a las labels reales del repo (`bug`, `enhancement`). Test que valida las labels contra el repo real para prevenir regresion.
- **`.claude/bin/norm-harness.js` / `setup-settings.js`**: mantenian una copia paralela y desincronizada de la definicion de hooks. `norm-harness.js` (usado cuando ai-core se instala como submodulo) carecia de `subagent-guard.js`, `bash-verbosity-guard.js`, `memory-vault-prune-check.js`, y de `cross-verify-gate.js`/`injection-guard.js` en `SubagentStop`. Unificado en `.claude/bin/hooks-definition.js` (nuevo) como fuente unica de verdad, consumida por ambos callers via su propia funcion `bin()`.
- **`scripts/services/ModelRegistry.js`**: 3 defaults de modelo deprecados actualizados con evidencia verificada por busqueda web — `gpt-4o-mini` (GPT-4o retirado 2026-02) → `gpt-5.6-luna`; `deepseek-chat` (deprecacion confirmada 2026-07-24) → `deepseek-v4-flash`; `moonshot-v1-8k` (sunset 2026-08-31) → `kimi-k3`. Test que impide reintroducir los identificadores deprecados.
- **`tests/model-dispatcher.test.js`**: test de concurrencia media `duracion < 40ms` — flaky bajo carga de CPU (falla intermitentemente cuando la suite completa corre con muchos `spawnSync` reales, aunque la ejecucion si sea concurrente). Reemplazado por verificacion de orden de eventos (ambos workers inician antes de que cualquiera termine).
- **Contaminacion de `EVENTS_QUEUE.json` por los propios tests**: los tests que ejercitan guards reales (`standards-guard.js`, etc.) invocaban `capture-event.js` de verdad, encolando eventos de archivos temporales de prueba junto a fallos genuinos del arnes. `runScript()` en `tests/harness.test.js` inyecta `AI_CORE_TEST_MODE=1`, que `capture-event.js` respeta para salir temprano sin escribir.

### Agregado — Enforcement real y ahorro de tokens

- **`.claude/bin/subagent-guard.js`** (nuevo, hook `PreToolUse` matcher `Agent`): bloquea con exit 2 la recursion del mismo tipo de subagente y el spawn mas alla de 3 subagentes en una ventana de 2 minutos. Antes "maximo 3 subagentes paralelos" y "prohibido spawn recursivo" eran solo prosa en CLAUDE.md sin verificacion.
- **`.claude/bin/bash-verbosity-guard.js`** (nuevo, hook `PreToolUse` matcher `Bash`): bloquea comandos de alto riesgo de output masivo sin acotar (`git log`/`git diff`/`cat`/`find` sin limite) antes de ejecutarlos — los hooks de Claude Code no exponen el output real de una tool call via variable de entorno, solo el input, asi que la unica intervencion posible es preventiva.
- **`.claude/bin/memory-vault-prune-check.js`** (nuevo, hook `Stop`): avisa cuando `.raw/` del vault de memoria supera 50 archivos, sin mover ni eliminar nada — la poda sigue siendo responsabilidad manual del operador, ya documentada en `memory-manager`.
- **`package.json`**: `postinstall` corre `setup-settings.js` automaticamente tras cada `npm install`, evitando hooks rotos por rutas placeholder sin regenerar manualmente en una maquina nueva.
- **`aiops-score.js`**: gate de verbosidad — solo imprime el reporte completo de las 6 dimensiones si el score baja o hay hallazgos nuevos; en turnos estables emite una sola linea compacta.
- **CLAUDE.md — tabla de seleccion de skills eliminada**: los 38 `SKILL.md` ya cumplen el estandar abierto [agentskills.io](https://agentskills.io/specification) (`name`/`description` en frontmatter con lenguaje de activacion), que Claude Code carga nativamente via skill-discovery — la tabla de 32 filas era duplicacion pura. `validate-globals.js` ahora verifica conformidad con el schema formal (name coincide con la carpeta, formato, limites de longitud).
- **`validate-map.js`**: `DRIFT_THRESHOLD` de 3 a 1 — un drift de 2 archivos no disparaba regeneracion automatica del mapa, causando desincronizacion silenciosa entre `CONTEXT_MAP.json` y el arbol real.
- **Hook post-commit para el mapa**: nuevo matcher `PostToolUse(Bash(git commit*)|Bash(git push*))` que dispara `diff-map-trigger.js` — ningun hook cubria ese momento antes.
- **`standards-guard.js`**: `COMMIT_EDITMSG` ya no se trata como prosa conversacional sujeta al limite de 150 palabras (solo `TO_GEMINI.md` lo es) — un mensaje de commit es documentacion tecnica del cambio, no una respuesta al usuario.

### Cobertura de tests

141 tests nuevos (487 → 628) cubriendo los 19 archivos de `.claude/bin/` y `scripts/services/` que no tenian ninguno: `generate-map.js`, `validate-map.js`, `diff-map-trigger.js`, `health-check.js`, `health-sync.js`, `detect-stack.js`, `detox.js`, `syntax-check.js`, `health-report.js`, `health-worker.js`, `git-queue-advisor.js`, `audit-market.js`, `norm-harness.js`, `hooks-definition.js`, `ContextIndex.js`, `RateLimiter.js`, `ResponseValidator.js`, `RootGuard.js`, `StyleProfiler.js`, `ErrorRepairLoop.js`.

### Aprendido

- Un modulo que "nunca lanza excepcion" (retorna `null`/`[]`/`0` en el camino de error) puede quedar completamente inerte tras un cambio de esquema en sus datos de entrada sin que nada lo detecte — `ContextIndex.js` llevaba sesiones enteras sin resolver ninguna ruta real. La ausencia de error no es evidencia de funcionamiento correcto.
- Escribir el primer test de un modulo existente es, en la practica, una auditoria — 4 de los 10 bugs de esta version se descubrieron exclusivamente al construir el caso de prueba, no en una revision de codigo previa.
- Un test que mide tiempo de reloj real (`duracion < Nms`) para inferir concurrencia es inherentemente fragil bajo carga variable de CPU; verificar orden de eventos (que ambos workers iniciaron antes de que cualquiera terminara) prueba lo mismo sin depender del scheduler del sistema operativo.

### Deuda tecnica remanente

- 17 de 38 skills sin dominio registrado en `MARKET_STANDARDS.json` (no bloqueante, solo limita la auditoria automatica de vigencia de mercado para esos skills).
- Timeouts sin comentario explicativo en `health-sync.js`, `standards-guard.js`, `health-worker.js` (bajo impacto, cosmetico).
- Cascada de calidad de output entre proveedores (`ModelDispatcher.js`) deliberadamente no implementada: no existe caller productivo real que la necesite hoy; se extrajo `ModelRegistry.parsearJSONFailClosed()` como helper compartido para cuando exista.

**628/628 tests, 38 skills.**

## [3.12.0] — 2026-07-10

### Agregado — Arquitectura Multi-Agente (MoA) y aislamiento de memoria por rol

- **`scripts/services/ModelDispatcher.js`**: router Mixture-of-Agents entre proveedores (distinto de `ModelRouter.js`, que enruta dentro de la familia Claude). Patron Command/Port (`SubTaskCommand` abstracta, no instanciable directamente) + Factory (`crearSubTarea`) + Strategy (`PROVIDER_POR_SUBTASK`): `ContextGathering` → Gemini, `SyntaxDrafting` → DeepSeek, `SurgicalEdit` → Claude. `executeMoATask(userPrompt)` ejecuta fan-out concurrente con `Promise.allSettled` — un worker caido (timeout, rate limit, key ausente) no aborta al otro; el resultado combina ambas secciones con marcador de contexto vacio si alguna falla. El orquestador nunca rechaza.
- **`.claude/bin/moa-context-gatherer.js`**: conecta `executeMoATask` al hook `UserPromptSubmit`, categoria propia `moa` en `process-guard.js` (no comparte lock con `detect-role.js`, que corre en el mismo array de hooks). Guard de disponibilidad: si falta `GEMINI_API_KEY` o `DEEPSEEK_API_KEY`, no invoca red y limpia cualquier `.claude/moa_context.md` obsoleto de un turno anterior. `ambasKeysDisponibles()` exportada como unidad testeable en memoria — necesario porque `loadEnv()` (patron compartido por todo el arnes) rellena cualquier env var falsy desde `.env`, lo que hacia que pasar una key vacia por entorno no la deshabilitara realmente.
- **Namespacing del `memory-vault`**: `.raw/<rol>/` y `.wiki/<rol>/` por convencion de carpeta (entradas sueltas en la raiz = namespace `general`, retrocompatible con el vault previo sin namespacing). `index.json` sigue siendo un unico indice BM25 global, pero cada fragmento lleva su `rol` de origen. `memory-index.js query` acepta `--rol=<rol>` para filtrar busqueda o se omite para busqueda cross-rol explicita.
- **Rol declarativo en frontmatter de skills**: las 37 `SKILL.md` ahora declaran `rol: architect|coder|auditor`. `AgentRoles.descubrirSkillsPorRol()` lee el campo directamente — sin inferencia por regex sobre `description`, que producia un sesgo fuerte (28/36 skills caian en `architect` por keywords genericas como "sistema"). `IntentClassifier.js` sigue siendo el unico lugar que infiere, y solo sobre el prompt dinamico del usuario, no sobre el inventario estatico de skills.
- **`validate-globals.js`**: `rol:` agregado a los campos de frontmatter obligatorios — un skill sin ese campo o con valor invalido se marca `NO_CONFORME`.

### Agregado — Guardrails deterministas y ciclo TDD obligatorio

- **`standards-guard.js`**: regla de emoji elevada de severidad `alta` a `critica` (bloqueante). Nueva regla de limite de 150 palabras de prosa, restringida a artefactos conversacionales (`COMMIT_EDITMSG`, `TO_GEMINI.md`) — no aplica a documentacion tecnica extensa (`SKILL.md`, README) que legitimamente supera ese largo. El hook ahora sale con exit 2 ante violacion critica (antes siempre `exit(0)`, solo avisaba y encolaba).
- **`process-guard.js`**: propaga el `result.status` real del comando envuelto en vez de absorberlo — sin esto, `standards-guard.js` nunca podia bloquear una escritura aunque saliera con exit 2.
- **`.claude/bin/pre-commit-tdd.js`**: gate TDD por heuristica de presencia (no Red-Green real, que requeriria ejecutar la suite completa por cada Write/Edit). Bloquea con exit 2 si se edita codigo fuente fuera de `tests/` y ningun `*.test.js` tiene cambios sin commitear en el repo (via `git status --porcelain`). Aplica sin excepcion, incluido el propio harness.
- **ACI diff edits**: `SYSTEM_PROMPTS[ROLES.CODER]` en `AgentRoles.js` ahora exige formato SEARCH/REPLACE (estilo Aider) para editar codigo existente, con excepcion explicita para archivos nuevos.
- **`.claude/bin/dependency-tracer.js`**: grafo de dependencias inverso sobre `require()` relativo en `scripts/` y `.claude/bin/` (regex sobre string literal, sin AST completo). Registrado en `PreToolUse(Write|Edit)`, no bloqueante — informa que otros scripts dependen (directa o transitivamente) del archivo que se esta por tocar.

### Corregido — Deuda estructural (God Objects, DRY)

- **`.claude/skills/aaa-evaluator/SKILL.md`** (nuevo, `rol: auditor`): estandares AAA estilo SWE-bench — limite de 300 lineas por archivo, 20 lineas por funcion, uso justificado (no especulativo) de Factory/Strategy/Observer, prohibicion de God Objects.
- **`scripts/services/TokenManager.js`** (nuevo): extraidas `estimarTokensMensajes`, `truncarInputGemini`, `truncarOutputGemini` de `anthropic-bridge.js` (336 → 280 lineas). `anthropic-bridge.js` re-exporta los mismos nombres para no romper a `dry-run-cost-sim.js`.
- **Fragmentacion de `mcp-gemini.js`** (527 → 183 lineas): `scripts/services/GeminiApiClient.js` (146 lineas — cliente SDK puro: auth, reintentos, parseo JSON, compactado) y `scripts/services/McpServerHandlers.js` (250 lineas — las 5 herramientas MCP + system prompts). `mcp-gemini.js` queda solo como shell del protocolo JSON-RPC/stdio. Elimina ademas la implementacion duplicada de `truncarInputGemini`/`truncarOutputGemini` que vivia localmente en este archivo (constantes numericamente identicas a `TokenManager.js`, solo el mensaje de truncado diferia).
- **Zero-Dead-Code en `settings.json` al actualizar**: `setup-settings.js`/`norm-harness.js` construyen el objeto de hooks desde cero y sobreescriben el archivo completo (nunca mergean) — cualquier hook de una version anterior que referencie un script eliminado o renombrado desaparece automaticamente al regenerar. Verificado con un test de regresion explicito que inyecta un hook obsoleto y confirma su purga tras `npm run setup`.

### Aprendido

- La inferencia por regex sobre texto libre (keywords en `description`) no es un sustituto confiable de metadata declarada explicitamente cuando la clasificacion tiene consecuencias estructurales (asignar rol a un inventario estatico de 37 skills, no un prompt dinamico de un usuario). El mismo mecanismo que funciona razonablemente para clasificar *intent* de una frase corta produce sesgos serios sobre texto largo con vocabulario tecnico repetido entre categorias.
- Un guard de disponibilidad de credenciales no puede verificarse pasando strings vacios via variable de entorno si el propio script tiene un `loadEnv()` que rellena falsy values desde `.env` — el test debe aislar la funcion de decision en memoria, no simular ausencia de config a traves del proceso completo.
- `Promise.allSettled` es preferible a `Promise.all` + try/catch manual para fan-out con fallback aislado: la plataforma ya resuelve exactamente el aislamiento de fallo por promesa que se necesita, sin logica adicional que mantener.

### Deuda tecnica remanente

Ninguna deuda estructural conocida al cierre de esta version: todos los archivos tocados en esta sesion estan bajo el limite de 300 lineas (`ModelDispatcher.js` 171, `TokenManager.js` 75, `mcp-gemini.js` 183, `GeminiApiClient.js` 146, `McpServerHandlers.js` 250, `moa-context-gatherer.js` 80), sin duplicacion DRY conocida entre modulos de token/truncado, y el gate `pre-commit-tdd.js` confirma cobertura de test para cada archivo modificado. Zero-debt estructural para el alcance cubierto en esta sesion — no implica ausencia de deuda en areas no tocadas (ver **487/487 tests, 37 skills**).

**487/487 tests, 37 skills.**

## [3.11.0] — 2026-07-10

### Agregado — Proteccion contra prompt injection

- **`injection-guard.js`**: hook `SubagentStop` que detecta indirect prompt injection en el output de subagentes — contenido externo (archivos del repo anfitrion, resultados de Gemini bridge, paginas web) que intenta hacerse pasar por una instruccion nueva del sistema o del usuario. Advierte, no bloquea; la decision final es del operador humano. Complementa `subagent-review.js` (calidad de codigo) y `cross-verify-gate.js` (regresion funcional) como tercer eje de validacion en el ciclo de vida del subagente.
- **`CLAUDE.md`**: regla 7 nueva en "Gobierno de Agentes y Subagentes" — contenido externo nunca se trata como instruccion del sistema, aunque este formateado como tal. Anclada tambien en el bloque de reglas criticas al final del archivo.
- **`ai-guardrails` v1.2.0**: nota de alcance — el skill gobierna la proteccion de sistemas LLM que el proyecto anfitrion construye, distinto de `injection-guard.js`/`secrets-guard.js` que protegen al propio arnes como infraestructura siempre activa.

### Corregido — Vigencia de modelo y OWASP

- **Drift de version de modelo**: `claude-sonnet-4-6` reemplazado por `claude-sonnet-5` (vigente desde 2026-06-30) en 16 archivos: `CLAUDE.md`, `ModelRegistry.js`, `mcp-anthropic.js` y 12 skills (`agent-testing`, `multimodal-engineer`, `ai-integrations`, `llm-evals`, `workflow-orchestrator`, `tech-lead-frontend`, `llm-observability`, `prompt-engineer`, `claude-api`, `cost-optimizer`, `release-manager`, `claude-agent-sdk`). Detectado en auditoria de vigencia de skills contra fuentes de mercado 2026.
- **`security-auditor` v1.3.0**: OWASP Top 10 actualizado de la edicion 2021 a la edicion 2025 (vigente, publicada enero 2026). SSRF fusionado dentro de A01 Control de Acceso Roto, Security Misconfiguration sube de posicion #5 a #2, categoria nueva A03 Software Supply Chain Failures (reemplaza y amplia el antiguo A06 de componentes vulnerables), categoria nueva A10 Mishandling of Exceptional Conditions (referenciada a `silent-failure-hunter`).
- **README.md**: reescrito completo — eliminada una tabla de auto-routing de skills duplicada y desincronizada contra `CLAUDE.md` (que ya tenia la version correcta), corregido error que fusionaba los tiers `TIER_OPUS` y `TIER_FABLE` de `ModelRouter.js` como si fueran el mismo, conteos de skills sincronizados (existian referencias a 36/32/29 dentro del mismo archivo).

### Corregido — Migracion a la familia Gemini 3.x

Verificado contra fuente oficial primaria (`deepmind.google`, `ai.google.dev`, `blog.google`, `blog.modelcontextprotocol.io`) antes de escribir cualquier cambio, siguiendo el protocolo de contenido externo no confiable de "Gobierno de Agentes y Subagentes".

- **`rag-specialist` v2.5.0**, **`cost-optimizer` v1.2.0**, **`mobile-engineer` v1.3.0**, **`workflow-orchestrator` v2.2.0**, **`multimodal-engineer` v1.1.0**: default de modelo migrado de la familia 2.5 a 3.x. Jerarquia de costo corregida: el tier "Lite" mas barato es `gemini-3.1-flash-lite` (no `gemini-3.5-flash-lite`, que no existe) — `gemini-3.5-flash` es ~5x mas caro que 3.1 Flash-Lite en paid y no es un reemplazo 1:1 de bajo costo, aunque mantiene free tier en la API.
- **`audio-voice-engineer` v1.3.0**: Live API migrada a `gemini-3.1-flash-live-preview` (sucesor de `gemini-2.5-flash-live-preview`, apagado 2025-12-09). Regresion de feature documentada: Affective Dialog no esta soportado en el modelo vigente segun documentacion oficial ("not yet supported"), pese a estar disponible en el modelo que reemplaza. TTS migrado a `gemini-3.1-flash-tts-preview` (200+ audio tags expresivos, 70+ idiomas, watermark SynthID).
- **`prompt-engineer` v1.8.0**: seccion Dynamic Thinking reescrita — `thinking_budget` (tokens, generacion 2.5) reemplazado por `thinking_level` (`low`/`medium`/`high`, generacion 3.x). Documentada la incompatibilidad: combinar ambos parametros en el mismo request retorna error 400. Default de la API si no se especifica es `high` (el mas caro), no un valor neutro.
- **`gemini-2-5-specialist` renombrado a `gemini-3-specialist` v2.0.0**: reescritura completa, no solo cambio de nombre. El tier "Flash-Thinking" desaparecio como modelo discreto — el razonamiento es ahora un parametro (`thinking_level`) sobre cualquier modelo de la familia 3. La generacion de imagen tiene modelo propio (`gemini-3.1-flash-image-preview`, nombre en codigo "Nano Banana 2"), no es una flag sobre el modelo de texto. Referencias actualizadas en `CLAUDE.md` (tabla de seleccion de skills), `multimodal-engineer` y `prompt-engineer`.
- **`mcp-server-builder` v1.4.0**: documentado el release candidate del Model Context Protocol `2026-07-28` (RC publicado 2026-05-21) — protocolo pasa de sesion con estado a stateless por request, headers `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name` obligatorios en Streamable HTTP, framework de extensiones (`Tasks`, `MCP Apps`), politica de deprecacion formal (Active/Deprecated/Removed, minimo 12 meses), codigo de error de recurso no encontrado cambia de `-32002` a `-32602`.
- **`CLAUDE.md`**: seccion nueva "Protocolo de Vigencia Tecnologica" — sistematiza cuando y como verificar si un skill quedo anclado a un modelo o protocolo que el proveedor ya reemplazo, con enfasis en no actuar sobre afirmaciones de terceros sin fuente oficial primaria. Tabla "Limites operativos Gemini free tier" corregida con pricing y disponibilidad reales de la familia 3.x.
- **Codigo del bridge**: el default real de Gemini en `ModelRouter.js`, `ModelRegistry.js`, `mcp-gemini.js` y `.env.example` — no solo la documentacion de skills — migrado de `gemini-2.5-flash` a `gemini-3.5-flash`. `npm test` (379/379) y `node --check` en los tres archivos confirman que el cambio no rompe nada.

## [3.10.0] — 2026-07-06

### Agregado — Verificacion Cross-Model

- **`CrossVerifier.js`**: verificacion ciega de un diff con proveedor de IA distinto al que genero el cambio. Implementa el patron "Writer/Reviewer" de Anthropic (code.claude.com/docs/en/best-practices) — el verificador recibe solo el diff y la tarea original, nunca el razonamiento del actor. Motivado por el hallazgo de que verificar con el mismo modelo detecta solo 9.6% de errores self-consistentes (arXiv 2505.17656). Reutiliza `ModelRegistry.chat()`, sin cliente HTTP propio.
- **`cross-verify-gate.js`**: hook `SubagentStop` que dispara `CrossVerifier` automaticamente cuando el subagente `code-reviewer` emite veredicto `APROBADO`. Best-effort: se omite sin bloquear si no hay proveedor distinto de Anthropic configurado en `.env`.
- **`cross-model-verifier` skill v1.0.0**: documenta el mecanismo, activacion automatica via hook y diagnostico manual (total: 36 skills).
- **`ModelRouter.js`**: nuevo tier `TIER_VERIFICADOR` — delega la seleccion de proveedor a `CrossVerifier.seleccionarVerificador()` en vez de la jerarquia de costo Anthropic.
- **`.env.example`**: nota de rol dual para `OPENAI_API_KEY`/`DEEPSEEK_API_KEY` — ahorro de costo tier 2 Y verificador cross-model.
- Plan completo y decision de diseno (sin duplicar `code-reviewer`/`subagent-review.js`/`security-scanner`) en `docs/OPUSPLAN-cross-model-verifier.md`.

### Agregado — Upgrade AAA

- **`ponytail-check.js`**: hook PreToolUse Write|Edit con escalera YAGNI de 5 capas. Detecta reimplementaciones de stdlib, funciones >3 parametros y bloques >200 lineas antes de escribir.
- **`dev-loop` skill v1.0.0**: ciclo Spec→Design→Plan→Build→Review con 5 gates obligatorios. Sin artefacto de la fase anterior, la siguiente no comienza.
- **`memory-index.js`**: motor BM25 zero-deps para vault semantico en `.claude/memory-vault/`. Indexacion automatica en Stop hook. Recuperacion al inicio de sesion con umbral score >2.0.
- **`memory-manager` skill v1.0.0**: protocolo de indexacion y recuperacion semantica entre sesiones.
- **`agent-metrics.js`**: observabilidad por tool call — herramienta, status, tokens estimados, duracion. `npm run agent-report` para ver resumen de sesion.
- **`subagent-review.js`**: validacion adversarial en SubagentStop con 3 perspectivas (Auditor + Adversario + Pragmatico). Exit 1 si hay hallazgos CRITICOS.
- **`ux-visual-designer` v2.0.0**: 10 paradigmas visuales 2026 (glassmorphism, claymorphism, liquid glass, brutalismo, maximalismo, bento grid, spatial UI, editorial-minimal, retro-futurista, organico-tactil), tokens W3C estandar Oct 2025, WCAG 2.2 AA nuevos criterios (2.4.11, 2.5.8, 3.3.8).
- **`tech-lead-frontend` v4.0.0**: Motion v11+ con import path correcto (`motion/react`), edge rendering, container queries como estandar, CSS 2026 (anchor positioning, view transitions, color-mix oklch).
- **`ROADMAP_AAA.md`**: hoja de ruta documentada con 6 mejoras implementadas y arquitectura decidida para arnes-manager.
- **Protocolo de Arranque** en CLAUDE.md: al inicio de cada sesion ejecuta telemetria, consulta vault BM25, verifica mapa y lee metricas de sesion anterior — sin intervencion del usuario.
- **2 skills nuevos** en tabla de auto-routing: `dev-loop` y `memory-manager` (total: 34 skills).

### Corregido

- **`ModelRouter.js` + `mcp-anthropic.js`**: `claude-opus-4-7` actualizado a `claude-opus-4-8`.
- **`health-sync.js`**: parsing de skills en CLAUDE.md corregido (formato tabla markdown, no linea legacy) — eliminados 34 falsos positivos en HEALTH_REPORT.
- **`aiops-score.js`**: `subagent-review.js` agregado a lista de exclusion del scan de seguridad — score corregido de 9/10 a 10/10.
- **`CLAUDE.md` linea 4**: version string corregida de v3.9.1 a v3.10.0.
- **`DOCS_MAESTRA.md`** eliminado: documento legacy v2.6.4 que contaminaba el contexto. Contenido absorbido por README y CLAUDE.md desde v3.8.
- **Conteos sincronizados**: todas las referencias a 32 skills / 286 tests actualizadas a 34 / 342 en README, CLAUDE.md, update.js, ci.yml y aiops-score.js.
- **`@anthropic-ai/sdk`**: actualizado de 0.104.1 a 0.110.0.
- **`package.json` engines**: constraint actualizado de `>=18.0.0` a `>=20.0.0` (Node 18 en EOL).
- **CI matrix**: Node 18 eliminado de la matrix de pruebas (EOL 2025).

### Actualizacion de scripts de portabilidad — NOTA CRITICA

`setup-settings.js` y `norm-harness.js` estaban desactualizados: generaban un `settings.json` con solo 2 hooks (version v3.9.0) en lugar de los 22 hooks del harness actual. Cualquier proyecto que clonara ai-core o corriera `npm run setup` recibia un harness incompleto sin: ponytail-check, agent-metrics, subagent-review, memory-index, secrets-guard, session-summary, aiops-score, SubagentStop, PostToolUseFailure, git-queue-advisor.

Ambos scripts fueron reescritos y ahora producen el harness completo.

**Accion requerida en proyectos existentes con ai-core como submodulo:**

```bash
# Desde la raiz del proyecto anfitrion
cd .claude/ai-core
git pull origin main
npm install
cd ../..
node .claude/ai-core/.claude/bin/norm-harness.js
```

El ultimo comando sobreescribe el `settings.json` del anfitrion con los 22 hooks actualizados. Sin este paso, el anfitrion sigue usando el harness viejo aunque el submodulo este en v3.10.0.

## [3.9.1] — 2026-06-12

### Corregido

- **`validate-globals.js`**: parser reemplazado para leer la tabla markdown de seleccion de skills en CLAUDE.md en lugar del patron de lista lineal legacy. Elimina 32 falsos positivos de severidad media reportados en cada ejecucion desde v3.9.0.
- **`@anthropic-ai/sdk`**: actualizado de 0.100.1 a 0.104.1.
- **`ModelRegistry.js`**: comentario de catalogo de modelos actualizado (Haiku 4.5 / Sonnet 4.6 / Opus 4.8 / Fable 5) para orientar seleccion por tier de costo.

### Auditoria de Portabilidad

La garantia de que el arnes funciona en cualquier maquina tras `git clone` se apoya en dos mecanismos:

1. **`npm run setup`** — regenera `settings.json` con las rutas absolutas del sistema actual. Lo ejecuta automaticamente `npm run update`. Sin este paso, los hooks de Claude Code apuntan a la ruta del owner original y fallan silenciosamente.
2. **`.env.example`** — plantilla completa con todas las API keys necesarias (GEMINI_API_KEY, ANTHROPIC_API_KEY y opcionales). El usuario copia a `.env` y completa solo las claves que use.

Riesgo residual documentado: `settings.json` se commitea con rutas absolutas del owner. Si un colaborador clona y NO ejecuta `npm run setup`, los hooks apuntan a `/home/cyber/Proyectos/ai-core/` y no a su ruta local. El arnes corre pero todos los hooks fallan silenciosamente (los scripts tienen `|| true` como guardia). Solucion: ejecutar `npm run setup` siempre tras clonar.

## [3.9.0] — 2026-06-10

### Skills — Upgrade Senior (nivel basico → nivel produccion)

**Patron aplicado en 10+ skills:** Seccion `Cuando NO Activar Este Perfil` + conversion de reglas PROHIBIDO a imperativo positivo + checklists de PR donde faltaban.

- `qa-engineer` v2.0.0 — seccion "Cuando NO activar" (5 casos), checklist de PR (6 items), restricciones en positivo.
- `workflow-orchestrator` v2.0.0 — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `backend-architect` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `prompt-engineer` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `agent-testing` — seccion "Cuando NO activar" (5 casos), restricciones en positivo, eliminadas reglas redundantes con CLAUDE.md.
- `llm-evals` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `managed-agents-specialist` — seccion "Cuando NO activar" (5 casos), restricciones en positivo.
- `cost-optimizer` — seccion "Cuando NO activar" (4 casos).
- `rag-specialist` v2.4.0 — seccion "Cuando NO activar" (4 casos), checklist de PR (6 items), restricciones en positivo.

**Fundamento:** Investigacion 2026 (650 trials) indica que reglas PROHIBIDO se violan con mayor frecuencia que imperativos positivos. La seccion "Cuando NO activar" previene activacion de skill erroneo — principal causa de respuestas de baja calidad en proyectos reales.

---

## [3.8.0] — 2026-06-04

### Agregado

- **`web-scraping-specialist`**: patron Power BI iframe anidado con Azure Static Apps — soporte para extraccion desde iframes con autenticacion Azure AD embebida.
- **`norm-harness.ps1`**: equivalente PowerShell de `norm-harness.js` con rutas dinamicas via `$PSScriptRoot` para instalacion en Windows sin edicion manual.
- **`diff-map-trigger.js`** y **`validate-map.js`**: hooks PostToolUse y PreToolUse para deteccion automatica de drift estructural en CONTEXT_MAP sin consultar `git ls-files` ni `find`.
- **Instalacion cross-platform**: README expandido con instrucciones completas para macOS, Linux y Windows (Administrador).
- **`token-metrics.js`** y **`dry-run-cost-sim.js`**: medicion de reduccion de consumo de tokens y simulacion de costo sin llamadas reales.
- **`CONTEXT_MAP.json`**: indice dual host/core con seccion de stack, regenerado automaticamente via hooks.

### Cambiado

- **`CLAUDE.md`**: version bumpeada a v3.8.0. Protocolo Zero-Token, Modo Neanderthal, Gobierno de Agentes (estandar AAA), Patron CONTEXT_MAP y Limites Gemini free tier 2026 documentados.
- **32 skills**: `last_updated` sincronizado. Skills nuevos: `ux-visual-designer`, `seo-sem-specialist`.
- **`package.json`**: version bumpeada a 3.8.0.
- **README.md**: seccion de arquitectura y arbol de modulos actualizados a v3.8.0.
- **`.gitignore`**: excluidos artefactos de sesion local (`.claude/HEALTH_REPORT.md`, `TO_GEMINI.md`, `last_session.md`).

### MIGRACION

```bash
# En cada proyecto anfitrion que use ai-core como submodulo:
cd .claude/ai-core && git pull origin main
node .claude/ai-core/.claude/bin/norm-harness.js
npm run validate-globals
```

---

## [3.3.0] — 2026-06-05

### Agregado

- **`validate-globals.js`** (nuevo script en `.claude/bin/`): auditor de conformidad que verifica que los 32 skills no copien reglas de `CLAUDE.md`, tengan la referencia inmutable, las secciones obligatorias y el frontmatter completo. Detecta drift de `last_updated` y lo corrige con `--fix-drift`. Exit code 1 si hay hallazgos criticos o altos — bloquea CI.
- **`update.js`** (nuevo script en `scripts/`): actualizacion one-command. Ejecuta `git pull` → `setup-settings.js` → `npm test` → `validate-globals.js` y reporta que cambio entre versiones. Si hay breaking changes, avisa antes de continuar.
- **GitHub Actions CI** (`.github/workflows/ci.yml`): pipeline que corre `npm test` + `validate-globals` en Linux, macOS y Windows con Node 18/20/22 en cada push a `main` y en cada PR. Un PR que rompa la conformidad de un skill no puede mergear.
- **Seccion MIGRACION** en cada entrada de version del CHANGELOG: indica exactamente que debe ejecutar el usuario para actualizar.

### Cambiado

- **32 skills**: el bloque `PROTOCOLO DE SESION` copiado fue reemplazado por una referencia inmutable de una linea: `> Reglas de sesion activas: CLAUDE.md > este skill.` Ahora hay una sola fuente de verdad. Si `CLAUDE.md` cambia, los skills no necesitan actualizarse.
- **Jerarquia declarada**: cada skill tiene la declaracion explicita `CLAUDE.md > este skill` — el modelo sabe que en caso de tension entre el skill activo y las reglas globales, `CLAUDE.md` gana siempre.
- **`package.json`**: version bumpeada a 3.3.0. Nuevos scripts: `validate-globals`, `update`.
- **`CLAUDE.md`**: version bumpeada a 3.3.0. Comandos de referencia actualizados.

### Corregido

- Formato de `Restricciones del Perfil` en todos los skills: el bug de inyeccion anterior habia pegado "Restricciones adicionales:" al final de una linea de codigo en lugar de como seccion separada.
- `last_updated` actualizado en los 32 skills a 2026-06-05 via `validate-globals --fix-drift`.

### MIGRACION

**Tiempo estimado: 30 segundos.**

Para usuarios que ya tienen el ai-core clonado:

```bash
npm run update
```

Eso es todo. El script hace `git pull`, regenera `settings.json` con tus rutas locales, corre los tests y valida los skills. No hay accion manual requerida.

Para usuarios que clonan por primera vez:

```bash
git clone git@github.com:salvex93/ai-core.git
cd ai-core
npm install
npm run setup    # adapta settings.json a tu ruta local
npm test         # verifica que todo esta en orden
```

---

## [3.2.0] — 2026-06-04

### Agregado

- **32 skills** (antes 30): nuevos `ux-visual-designer` y `seo-sem-specialist`.
- **`tech-lead-frontend` v3.0.0**: SEO tecnico (Open Graph, Schema.org, Lighthouse CI gate), SEM, motion design con GSAP/Framer Motion, design tokens con tipografia variable.
- **`web-scraping-specialist` v2.0.0**: Stagehand, browser-use, Crawlee, Browserbase, estrategias especificas por proveedor anti-bot (Cloudflare, Datadome, Imperva, PerimeterX).
- **Bloque `PROTOCOLO DE SESION`** inyectado en los 32 skills (Modo Neanderthal + compact/clear).
- **`setup-settings.js`**: portabilidad cross-platform (Linux/Mac/Windows).
- **`tests/harness.test.js`**: 269 assertions con Node nativo, sin dependencias externas.
- **`tests/token-metrics.js`**: mide reduccion de consumo de tokens por sesion.

### MIGRACION

```bash
npm run update
```

---

## [3.0.0] — 2026-05-19

### Agregado
- **Skill `multimodal-engineer`** (nuevo — skill #28): especialista en vision, PDFs y extraccion estructurada con LLMs. Cubre analisis de imagenes con Claude Opus 4.7 (vision 3.75MP) y Gemini 2.5 Pro (1M tokens), extraccion estructurada con `tool_use`, Citations API con Files API, procesamiento de PDFs multi-pagina, embeddings multimodales con `voyage-multimodal-3`, y optimizacion de costo por token visual. Incluye tabla de seleccion de modelo por caso de uso y funcion de calculo de tokens por imagen para Claude (tiles) y Gemini (patches).
- **Vectores de evasion modernos en `ai-guardrails`**: nueva seccion "Vectores de Evasion Modernos 2026" con contramedidas para interleaved thinking como canal opaco, Google Cloud Model Armor GA en GCP, y adaptive thinking de Opus 4.7 como superficie de ataque ampliada.
- **Merge Queues en `release-manager`**: seccion dedicada a GitHub Actions Merge Queues (GA) con workflow completo para evitar merge races en equipos de mas de 3 desarrolladores integrando en paralelo.
- **Evals como Gate de Release en `release-manager`**: nueva seccion con umbrales minimos por metrica (faithfulness >= 0.85, hallucination rate <= 5%, task success >= 90%), tabla de frameworks de medicion y workflow de GitHub Actions que bloquea el release si los umbrales no se cumplen.
- **Firebase Vertex AI y Flutter 3.32 en `mobile-engineer`**: soporte para `firebase_vertexai` con ejemplo de integracion de Gemini en edge, actualizacion a Impeller como renderer por defecto, y migracion de `StateNotifierProvider` (deprecado) a `NotifierProvider`.

### Cambiado
- **`prompt-engineer`**: corregida referencia incorrecta a modelo inexistente `gemini-3.1-flash-live`. La seccion "Dynamic Thinking" ahora documenta correctamente `Gemini 2.5 Pro` con `thinking_config.thinking_budget`, SDK real (`google-genai`), costo de `thoughts_token_count` y criterios de seleccion de nivel.
- **`doc-builder`**: agregada literal `[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]` que faltaba en la "Directiva de Interrupcion". La version anterior solo tenia condiciones narrativas sin el token maquina requerido por el protocolo.
- **`ai-guardrails`**: Model Armor actualizado de "preview en 2026" a "GA en GCP desde 2026-Q2".
- **`CLAUDE.md`**: version bumpeada a 3.0.0, nueva entrada en tabla de seleccion de skills para `multimodal-engineer`, lista de 28 skills actualizada.
- **`package.json`**: version bumpeada a 3.0.0.
- **README**: actualizado a v3.0.0 con tabla de 28 skills, palabras clave de auto-routing expandidas, mapa de modulos corregido.

### Corregido
- `ai-guardrails` v1.0.4 → v1.1.0: last_updated sincronizado (estaba 33 dias desactualizado).
- `mobile-engineer` v1.1.1 → v1.2.0: last_updated sincronizado.
- `release-manager` v1.1.4 → v1.2.0: last_updated sincronizado.
- `aiops-engineer` v1.6.0 → v1.7.0: last_updated sincronizado post-auditoria.

---

## [2.8.0] — 2026-05-19

### Agregado
- **Health-Check System v1.0**: autodiagnostico y autocorreccion al inicio de cada sesion. Verifica integridad de skills, hooks, CONTEXT_MAP y variables de entorno antes de que el agente tome el control. Modulos: `health-check.js`, `health-report.js`, `health-sync.js`, `health-worker.js`.
- **Guard Read** (`bin/guard-read.js`): hook `PreToolUse` que bloquea lecturas directas en archivos > 200 lineas y fuerza el uso de `analizar_archivo` de Gemini. Protege la cuota de Claude.
- **Validate Map** (`bin/validate-map.js`): regenera `CONTEXT_MAP.json` automaticamente al inicio de sesion si detecta drift >= 3 archivos respecto al indice.
- **Skill `gemini-2-5-specialist`**: cubre thinking budgets, Live API con TTS nativo, image generation conversacional, Flash-Lite como tier 0 de alta escala y contexto de 1M tokens con Gemini Pro.
- **Skill `web-scraping-specialist`**: cubre scraping etico con Playwright/Puppeteer, OCR con Tesseract y Google Vision, bypass de CAPTCHA, rotacion de proxies y pipelines de datos desde marketplaces.
- `context-monitor.js`: monitor de uso de contexto con alertas de compactacion.
- `IntentClassifier.js`: arbol de decision que infiere herramienta y modelo desde el mensaje crudo del usuario.

### Cambiado
- `buscar_web` migrado a Gemini tier 0 (antes usaba Sonnet como fallback primario).
- Cobertura de Haiku ampliada a mas herramientas de bajo volumen.
- README actualizado a v2.8.0 con mapa de modulos completo y tabla de 26 skills.
- `package.json` bumpeado a v2.8.0.

### Corregido
- `node_modules/` desrastreado del historial git. Estaba committeado desde versiones anteriores a pesar de estar en `.gitignore`.
- `.gitignore` actualizado para excluir artefactos de sesion: `HEALTH_REPORT.md` y `TO_GEMINI.md`.

---

## [2.7.1] — 2026-05-17

### Corregido
- Correccion de `cwd` en servidor MCP Gemini al ejecutarse fuera del directorio del nucleo.
- Filtros de cuota Gemini: `truncarInputGemini()` y `truncarOutputGemini()` aplicados correctamente en todos los paths del bridge.
- Reduccion de overhead de hooks al inicio de sesion.
- Ajuste del limite de compactacion de contexto (de 10 a 6 turnos para anticipar la presion de cuota).

---

## [2.7.0] — 2026-05-01

### Agregado
- **Model Router v2.7**: jerarquia de costo de 4 niveles — Gemini free (tier 0) → Haiku → Sonnet → Opus. Gemini con prioridad absoluta para lecturas, resumenes y analisis de repositorio.
- **Skill `cost-optimizer`**: optimizador de costos de inferencia LLM — selecciona el modelo mas barato que completa la tarea.
- **Skill `workflow-orchestrator`**: patrones fan-out/fan-in, retry con backoff exponencial, checkpointing de estado y coordinacion de subagentes heterogeneos.
- **Skill `tech-lead-frontend` v2**: seguridad frontend de produccion, ortografia impecable en cualquier idioma y tests de componentes.
- **Skill `backend-architect` v2**: tests unitarios e integracion incluidos en el perfil.
- `ResponseValidator.js`: validacion deterministica (regex, sin LLM) del output antes de entregarlo. Detecta emojis, respuestas en ingles y frases prohibidas.
- `StyleProfiler.js`: acumula rasgos de escritura del usuario en la sesion y genera instruccion de tono inyectada dinamicamente en el system prompt.
- Umbral de delegacion a Gemini bajado de 500 a 200 lineas para maximizar ahorro de cuota.

### Cambiado
- Architect ya no fuerza Opus por defecto — usa Sonnet y escala solo si la herramienta lo requiere.
- `AgentRoles.js` desacoplado de `ModelRouter.js` — importa constantes MODELOS sin instanciar el router completo.

---

## [2.6.6] — 2026-04-27

### Agregado
- Gemini Bridge: compactacion iterativa de respuestas largas.
- Trazabilidad de IA activa en cada respuesta del bridge (`[IA: gemini-2.5-flash | HERRAMIENTA: X]`).
- `RateLimiter` en el bridge de Anthropic para evitar saturacion de cuota.
- `mcp-anthropic.js`: servidor MCP alternativo con fallback directo a Anthropic SDK.
- Zero-Token Protocol: checklist obligatorio antes de responder para minimizar tokens consumidos por turno.

### Cambiado
- Reglas Claude Pro web formalizadas en `CLAUDE.md`: maximo 150 palabras de prosa por respuesta, delegacion obligatoria a `TO_GEMINI.md` para explicaciones > 100 palabras.

---

## [2.6.5] — 2026-04-27

### Agregado
- **Skill `claude-api`**: especialista en Claude API y Anthropic SDK — prompt caching, extended thinking, tool use, Batch API, Files API, Citations API.
- `MEMORY.md`: indice de memorias persistentes entre sesiones.
- Protocolo de permisos MCP documentado en `settings.json`.
- Sincronizacion de `last_updated` en todos los SKILL.md al modificarlos.

---

## [2.6.3] — 2026-04-21

### Agregado
- `ModelRouter.js`: enrutamiento dinamico Haiku/Sonnet/Opus por herramienta y volumen de tokens con estimacion de costo.
- `ContextIndex.js`: resolucion de rutas via `CONTEXT_MAP.json` sin I/O ciego al disco.
- `AgentRoles.js`: perfiles Architect/Coder/Auditor con system prompts diferenciados.
- `ErrorRepairLoop.js`: ciclo deteccion → diagnostico → reparacion en tres fases.

### Corregido
- 5 hallazgos de auditoria AIOps: conformidad OWASP, coherencia de escalamiento y purga de acoplamiento residual.

---

## [2.6.2] — 2026-04-19

### Cambiado
- README reestructurado como guia completa de implementacion.
- Sentinel Protocol formalizado como nombre del sistema de reglas.
- Skills sincronizados con especificaciones de abril 2026.
- `CONTEXT_MAP.json` introducido como indice primario de rutas.

---

## [2.6.0] — 2026-04-17

### Agregado
- Protocolo de vinculacion via symlinks para desarrollo centralizado (alternativa a submodulos).
- Equivalente PowerShell de `norm-harness.js` con rutas dinamicas via `$PSScriptRoot`.
- **Skill `audio-voice-engineer`**: Voice AI, streaming de audio, Gemini 2.5 Flash Live API.

### Cambiado
- Modelo base de Architect actualizado a Opus 4.7 con task-budgets.

---

## [2.4.0] — 2026-03-25

### Agregado
- Aislamiento premium: `scripts/premium/` excluido del repositorio publico.
- **Skill `claude-agent-sdk`**: construccion de agentes autonomos, hooks de ciclo de vida, subagentes, integracion MCP y OAuth 2.0.
- **Skill `ai-integrations`**: integracion de LLMs en aplicaciones de produccion, streaming, fallback entre proveedores.
- Model routing: triada Sonnet/Opus/Gemini con optimizacion de tokens.
- Licencia MIT formalizada para distribucion open source.

---

## [2.3.0] — 2026-04-16

### Agregado
- Arnes agentico autonomo: Gemini Bridge como tier 0, hook de sesion `Stop`, Regla 15 (Documentacion Viva).
- Sensor de Eficiencia (Regla 22): `wc -l` antes de Read, delegacion automatica si > 300 lineas.

---

## [2.2.0] — 2026-04-16

### Agregado
- Arquitectura de orquestacion documentada.
- **Skill `rag-specialist`**: pipelines RAG, Hybrid Search (BM25 + denso + RRF), Contextual Retrieval, re-ranking.
- **Skill `llm-evals`**: evaluacion sistematica de outputs LLM, LLM-as-judge, integracion en CI/CD.
- **Skill `llm-observability`**: OpenTelemetry, dashboards de costo/latencia, Langfuse, Helicone.

---

## [1.0.0] — 2026-03-22

### Agregado
- Implementacion inicial de ai-core agnostico.
- Sistema de skills universales: `backend-architect`, `devops-infra`, `security-auditor`, `data-engineer`, `mobile-engineer`, `qa-engineer`, `release-manager`.
- `CLAUDE.md` como autoridad unica de reglas globales.
- Integracion como submodulo Git con instrucciones de instalacion.
- README comunitario y Regla 7 de persistencia de hallazgos en `BACKLOG.md`.
