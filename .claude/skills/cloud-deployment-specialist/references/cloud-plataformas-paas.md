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
- Tamano de Worker: 64 MiB sin comprimir en Free y Paid; sin limite de tamano comprimido (verificado 2026-09-21, el limite previo de 3 MB comprimido ya no aparece en la fuente).
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
