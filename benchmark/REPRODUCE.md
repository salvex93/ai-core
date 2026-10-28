# Reproducir el benchmark

## Requisitos

- Node.js con `node:test` (la version usada queda en `meta.node` de cada resultado).
- Claude Code CLI autenticado (`claude --version`; la version queda en `meta.claude`).
- Costo real: cada corrida consume cuota o credito de la cuenta usada.

## Arneses medidos

| Nombre | Que es |
|---|---|
| `claude-vanilla` | Claude Code sin configuracion de proyecto |
| `ai-core` | ai-core desde `AI_CORE_ROOT` (por defecto, este repositorio) |
| `ai-core-dynamic` | ai-core desde `AI_CORE_DYNAMIC_ROOT` (por defecto, este repositorio) |
| `ai-core-dynamic-short` | ai-core-dynamic con descripciones de skills recortadas a la primera oracion |
| `ai-core-claudemd-min`, `ai-core-no-skills`, `ai-core-no-hooks` | ablaciones para atribuir costo por pieza |
| `hermes`, `openclaw` | sin comando verificado; requieren `--allow-unverified` y no hay resultados publicados |

Para comparar dos versiones de ai-core, crear un `git worktree` por commit, copiar a cada uno el
`.claude/settings.json` (esta ignorado por git) con la ruta reescrita al worktree, y apuntar
`AI_CORE_ROOT` y `AI_CORE_DYNAMIC_ROOT` a cada uno. Ver `meta.roots` en el resultado para el commit exacto.

## Comandos

```
cd benchmark
node --test test/lib.test.js test/tasks.test.js
node run.js --adapters claude-vanilla,ai-core --suite all --reps 3
node run.js --adapters claude-vanilla,ai-core --session --long --reps 3
node run.js --adapters claude-vanilla,ai-core --suite all --reps 3 --model haiku
```

## Que mide cada suite

- `performance`: 6 tareas de codigo con verificador determinista (corrige bug, funcionalidad, refactor, SQLi, multiarchivo, log).
- `governance`: 4 reglas verificables por script (estilo de respuesta, secretos, tope de 300 lineas, commit sin atribucion).
- `--session --long`: 16 turnos en una sola conversacion reanudada; incluye 6 preguntas de recuerdo.
- Cada resultado es la mediana de `--reps` repeticiones con un fixture nuevo por corrida.

## Limites conocidos

- El costo viene del campo `total_cost_usd` del CLI; no se recalcula con tarifas propias.
- Un fallo del arnes (no de la tarea) se marca `invalid` y se excluye de la tasa de exito.
- Un solo modelo (el indicado en `opts.model`); no hay resultados con modelos de otros proveedores.
- Las corridas de `ai-core` en versiones anteriores a `meta` no registran commit; se indica en el informe.
- `results/` conserva corridas descartadas; el informe indica cuales son validas.
