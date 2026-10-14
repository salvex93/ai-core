## Modulo 6 — Tests Frontend

### Piramide de tests

```
        /e2e\        Flujos criticos (login, checkout) — Playwright. Pocos y estables.
       /------\
      /integra \     Componentes con DOM real + API mockeada — Testing Library + MSW.
     /----------\
    /    unit    \   Hooks, utils, stores — Vitest o Jest. Muchos y rapidos.
   /--------------\
```

### Tests de integracion — patron correcto

```typescript
// PROHIBIDO — test de implementacion interna
expect(wrapper.vm.isLoading).toBe(false);

// CORRECTO — test de comportamiento visible
expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
```

Mock de API con MSW:

```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/usuario/:id', ({ params }) => {
    return HttpResponse.json({ id: params.id, nombre: 'Ana Lopez', rol: 'admin' });
  })
);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Tests de accesibilidad automatizados

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

it('no tiene violaciones de accesibilidad', async () => {
  const { container } = render(<FormularioContacto />);
  expect(await axe(container)).toHaveNoViolations();
});
```

### Cobertura minima

Objetivo AAA especifico de frontend — el piso minimo orientativo agnostico de stack esta en `qa-engineer`. Usar esta tabla como meta; si el proyecto no puede alcanzarla aun, el minimo de `qa-engineer` es aceptable como punto de partida documentado.

| Capa | Umbral |
|---|---|
| Hooks y composables con logica | 90% |
| Funciones de utilidad | 95% |
| Componentes con formularios | 80% |
| Stores | 85% |

