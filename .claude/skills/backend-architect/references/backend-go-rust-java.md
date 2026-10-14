## Modulo — Backend en Go, Rust y Java/JVM: Codigo Real por Lenguaje

### Principio fundamental

Este perfil se declara agnostico al lenguaje, pero declarar agnosticismo sin ejemplos ejecutables reales deja al usuario de cada stack con solo nombres en tablas de decision. Este modulo cierra esa brecha con API REST, concurrencia idiomatica y testing verificados contra fuente oficial de cada lenguaje — no interpolados desde el ejemplo de Node.js/TypeScript. Cubre Go, Rust, Java/JVM (mas abajo) y .NET, PHP, Ruby (modulo siguiente) — los 6 lenguajes de backend de mayor uso real.

### Go — net/http (stdlib) y Gin

Version verificada: Go 1.27.1 (fuente: `go.dev/doc/devel/release`, verificado 2026-09-15). El router nativo `http.ServeMux` soporta patrones `"METODO /ruta"` y wildcards `{nombre}` desde Go 1.22 (fuente: `go.dev/doc/go1.22`) — no requiere un framework para casos simples.

```go
// main.go — net/http estandar, sin framework
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
)

type Pedido struct {
	ID     int     `json:"id"`
	Item   string  `json:"item"`
	Precio float64 `json:"precio"`
}

var ErrPedidoNoEncontrado = errors.New("pedido no encontrado")

type PedidoStore struct {
	mu      sync.RWMutex
	pedidos map[int]Pedido
	nextID  int
}

func NewPedidoStore() *PedidoStore {
	return &PedidoStore{pedidos: make(map[int]Pedido), nextID: 1}
}

func (s *PedidoStore) Crear(p Pedido) Pedido {
	s.mu.Lock()
	defer s.mu.Unlock()
	p.ID = s.nextID
	s.nextID++
	s.pedidos[p.ID] = p
	return p
}

func (s *PedidoStore) ObtenerPorID(id int) (Pedido, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.pedidos[id]
	if !ok {
		return Pedido{}, ErrPedidoNoEncontrado
	}
	return p, nil
}

func responderJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("error codificando respuesta JSON: %v", err)
	}
}

func responderError(w http.ResponseWriter, status int, mensaje string) {
	responderJSON(w, status, map[string]string{"error": mensaje})
}

func handlerCrearPedido(store *PedidoStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var entrada Pedido
		defer r.Body.Close()

		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&entrada); err != nil {
			responderError(w, http.StatusBadRequest, fmt.Sprintf("cuerpo invalido: %v", err))
			return
		}
		if entrada.Item == "" || entrada.Precio <= 0 {
			responderError(w, http.StatusUnprocessableEntity, "item y precio son obligatorios")
			return
		}

		creado := store.Crear(entrada)
		responderJSON(w, http.StatusCreated, creado)
	}
}

func handlerObtenerPedido(store *PedidoStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(r.PathValue("id"))
		if err != nil {
			responderError(w, http.StatusBadRequest, "el 'id' debe ser numerico")
			return
		}

		pedido, err := store.ObtenerPorID(id)
		if err != nil {
			if errors.Is(err, ErrPedidoNoEncontrado) {
				responderError(w, http.StatusNotFound, err.Error())
				return
			}
			responderError(w, http.StatusInternalServerError, "error interno")
			return
		}
		responderJSON(w, http.StatusOK, pedido)
	}
}

func main() {
	store := NewPedidoStore()
	mux := http.NewServeMux()

	// Sintaxis "METODO /ruta" y wildcard {id} — Go 1.22+ (go.dev/doc/go1.22).
	mux.HandleFunc("POST /pedidos", handlerCrearPedido(store))
	mux.HandleFunc("GET /pedidos/{id}", handlerObtenerPedido(store))

	log.Println("escuchando en :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("servidor detenido: %v", err)
	}
}
```

Con Gin (`go get github.com/gin-gonic/gin@v1.12.0`, version verificada en `github.com/gin-gonic/gin/releases`, `go.mod` minimo Go 1.25.0 — compatible con Go 1.27.1):

```go
r := gin.Default() // incluye middleware Logger() y Recovery()

r.POST("/pedidos", func(c *gin.Context) {
	var entrada Pedido
	if err := c.ShouldBindJSON(&entrada); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, store.Crear(entrada))
})

r.GET("/pedidos/:id", func(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el 'id' debe ser numerico"})
		return
	}
	pedido, err := store.ObtenerPorID(id)
	if errors.Is(err, ErrPedidoNoEncontrado) {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pedido)
})
```

**Concurrencia idiomatica** — worker pool con limite via semaforo de channel buffereado, usando `WaitGroup.Go` (metodo nativo desde Go 1.25, fuente `go.dev/doc/go1.25`, que reemplaza el trio manual `Add(1)`/`go func(){defer Done()}()` eliminando la clase de bug de conteo desincronizado):

```go
func ProcesarPedidosConcurrente(ctx context.Context, items []ItemPedido, maximoConcurrencia int) error {
	semaforo := make(chan struct{}, maximoConcurrencia)
	resultados := make(chan ResultadoItem, len(items))
	var wg sync.WaitGroup

	for _, item := range items {
		it := item
		wg.Go(func() { // Go 1.25+: reemplaza wg.Add(1) + go func(){defer wg.Done()}()
			semaforo <- struct{}{}
			defer func() { <-semaforo }()

			err := procesarItem(ctx, it)
			resultados <- ResultadoItem{ID: it.ID, Err: err}
		})
	}

	go func() { wg.Wait(); close(resultados) }()

	var errores []error
	for r := range resultados {
		if r.Err != nil {
			errores = append(errores, fmt.Errorf("item %d: %w", r.ID, r.Err))
		}
	}
	if len(errores) > 0 {
		return errors.Join(errores...) // stdlib desde Go 1.20
	}
	return nil
}
```

**Testing** — `testing` + `testify` (version del modulo `testify` no verificada contra fuente oficial en esta pasada; confirmar con `go list -m -versions github.com/stretchr/testify` antes de fijarla en `go.mod`):

```go
func TestPedidoStore_ObtenerPorID_ErrorSiNoExiste(t *testing.T) {
	store := NewPedidoStore()
	_, err := store.ObtenerPorID(999)
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrPedidoNoEncontrado)
}

func TestHandlerCrearPedido_Integracion(t *testing.T) {
	store := NewPedidoStore()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /pedidos", handlerCrearPedido(store))

	cuerpo, _ := json.Marshal(Pedido{Item: "silla", Precio: 120.0})
	req := httptest.NewRequest(http.MethodPost, "/pedidos", bytes.NewReader(cuerpo))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)
}
```

**Estructura de proyecto** (patron de comunidad "Standard Go Project Layout" — no es una especificacion oficial de `go.dev`, declarado explicitamente como tal):

```
pedidos-api/
├── cmd/api/main.go       # solo wiring: config, DI, arranque
├── internal/pedido/      # internal/ impide import externo — enforcement del compilador
│   ├── handler.go
│   ├── service.go
│   ├── store.go
│   └── service_test.go
├── pkg/                  # solo si se publica codigo reusable por terceros
├── go.mod
└── go.sum
```

### Rust — Axum + Tokio

Version verificada: Rust 1.97.1 (fuente: `blog.rust-lang.org/2026/07/09/Rust-1.97.0`), edicion 2024 como default de `cargo new`. Axum 0.8.9 (fuente: `github.com/tokio-rs/axum/releases`). Axum 0.8 reemplazo la sintaxis de path params `:id`/`*rest` por `{id}`/`{*rest}` (fuente: `tokio.rs/blog/2025-01-01-announcing-axum-0-8-0`) — no usar la sintaxis de dos puntos en codigo nuevo.

```rust
// Cargo.toml: axum = "0.8", tokio = { version = "1", features = ["full"] },
// serde = { version = "1", features = ["derive"] }, serde_json = "1", uuid = { version = "1", features = ["v4", "serde"] }

use axum::{
    extract::{Path, State}, http::StatusCode, response::{IntoResponse, Response},
    routing::{get, post}, Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, Mutex}};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
struct Pedido { id: Uuid, producto: String, cantidad: u32 }

#[derive(Deserialize)]
struct NuevoPedido { producto: String, cantidad: u32 }

type Db = Arc<Mutex<HashMap<Uuid, Pedido>>>;

// Error custom idiomatico: implementa IntoResponse, sin unwrap()/panic! en el camino feliz.
enum ApiError { NoEncontrado(Uuid), ValidacionInvalida(String), Interno(String) }

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, mensaje) = match self {
            ApiError::NoEncontrado(id) => (StatusCode::NOT_FOUND, format!("pedido {id} no encontrado")),
            ApiError::ValidacionInvalida(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Interno(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg),
        };
        (status, Json(serde_json::json!({ "error": mensaje }))).into_response()
    }
}

async fn crear_pedido(
    State(db): State<Db>, Json(payload): Json<NuevoPedido>,
) -> Result<(StatusCode, Json<Pedido>), ApiError> {
    if payload.producto.trim().is_empty() || payload.cantidad == 0 {
        return Err(ApiError::ValidacionInvalida("producto y cantidad son obligatorios".into()));
    }
    let pedido = Pedido { id: Uuid::new_v4(), producto: payload.producto, cantidad: payload.cantidad };
    let mut guard = db.lock().map_err(|_| ApiError::Interno("lock envenenado".into()))?;
    guard.insert(pedido.id, pedido.clone());
    Ok((StatusCode::CREATED, Json(pedido)))
}

// Sintaxis {id} vigente en Axum 0.8.x — no ":id" (tokio.rs/blog/2025-01-01-announcing-axum-0-8-0).
async fn obtener_pedido(State(db): State<Db>, Path(id): Path<Uuid>) -> Result<Json<Pedido>, ApiError> {
    let guard = db.lock().map_err(|_| ApiError::Interno("lock envenenado".into()))?;
    guard.get(&id).cloned().map(Json).ok_or(ApiError::NoEncontrado(id))
}

fn app(db: Db) -> Router {
    Router::new()
        .route("/pedidos", post(crear_pedido))
        .route("/pedidos/{id}", get(obtener_pedido))
        .with_state(db)
}

#[tokio::main]
async fn main() {
    let db: Db = Arc::new(Mutex::new(HashMap::new()));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.expect("puerto 3000 ocupado");
    axum::serve(listener, app(db)).await.expect("servidor detenido");
}
```

**Concurrencia idiomatica** — `tokio::sync::Semaphore` para limitar tareas concurrentes reales. El permiso se adquiere **antes** de `tokio::spawn` (no dentro de la tarea) y se mueve con `async move` — invertir el orden anula el limite de concurrencia, porque entonces todas las tareas se spawnean sin limite y solo el trabajo interno espera (patron confirmado contra la doc-comment oficial de `docs.rs/tokio/latest/tokio/sync/struct.Semaphore.html`):

```rust
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::task::JoinError;

enum ProcesamientoError { Fallo(String), TareaAbortada(JoinError) }

impl From<JoinError> for ProcesamientoError {
    fn from(err: JoinError) -> Self { ProcesamientoError::TareaAbortada(err) }
}

async fn procesar_lote(ids: Vec<u32>) -> Result<Vec<u32>, ProcesamientoError> {
    let semaforo = Arc::new(Semaphore::new(4));
    let mut manejadores = Vec::with_capacity(ids.len());

    for id in ids {
        // acquire_owned() ANTES del spawn -- limita cuantas tareas corren a la vez, no solo su trabajo interno.
        let permiso = Arc::clone(&semaforo)
            .acquire_owned()
            .await
            .map_err(|_| ProcesamientoError::Fallo("semaforo cerrado".into()))?;

        manejadores.push(tokio::spawn(async move {
            let _permiso = permiso; // se dropea al terminar la tarea, liberando el slot
            procesar_pedido_externo(id).await
        }));
    }

    let mut resultados = Vec::with_capacity(manejadores.len());
    for manejador in manejadores {
        resultados.push(manejador.await?); // JoinError propagado con ?, luego el Result interno con ?
    }
    Ok(resultados)
}
```

**Testing** — `#[tokio::test]` para logica async y `tower::ServiceExt::oneshot` para tests de integracion del `Router` completo sin levantar un puerto TCP (patron confirmado en `tokio-rs/axum/tree/main/examples/testing`):

```rust
#[tokio::test]
async fn post_pedidos_devuelve_created_y_json_valido() {
    use tower::ServiceExt; // habilita .oneshot() sobre el Router

    let db: Db = Arc::new(Mutex::new(HashMap::new()));
    let router = app(db);

    let cuerpo = serde_json::json!({ "producto": "teclado", "cantidad": 2 }).to_string();
    let request = axum::http::Request::builder()
        .method("POST").uri("/pedidos").header("content-type", "application/json")
        .body(axum::body::Body::from(cuerpo)).unwrap();

    let response = router.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);

    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let cuerpo_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(cuerpo_json["producto"], "teclado");
}
```

**Estructura de proyecto** (patron observado en los examples oficiales de `tokio-rs/axum`, no una convencion prescrita formalmente — declarado explicitamente):

```
pedidos-api/
├── src/
│   ├── main.rs        # arranque: config, Router, listener de tokio
│   ├── error.rs        # ApiError y su impl de IntoResponse
│   ├── routes/         # handlers por dominio
│   ├── models/         # structs de dominio + DTOs con serde
│   └── state.rs        # AppState compartido via State extractor
└── tests/
    └── pedidos_integration.rs   # tests via tower::ServiceExt::oneshot
```

### Java/JVM — Spring Boot

Version verificada: Spring Boot 4.1.1 (fuente: `spring.io/projects/spring-boot`, verificado 2026-09-15), requiere Java 17 minimo y es compatible hasta Java 26 (cita textual de `docs.spring.io/spring-boot/system-requirements.html`). JDK 25 es la LTS mas reciente (GA 2025-09-16, soporte NFTC hasta 2028, fuente `oracle.com/java/technologies/java-se-support-roadmap.html`).

```java
@Entity
@Table(name = "pedidos")
public class Pedido {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @NotBlank(message = "el cliente es obligatorio")
    private String cliente;
    @Positive(message = "el monto debe ser mayor a cero")
    private BigDecimal monto;
    // getters/setters omitidos
}

public record PedidoRequest(
    @NotBlank(message = "el cliente es obligatorio") String cliente,
    @Positive(message = "el monto debe ser mayor a cero") BigDecimal monto
) {}

public interface PedidoRepository extends JpaRepository<Pedido, Long> {}

@Service
public class PedidoService {
    private final PedidoRepository repository;
    public PedidoService(PedidoRepository repository) { this.repository = repository; }

    public Pedido crear(PedidoRequest request) {
        Pedido pedido = new Pedido();
        pedido.setCliente(request.cliente());
        pedido.setMonto(request.monto());
        return repository.save(pedido);
    }

    public Pedido buscarPorId(Long id) {
        return repository.findById(id).orElseThrow(() -> new PedidoNoEncontradoException(id));
    }
}

public class PedidoNoEncontradoException extends RuntimeException {
    public PedidoNoEncontradoException(Long id) { super("pedido no encontrado: " + id); }
}

@RestController
@RequestMapping("/pedidos")
public class PedidoController {
    private final PedidoService service;
    public PedidoController(PedidoService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<Pedido> crear(@Valid @RequestBody PedidoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.crear(request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Pedido> obtener(@PathVariable Long id) {
        return ResponseEntity.ok(service.buscarPorId(id));
    }
}

// Contrato de error centralizado — mismo principio que la seccion "Contrato de error universal".
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidacion(MethodArgumentNotValidException ex) {
        String mensaje = ex.getBindingResult().getFieldErrors().stream()
            .map(FieldError::getDefaultMessage).collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(new ErrorResponse(mensaje, 400, Instant.now()));
    }

    @ExceptionHandler(PedidoNoEncontradoException.class)
    public ResponseEntity<ErrorResponse> handleNoEncontrado(PedidoNoEncontradoException ex) {
        return ResponseEntity.status(404).body(new ErrorResponse(ex.getMessage(), 404, Instant.now()));
    }
}

public record ErrorResponse(String mensaje, int status, Instant timestamp) {}
```

**Concurrencia idiomatica** — virtual threads (Project Loom, estables desde JDK 21, JEP 444) para IO-bound concurrency, con manejo explicito de `ExecutionException`/`InterruptedException` en vez de un catch generico:

```java
@Service
public class NotificacionExternaService {
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();
    private final RestClient clienteA, clienteB;

    public ResultadoNotificacion notificarEnParalelo(Long pedidoId) {
        CompletableFuture<String> respuestaA = CompletableFuture.supplyAsync(() -> clienteA.notificar(pedidoId), executor);
        CompletableFuture<String> respuestaB = CompletableFuture.supplyAsync(() -> clienteB.notificar(pedidoId), executor);

        try {
            CompletableFuture.allOf(respuestaA, respuestaB).join();
            return new ResultadoNotificacion(respuestaA.get(), respuestaB.get());
        } catch (CompletionException | ExecutionException ex) {
            Throwable causa = ex.getCause() != null ? ex.getCause() : ex;
            throw new NotificacionFallidaException("fallo al notificar pedido " + pedidoId, causa);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt(); // restaura el flag de interrupcion, nunca se ignora
            throw new NotificacionFallidaException("notificacion interrumpida para pedido " + pedidoId, ex);
        }
    }
}
```

**Testing** — JUnit 5 + Mockito para el `@Service`, `@WebMvcTest` + `MockMvc` para el controller. **`@MockBean` fue removido en Spring Boot 4.0** (deprecado en 3.4, remocion efectiva en 4.0 — fuente: `github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide`); usar `@MockitoBean` (`org.springframework.test.context.bean.override.mockito.MockitoBean`, fuente `docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html`):

```java
@ExtendWith(MockitoExtension.class)
class PedidoServiceTest {
    @Mock private PedidoRepository repository;
    @InjectMocks private PedidoService service;

    @Test
    void deberiaCrearPedidoCorrectamente() {
        PedidoRequest request = new PedidoRequest("cliente-1", new BigDecimal("100.00"));
        Pedido guardado = new Pedido();
        guardado.setId(1L);
        when(repository.save(any(Pedido.class))).thenReturn(guardado);

        assertThat(service.crear(request).getId()).isEqualTo(1L);
    }

    @Test
    void deberiaLanzarExcepcionSiPedidoNoExiste() {
        when(repository.findById(99L)).thenReturn(Optional.empty());
        assertThrows(PedidoNoEncontradoException.class, () -> service.buscarPorId(99L));
    }
}

@WebMvcTest(PedidoController.class)
class PedidoControllerTest {
    @Autowired private MockMvc mockMvc;

    @MockitoBean // no @MockBean -- removido en Spring Boot 4.0
    private PedidoService service;

    @Test
    void deberiaRetornar404SiPedidoNoExiste() throws Exception {
        when(service.buscarPorId(99L)).thenThrow(new PedidoNoEncontradoException(99L));
        mockMvc.perform(get("/pedidos/99")).andExpect(status().isNotFound());
    }
}
```

**Estructura de paquetes**: por capa (`controller/`, `service/`, `repository/`, `dto/`) para proyectos pequenos; por feature (`pedido/PedidoController.java`, `pedido/PedidoService.java` en el mismo paquete) para monolitos modulares con multiples equipos — ninguna de las dos esta prescrita por Spring, es criterio de diseno segun escala del equipo.

