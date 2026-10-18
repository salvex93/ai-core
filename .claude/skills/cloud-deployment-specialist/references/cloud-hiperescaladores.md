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
