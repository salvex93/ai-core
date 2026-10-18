## Modulo — QA Destructivo: Fuzzing, Chaos Testing y Historial de Fallos

### Principio fundamental

Un producto que solo pasa el camino feliz de sus propios tests demuestra que hace lo que su desarrollador imagino que haria — nada mas. La suite de tests unitarios y de contrato (ver Modulo — Vanguardia arriba) verifica que el sistema cumple su especificacion; el QA destructivo verifica algo distinto: que el sistema resiste el input, la carga o el fallo de infraestructura que nadie especifico porque nadie lo penso. La diferencia entre "pasa los tests" y "es resiliente" es exactamente el conjunto de casos que el desarrollador no imagino al escribir la funcion. QA destructivo busca activamente ese conjunto: fuzzing ataca la superficie de inputs de la aplicacion, chaos testing ataca la infraestructura que la sostiene, y el historial de fallos asegura que cada hallazgo se convierte en conocimiento permanente en vez de repetirse.

### Fuzzing de Inputs

Tecnica agnostica al framework — deducir del stack detectado en el proyecto anfitrion cual aplica:

- **API REST/GraphQL con schema (OpenAPI/Swagger/SDL):** fuzzing guiado por schema. La herramienta infiere el dominio valido de cada campo (tipos, formatos, enums) directamente de la especificacion y genera casos que la violan deliberadamente, incluyendo secuencias de requests con estado cuando el schema declara dependencias productor-consumidor entre endpoints.
- **Funciones puras / logica de negocio con invariante declarable:** property-based testing. El desarrollador declara una propiedad ("para todo input X, la funcion Y debe cumplir Z") y la herramienta genera casos masivos intentando refutarla, con shrinking automatico al caso minimo reproducible si falla.
- **Codigo Go nativo:** `go test -fuzz`, estable en el toolchain estandar desde Go 1.18 (GA, coverage-guided). Usa corpus semilla (`f.Add()` o `testdata/fuzz/`) mas mutador nativo; fallo = panic, `t.Fail()/t.Error()/t.Fatal()`, error no recuperable, o timeout > 1s (indicativo de deadlock).

| Stack detectado | Herramienta | Tipo |
|---|---|---|
| API con OpenAPI/Swagger | Schemathesis | Generacion guiada por schema (motor Hypothesis) |
| API REST con estado (secuencias de requests) | RESTler | Generacion guiada por schema, infiere dependencias entre endpoints |
| Python (funciones/logica de negocio) | Hypothesis | Property-based (`st.lists()`, `st.integers()`, etc.) |
| JavaScript/TypeScript (funciones/logica de negocio) | fast-check | Property-based (arbitraries + shrinking) |
| Python (fuzzing puro, sin gramatica) | Atheris | Coverage-guided mutation-based (libFuzzer), Python 3.11-3.14 |
| JVM | Jazzer | Coverage-guided in-process (libFuzzer), integra JUnit 5.9.0+ via `@FuzzTest`, sanitizers para SSRF/path traversal/command injection |
| Go nativo | `go test -fuzz` | Coverage-guided, GA desde Go 1.18 |

Criterio de fallo relevante (no ruido): crash/panic del proceso, excepcion no manejada que se propaga fuera del contrato, timeout/hang, violacion de una propiedad declarada (PBT), o violacion de schema/respuesta inconsistente con el contrato propio (ej. 500 en vez de 400 documentado). Un input malformado rechazado correctamente con el codigo de error que el schema prevé NO es un hallazgo — es el comportamiento esperado ante fuzzing.

Herramientas mencionadas pero no verificadas contra fuente oficial en esta pasada — orientativo, no verificado: AFL++ (fork mantenido de AFL, que esta archivado desde 2024-03-22), wfuzz, jsfuzz. No citar version ni comando especifico de estas sin verificacion adicional.

### Chaos Testing de Infraestructura

Distincion explicita con fuzzing: fuzzing ataca la superficie de **input de una aplicacion** (una funcion, un endpoint, un parser) buscando crashes; chaos testing ataca la **infraestructura de un sistema distribuido en runtime** (nodos, red, recursos) buscando si el sistema completo sostiene su comportamiento normal bajo fallo. Hay solapamiento de motivacion (ambos buscan resiliencia ante lo inesperado) pero no de capa — no tratar un test de carga de servicio como si fuera fuzzing de inputs, y no tratar fuzzing de un parser como si fuera chaos testing.

Principios formales (ciclo de cuatro pasos):
1. **Steady-state:** definir un output medible que indique comportamiento normal — throughput, tasa de error, percentiles de latencia. El foco es el output observable del sistema, no atributos internos.
2. **Hipotesis:** postular que el steady-state se mantendra tanto en el grupo de control como en el experimental sometido a la perturbacion.
3. **Variar eventos del mundo real:** introducir fallos de hardware, fallos de software, particiones de red, o eventos que no son fallos (picos de trafico, eventos de escalado).
4. **Blast radius acotado:** minimizar y contener el impacto de cada experimento, con responsabilidad explicita si se ejecuta contra produccion.

| Herramienta | Estado | Alcance |
|---|---|---|
| Chaos Mesh | CNCF Incubating (no Graduated, verificado contra cncf.io/projects) | Kubernetes-nativo, CRDs (PodChaos, NetworkChaos, StressChaos, IOChaos, TimeChaos), soporta scope por namespace/labels/selectors para acotar blast radius, y `Schedule` para chaos continuo en CI |
| LitmusChaos | CNCF Incubating (no Graduated, verificado contra cncf.io/projects) | Plataforma end-to-end con ChaosHub de experimentos declarativos reutilizables |
| Gremlin | SaaS comercial, no CNCF | Ataques de recurso (CPU/memoria/disco/IO), red (blackhole/latencia/packet loss/DNS), estado (shutdown/process killer/time travel); incluye coordinacion de equipos (game days) como feature de producto |

Cuando aplica vs cuando es over-engineering: chaos testing tiene sentido cuando existe una arquitectura distribuida real con multiples servicios, dependencias de red entre procesos, o infraestructura orquestada (Kubernetes, colas, servicios externos) cuya falla parcial debe tolerarse. Un monolito sin dependencias distribuidas no necesita Chaos Mesh ni LitmusChaos — instalar un orquestador de chaos sobre un solo proceso sin topologia de red que perturbar es gasto de complejidad sin hipotesis que verificar. Empezar siempre con blast radius minimo en staging antes de escalar, nunca directo a produccion.

### Adversarial Testing de UI/API

Boundary Value Analysis (BVA) y Equivalence Partitioning (EP) — origen formal ISTQB — como checklist sistematico por campo, no exploracion ad-hoc:

- **Nulos y vacios:** ausencia del campo, string vacio, `null` explicito.
- **Valores limite (BVA):** min-1, min, min+1, max-1, max, max+1 en campos numericos y de longitud.
- **Cadenas extremadamente largas:** para detectar overflow o fallos de manejo de buffer.
- **Tipos incorrectos:** string donde se espera numero, array donde se espera objeto, boolean donde se espera string.
- **Unicode / emoji:** caracteres multibyte, RTL override, normalizacion NFC/NFD inconsistente.
- **Inyeccion basica (para detectar fallo de resiliencia, no para explotar — escalar a `security-auditor` si revela vulnerabilidad real):** comillas simples/dobles, `OR 1=1`, `<script>`, path traversal (`../../`) — vectores documentados en el OWASP WSTG (SQL/LDAP/XML/Command Injection, XSS, HTTP Parameter Pollution, Mass Assignment).

Herramientas de fuzzing manual/dirigido sobre estos vectores: Burp Suite Intruder (marcar posiciones con `§...§`; modos Sniper para fuzzear un parametro a la vez, Battering ram para repetir el mismo payload en varias posiciones, Pitchfork para payloads relacionados en paralelo, Cluster bomb para todas las combinaciones), o ffuf como equivalente open source (`ffuf -w wordlist -u http://target/FUZZ`).

Pruebas de carga como forma de romper el sistema bajo estres — nota de capa: esto opera a nivel de infraestructura/servicio, la misma categoria que describe la seccion de Chaos Testing arriba, no fuzzing de input puro; se incluye aqui porque el objetivo practico de sesion (encontrar el limite de ruptura) es compartido con el resto de este modulo. Taxonomia de tipos de test (k6/Grafana): smoke, load (carga promedio), stress (degradacion sobre el promedio), soak (carga sostenida por horas — mecanismo especifico para detectar memory leaks progresivos), spike (aumento subito), breakpoint (carga creciente hasta forzar la falla del sistema deliberadamente).

Metricas concretas de "esto se rompio":
- `http_req_duration` — disparo sostenido de p99 es la senal clasica de saturacion.
- `http_req_failed` — tasa de error de las peticiones HTTP.
- `iteration_duration` — aumento anomalo indica cuellos de botella.
- Memory leak progresivo — no es una metrica nativa de la herramienta de carga, se observa correlacionando RAM del proceso bajo prueba contra la duracion del soak test.
- Umbral (`threshold`) con exit code de falla — permite que el pipeline de CI detenga el build sin lectura humana de graficas.

### Historial de Fallos — BUGS_HISTORY.json

Vive en la raiz del proyecto anfitrion (no en ai-core, no en `.claude/`) porque es conocimiento del producto, no del arnes. Se consulta ANTES de cada sesion nueva de QA destructivo por dos razones: (a) no reintroducir un bug ya reparado, (b) priorizar fuzzing y chaos testing hacia los componentes con mayor densidad historica de bugs.

```json
{
  "id": "BUG-2026-0142",
  "fecha_deteccion": "2026-08-04",
  "severidad": "critica|alta|media|baja",
  "componente": "scripts/services/ModelRouter.js",
  "causa_raiz": "descripcion tecnica breve de la causa, no del sintoma",
  "reproduccion": "pasos o input concreto que dispara el fallo",
  "test_regresion_asociado": "tests/harness/modelrouter-fallback-provider.test.js",
  "estado": "abierto|reparado|regresion"
}
```

Patron obligatorio: **bug encontrado -> se escribe el test de regresion ANTES del fix -> el test queda permanentemente en la suite.** El test debe fallar primero (rojo), confirmando que el bug es real y esta bien entendido; solo despues se corrige el codigo hasta que el test pasa. Ningun bug se considera reparado sin ese test de regresion automatizado acompanandolo — el test no se retira despues del fix, permanece indefinidamente para que ningun cambio futuro reintroduzca el mismo fallo. Estado `regresion` marca explicitamente el caso en que un bug ya cerrado volvio a aparecer, senal de que el test de regresion asociado fallo en cubrir el caso real o fue removido indebidamente.

### Checklist de Sesion de QA Destructivo

- [ ] Se consulto `BUGS_HISTORY.json` del proyecto anfitrion antes de iniciar la sesion.
- [ ] Se identificaron los componentes con mayor densidad historica de bugs y se priorizo fuzzing/chaos hacia ellos.
- [ ] Se selecciono la tecnica de fuzzing segun la superficie real detectada (schema, funcion pura, Go nativo) — no aplicada por defecto sin justificar.
- [ ] Se evaluo si el proyecto tiene arquitectura distribuida real antes de introducir chaos testing — descartado explicitamente si es un monolito sin dependencias distribuidas.
- [ ] Si aplica chaos testing: blast radius acotado por namespace/labels/selectors, ejecutado primero en staging, nunca directo a produccion.
- [ ] Se aplico el checklist de BVA/EP (nulos, limites, cadenas largas, tipos incorrectos, unicode, inyeccion basica) sobre cada campo de input expuesto.
- [ ] Si se ejecuto prueba de carga: se definieron metricas concretas de ruptura (p99, error rate, memory leak) antes de correr el test, no despues.
- [ ] Todo hallazgo nuevo se registro en `BUGS_HISTORY.json` con causa raiz y reproduccion, no solo el sintoma.
- [ ] Todo bug confirmado tiene su test de regresion escrito ANTES del fix, y ese test permanece en la suite tras el fix.
- [ ] Se verifico que ningun bug marcado `reparado` en el historial fue reintroducido por el cambio actual.

### Nota de alcance

El 'Modulo — Estrategia de Testing de Vanguardia y Contract Testing Verificable' (identidad, prohibidos, gate y vigencia) definido mas arriba en este mismo archivo sigue aplicando integramente a este modulo — fuzzing, chaos testing e historial de fallos son una capa adicional de QA destructivo, no un reemplazo ni una duplicacion de esas reglas de identidad/gate/vigencia ya establecidas.
