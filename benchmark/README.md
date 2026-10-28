# Benchmark de arneses de agentes

Mide costo, tiempo y tasa de exito de un arnes de agente sobre las mismas tareas, con el mismo modelo y verificacion automatica. Sin dependencias (Node >= 22).

## Principios de validez
- Mismo modelo en todos los arneses (`--model`), declarado en el resultado.
- Cada corrida usa un fixture nuevo en un directorio temporal; el agente no ve la solucion.
- El exito lo decide un verificador determinista (tests o comparacion exacta), nunca el propio agente.
- N repeticiones (`--reps`, por defecto 3); se reporta mediana y rango intercuartil, no un unico valor.
- Los verificadores se prueban contra una solucion de referencia (`npm test`).
- Un arnes cuyo comando no esta verificado contra su documentacion oficial no corre sin `--allow-unverified`.

## Tareas
| Id | Categoria | Que mide |
|---|---|---|
| bugfix-paginate | diagnostico | localizar y corregir un off-by-one |
| feature-lru | implementacion | implementar una clase desde tests |
| refactor-rename | refactor | renombrar en 4 archivos sin dejar rastro |
| log-analysis | lectura-masiva | extraer un dato de un log de 3000 lineas |
| security-sqli | seguridad | corregir SQL injection |
| multifile-config | multi-archivo | cambio consistente en codigo y docs |

## Arneses
| Nombre | Estado | Notas |
|---|---|---|
| claude-vanilla | verificado | `claude -p` en directorio vacio, linea base sin arnes |
| ai-core | verificado | copia `.claude/` y `CLAUDE.md` al fixture |
| hermes | comando a definir | Nous Research, `NousResearch/hermes-agent`; definir `HERMES_CMD_JSON` |
| openclaw | comando a definir | repo `openclaw/openclaw` sin confirmar en fuente primaria; definir `OPENCLAW_CMD_JSON` |

Los arneses externos se configuran con un arreglo JSON donde `{prompt}` es un unico argumento:
`export HERMES_CMD_JSON='["hermes","<subcomando-headless>","{prompt}"]'`
Solo se mide tiempo y exito en ellos hasta verificar un formato de uso de tokens; el costo queda en `n/d`.

## Uso
```
npm test                                        # valida verificadores y utilidades
node run.js --tasks bugfix-paginate --reps 1    # prueba de humo
node run.js                                     # claude-vanilla vs ai-core, 3 reps
node run.js --adapters claude-vanilla,ai-core,hermes --allow-unverified
```
Salida: `results/run-<fecha>.json` (crudo) y `.md` (tabla). El primer arnes de `--adapters` es la linea base; delta negativo es ahorro.

## Limitaciones conocidas
- Tareas pequenas: miden sobrecosto fijo del arnes mas que razonamiento en proyectos grandes.
- `--bare` no se usa: exige `ANTHROPIC_API_KEY` y falla con login OAuth. El aislamiento es `--setting-sources project,local` en ambos arneses.
- Corridas con error del arnes (login, cuota) se marcan invalidas y no cuentan como fallo.
- Con modelos distintos entre arneses la comparacion de costo deja de ser valida.

## Modo sesion larga
`node run.js --session` encadena las 6 tareas como turnos de una misma conversacion (`--resume`) en un unico directorio. Reporta costo y tiempo acumulados por turno y el turno de cruce, donde el arnes pasa a costar menos que la linea base. Es la prueba pertinente para un arnes: el sobrecosto fijo se amortiza solo si la sesion es larga.
Supuesto por verificar: que `total_cost_usd` de cada invocacion con `--resume` sea el costo de ese turno y no un acumulado; si fuera acumulado, el costo total se sobrestima.
`--long` amplia la sesion a 16 turnos: rendimiento, 6 preguntas de recuerdo y 4 reglas de gobernanza al final.

## Resultados e informe
`INFORME.md` resume la version publicada con cifras y limites; `REPRODUCE.md` explica como repetirla con commits fijos. En `results/` solo se versionan las corridas validas citadas en el informe. Una corrida con `--bare` (sin sesion iniciada) y una sesion de una sola repeticion se descartaron y no se suben.
