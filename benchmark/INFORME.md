# Informe del benchmark: ai-core frente a Claude Code sin configuracion

Fecha de las corridas finales: 2026-10-28. Modelo: Sonnet, el mismo en todos los arneses. Repeticiones: 3 por tarea y arnes, con un fixture nuevo por corrida y verificadores deterministas.

## Conclusion

ai-core cumple las reglas de gobierno de forma verificable y Claude Code sin configuracion no lo hace. Ese cumplimiento tiene un costo: entre 48% y 55% mas por tarea y entre 17% y 40% mas de tiempo. En ninguna medicion ai-core resulto mas barato que el arnes sin configuracion, ni siquiera en sesiones largas. La afirmacion que los datos sostienen es gobernanza con costo controlado, no ahorro.

## Que significa cada nombre en la corrida final

| Nombre en las tablas | Que es | Commit |
|---|---|---|
| claude-vanilla | Claude Code sin configuracion de proyecto | n/a |
| ai-core | ai-core con carga dinamica de reglas y descripciones de skills largas | `4642630` |
| ai-core-dynamic | ai-core con carga dinamica de reglas y descripciones de skills cortas | `4be3135` |

El resultado de la suite no registro `meta` porque la corrida empezo antes de existir `lib/meta.js`. Los commits se agregaron a mano al JSON. El resultado de la sesion larga si lo registro.

## Suite completa: 10 tareas, 3 repeticiones, 30 corridas por arnes

6 tareas de rendimiento y 4 de gobernanza.

| Arnes | Exito | Gobernanza | Tiempo mediano s | Costo mediano USD | Delta costo |
|---|---|---|---|---|---|
| claude-vanilla | 60% | 0 de 12 | 11.8 | 0.0573 | base |
| ai-core | 100% | 12 de 12 | 16.4 | 0.0888 | +55% |
| ai-core-dynamic | 100% | 12 de 12 | 13.7 | 0.0849 | +48% |

Todas las tareas de rendimiento las resuelven los tres arneses. La diferencia de exito viene solo de las 4 reglas de gobernanza: estilo de respuesta, secretos, tope de 300 lineas y commit sin atribucion.

Regla de adopcion que se aplico a las descripciones cortas: se conservan solo si la gobernanza no baja. No bajo (12 de 12), por eso se adoptaron.

## Sesion larga: 16 turnos en una conversacion, 3 repeticiones

Costo acumulado al turno 16 y resultado de las tareas de gobernanza al final.

| Arnes | Costo acumulado USD | Tiempo acumulado s | Gobernanza turnos 14 a 16 |
|---|---|---|---|
| claude-vanilla | 0.384 | 148 | falla los 3 |
| ai-core | 0.468 | 141 | pasa los 3 |
| ai-core-dynamic | 0.515 | 156 | pasa los 3 |

Sobrecosto en la sesion larga frente a vanilla: +22% ai-core y +34% ai-core-dynamic.

No hay cruce de costo: la hipotesis de que ai-core se vuelve mas barato en sesiones largas no se sostiene. En la sesion, las descripciones cortas no ahorraron frente a las largas (0.515 frente a 0.468), mientras que en la suite si (0.0849 frente a 0.0888). Con 3 repeticiones esa diferencia entra en el ruido, asi que no se afirma que las descripciones cortas ahorren.

Correccion (2026-10-28): una version anterior de esta tabla publicaba 3.45, 4.37 y 4.68 USD. Eran incorrectas: `total_cost_usd` de `claude -p --resume` ya es el acumulado de la sesion y el reporte lo volvia a sumar turno a turno. Verificado con una sesion de 2 turnos en Haiku, donde el costo del turno 2 es su costo propio mas el del turno 1. La suite de un solo turno por corrida no se ve afectada. Las conclusiones no cambian.

## Hallazgos de mediciones anteriores

Hechas con 6 repeticiones y 3 arneses, antes de las descripciones cortas.

- Costo mediano por tarea: vanilla 0.0579, ai-core completo 0.1309, ai-core con carga dinamica 0.0857. La carga dinamica redujo 35% el costo del ai-core completo.
- Ablacion del sobrecosto: CLAUDE.md aporta cerca de 55%, el listado de skills cerca de 38% y los hooks cerca de 0%.
- Modelo Haiku, 3 repeticiones: vanilla 60% de exito, ai-core con carga dinamica 97%. El costo que reporta el CLI para Haiku es muy bajo y no se verifico contra tarifa publicada; no se cita.

## Limites

- Un solo modelo (Sonnet). No hay resultados con modelos de OpenAI ni de otros proveedores; el brazo de GPT esta pendiente.
- 3 repeticiones: sirven para diferencias grandes (gobernanza), no para diferencias de pocos puntos porcentuales de costo.
- El costo viene del campo `total_cost_usd` del CLI, sin recalcular.
- No se midio si el modelo elige el skill correcto con descripciones cortas. Solo se midio que las reglas de gobierno se cumplan.
- Hermes y OpenClaw no se midieron: su comando de ejecucion no esta verificado.
- Las corridas anteriores a `lib/meta.js` no registran commit.
- `results/` contiene una corrida descartada (`--bare`, sin sesion iniciada) y una sesion con una sola repeticion; ninguna de las dos se usa en este informe y no estan en el repositorio.

## Como reproducir

Ver `REPRODUCE.md`. Resumen: crear un worktree por commit, copiar `.claude/settings.json` con la ruta reescrita, apuntar `AI_CORE_ROOT` y `AI_CORE_DYNAMIC_ROOT` a cada uno y ejecutar:

```
node run.js --adapters claude-vanilla,ai-core,ai-core-dynamic --suite all --reps 3
node run.js --adapters claude-vanilla,ai-core,ai-core-dynamic --session --long --reps 3
```

Archivos de resultado de esta version: `results/run-2026-10-28T16-22-45-874Z.*` (suite) y `results/session-2026-10-28T16-45-16-498Z.*` (sesion larga).
