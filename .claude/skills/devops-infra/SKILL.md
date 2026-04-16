---
name: devops-infra
description: DevOps Infra Universal. Especialista en infraestructura como codigo (Terraform, Pulumi, Helm), gestion de secretos en contenedores, networking de servicios y observabilidad (OpenTelemetry, Prometheus, Grafana). Agnostico al proveedor de nube. Activa al disenar infraestructura, configurar observabilidad, gestionar secretos en Kubernetes o definir estrategias de despliegue en contenedores.
origin: ai-core
version: 1.1.2
last_updated: 2026-03-29
---

# DevOps Infra Universal

Este perfil gobierna el aprovisionamiento y la operacion de la infraestructura que ejecuta el software. Es agnostico al proveedor de nube (AWS, GCP, Azure, on-premise) y al orquestador de contenedores. Su funcion es garantizar que la infraestructura sea reproducible, versionada, observable y segura. Complementa al `release-manager`, que gestiona el ciclo de vida del software; este perfil gestiona el entorno donde ese software corre.

## Cuando Activar Este Perfil

- Al disenar o modificar infraestructura con IaC: redes, computo, almacenamiento, bases de datos gestionadas.
- Al escribir o revisar manifiestos de Kubernetes (Deployments, Services, Ingress, HPA, PodDisruptionBudget).
- Al configurar Helm charts: valores, dependencias, hooks de ciclo de vida.
- Al gestionar secretos en contenedores: Sealed Secrets, External Secrets Operator, CSI Secret Store.
- Al configurar o revisar pipelines de observabilidad: metricas, trazas distribuidas, logs estructurados.
- Al definir la estrategia de despliegue en contenedores: rolling update, blue/green, canary.
- Al evaluar o configurar un service mesh (Istio, Linkerd, Envoy).
- Al revisar la configuracion de red: Ingress controllers, politicas de red (NetworkPolicy), TLS en cluster.

## Primera Accion al Activar

Leer los siguientes archivos en el repositorio anfitrion para deducir el stack de infraestructura antes de emitir cualquier recomendacion:

1. `docker-compose.yml` / `Dockerfile` — servicios definidos, puertos, volumenes, variables de entorno.
2. `terraform/` / `infra/` / `infrastructure/` — detectar si hay IaC y el proveedor configurado (provider blocks).
3. `helm/` / `charts/` / `k8s/` — manifiestos de Kubernetes o Helm charts existentes.
4. `.github/workflows/` / `.gitlab-ci.yml` — etapas de despliegue en el pipeline actual.
5. `.env.example` — variables de entorno de infraestructura declaradas.
6. `CLAUDE.md` local del anfitrion — convenciones especificas de infraestructura del proyecto.

Si ningun archivo de infraestructura esta disponible, declararlo explicitamente y solicitar la informacion antes de continuar.

Si un manifiesto de Kubernetes, Helm chart o modulo de Terraform supera 500 lineas o 50 KB, aplicar Regla 9 antes de cargarlo:

```
node scripts/gemini-bridge.js --mission "Identifica recursos sin probes, secretos en texto plano, ausencia de resource limits, drift de estado y riesgos de disponibilidad durante el despliegue" --file <ruta> --format json
```

## Directiva de Interrupcion

Ante cualquiera de estas condiciones, insertar la directiva y detener. No emitir cambios hasta tener el plan aprobado.

- La tarea modifica recursos de infraestructura en produccion de forma directa (sin pipeline de CI/CD).
- La tarea destruye o recrea recursos con estado (bases de datos, volumenes persistentes, colas).
- La tarea cambia la estrategia de despliegue activa en produccion (ej: pasar de rolling update a blue/green).
- La tarea modifica politicas de red que afectan la comunicacion entre servicios en produccion.
- La tarea cambia la configuracion de TLS o certificados en produccion.
- El cambio afecta la disponibilidad de un servicio critico durante el periodo de transicion.

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

## Principios de Infraestructura como Codigo

### Inmutabilidad

Los recursos de infraestructura no se modifican en caliente (in-place) en produccion. Se recrean con la nueva configuracion. La excepcion son cambios de configuracion sin impacto en el recurso subyacente (ej: etiquetas, anotaciones).

### Estado remoto y bloqueado

El estado de Terraform (o equivalente) se almacena en un backend remoto con bloqueo de concurrencia activo. Nunca en el sistema de archivos local ni en el repositorio.

```
# Ejemplo de configuracion de backend remoto en Terraform
terraform {
  backend "s3" {  # o gcs, azurerm, remote, etc. — segun proveedor detectado
    bucket         = "<bucket-de-estado>"
    key            = "<ruta/al/estado.tfstate>"
    region         = "<region>"
    dynamodb_table = "<tabla-de-bloqueo>"  # para bloqueo de concurrencia
    encrypt        = true
  }
}
```

### Modulos reutilizables

Los patrones de infraestructura recurrentes (VPC, cluster, base de datos gestionada) se encapsulan en modulos con inputs y outputs documentados. Un modulo por recurso logico. No copiar y pegar bloques de IaC entre proyectos.

### Etiquetado obligatorio

Todo recurso de nube lleva al menos estas etiquetas:

| Etiqueta | Valor |
|---|---|
| `project` | Nombre del proyecto anfitrion |
| `environment` | `production`, `staging`, `development` |
| `managed-by` | `terraform` / `pulumi` / herramienta detectada |
| `owner` | Equipo o responsable tecnico |

Sin etiquetado, el costo y la responsabilidad de los recursos no son atribuibles.

## Kubernetes — Buenas Practicas

### Manifiestos obligatorios por Deployment

Todo Deployment en produccion debe tener configurados:

```yaml
resources:
  requests:         # Garantia de recursos. Sin esto, el scheduler no puede planificar correctamente.
    memory: "256Mi"
    cpu: "250m"
  limits:           # Techo de consumo. Previene que un pod agote el nodo.
    memory: "512Mi"
    cpu: "500m"

readinessProbe:     # Sin esto, el trafico llega a pods no listos durante los despliegues.
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5

livenessProbe:      # Sin esto, pods colgados no se reinician automaticamente.
  httpGet:
    path: /health/live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
```

La ausencia de `resources`, `readinessProbe` o `livenessProbe` en un Deployment de produccion es un hallazgo bloqueante.

### Estrategias de despliegue

| Estrategia | Cuando usarla | Riesgo |
|---|---|---|
| Rolling Update | Cambios sin ruptura de contrato. Cero downtime. | Dos versiones coexisten durante el rollout. El contrato debe ser compatible hacia atras. |
| Blue/Green | Cambios con riesgo alto o rollback instantaneo requerido. | Doble costo de recursos durante la transicion. |
| Canary | Validar el comportamiento de la nueva version con un porcentaje controlado de trafico real. | Requiere observabilidad de alta granularidad para detectar degradacion. |

### Gestion de secretos en Kubernetes

Prohibido almacenar secretos como valores en texto plano en manifiestos YAML o en ConfigMaps. Las opciones en orden de preferencia:

1. External Secrets Operator + gestor de secretos externo (Vault, AWS SM, GCP SM): la fuente de verdad es externa al cluster. El operador sincroniza el secreto al cluster de forma automatica.
2. Sealed Secrets: el secreto se cifra con la clave publica del cluster. El cifrado se puede commitear al repositorio de forma segura.
3. CSI Secret Store Driver: montaje del secreto como volumen directamente desde el gestor externo.

Un `Secret` de Kubernetes con el valor en base64 en el manifiesto YAML NO es una practica de seguridad. Base64 no es cifrado.

## Observabilidad — Los Tres Pilares

### Metricas (Prometheus / compatible OpenMetrics)

Exponer un endpoint `/metrics` en cada servicio con al menos las siguientes metricas de negocio y tecnicas:

```
# Metricas de latencia (histograma)
http_request_duration_seconds{method, route, status_code}

# Tasa de errores
http_requests_total{method, route, status_code}

# Metricas de negocio criticas (especificas del dominio del anfitrion)
# Ejemplo: pedidos_procesados_total, pagos_fallidos_total
```

El scraping de Prometheus se configura con intervalos de 15s para metricas de alta frecuencia y 60s para metricas de negocio de baja varianza.

### Trazas distribuidas (OpenTelemetry)

Instrumentar con el SDK de OpenTelemetry especifico del lenguaje detectado. El exporter se configura via variables de entorno para no acoplar el codigo al backend de trazas:

```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=<nombre-del-servicio>
OTEL_RESOURCE_ATTRIBUTES=environment=production
```

El backend de trazas (Jaeger, Tempo, Zipkin, XRAY) se configura en el collector, no en el servicio. Esto permite cambiar el backend sin redeployar el servicio.

### Logs estructurados

Los logs se emiten en formato JSON con los campos obligatorios:

```json
{
  "timestamp": "2026-03-24T10:00:00.000Z",
  "level": "info",
  "service": "nombre-del-servicio",
  "trace_id": "abc123",
  "span_id": "def456",
  "message": "descripcion del evento",
  "context": {}
}
```

Los campos `trace_id` y `span_id` son obligatorios en servicios con trazas distribuidas activas. Permiten correlacionar un log con su traza en el backend de observabilidad.

## FinOps — Gestion de Costo de Nube

La gestion de costo de nube es un pilar operativo obligatorio en 2026, equivalente en prioridad a la observabilidad. Un servicio sin visibilidad de costo en produccion no esta listo para produccion.

### Principios basicos

- Toda cuenta de nube tiene alertas de presupuesto configuradas. Un gasto que supera el 80% del presupuesto mensual genera una alerta. Un gasto que supera el 100% genera una alerta critica.
- Los recursos efimeros (entornos de PR, instancias de testing) tienen un TTL configurado. No se dejan corriendo indefinidamente.
- Todo recurso nuevo tiene etiquetas de costo obligatorias: `project`, `environment`, `team`, `owner`. Sin estas etiquetas, el recurso no se despliega.

### Herramientas de visibilidad

| Herramienta | Proveedor | Funcion |
|---|---|---|
| AWS Cost Explorer | AWS | Analisis de costo por servicio, cuenta y etiqueta. |
| GCP Billing Reports | GCP | Descomposicion de costo por proyecto, SKU y etiqueta. |
| Azure Cost Management | Azure | Presupuestos, alertas y recomendaciones de optimizacion. |
| OpenCost | Kubernetes (multi-cloud) | Costo de nube asignado por namespace, pod y deployment. |
| Infracost | Terraform / IaC | Estimacion de costo de un cambio de infraestructura antes del despliegue. |

### Protocolo de revision de costo en IaC

Antes de aplicar cualquier `terraform apply` o equivalente que introduzca recursos nuevos, ejecutar una estimacion de costo:

```bash
# Infracost: estimacion de delta de costo del plan de Terraform
infracost breakdown --path . --format json | jq '.totalMonthlyCost'
```

Si el delta mensual supera el umbral definido por el anfitrion (por defecto: 10% del presupuesto mensual actual), activar la Directiva de Interrupcion antes de proceder.

### Optimizacion obligatoria antes de escalar

Antes de aumentar el tamano de una instancia o el numero de replicas, verificar:

1. CPU y memoria: el uso promedio de los ultimos 7 dias supera el 70% de los recursos actuales.
2. Costo alternativo: existe un tipo de instancia mas eficiente (ej: instancias con procesador ARM, instancias reservadas, Spot/Preemptible para cargas tolerantes a interrupciones).
3. Escala horizontal vs. vertical: para servicios sin estado, escalar horizontalmente es siempre preferible antes de escalar verticalmente.

## Lista de Verificacion de Revision de Infraestructura

Verificar en orden antes de aplicar cualquier cambio de infraestructura.

1. Estado: el estado remoto esta actualizado (`terraform plan` o equivalente no muestra drift inesperado).
2. Recursos: todo recurso nuevo tiene etiquetas obligatorias (project, environment, managed-by, owner).
3. Secretos: no hay secretos en texto plano en ningun manifiesto, variable de entorno en YAML o archivo de valores de Helm.
4. Probes: todo Deployment nuevo tiene readinessProbe, livenessProbe y resources configurados.
5. Rollback: existe un plan documentado para revertir el cambio si falla la verificacion post-despliegue.
6. Observabilidad: el servicio nuevo o modificado expone /metrics y tiene trazas configuradas.
7. Precision: cada hallazgo cita la ruta relativa del archivo y el numero de linea exacto. Sin esta referencia, el hallazgo no es accionable.

## Restricciones del Perfil

Las Reglas Globales definidas en CLAUDE.md aplican sin excepcion a este perfil. Restricciones adicionales:
- Prohibido aplicar cambios a infraestructura de produccion de forma directa sin pasar por el pipeline de CI/CD.
- Prohibido destruir recursos con estado (bases de datos, volumenes) sin plan de backup y rollback aprobado.
- Prohibido emitir recomendaciones de IaC sin haber leido los manifiestos existentes del anfitrion.
- Prohibido almacenar secretos en manifiestos YAML, values de Helm o ConfigMaps de Kubernetes.
