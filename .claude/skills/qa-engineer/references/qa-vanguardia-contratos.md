## Modulo — Estrategia de Testing de Vanguardia y Contract Testing Verificable

### Principio fundamental

Una suite de tests que pasa en verde pero no detecta una regresion real de contrato entre servicios no cumple el objetivo. El liston es que la piramide de testing sea una decision deliberada por capa de riesgo — no una plantilla de `it('deberia funcionar')` copiada del scaffold del framework. Si no se puede declarar en una frase que riesgo de negocio especifico cubre cada capa de la piramide, la estrategia no esta lista.

### Identidad de testing — declarar antes de escribir la suite

Igual que otros perfiles de este ecosistema exigen declarar una identidad antes de producir output, ninguna estrategia de testing se implementa sin declarar primero:

```
IDENTIDAD DE TESTING:
  Perfil de riesgo: [transaccional/financiero — cero tolerancia a regresion | contenido/CRUD estandar | interno/herramienta de bajo impacto]
  Contrato critico: [endpoint(s) o evento(s) consumidos por servicios externos, o "ninguno" si es monolito cerrado]
  Punto de fallo historico: [una linea — que parte del sistema ya rompio produccion antes, o "sin incidente registrado"]
  Gate de bloqueo de PR: [cobertura minima + contract test + que mas bloquea merge]
```

Si el proyecto no tiene un punto de fallo historico documentado, no inventar uno — declarar "sin incidente registrado" y proponer la primera capa de contract testing sobre el contrato de mayor riesgo detectado en el manifiesto del anfitrion.

### Prohibido — patrones reconocibles de suite de plantilla

- Tests que llaman la funcion pero no hacen ninguna asercion sobre el resultado (`expect(true).toBe(true)` o ausencia total de `expect`/`assert`), inflando cobertura sin verificar comportamiento.
- Mock de la propia base de datos en un test etiquetado como "integracion" — el nombre promete lo que el mock no cumple.
- Snapshot testing usado como sustituto de aserciones especificas (`expect(resultado).toMatchSnapshot()` sobre un objeto completo, sin que nadie revise el diff en cada PR).
- Suite E2E que reconstruye toda la logica de negocio con datos hardcodeados en vez de usar factories, duplicando el acoplamiento que el contract testing deberia evitar.
- Test de contrato que solo verifica el codigo de estado HTTP (`expect(res.status).toBe(200)`) sin validar el schema real del payload — no detecta un campo removido o renombrado.
- `describe.skip` o `it.skip` acumulados sin ticket de seguimiento, tratados como "temporalmente desactivado" durante meses.

### Vigencia — estandar mas reciente del dominio

Verificado contra fuente oficial el 2026-09-21: la especificacion OpenAPI vigente es la version 3.2.1 (patch publicado el 2026-09-10 en `spec.openapis.org/oas/v3.2.1.html`) sobre la 3.2.0 del 2025-09-23 (`openapis.org/blog`). La 3.2.0 es una release menor sin cambios que rompan compatibilidad respecto a 3.1 — cualquier contract testing basado en validacion de schema OpenAPI puede seguir usando specs 3.1 existentes sin migracion obligatoria. Antes de fijar una version de spec como requisito de un contrato nuevo, confirmar contra ese dominio oficial si aplica una version mas reciente al momento de la implementacion.

Sobre la version exacta de Pact/Pact Specification vigente para cada lenguaje (Pact JS, pact-python, Pact JVM) y el detalle de PactFlow como servicio de broker gestionado: orientativo, no verificado contra fuente oficial en esta sesion — confirmar version exacta en `docs.pact.io` antes de fijarla como dependencia en un `package.json` o manifiesto equivalente, en vez de asumir la version mencionada en blogs de terceros.
