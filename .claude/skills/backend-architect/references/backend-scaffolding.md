## Scaffolding de Proyecto Nuevo

Cuando la tarea es crear un servidor desde cero (sin manifiestos existentes), declarar el stack antes de emitir codigo. Si el usuario no lo especifica, preguntar antes de asumir:

- Runtime: Node.js/TypeScript (default), Python, Go, Rust, JVM.
- Base de datos: PostgreSQL (default), MySQL, MongoDB, SQLite.
- Autenticacion: JWT stateless (default), OAuth2, API Keys.

### Estructura base (Node.js + TypeScript + Express + Prisma)

```
src/
  config/           # env vars, constantes, configuracion de providers
  modules/
    auth/
      auth.controller.ts
      auth.service.ts
      auth.middleware.ts
    users/
      users.controller.ts
      users.service.ts
      users.repository.ts
  shared/
    errors/         # AppError, HttpException, codigos de error centralizados
    middleware/     # rate-limiting, cors, request-id, logger estructurado
    utils/          # pagination, fechas, validadores comunes
  database/
    client.ts       # instancia Prisma o pool de conexion
    migrations/     # archivos de migracion
  app.ts            # setup del framework, plugins, rutas
  server.ts         # entry point, manejo de senales SIGTERM/SIGINT
prisma/
  schema.prisma
docker-compose.yml
Dockerfile
.env.example
```

Para Python (FastAPI), Go, Rust o Java, la estructura equivalente se genera con los mismos principios de separacion por modulos y la misma jerarquia de capas — ver ejemplos de codigo real y estructura idiomatica por lenguaje en "Modulo — Backend en Go, Rust y Java/JVM".

### Orden de generacion para bootstrapping

1. `.env.example` — todas las variables requeridas, ninguna con valor real.
2. `docker-compose.yml` — motor de BD + app en red propia.
3. `Dockerfile` — multi-stage: etapa `build` con devDependencies, etapa `runtime` sin ellas.
4. Manifiesto de dependencias con versiones fijas.
5. Schema inicial del ORM con tabla `users` (id UUID, created_at, updated_at).
6. Middleware base: CORS, rate-limiting, request-id, logger JSON.
7. Modulo de autenticacion: registro, login, refresh, endpoint `/health`.
8. Primer modulo de dominio especifico del proyecto.

### Autenticacion JWT minima

- `access_token`: duracion corta (15 min), firmado con clave secreta de entorno.
- `refresh_token`: duracion larga (7 dias), almacenado en BD con hash bcrypt. Invalido al hacer logout.
- El middleware de autenticacion extrae el token de `Authorization: Bearer <token>`, verifica la firma y adjunta el payload a `req.user`. Rechaza con 401 si el token es invalido o expirado.
- No almacenar tokens en texto plano ni en logs.

### Escalamiento a OPUSPLAN en proyecto nuevo

Si el proyecto requiere multi-tenancy, sharding, event sourcing, o la autenticacion utiliza OAuth2/OIDC con providers externos, activar la directiva antes de emitir codigo:

```
[ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN]
```

---
