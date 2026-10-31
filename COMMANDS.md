# OPERATIONAL COMMAND REGISTRY

## command: benchmark
- Syntax: ai-core benchmark --suite=<name>
- Preconditions: npm run build passes with 0 errors.
- Side-effects: Emits telemetry to .harness/benchmark_results.json.

## command: audit-node
- Syntax: ai-core audit --nid=<id>
- Behavior: Spawns Antithesis agent, generates <nid>.adversary.spec.ts, executes runner.

## command: session-commit
- Syntax: ai-core session --commit
- Behavior: Extrae las acciones de la sesión activa y actualiza STATE.md.
- Output format:
  1. DONE: Nodos (#NID) o tareas completadas.
  2. LEARN: Decisiones arquitectónicas (ADRs) consolidadas para MEMORY.md.
  3. PENDING: Tareas fuera de alcance actual o bloqueos.
