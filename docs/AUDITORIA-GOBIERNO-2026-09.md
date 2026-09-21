# Auditoria de gobierno, coherencia, alcance y estabilidad — AI-CORE v3.40.1

Fecha: 2026-09-21. Alcance: hooks, permisos, skills, agentes, tests y comparacion con arneses del mercado. Documento interno.

## 1. Estado medido (verificable con los comandos indicados)

| Dimension | Resultado | Comando |
|---|---|---|
| Suite de tests | 1414 tests, 1413 pass, 0 fail, 1 skip | `npm test` |
| Conformidad de skills | 45/45, 0 criticos, 0 altos | `npm run validate-globals` |
| Vigencia de mercado | sin hallazgos STALE, 45/45 skills con dominio registrado | `npm run audit-market -- --only-stale` |
| Hooks activos | 45 (PreToolUse 22, PostToolUse 9, Stop 5, SubagentStop 5, UserPromptSubmit 4, PostToolUseFailure 4) | `.claude/settings.json` |
| Codigo fuente sobre 300 lineas | 0 archivos (antes: 5) | `wc -l` sobre `.js` |
| Definicion de hooks | una sola fuente (`hooks-definition.js`), salida byte a byte identica tras la division | comparacion contra baseline |
| Permisos base | una sola fuente (`lib/base-permissions.js`), antes duplicada en dos scripts | `setup-settings.js`, `norm-harness.js` |

## 2. Hallazgos corregidos en esta pasada

1. Test de `issue-reporter` fallaba en macOS/Linux: el fake `gh` copiaba `process.execPath`, y el node de Homebrew esta enlazado dinamicamente (`@rpath/libnode`), por lo que mover el binario lo rompe. Ahora es un wrapper `sh`. Sin cambio en el script bajo prueba.
2. Emoji literal en `CHANGELOG.md` (violacion de la regla critica 1), reemplazado por texto.
3. Cinco archivos `.js` sobre el limite de 300 lineas: `mcp-anthropic.js`, `issue-reporter.js`, `destructive-op-guard.js`, `norm-harness.js`, `hooks-definition.js`. Division en modulos por responsabilidad, sin cambio de comportamiento.
4. Duplicacion de listas de permisos entre `setup-settings.js` y `norm-harness.js` (riesgo de drift silencioso): unificada.
5. Vigencia: `ciso` y `product-lifecycle-orchestrator` no tenian dominio en `MARKET_STANDARDS.json`.
6. Error propio detectado y corregido durante la verificacion: la extraccion de `norm-harness.js` dejo `ensureHostClaude` y `ensureHostGitignore` sin exportar, lo que rompia 12 tests. La suite completa lo detecto antes de cerrar.

## 3. Brechas (G1, G6, G11 y G17 resueltas; el resto requiere ejecucion)

| Id | Brecha | Evidencia | Propuesta |
|---|---|---|---|
| G1 | RESUELTA. `Bash(git push*)` se mantiene en `allow` por decision del usuario; la publicacion queda condicionada al marco de calidad via hook git `.githooks/pre-push` (`scripts/quality-gate.js`). El bypass del hook esta bajo break-glass. | `npm run quality-gate`, regla 11 de Gobierno en CLAUDE.md | Ninguna |
| G2 | `permissions.deny` y `permissions.ask` vacios: todo el control preventivo depende de hooks, ninguno de permisos declarativos | `settings.json` | Definir `deny` para rutas sensibles (`.env*`, claves) como segunda capa independiente de los hooks |
| G3 | Sin clave `sandbox` nativa de Claude Code en settings | `settings.json` | Verificar contra code.claude.com/docs antes de activar; complementa a `npm run sandbox` (Docker) |
| G4 | 5 SKILL.md superan 500 lineas (backend-architect 1698, tech-lead-frontend 1088, web-scraping-specialist 1006, ux-visual-designer 626, mcp-server-builder 606). agentskills.io recomienda menos de 500 lineas y detalle en `references/` (divulgacion progresiva) | `wc -l` | Dividir en SKILL.md (nucleo + indice) y `references/*.md`. CLAUDE.md exime hoy a los `.md`; enmendar esa exencion |
| G5 | Campos `origin`, `version`, `last_updated`, `rol` fuera de `metadata` en el frontmatter. La especificacion define `metadata` como mapa string a string para campos propios | spec agentskills.io | Migrar bajo `metadata` y ajustar `validate-globals`, `audit-market` y evals |
| G6 | RESUELTA. Los 5 tests se dividieron por describe en 12 archivos (todos bajo 300 lineas; conteo de tests preservado; 1446 en total tras G11). El limite se hace cumplir ahora tambien en pre-push. | `quality-gate.js --fast` | Ninguna |
| G7 | Log de auditoria (`BREAK_GLASS_LOG.jsonl`, metricas) sin cadena de hash ni exportacion estandar | inspeccion | Cadena de hash por entrada (evidencia de manipulacion) y exportacion OpenTelemetry opcional |
| G8 | Sin escaner de contenido de skills al instalarse o modificarse | no existe hook | Escaner estatico (patrones de inyeccion, exfiltracion, comandos destructivos) como PostToolUse sobre `.claude/skills/**` |
| G9 | Escrituras a memoria y skills sin compuerta de aprobacion | `agent-snapshot` respalda pero no pide confirmacion | Compuerta tipo break-glass para escrituras del hilo principal en `.claude/skills/**` y vault |
| G10 | 6 dominios cerca del umbral de vigencia (mcp-protocol a 55 dias; cinco dominios de 2026-08-04 a 48 dias) | `audit-market` | Reverificar contra fuentes primarias antes de que venzan |
| G11 | RESUELTA. `web-search-guard.js` y `guard-read.js` denegaban la tool nativa aunque el bridge respondiera 429. `scripts/mcp-gemini.js` escribe ahora un marcador con TTL de 10 min (`lib/gemini-cuota.js`) ante 429/RESOURCE_EXHAUSTED y ambos guards degradan a la tool nativa mientras este vigente. Verificado bajo el Node Permission Model real (perfil `repoReadWriteCuota`) | 10 tests en `gemini-cuota-guards-degradacion.test.js` | Ninguna. Abierto: evaluar proveedor alterno para `buscar_web` |
| G12 | `mcpServers` dentro de `settings.json` no carga los servidores; la ubicacion efectiva es `.mcp.json` o `~/.claude.json` (inferido, sin verificar en documentacion). `setup-settings.js` y `norm-harness.js` generan una clave sin efecto y `health-check.js` la lee | vault, sesion 2026-09-20 | Verificar en fuente primaria y generar `.mcp.json` desde un modulo compartido (patron `hooks-definition.js`); ajustar `health-check.js` y tests |
| G13 | Identidad git sin configurar en el repo: los commits de `ai-core/checkpoints` salieron con email de maquina, contra la regla de commits. La identidad depende de un paso manual y nada la verifica | `git log ai-core/checkpoints` | `setup-settings`/`norm-harness` fijan identidad local solo si esta vacia; `.githooks/commit-msg` (rechaza `Co-Authored-By` y menciones a IA) y `pre-commit` (identidad valida): control determinista tambien para commits humanos |
| G14 | `destructive-op-guard` bloquea texto literal dentro de argumentos (un script con la cadena del bypass del hook pre-push fue denegado aunque no ejecutaba nada) | sesion 2026-09-20 | Evaluar ignorar cuerpos de heredoc y argumentos de `node -e`; riesgo de abrir evasiones, exige tests adversariales. Alternativa: dejar como esta y escribir scripts con Write |
| G15 | Cifras fijas en CLAUDE.md quedan obsoletas sin aviso: decia 11 reglas break-glass cuando el codigo tenia 12 y hoy son 13; conteo de tests y de skills igual | `grep -c "breakGlass: true"` | Test que compare las cifras de CLAUDE.md contra el codigo (reglas break-glass, skills, agentes), o eliminar las cifras |
| G16 | El gate no cubre: archivos residuales (`*.new`, `*.orig`), secretos en el working tree, ni el limite de 500 lineas de SKILL.md (pendiente de G4) | `.new` residuales detectados al inicio de la sesion | Agregar los tres checks a `quality-gate.js` (el de SKILL.md solo tras completar G4) |
| G17 | RESUELTA. Los hooks de `UserPromptSubmit` leian el texto del usuario de `prompt_text` o `CLAUDE_USER_PROMPT`; Claude Code envia el campo `prompt` y nunca establece esa variable. `jailbreak-guard`, `secrets-guard`, `detect-role` y `moa-context-gatherer` recibian cadena vacia: no bloqueaban nada y `CONFIRMAR-<id>` jamas llegaba al break-glass, por lo que ninguna operacion de alto nivel se podia autorizar. Los tests pasaban porque inyectaban `CLAUDE_USER_PROMPT` o `prompt_text`, rutas inexistentes en produccion | captura real del payload con `claude -p --settings` | `lib/hook-stdin.js` expone `extraerPrompt`/`leerPromptDeUsuario` (lee `prompt`); 4 consumidores migrados; 9 tests con el payload real incluido el flujo bloqueo, confirmacion, reintento unico y log. Tests aislados del tmpdir real de break-glass. Pendiente: verificar con captura real los campos de SubagentStop, Stop y PostToolUseFailure |

## 4. Comparacion con arneses del mercado

La comparacion proviene de investigacion web asistida. Lo no confirmado contra fuente primaria esta rotulado.

| Capacidad | AI-CORE | Mercado | Estado |
|---|---|---|---|
| Control preventivo local (hooks bloqueantes, break-glass de un solo uso con TTL y registro) | 45 hooks, 13 reglas con break-glass, hard-stops sin excepcion | Codex CLI, Gemini CLI y Claude Code lideran en control local | Al nivel |
| Modos de aprobacion configurables por usuario | Fijos por hook; no hay modo `smart/manual/off` | Hermes: `smart`, `manual`, `off`, politica `cron_mode: deny` (segun investigacion, no verificado en fuente primaria) | Brecha menor |
| Evals de skills | promptfoo 45/45 | No confirmado en otros arneses | Diferenciador |
| Observabilidad estructurada | Metricas propias en JSON | OpenHands lidera con OpenTelemetry | Brecha (G7) |
| Escaner de skills | No existe | Hermes: Skills Guard (segun investigacion) | Brecha (G8) |
| Telemetria y curacion de skills | `validate-globals`, `audit-market`, `eval-skills` | Hermes: Curator con telemetria de uso (segun investigacion) | Parcial |
| Aprobacion de escritura a memoria/skills | Snapshot y checkpoint, sin compuerta | Hermes: aprobacion de escritura | Brecha (G9) |
| Sandbox | Docker opcional; sin sandbox nativo activo | Varios arneses con sandbox por defecto | Brecha (G3) |
| Cumplimiento del estandar de skills | Conforme en campos obligatorios; 5 skills sobre 500 lineas; campos propios fuera de `metadata` | agentskills.io | Parcial (G4, G5) |

## 5. Escalabilidad y estabilidad

- Modularidad restaurada: ningun `.js` de codigo sobre 300 lineas. Cada evento de hook tiene su modulo (`lib/hooks-events-*.js`) y los perfiles de permiso Node estan aislados en `lib/hooks-permissions.js`. Agregar un hook sigue siendo editar un solo modulo de evento.
- Riesgo de estabilidad principal detectado: divisiones de modulos con dependencias implicitas (ocurrio con `norm-harness`). Mitigacion vigente: la suite de 1425 tests lo capturo. Recomendacion: mantener `npm test` como paso obligatorio tras cualquier extraccion.
- Riesgo de escala: 45 hooks en cada evento de herramienta agregan latencia por invocacion (un proceso Node por hook). No medido en esta pasada; se recomienda medir antes de agregar hooks nuevos.

## 6. Orden de ejecucion recomendado

Resueltas: G1, G6. Siguientes, en este orden:

1. G11 (desbloquea la investigacion web y con ella G2, G3 y G10; bajo esfuerzo).
2. G13 y G15 (controles deterministas baratos; cierran deriva de identidad y de cifras).
3. G2 y G3 (requieren verificar sintaxis contra code.claude.com/docs antes de escribir; depende de G11 o de cuota Gemini).
4. G10 con fecha limite: `mcp-protocol` vence alrededor de 2026-09-25 y `ai-core-internal-governance` alrededor de 2026-10-02.
5. G4 y G5 (calidad de skills; mayor esfuerzo, por skill con `npm run eval-skills` y `validate-globals` como red; luego G16 para el limite de 500 lineas).
6. G12, G8, G9, G7 (paridad con el mercado y generacion correcta de MCP).
7. G14 solo si la friccion se repite.

Nota: las fechas escritas por las herramientas usan UTC; la fecha local puede ir un dia atras.
