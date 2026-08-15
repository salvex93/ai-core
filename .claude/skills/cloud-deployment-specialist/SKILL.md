---
name: cloud-deployment-specialist
description: Despliegue real y ejecutable en proveedores especificos de nube/hosting (AWS App Runner/ECS Express Mode, Google Cloud Run/Firebase, Azure Container Apps, DigitalOcean App Platform, Cloudflare Workers/Pages, Vercel, Railway, Render, Fly.io) -- comandos CLI reales, modelos de pricing, y criterio de seleccion de proveedor segun el proyecto. Diferenciado de devops-infra (IaC/Kubernetes/observabilidad generica y agnostica, ya cubierto ahi, este skill no lo repite) y release-manager (CI/CD generico). Activa al elegir donde desplegar un proyecto nuevo, migrar de proveedor, o ejecutar un deploy real a produccion en cualquiera de estos 9 proveedores.
origin: ai-core
version: 1.0.1
last_updated: 2026-08-15
rol: architect
compatibility: Depende de las CLIs oficiales de cada proveedor de nube que se use (aws-cli, gcloud, az, flyctl, railway, vercel, etc. segun el proveedor elegido) y credenciales/conectividad hacia ese proveedor.
---

# Cloud Deployment Specialist

Este perfil gobierna la decision y ejecucion de despliegue en un proveedor de nube o hosting concreto: comandos CLI reales, servicios nombrados, modelos de pricing verificados y criterio de seleccion segun el proyecto. `devops-infra` cubre infraestructura como codigo de forma agnostica y generica (Terraform, Helm, Prometheus, observabilidad) — este skill cubre el paso posterior: el despliegue ejecutable especifico de cada proveedor concreto. Son complementarios: `devops-infra` puede definir el Terraform que provisiona la cuenta de AWS; este skill ejecuta el `aws ecs create-express-gateway-service` o el `gcloud run deploy` real sobre esa infraestructura.

## Cuando Activar Este Perfil

- Elegir en que proveedor desplegar un proyecto nuevo sin infraestructura previa.
- Ejecutar un deploy real a produccion en AWS (App Runner/ECS Express Mode), Google Cloud (Cloud Run/Firebase), Azure (Container Apps/App Service), DigitalOcean (App Platform/Droplets), Cloudflare (Workers/Pages), Vercel, Railway, Render o Fly.io.
- Evaluar migracion de proveedor por costo, latencia o limite de free tier alcanzado.
- Comparar modelos de pricing reales (facturacion por segundo, por vCPU-hora, por credito consumido) entre dos o mas proveedores concretos.
- Diagnosticar por que un servicio no escala a cero o factura de forma inesperada en un proveedor especifico.
- Decidir entre serverless (Cloud Run, Container Apps, Workers), PaaS con git-push (Vercel, Railway, Render) o VM/contenedor con control total (Droplets, ECS Fargate, Fly Machines).

## Cuando NO Activar Este Perfil

- Definir modulos de Terraform, charts de Helm o topologia de Kubernetes de forma agnostica al proveedor — eso es `devops-infra`, no se repite aqui.
- Configurar observabilidad (Prometheus, Grafana, OpenTelemetry) — cubierto en `devops-infra`.
- Escribir codigo de aplicacion (backend, frontend, esquema de base de datos) — corresponde a `backend-architect` o `tech-lead-frontend`.
- Disenar pipelines de CI/CD genericos (GitHub Actions, gates de release, versionado semantico) — corresponde a `release-manager`. Este skill solo entra cuando el paso final de ese pipeline es un comando de deploy real hacia un proveedor nombrado.
- Publicar builds a App Store/Play Store/Microsoft Store — corresponde a `app-store-publisher`.

## Primera Accion al Activar

Antes de recomendar un proveedor o comando, declarar explicitamente:

1. **Presupuesto real:** free tier estricto o hay presupuesto pago disponible. Sin esta respuesta no se puede descartar Fly.io (sin free tier para clientes nuevos) ni recomendar entre Render free (con sleep) vs Vercel Hobby (sin sleep, invocation-based).
2. **Region/latencia objetivo:** publico global (favorece edge — Cloudflare Workers, Vercel Edge) vs region unica (favorece Cloud Run/Container Apps/Railway en la region mas cercana al usuario).
3. **Necesidad de escalado:** serverless invocation-based (Cloud Run, Container Apps, Workers, Vercel Functions), contenedor long-running con estado (Railway, Fly Machines, ECS/Fargate) o VM con control total (Droplets).
4. **Proveedor actual del proyecto:** si el proyecto YA esta desplegado en algun proveedor, no proponer migracion sin justificacion tecnica o de costo explicita — migrar tiene costo de reconfiguracion, DNS, y riesgo de downtime que debe pesar contra el beneficio declarado.

## AWS — App Runner (cerrado a clientes nuevos) y ECS Express Mode

**Estado critico verificado independientemente contra fuente oficial** (`docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html`, verificado 2026-08-04): AWS App Runner ya no acepta clientes nuevos ("we decided to close AWS App Runner to new customers"). Clientes existentes siguen operando con normalidad, incluyendo creacion de recursos y servicios nuevos, pero AWS no planea agregar features nuevas. AWS recomienda migrar a **Amazon ECS Express Mode**.

Comando real, verificado con fetch directo contra la misma fuente oficial (sintaxis exacta confirmada, no solo mencionada de pasada):
```bash
aws ecs create-express-gateway-service \
    --execution-role-arn arn:aws:iam::123456789012:role/ecsTaskExecutionRole \
    --infrastructure-role-arn arn:aws:iam::123456789012:role/ecsInfrastructureRoleForExpressServices \
    --primary-container '{
        "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest",
        "containerPort": 8080,
        "environment": [{
            "name": "ENV_VAR_NAME",
            "value": "value"
        }]
    }' \
    --service-name "my-application" \
    --health-check-path "/" \
    --scaling-target '{"minTaskCount":1,"maxTaskCount":4}' \
    --monitor-resources
```
Requiere crear 2 IAM roles antes de este comando (`ecsTaskExecutionRole`, `ecsInfrastructureRoleForExpressServices`). Provisiona en una sola llamada: servicio ECS en Fargate, Application Load Balancer con target groups y health checks, auto-scaling, security groups/networking y una URL por defecto. Aprovisionamiento tipico: 3-5 minutos.

Migracion real desde App Runner: blue/green con DNS weighted routing (Route 53), traspaso gradual de trafico (10/90 -> 25/75 -> 50/50 -> 75/25 -> 100/0), validando en cada paso antes de continuar. Periodo de validacion recomendado de 24-48h manteniendo ambos servicios activos antes de eliminar App Runner.

**Pricing App Runner (vigente solo para clientes existentes):**
- Instancia provisionada inactiva: $0.007/GB-hora de memoria (se factura aun sin trafico).
- Instancia activa: $0.064/vCPU-hora + $0.007/GB-hora de memoria.
- Region Tokyo mas cara: $0.081/vCPU-hora y $0.009/GB-hora.
- No se encontro free tier documentado para App Runner en la fuente oficial.
- Scale-to-zero real: no confirmado, con sospecha razonable de que no aplica (la instancia provisionada se factura inactiva).

**ECS Express Mode / Fargate:** scale-to-zero no confirmado (corre sobre Fargate + Application Load Balancer, que normalmente cobra fijo por el balanceador activo independiente del trafico). No hay cargo adicional por usar Express Mode en si — se paga solo por los recursos AWS subyacentes que provisiona.

**Elastic Beanstalk:** estado exacto (mantenimiento formal vs. vigente) no verificado contra fuente oficial en esta investigacion — no asumir vigencia ni deprecacion sin verificacion dedicada.

**Mejor caso de uso:** proyectos que ya requieren el feature set completo de ECS/Fargate (networking VPC explicito, task definitions propias, control granular de scaling) o que ya estan en el ecosistema AWS por otras razones (IAM, VPC, RDS existentes).

## Google Cloud — Cloud Run y Firebase Hosting

Comando real (fuente: `docs.cloud.google.com/sdk/gcloud/reference/run/deploy`):
```bash
gcloud run deploy [SERVICE] --source=SOURCE --region=REGION --allow-unauthenticated
gcloud run deploy my-backend --image=us-docker.pkg.dev/project/image --region=us-central1
```
`--source` construye la imagen automaticamente via Cloud Build/buildpacks, sin Dockerfile ni Docker local.

Firebase Hosting con backend dinamico (fuente: `firebase.google.com/docs/hosting/quickstart`):
```bash
firebase deploy --only hosting
firebase deploy --only hosting,functions
```
Integracion con Cloud Functions o Cloud Run via `rewrites` en `firebase.json`.

**Pricing y free tier (fuente: `cloud.google.com/run/pricing`):**
- Free tier mensual: 180,000 vCPU-segundos, 360,000 GiB-segundos, 2,000,000 requests, agregado por cuenta de facturacion, se resetea cada mes.
- Precio por unidad mas alla del free tier: orientativo, no verificado contra fuente oficial — el fetch de la pagina se trunco en multiples intentos, requiere consulta dedicada con la calculadora oficial antes de cotizar.
- Scale-to-zero real: confirmado oficialmente. Solo se factura con trafico activo.

**Mejor caso de uso:** APIs y backends containerizados con trafico variable o impredecible, proyectos que ya usan Cloud Build/Artifact Registry, o que necesitan el comando de deploy de menor friccion entre los tres hyperscalers (un solo comando, sin roles previos, sin Dockerfile).

## Azure — Container Apps y App Service

Comando real (fuente: `learn.microsoft.com/en-us/azure/container-apps/get-started`):
```bash
az containerapp up \
  --name my-container-app \
  --resource-group my-container-apps \
  --location centralus \
  --environment 'my-container-apps' \
  --image mcr.microsoft.com/k8se/quickstart:latest \
  --target-port 80 \
  --ingress external \
  --query properties.configuration.ingress.fqdn
```
Un solo comando crea el entorno, el Log Analytics workspace y despliega el contenedor.

**Pricing Container Apps Consumption plan (fuente: `learn.microsoft.com/en-us/azure/container-apps/billing`):**
- Free tier mensual: 180,000 vCPU-segundos, 360,000 GiB-segundos, 2,000,000 HTTP requests por suscripcion/mes — cifras identicas a Cloud Run.
- Facturacion por segundo en dos meters (vCPU-segundos, GiB-segundos), con tarifa reducida ("idle rate") cuando `min replica count > 0` sin trafico activo.
- Precio exacto por unidad en USD: orientativo, no verificado contra fuente oficial en esta investigacion.
- Scale-to-zero real: confirmado oficialmente — "no resource consumption charges are incurred" cuando escala a cero replicas.

**Azure App Service (fuente: `learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans`):**
- PaaS tradicional para apps web (codigo o contenedor), sin scale-to-zero real salvo tier Free/Shared (limitado, sin autoscale). El tier Basic no tiene autoscale-to-zero.
- Mejor caso de uso: apps web tradicionales sin necesidad de escalar a cero, equipos ya familiarizados con App Service.

**Container Apps mejor caso de uso:** microservicios con requisito real de scale-to-zero, arquitecturas orientadas a eventos, cargas de trabajo intermitentes.

## DigitalOcean — App Platform y Droplets

Flujo real: en el Control Panel se selecciona la fuente (repo Git o imagen), rama y subdirectorio (monorepo). Autodeploy activo por defecto en cada push (desmarcable). Fuente: `docs.digitalocean.com/products/app-platform/how-to/create-apps/`.

CLI real (fuente: `docs.digitalocean.com/reference/doctl/reference/apps/create/`):
```bash
doctl apps create --spec src/your-app.yaml --format ID,DefaultIngress,Created
```

**Pricing (fuente: `docs.digitalocean.com/products/app-platform/details/pricing/`):** hibrido — tier fijo mensual como techo, pero facturado por segundo con minimo de un minuto, prorrateado segun el "size slug" seleccionado. No es tier 100% fijo ni facturacion granular pura tipo Lambda.

| Tier | CPU | RAM | Precio/mes |
|---|---|---|---|
| apps-s-1vcpu-0.5gb | 1 compartida | 512 MiB | $5.00 |
| apps-s-1vcpu-1gb | 1 compartida | 1 GiB | $12.00 |
| apps-s-2vcpu-4gb | 2 compartidas | 4 GiB | $50.00 |
| apps-d-1vcpu-2gb | 1 dedicada | 2 GiB | $39.00 |
| apps-d-4vcpu-16gb | 4 dedicadas | 16 GiB | $196.00 |
| apps-d-8vcpu-32gb | 8 dedicadas | 32 GiB | $392.00 |

Free tier: hasta 3 apps que usen solo componentes de sitio estatico.

**Droplets:** VMs Linux con RAM/disco/ancho de banda siempre dedicados, CPU compartida o dedicada segun plan. Integran con autoscale pools, volumes, firewalls y load balancers propios de DigitalOcean.

**Mejor caso de uso:** equipos que quieren PaaS simple con precio predecible (techo fijo conocido de antemano) sin la complejidad de Kubernetes, o que necesitan control total de VM via Droplets sin salir del mismo proveedor.

## Cloudflare — Workers y Pages

Modelo de ejecucion confirmado: V8 isolates, no VMs ni contenedores (fuente: `developers.cloudflare.com/workers/reference/how-workers-works/`). Un isolate arranca hasta cien veces mas rapido que un proceso Node en contenedor/VM, con memoria consumida un orden de magnitud menor.

Comando real (fuente: `developers.cloudflare.com/workers/wrangler/commands/`):
```bash
npx wrangler deploy
```

**Limites del free tier (fuente: `developers.cloudflare.com/workers/platform/limits/`):**
- Requests: 100,000/dia (limite de requests/minuto no confirmado en fuente oficial — no reportar como confirmado).
- CPU time: 10 ms por request HTTP o Cron Trigger.
- Memoria: 128 MB por isolate.
- Subrequests: 50 por invocacion.
- Tamano de script: 3 MB comprimido / 64 MB sin comprimir.
- Conexiones simultaneas: 6. Workers por cuenta: 100. Cron Triggers: 5 por cuenta.
- Scale-to-zero: si, por diseno — el modelo de facturacion es por request/CPU-tiempo, sin instancia persistente que facturar en reposo.

**Para que NO sirve:** backend con estado persistente complejo sin usar primitivas complementarias (Durable Objects, D1, KV) — el limite de 10ms de CPU time y la ausencia de filesystem persistente lo descartan para cargas de trabajo con estado pesado sin esas piezas adicionales.

**Cloudflare Pages vs Workers:** Pages no esta deprecado (fuente: `developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/`), pero Workers tiene feature set mas amplio (Durable Objects, Cron Triggers, Observability) y ahora sirve assets estaticos gratis, eliminando la ventaja de costo que antes tenia Pages. Pages Functions corre sobre el mismo runtime de Workers y factura contra la misma cuota. Sin recomendacion excluyente oficial para proyectos nuevos.

**Mejor caso de uso:** APIs de baja latencia global, edge computing, sitios estaticos con logica ligera de borde.

## Vercel

Diseno original para frontend/Next.js con deploy automatico desde git, expandido a Vercel Functions (arquitectura "Fluid compute").

Comando real (fuente: `vercel.com/docs/cli/deploy`):
```bash
vercel        # deploy
vercel --prod # deployment de produccion
```

**Pricing (fuente: `vercel.com/pricing`):**
- Hobby (gratis): 1M Edge Requests/mes, 100GB Fast Data Transfer/mes, 4 horas Active CPU/mes, 1M invocaciones/mes, 360 GB-hrs Provisioned Memory.
- Pro: $20/usuario/mes + $20 de credito de uso incluido. 10M Edge Requests incluidos ($2 por 1M adicional), 1TB Fast Data Transfer incluido ($0.15/GB adicional).

**Limites de Functions (fuente: `vercel.com/docs/functions/limitations`):**
- Memoria: Hobby 2GB/1vCPU fijo; Pro/Enterprise hasta 4GB/2vCPU configurable.
- Duracion: Hobby 300s fijo. Pro/Enterprise: 300s default, 800s maximo GA, 1800s beta con configuracion especial.
- Bundle: 250MB (500MB Python), "large functions" beta hasta 5GB.

**Scale-to-zero:** no declarado explicitamente en fuente oficial consultada — pendiente de verificacion dedicada, no asumir por analogia con el modelo invocation-based.

**Mejor caso de uso:** frontend Next.js/React con deploy automatico desde git, ISR, integracion nativa con el framework del mismo fabricante.

## Railway

Comando real (fuente: `docs.railway.com/guides/cli`):
```bash
railway up
railway up --detach
```
Deploy automatico desde GitHub en cada push a la rama conectada, con soporte de "Wait for CI" (fuente: `docs.railway.com/guides/github-autodeploys`).

**Pricing (fuente: `docs.railway.com/reference/pricing`):**
- Free/Trial: $0/mes con $1 credito mensual — la misma pagina oficial tambien menciona una subvencion unica de $5 para usuarios nuevos con acceso limitado (1GB RAM, 2 vCPU, 1GB almacenamiento efimero). Esta inconsistencia es real y esta dentro de la propia fuente citada: reverificar en el dashboard actual antes de cotizar, no asumir cual cifra aplica.
- Hobby: $5/mes (incluye $5 de credito). Pro: $20/mes (incluye $20 de credito).
- Costo por recurso: RAM $10/GB/mes, CPU $20/vCPU/mes, Network Egress $0.05/GB, Volume Storage $0.15/GB/mes.

**Scale-to-zero:** no declarado explicitamente en fuente oficial — pendiente de verificacion, no asumir.

**Mejor caso de uso:** backends completos con estado y bases de datos (Postgres, Redis, volumes persistentes nativos) — el modelo de recursos reales consumidos encaja con servicios long-running, a diferencia del modelo invocation-based de Vercel.

## Render

Deploy real via git push-to-deploy o Blueprint declarativo (`render.yaml` en la raiz, fuente: `render.com/docs/blueprint-spec`), que define servicios web/workers/cron, Postgres, Key Value, discos persistentes y variables de entorno como IaC.

**Free tier (fuente: `render.com/docs/free`):**
- Web services gratuitos duermen tras 15 minutos de inactividad; cold start de reinicio aproximadamente 1 minuto.
- 750 horas de instancia gratuita por workspace/mes calendario; agotadas, se suspenden todos los servicios web free hasta el mes siguiente.
- Postgres free: maximo 1GB, expira a los 30 dias, solo una instancia free por workspace.
- Key Value (Redis-compatible) free no persiste en disco.
- Scale-to-zero: no aplica en el mismo sentido que Cloud Run/Container Apps — se suspende y deja de estar disponible hasta el proximo mes, no es "factura $0 sin trafico" con reactivacion instantanea.

**Pricing de planes pagos:** no verificado contra fuente oficial en esta investigacion (el fetch de `render.com/pricing` no devolvio cifras) — pendiente de reverificacion antes de cotizar.

**Mejor caso de uso:** proyectos con presupuesto free estricto que toleran cold start tras inactividad, prototipos y side projects con Postgres incluido.

## Fly.io

Modelo de ejecucion: Firecracker microVMs ("Machines"), 18 regiones globales confirmadas con red Anycast (fuente: `fly.io/docs/reference/regions/`).

Comando real (fuente: `fly.io/docs/launch/deploy/`):
```bash
fly deploy
```
Ejecutado desde el directorio con `fly.toml` y Dockerfile. Estrategias de deploy: `rolling` (default), `immediate`, `canary`, `bluegreen`.

**Pricing:** cambio de modelo confirmado — Fly.io ya no ofrece free allowance a clientes nuevos (solo aplica a organizaciones en planes legacy deprecados). Modelo actual Pay As You Go puro. **Cifras concretas de pricing (shared-cpu-1x/256MB, performance-16x/128GB, Kubernetes gestionado): orientativo, NO verificado contra fetch directo exitoso de la pagina oficial de pricing en esta investigacion** — son las cifras mas volatiles del set, reverificar directamente en el dashboard de Fly antes de cotizar a cliente.

**Scale-to-zero:** no declarado explicitamente en fuente oficial — pendiente de verificacion, no asumir.

**Mejor caso de uso:** aplicaciones que requieren control fino de topologia multi-region real (microVMs desplegables explicitamente por region), latencia minima para usuarios distribuidos globalmente, sin la complejidad operativa de Kubernetes.

## Tabla Comparativa Final

| Proveedor | Modelo de pricing | Curva de aprendizaje | Mejor caso de uso |
|---|---|---|---|
| AWS (App Runner / ECS Express Mode) | Por vCPU-hora + GB-hora, facturado por segundo; App Runner factura instancia inactiva; App Runner cerrado a clientes nuevos | Alta (requiere IAM roles, conceptos de ECS/Fargate) | Proyectos ya integrados al ecosistema AWS que necesitan el feature set completo de ECS |
| Google Cloud Run | Free tier generoso (180k vCPU-s/360k GiB-s/2M requests); precio por unidad no verificado | Baja (un comando, sin roles previos) | APIs/backends containerizados con trafico variable, scale-to-zero real confirmado |
| Azure Container Apps | Free tier identico a Cloud Run; precio por unidad no verificado | Baja-media (un comando crea entorno completo) | Microservicios orientados a eventos con scale-to-zero real confirmado |
| Azure App Service | Por tier fijo (Free/Shared/Basic+); sin scale-to-zero real salvo tier limitado | Baja (PaaS tradicional maduro) | Apps web tradicionales sin requisito de escalar a cero |
| DigitalOcean App Platform | Hibrido: techo fijo por tier, prorrateado por segundo | Baja | PaaS simple con precio predecible, sin Kubernetes |
| DigitalOcean Droplets | VM por hora/mes, recursos dedicados | Media (control total de VM) | Control total de infraestructura sin salir de un proveedor simple |
| Cloudflare Workers | Por request/CPU-tiempo; scale-to-zero por diseno, confirmado | Baja (un comando, sin config previa) | Edge computing y APIs de baja latencia global, sin estado pesado |
| Vercel | Free tier por invocaciones/edge requests; Pro por usuario + credito; scale-to-zero no confirmado | Muy baja (integracion git nativa) | Frontend Next.js/React con deploy automatico desde git |
| Railway | Planes base + credito de uso + costo por recurso real (RAM/CPU/red/disco); free tier con inconsistencia interna en la propia fuente oficial ($1 vs $5), reverificar antes de cotizar; scale-to-zero no confirmado | Baja | Backends con estado y bases de datos, servicios long-running |
| Render | Free tier con sleep tras 15 min (no es scale-to-zero instantaneo, es suspension mensual); planes pagos no verificados | Baja (Blueprint declarativo o git push) | Prototipos y proyectos con presupuesto free estricto, Postgres incluido |
| Fly.io | Pay As You Go puro, sin free tier para clientes nuevos; cifras de pricing orientativas, no verificadas con fetch directo; scale-to-zero no confirmado | Media (concepto de microVMs y regiones) | Multi-region real con control fino de topologia, baja latencia global |

Pendiente de investigacion dedicada, sin asumir por analogia (Protocolo de Vigencia Tecnologica de CLAUDE.md): scale-to-zero real de Vercel Functions, Railway y Fly.io — ninguno de los tres lo declara explicitamente en la fuente oficial consultada, y no debe inferirse del modelo de otro proveedor.

## Modulo — Vanguardia Transversal en Despliegue Multi-Nube

**Identidad declarada:** este perfil opera con precision de ingeniero de plataforma senior — recomienda el proveedor mas simple que cumple el requisito real (presupuesto, latencia, escalado), nunca el mas nuevo o el de mayor prestigio de marca. Cita siempre el comando y la cifra exactos, o declara explicitamente la ausencia de verificacion.

**Prohibido (anti-patrones reales de despliegue):**
- Recomendar migracion de proveedor sin que el usuario haya declarado presupuesto, region objetivo y necesidad de escalado (ver Primera Accion al Activar).
- Presentar una cifra de pricing sin fuente oficial verificada en esta sesion como si fuera un hecho confirmado — degradar siempre a "orientativo, no verificado" cuando corresponda, en el cuerpo del texto junto al dato, nunca solo en una nota al pie separada.
- Asumir scale-to-zero por analogia con otro servicio del mismo proveedor o de un proveedor competidor (ejemplo real: Azure App Service no tiene scale-to-zero real aunque Azure Container Apps si — son servicios distintos del mismo proveedor).
- Ejecutar un comando de una feature recien anunciada (menos de 90 dias) sin advertir que la sintaxis puede no estar estabilizada en versiones futuras de la CLI.
- Ignorar el costo de una instancia "inactiva pero provisionada" (ejemplo: App Runner factura $0.007/GB-hora en reposo) al comparar contra un servicio con scale-to-zero real.
- Proponer Fly.io como opcion "gratuita" sin aclarar que el free allowance ya no aplica a clientes nuevos.
- Tratar el free tier de Render como equivalente a scale-to-zero de Cloud Run/Container Apps — son modelos distintos (suspension mensual con cold start vs facturacion cero instantanea).
- Recomendar AWS App Runner para un proyecto nuevo sin advertir que esta cerrado a clientes nuevos — la alternativa real es ECS Express Mode.

**Gate de calidad medible antes de cerrar cualquier tarea de deploy:**
- Tiempo de deploy: medir el comando real ejecutado de principio a fin, no estimar.
- Costo real vs presupuestado: comparar la factura del primer ciclo de facturacion contra la cifra citada en la recomendacion; si diverge, documentar la causa (unidad de medida mal interpretada, free tier agotado, region distinta a la cotizada).
- Tiempo de rollback: verificar el comando de rollback especifico del proveedor antes de considerar el deploy cerrado (rolling/canary/bluegreen en Fly.io, revision anterior en Cloud Run/Container Apps, redeploy de commit anterior en Vercel/Railway/Render, DNS weighted routing en migraciones AWS App Runner -> ECS Express Mode).

**Vigencia verificada en esta sesion (2026-08-04) contra fuente oficial de cada proveedor:**
- AWS: `docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html` (verificado independientemente con fetch directo propio, confirmando texto exacto de cierre a nuevos clientes y sintaxis exacta de `aws ecs create-express-gateway-service`), `aws.amazon.com/apprunner/pricing/`.
- Google Cloud: `docs.cloud.google.com/sdk/gcloud/reference/run/deploy`, `cloud.google.com/run/pricing`, `firebase.google.com/docs/hosting/quickstart`.
- Azure: `learn.microsoft.com/en-us/azure/container-apps/get-started`, `learn.microsoft.com/en-us/azure/container-apps/billing`, `learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans`.
- DigitalOcean: `docs.digitalocean.com/products/app-platform/how-to/create-apps/`, `docs.digitalocean.com/reference/doctl/reference/apps/create/`, `docs.digitalocean.com/products/app-platform/details/pricing/`.
- Cloudflare: `developers.cloudflare.com/workers/reference/how-workers-works/`, `developers.cloudflare.com/workers/wrangler/commands/`, `developers.cloudflare.com/workers/platform/limits/`, `developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/`.
- Vercel: `vercel.com/docs/cli/deploy`, `vercel.com/pricing`, `vercel.com/docs/functions/limitations`.
- Railway: `docs.railway.com/guides/cli`, `docs.railway.com/guides/github-autodeploys`, `docs.railway.com/reference/pricing` (inconsistencia interna $1 vs $5 confirmada en la propia fuente).
- Render: `render.com/docs/blueprint-spec`, `render.com/docs/free`.
- Fly.io: `fly.io/docs/reference/regions/`, `fly.io/docs/launch/deploy/` (pricing no confirmado con fetch directo, ver seccion Fly.io).
- Pendiente de investigacion dedicada, sin asumir por analogia: scale-to-zero real de Vercel Functions, Railway y Fly.io; precio por unidad de Cloud Run y Azure Container Apps mas alla del free tier; planes pagos exactos de Render; estado exacto de Elastic Beanstalk.
- Reverificar contra las mismas fuentes si pasan mas de 60 dias desde `last_updated`, segun el Protocolo de Vigencia Tecnologica de CLAUDE.md.

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir cambios hasta tener el plan aprobado.

- La tarea implica migracion de proveedor de nube en produccion (cambio de AWS a GCP, de Render a Railway, de App Runner a ECS Express Mode, etc.) con servicio ya sirviendo trafico real.
- La tarea implica un cambio de modelo de pricing con impacto de costo significativo (ejemplo: pasar de invocation-based a recursos reales consumidos, o de free tier a Pay As You Go sin techo).

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Restricciones del Perfil

> Reglas de sesion activas: CLAUDE.md > este skill. Modo Neanderthal, compact/clear y delegacion a Gemini son obligatorios e inmutables.

- Prohibido inventar un comando CLI, nombre de servicio o cifra de pricing que no este en el material de investigacion verificado de esta sesion — si falta el dato, declarar "orientativo, no verificado contra fuente oficial" en la misma linea, nunca en nota al pie separada del cuerpo.
- Prohibido asumir scale-to-zero, free tier o capacidad de un servicio por analogia con otro servicio del mismo proveedor o de un competidor.
- Toda recomendacion de proveedor requiere primero la declaracion de presupuesto, region/latencia y necesidad de escalado (ver Primera Accion al Activar) — no recomendar sin esos tres datos.
- No proponer migracion de un proyecto ya desplegado sin justificacion tecnica o de costo explicita y verificada.
- Reverificar cifras de pricing y limites de free tier si pasan mas de 60 dias desde `last_updated`, contra las fuentes oficiales listadas en el modulo de vigencia.
