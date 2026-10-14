
## Modulo — Backend en .NET, PHP y Ruby: Codigo Real por Lenguaje

### Principio fundamental

Continuacion del modulo de Go/Rust/Java: cierra la brecha de cobertura para los 3 lenguajes de backend restantes con mayor uso empresarial real. Mismo criterio: codigo verificado contra fuente oficial de cada framework, no interpolado desde el ejemplo de JS/TS.

### .NET/C# — ASP.NET Core Minimal APIs

Version verificada: .NET 10 es la LTS vigente (soportada hasta noviembre 2028, fuente `learn.microsoft.com/dotnet/core/releases-and-support`), lanzada junto con ASP.NET Core 10 el 22 de abril de 2026. `builder.Services.AddValidation()` agrega validacion nativa con DataAnnotations en Minimal APIs (reemplaza FluentValidation para casos simples), confirmado contra `learn.microsoft.com/aspnet/core/fundamentals/minimal-apis`.

```csharp
// Program.cs — ASP.NET Core 10, Minimal APIs, EF Core, validacion nativa y ProblemDetails
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PedidosDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("PedidosDb")));

// Validacion nativa de Minimal APIs (ASP.NET Core 10) — reemplaza FluentValidation
// para casos simples de DataAnnotations.
builder.Services.AddValidation();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();

app.MapPost("/pedidos", async (
    CrearPedidoRequest request, PedidosDbContext db, CancellationToken cancellationToken) =>
{
    var pedido = new Pedido { ClienteId = request.ClienteId, Total = request.Total, CreadoEn = DateTimeOffset.UtcNow };
    db.Pedidos.Add(pedido);
    await db.SaveChangesAsync(cancellationToken);
    return TypedResults.Created($"/pedidos/{pedido.Id}", PedidoResponse.DesdeEntidad(pedido));
});

app.MapGet("/pedidos/{id:guid}", async Task<Results<Ok<PedidoResponse>, ProblemHttpResult>> (
    Guid id, PedidosDbContext db, CancellationToken cancellationToken) =>
{
    var pedido = await db.Pedidos.FindAsync([id], cancellationToken);
    if (pedido is null)
    {
        return TypedResults.Problem(
            title: "Pedido no encontrado", detail: $"No existe un pedido con id {id}.",
            statusCode: StatusCodes.Status404NotFound, type: "https://errores.dominio/pedido-no-encontrado");
    }
    return TypedResults.Ok(PedidoResponse.DesdeEntidad(pedido));
});

app.Run();

// Contrato de request con validacion DataAnnotations — soporte para records confirmado en ASP.NET Core 10.
public record CrearPedidoRequest(
    [property: Required(ErrorMessage = "ClienteId es obligatorio")] Guid ClienteId,
    [property: Range(0.01, double.MaxValue, ErrorMessage = "Total debe ser mayor a 0")] decimal Total
);

public record PedidoResponse(Guid Id, Guid ClienteId, decimal Total, DateTimeOffset CreadoEn)
{
    public static PedidoResponse DesdeEntidad(Pedido pedido) => new(pedido.Id, pedido.ClienteId, pedido.Total, pedido.CreadoEn);
}

public class Pedido
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClienteId { get; set; }
    public decimal Total { get; set; }
    public DateTimeOffset CreadoEn { get; set; }
}

public class PedidosDbContext(DbContextOptions<PedidosDbContext> options) : DbContext(options)
{
    public DbSet<Pedido> Pedidos => Set<Pedido>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Pedido>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Total).HasPrecision(18, 2);
        });
    }
}
```

Nota de vigencia: `TypedResults.ServerSentEvents` (SSE nativo en Minimal APIs) es una capacidad real de .NET 10 ampliamente reportada, pero la URL puntual de esta verificacion no contenia esa seccion especifica — confirmar contra la subpagina oficial exacta antes de citarla como "confirmado" en documentacion de cara al cliente.

**Concurrencia idiomatica** — `async`/`await` con `SemaphoreSlim` + `Task.WhenAll` para limitar llamadas concurrentes a servicios externos (patron de lenguaje estable, no especifico de .NET 10):

```csharp
public class ConsultaProveedoresService(IHttpClientFactory httpClientFactory, ILogger<ConsultaProveedoresService> logger)
{
    private const int MaxLlamadasConcurrentes = 4;

    public async Task<IReadOnlyList<CotizacionProveedor>> ConsultarCotizacionesAsync(
        IReadOnlyList<string> proveedorIds, CancellationToken cancellationToken)
    {
        using var limitador = new SemaphoreSlim(MaxLlamadasConcurrentes);
        var tareas = proveedorIds.Select(async proveedorId =>
        {
            await limitador.WaitAsync(cancellationToken);
            try { return await ConsultarUnProveedorAsync(proveedorId, cancellationToken); }
            finally { limitador.Release(); }
        });

        var respuestas = await Task.WhenAll(tareas);
        return respuestas.Where(r => r is not null).ToList()!;
    }

    private async Task<CotizacionProveedor?> ConsultarUnProveedorAsync(string proveedorId, CancellationToken cancellationToken)
    {
        var cliente = httpClientFactory.CreateClient("proveedores");
        try
        {
            return await cliente.GetFromJsonAsync<CotizacionProveedor>($"/cotizaciones/{proveedorId}", cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Fallo de red consultando proveedor {ProveedorId}", proveedorId);
            return null;
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Timeout consultando proveedor {ProveedorId}", proveedorId); // distinto de cancelacion explicita del caller
            return null;
        }
    }
}

public record CotizacionProveedor(string ProveedorId, decimal Precio, TimeSpan TiempoEntrega);
```

**Testing** — xUnit para unitario, `WebApplicationFactory<Program>` (paquete `Microsoft.AspNetCore.Mvc.Testing`) para integracion, confirmado vigente hasta ASP.NET Core 11:

```csharp
public class PedidosEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory = factory.WithWebHostBuilder(builder =>
    {
        builder.ConfigureServices(services =>
        {
            var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<PedidosDbContext>));
            if (descriptor is not null) services.Remove(descriptor);
            services.AddDbContext<PedidosDbContext>(options => options.UseInMemoryDatabase("PedidosTestDb"));
        });
    });

    [Fact]
    public async Task PostPedidos_RetornaCreated_CuandoRequestEsValido()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/pedidos", new CrearPedidoRequest(Guid.NewGuid(), 250.00m));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task GetPedidoPorId_RetornaNotFound_CuandoNoExiste()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/pedidos/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
```

**Estructura de proyecto**: separacion por proyecto (`.Api`, `.Domain`, `.Infrastructure`) dentro de una solucion, con `tests/` propio para unitarios e integracion — patron confirmado en `learn.microsoft.com/aspnet/core/test/integration-tests`, requiere que `Program.cs` sea accesible desde el proyecto de tests.

### PHP — Laravel

Version verificada: PHP 8.4.24 en mantenimiento activo (fuente `php.net/releases`, no contrastada con segunda fuente por agotamiento de cupo de busqueda en esa sesion — reverificar antes de fijarla como referencia permanente). Laravel 13.x, PHP minimo 8.3 (cita textual de `laravel.com/docs/13.x/releases`). Cambio estructural real: **`routes/api.php` ya no existe por defecto desde Laravel 11** — se crea con `php artisan install:api` (que tambien instala Sanctum), y el manejo de excepciones se centraliza en `bootstrap/app.php` via `->withExceptions()`, no en `app/Exceptions/Handler.php` (patron pre-Laravel-11).

```php
// routes/api.php (requiere "php artisan install:api" primero)
Route::post('/pedidos', [PedidoController::class, 'store']);
Route::get('/pedidos/{pedido}', [PedidoController::class, 'show']);

// app/Http/Requests/StorePedidoRequest.php
class StorePedidoRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'cliente_id' => ['required', 'integer', 'exists:users,id'],
            'total' => ['required', 'numeric', 'min:0.01'],
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'message' => 'Los datos enviados no son validos.',
            'errors' => $validator->errors(),
        ], 422));
    }
}

// app/Exceptions/PedidoNoEncontradoException.php
class PedidoNoEncontradoException extends Exception
{
    public function __construct(public readonly int $pedidoId) { parent::__construct("Pedido {$pedidoId} no encontrado."); }
}

// app/Http/Controllers/PedidoController.php
class PedidoController extends Controller
{
    public function store(StorePedidoRequest $request): JsonResponse
    {
        $pedido = Pedido::create($request->validated());
        return response()->json($pedido, 201);
    }

    public function show(int $id): JsonResponse
    {
        $pedido = Pedido::find($id);
        if (! $pedido) throw new PedidoNoEncontradoException($id);
        return response()->json($pedido);
    }
}

// bootstrap/app.php — contrato de error centralizado, patron real Laravel 11+/13.x.
// NO existe app/Exceptions/Handler.php en proyectos nuevos.
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(function (Middleware $middleware) {})
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (PedidoNoEncontradoException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['error' => ['codigo' => 'PEDIDO_NO_ENCONTRADO', 'mensaje' => $e->getMessage()]], 404);
            }
        });
    })->create();
```

**Concurrencia idiomatica** — PHP es sincrono por request (sin threads nativos); el patron real para trabajo pesado en background es **Laravel Queues** (jobs asincronos), y para mantener la app en memoria entre requests, **Laravel Octane** (FrankenPHP/Swoole/RoadRunner) sobre un event loop:

```php
// app/Jobs/ProcesarPedidoJob.php
class ProcesarPedidoJob implements ShouldQueue
{
    use Queueable;
    public function __construct(public Pedido $pedido) {}

    public function handle(): void
    {
        $this->pedido->update(['estado' => 'procesado']);
    }
}

// Despacho desde el controller — el endpoint responde sin esperar el procesamiento:
ProcesarPedidoJob::dispatch($pedido)->onQueue('pedidos')->delay(now()->addMinutes(1));

// php artisan queue:work --tries=3 --timeout=30   (worker en proceso separado, paralelismo real de infra)
```

`Octane::concurrently()` (tareas concurrentes dentro de un mismo request) **requiere especificamente Swoole u Open Swoole** — no funciona con FrankenPHP ni RoadRunner, confirmado textualmente contra `laravel.com/docs/13.x/octane` ("This feature requires Swoole"). Advertencia de la doc oficial: con Octane la app se mantiene en memoria entre requests, asi que inyectar el contenedor o el `Request` en constructores de singletons produce fugas de memoria y estado corrompido entre requests distintos.

**Testing** — PHPUnit con `RefreshDatabase` (ejecuta cada test en una transaccion, no remigra si el esquema ya esta al dia — cita textual de `laravel.com/docs/13.x/database-testing`):

```php
// tests/Feature/PedidoApiTest.php
class PedidoApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_usuario_autenticado_puede_crear_un_pedido(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->postJson('/api/pedidos', ['cliente_id' => $user->id, 'total' => 250.50]);
        $response->assertStatus(201)->assertJsonFragment(['total' => '250.50']);
        $this->assertDatabaseHas('pedidos', ['cliente_id' => $user->id, 'total' => 250.50]);
    }

    public function test_devuelve_404_si_el_pedido_no_existe(): void
    {
        $user = User::factory()->create();
        $response = $this->actingAs($user)->getJson('/api/pedidos/9999');
        $response->assertStatus(404)->assertJsonPath('error.codigo', 'PEDIDO_NO_ENCONTRADO');
    }
}
```

**Estructura de proyecto** (verificada contra `laravel.com/docs/13.x/structure`, no interpolada — varios subdirectorios de `app/` no existen por defecto, se crean bajo demanda con Artisan):

```
app/
  Http/Controllers/, Http/Requests/    # Form Requests
  Models/                              # Eloquent models
  Jobs/                                # no existe por defecto, "php artisan make:job"
  Exceptions/                          # excepciones custom, "php artisan make:exception"
bootstrap/app.php                      # incluye ->withExceptions()
routes/
  api.php                              # opcional, "php artisan install:api" lo crea
tests/
  Feature/  Unit/
```

### Ruby — Ruby on Rails (modo API)

Version verificada: Ruby 4.0.6 es la version estable actual (`ruby-lang.org/en/downloads`), coexistiendo en mantenimiento activo con 3.4.10 y 3.3.12 — patron normal de Ruby de soportar varias series en paralelo. Rails 8.1 (build v8.1.3.1, cita textual de `guides.rubyonrails.org`). Desde Rails 8.0, **Solid Queue** (backend por base de datos, sin Redis) es el adapter por defecto de ActiveJob.

```ruby
# Generado con: rails new pedidos_api --api --database=postgresql
# El flag --api hace que ApplicationController herede de ActionController::API,
# omite vistas/helpers/assets y reduce el stack de middleware.

# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from ActiveRecord::RecordInvalid, with: :render_unprocessable_entity

  private

  def render_not_found(exception)
    render json: { error: { code: "not_found", message: exception.message } }, status: :not_found
  end

  def render_unprocessable_entity(exception)
    render json: { error: { code: "unprocessable_entity", message: exception.record.errors.full_messages } }, status: :unprocessable_entity
  end
end

# app/models/pedido.rb
class Pedido < ApplicationRecord
  validates :cliente_nombre, presence: true
  validates :total, numericality: { greater_than: 0 }
end

# app/controllers/pedidos_controller.rb
class PedidosController < ApplicationController
  def create
    pedido = Pedido.new(pedido_params)
    pedido.save!
    render json: pedido, status: :created
  end

  def show
    render json: Pedido.find(params[:id]), status: :ok
  end

  private

  # params.expect confirmado como el patron actual de strong parameters en Rails 8.x
  def pedido_params
    params.expect(pedido: [:cliente_nombre, :total])
  end
end

# config/routes.rb
Rails.application.routes.draw do
  resources :pedidos, only: [:create, :show]
end
```

**Concurrencia idiomatica** — Puma (servidor por defecto) es threaded: cada request corre en su propio thread con su propia instancia de controller, compartiendo el espacio de proceso (confirmado contra `guides.rubyonrails.org/threading_and_code_execution.html`). Para trabajo pesado, el patron idiomatico es delegar a **ActiveJob**, no bloquear el request thread:

```ruby
# app/jobs/procesar_pedido_job.rb
class ProcesarPedidoJob < ApplicationJob
  queue_as :default
  retry_on ActiveRecord::Deadlocked, wait: 5.seconds, attempts: 3

  def perform(pedido_id)
    pedido = Pedido.find(pedido_id)
    pedido.update!(estado: "confirmado")
  end
end

# Uso desde el controller -- responde de inmediato, sin esperar el procesamiento:
ProcesarPedidoJob.perform_later(pedido.id)
```

Nota de vigencia: Ractor (paralelismo sin GVL compartido) no se verifico contra `ruby-lang.org` en esta pasada — la guia oficial de threading de Rails es agnostica a ese nivel de concurrencia de Ruby. No usar Ractor como recomendacion sin verificacion adicional; el patron dominante confirmado en Rails es Puma (I/O via threads) + ActiveJob (paralelismo de trabajo pesado via workers separados).

**Testing** — **Minitest es el framework oficial por defecto** (cita textual: "the default testing library used by Rails" de `guides.rubyonrails.org/testing.html`, la guia no menciona RSpec en ningun punto — su popularidad en la comunidad es conocimiento general, no verificado contra esta fuente):

```ruby
# test/integration/pedidos_api_test.rb (Minitest, ActionDispatch::IntegrationTest)
class PedidosApiTest < ActionDispatch::IntegrationTest
  test "POST /pedidos crea un pedido y responde 201" do
    post "/pedidos", params: { pedido: { cliente_nombre: "Ana", total: 100.50 } }
    assert_response :created
    body = JSON.parse(response.body)
    assert_equal "Ana", body["cliente_nombre"]
  end

  test "GET /pedidos/:id responde 404 si no existe" do
    get "/pedidos/999999"
    assert_response :not_found
  end
end
```

Equivalente en RSpec (patron de comunidad ampliamente adoptado, requiere la gema `rspec-rails`, no documentado en la guia oficial):

```ruby
RSpec.describe "POST /pedidos", type: :request do
  it "crea un pedido y responde 201" do
    post "/pedidos", params: { pedido: { cliente_nombre: "Ana", total: 100.50 } }
    expect(response).to have_http_status(:created)
  end
end
```

**Estructura de proyecto** generada por `rails new pedidos_api --api` (sin `app/views`, `app/helpers`, `app/assets` propios de una app web tradicional):

```
app/
  controllers/  jobs/  models/
config/
  queue.yml          # config de Solid Queue (Rails 8.0+)
test/                # Minitest por defecto
  integration/  models/
spec/                # solo si se agrega rspec-rails, no default
```
