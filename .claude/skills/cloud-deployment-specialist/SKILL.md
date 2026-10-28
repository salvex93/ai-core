---
name: cloud-deployment-specialist
description: Despliegue real y ejecutable en proveedores especificos de nube/hosting. Activa al elegir donde desplegar un proyecto nuevo, migrar de proveedor, o ejecutar un deploy real a produccion en cualquiera de estos 9 proveedores.
metadata:
  origin: ai-core
  version: 1.1.0
  last_updated: 2026-10-18
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
- Escribir codigo de aplicacion (backend, frontend, esquema de base de datos) — corresponde a `backend-architect` o `frontend-design`.
- Disenar pipelines de CI/CD genericos (GitHub Actions, gates de release, versionado semantico) — corresponde a `release-manager`. Este skill solo entra cuando el paso final de ese pipeline es un comando de deploy real hacia un proveedor nombrado.
- Publicar builds a App Store/Play Store/Microsoft Store — corresponde a `app-store-publisher`.

## Primera Accion al Activar

Antes de recomendar un proveedor o comando, declarar explicitamente:

1. **Presupuesto real:** free tier estricto o hay presupuesto pago disponible. Sin esta respuesta no se puede descartar Fly.io (sin free tier para clientes nuevos) ni recomendar entre Render free (con sleep) vs Vercel Hobby (sin sleep, invocation-based).
2. **Region/latencia objetivo:** publico global (favorece edge — Cloudflare Workers, Vercel Edge) vs region unica (favorece Cloud Run/Container Apps/Railway en la region mas cercana al usuario).
3. **Necesidad de escalado:** serverless invocation-based (Cloud Run, Container Apps, Workers, Vercel Functions), contenedor long-running con estado (Railway, Fly Machines, ECS/Fargate) o VM con control total (Droplets).
4. **Proveedor actual del proyecto:** si el proyecto YA esta desplegado en algun proveedor, no proponer migracion sin justificacion tecnica o de costo explicita — migrar tiene costo de reconfiguracion, DNS, y riesgo de downtime que debe pesar contra el beneficio declarado.

## Referencias bajo demanda

Contenido expansivo movido a `references/` (divulgacion progresiva) para mantener este SKILL.md nucleo liviano. Cargar el archivo correspondiente cuando la tarea lo requiera:

- `references/cloud-hiperescaladores.md` — AWS, Google Cloud, Azure y DigitalOcean.
- `references/cloud-plataformas-paas.md` — Cloudflare, Vercel, Railway, Render y Fly.io.
- `references/cloud-vanguardia.md` — Vanguardia transversal en despliegue multi-nube.

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

## Criterio de Decision Transversal — Well-Architected Frameworks

AWS y Google Cloud publican cada uno un framework propio de arquitectura con los mismos seis pilares (convergencia de industria, no coincidencia): Operational Excellence, Security, Reliability, Performance (Efficiency), Cost Optimization, Sustainability. Azure documenta un framework equivalente de 5 pilares (el mismo set salvo que no separa Sustainability como pilar independiente). Ningun proveedor de los otros 6 de este skill (DigitalOcean, Cloudflare, Vercel, Railway, Render, Fly.io) publica un framework formal propio — para esos, aplicar los mismos 6 pilares como checklist informal antes de cerrar una recomendacion, sin forzar terminologia que el proveedor no usa.

Uso practico en este skill: antes de recomendar un proveedor o cerrar un deploy, repasar brevemente los 6 pilares como filtro de lo que el modulo de Vanguardia Transversal (abajo) ya cubre parcialmente:
- **Operational Excellence:** cubierto por el Gate de calidad medible (tiempo de deploy, costo real vs presupuestado, tiempo de rollback).
- **Security:** fuera de alcance de este skill — ver `security-auditor`/`security-scanner`; este skill no reemplaza esa revision.
- **Reliability:** cubierto por la verificacion de scale-to-zero real vs asumido y el comando de rollback especifico del proveedor.
- **Performance Efficiency:** cubierto por la Tabla Comparativa Final (curva de aprendizaje, mejor caso de uso segun trafico).
- **Cost Optimization:** cubierto por el modelo de pricing de cada proveedor y el anti-patron de "instancia inactiva pero provisionada".
- **Sustainability:** sin cobertura explicita en este skill hoy — region/datacenter con menor huella de carbono no es parte del criterio de seleccion actual; declarar como gap conocido en vez de inventar un dato no verificado.

**Vigencia verificada en esta sesion (2026-09-18):** `docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html` (6 pilares AWS, confirmado via busqueda indexada, WebFetch no renderiza la SPA), `docs.cloud.google.com/architecture/framework` (6 pilares GCP, mismo set, sustainability expandido a pilar completo en 2026). Azure no reverificado en esta sesion contra fuente primaria propia — el dato de "5 pilares" proviene de conocimiento previo, no de fetch directo; tratar como orientativo hasta verificar contra `learn.microsoft.com/en-us/azure/well-architected/` en una sesion futura que edite este skill.

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
