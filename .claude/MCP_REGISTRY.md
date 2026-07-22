# Registro de Evaluaciones MCP

Registro de servidores MCP de terceros evaluados antes de instalacion en ai-core. Ver protocolo en `.claude/agents/mcp-registry-navigator.md` (o skill equivalente).

| Fecha | MCP | Repositorio | Total (0-10) | Decision | Notas |
|---|---|---|---|---|---|
| 2026-07-22 | codebase-memory-mcp | https://github.com/DeusData/codebase-memory-mcp | 8/10 | DESCARTADO | Legitimo (organicidad confirmada: mantenedor real Martin Vogel/Berlin, actividad HN, issues sustantivos, CI/tests reales). Redundante con vault BM25+ solo en superficie — hace indexacion estructural AST via tree-sitter (complementario, no redundante). Descartado por decision del usuario: (1) riesgo operativo concreto ya documentado en issue upstream #1200 (instalador sobrescribe config/hooks en 43 clientes auto-detectados, choca con `hooks-definition.js` como fuente unica de verdad); (2) binario nativo C fuera del stack Node.js declarado, sin capacidad propia de parchear/debuggear; (3) sin necesidad activa que lo justifique hoy — el vault BM25+ ya cubre memoria semantica entre sesiones; (4) auditoria de seguridad de inputs incompleta (`store/`/`discover/` sin revisar, riesgo de path traversal). Reabrir solo si surge una necesidad concreta de indexacion estructural de codigo (AST/call-graphs), y solo tras completar la auditoria de esos dos modulos. |

