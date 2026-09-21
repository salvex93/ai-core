## Modulo de Testing Backend — Unitarios e Integracion

### Principio fundamental

Todo modulo de backend que se entrega sin tests es deuda tecnica inmediata. Este modulo define que testear, como estructurarlo y que herramientas usar segun el stack detectado en el anfitrion.

### Piramide de tests para backend

```
         /\
        /e2e\        Flujos completos sobre la app desplegada en staging.
       /------\      Pocos. Costosos. Solo flujos criticos de negocio.
      /integra \
     / cion     \    Endpoint completo + BD real + servicios externos mockeados.
    /------------\   Moderados. Cubren el contrato de la API y las transacciones.
   /    unit      \
  /                \ Logica de negocio pura en aislamiento.
 /------------------\ Muchos. Rapidos. Sin BD ni red.
```

| Tipo | Proporcion | Lo que cubre |
|---|---|---|
| Unit | 70% | Servicios, validadores, transformaciones, logica de dominio |
| Integracion | 25% | Endpoints HTTP completos, queries a BD real, transacciones |
| E2E | 5% | Flujos criticos sobre staging. No en CI de PR. |

### Herramientas por stack

| Stack | Unit | Integracion | BD en tests |
|---|---|---|---|
| Node.js / TypeScript | Vitest o Jest | Supertest + Vitest | PostgreSQL en Docker via testcontainers |
| Python | Pytest | Pytest + httpx | SQLAlchemy + pytest-asyncio + testcontainers |
| Go | testing + testify | net/http/httptest | testcontainers-go |
| Java / Kotlin | JUnit 5 + Mockito | Spring Boot Test | Testcontainers |

La herramienta exacta se deduce del `package.json` / `pyproject.toml` / `go.mod` del anfitrion. Si no existe configuracion de testing, proponer la de la tabla anterior.

### Tests unitarios de backend

**Que testear:**
- Servicios con logica de negocio (calculos, validaciones, transformaciones).
- Funciones de dominio puras.
- Middleware custom.
- Funciones de utilidad (formateo, hashing, generacion de tokens).

**Que NO testear con unit tests:**
- Queries SQL directas.
- Controladores sin logica propia.

```typescript
// Vitest — test unitario de servicio
import { describe, it, expect, vi } from 'vitest';
import { PedidoService } from './PedidoService';

const mockRepo = { guardar: vi.fn(), buscarPorId: vi.fn() };
const servicio = new PedidoService(mockRepo);

describe('PedidoService', () => {
  it('calcula el total con descuento correctamente', () => {
    const resultado = servicio.calcularTotal(
      [{ precio: 100, cantidad: 2 }, { precio: 50, cantidad: 1 }],
      { porcentaje: 10 }
    );
    expect(resultado).toBe(225);
  });

  it('lanza error si el pedido esta vacio', () => {
    expect(() => servicio.calcularTotal([], null)).toThrow('El pedido no puede estar vacio');
  });

  it('llama al repositorio con el pedido correcto al crear', async () => {
    mockRepo.guardar.mockResolvedValue({ id: 'uuid-1' });
    await servicio.crear({ items: [{ precio: 100, cantidad: 1 }] });
    expect(mockRepo.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ total: 100 })
    );
  });
});
```

```python
# Pytest — test unitario de servicio
import pytest
from unittest.mock import MagicMock
from services.pedido_service import PedidoService

@pytest.fixture
def servicio():
    return PedidoService(repositorio=MagicMock())

def test_calcula_total_con_descuento(servicio):
    items = [{"precio": 100, "cantidad": 2}, {"precio": 50, "cantidad": 1}]
    assert servicio.calcular_total(items, descuento=10) == 225

def test_lanza_error_pedido_vacio(servicio):
    with pytest.raises(ValueError, match="El pedido no puede estar vacio"):
        servicio.calcular_total([], descuento=0)
```

### Tests de integracion de backend

Los tests de integracion verifican el comportamiento completo: HTTP handler + servicio + repositorio + BD real. No se mockea la BD. Si el test usa mock de BD, es un test unitario del controlador, no de integracion.

```typescript
// Supertest + Vitest con BD real
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { db } from '../database';

beforeAll(async () => { await db.migrate.latest(); });
afterAll(async () => { await db.destroy(); });
beforeEach(async () => {
  await db('pedidos').truncate();
  await db('usuarios').truncate();
});

describe('POST /api/pedidos', () => {
  it('crea un pedido y devuelve 201 con id', async () => {
    const [usuario] = await db('usuarios').insert({ email: 'test@test.com' }).returning('*');
    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${generarToken(usuario.id)}`)
      .send({ items: [{ productoId: 'prod-1', cantidad: 2 }] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), total: expect.any(Number) });
    const enBD = await db('pedidos').where({ id: res.body.id }).first();
    expect(enBD).toBeDefined();
  });

  it('devuelve 400 si el cuerpo esta vacio', async () => {
    const res = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${generarToken('user-1')}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(app).post('/api/pedidos').send({ items: [] });
    expect(res.status).toBe(401);
  });
});
```

```python
# Pytest + SQLAlchemy con rollback por test
@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection)()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

async def test_crear_pedido_devuelve_201(client, db_session):
    response = await client.post("/api/pedidos", json={"items": [{"producto_id": "p1", "cantidad": 1}]})
    assert response.status_code == 201
    assert "id" in response.json()
```

### Estrategia de datos en tests de integracion

- Cada test crea sus propios datos y los limpia al terminar (truncate en `beforeEach` o rollback de transaccion).
- Prohibido depender del orden de ejecucion.
- Prohibido depender de datos residuales de otros tests.
- Datos de referencia inmutables (catalogos, roles): seeders ejecutados una vez al inicio de la suite.

### Nomenclatura de tests backend

```
[unidad]_[condicion]_[resultado esperado]

crearPedido_conItemsValidos_devuelve201ConId
crearPedido_sinAutenticacion_devuelve401
calcularTotal_conDescuentoMayorAlPrecio_lanzaErrorDeValidacion
```

### Cobertura minima obligatoria para backend

Objetivo AAA especifico de esta capa — el piso minimo orientativo agnostico de stack esta en `qa-engineer`. Usar esta tabla como meta; si el proyecto no puede alcanzarla aun, el minimo de `qa-engineer` es aceptable como punto de partida documentado.

| Capa | Umbral |
|---|---|
| Servicios / Logica de dominio | 90% de ramas |
| Middleware de autenticacion | 95% de ramas |
| Funciones de utilidad | 95% de ramas |
| Controladores / Routers | 80% (via integracion) |
| Repositorios / Queries | 70% (via integracion) |

### Lista de verificacion de PR — Tests Backend

- [ ] Toda funcion publica de servicio tiene al menos 1 test de camino feliz y 1 de error esperado.
- [ ] Tests de integracion usan BD real, no mock de repositorio.
- [ ] Cada test limpia sus propios datos.
- [ ] Tests no dependen del orden de ejecucion.
- [ ] Endpoints de autenticacion tienen tests de 401/403.
- [ ] Cobertura del modulo no baja del umbral acordado.
- [ ] Nombres de tests describen comportamiento, no implementacion.
- [ ] Cada hallazgo cita ruta relativa + numero de linea exacto.
- [ ] Si el cambio toca contratos/eventos/tiempo real: existe test de integracion especifico por cada umbral aplicable del "Gate de calidad medible" de la seccion "Vanguardia Backend" (ej. test de duplicados=0 con reintento simulado si hay Idempotency-Key en juego).
