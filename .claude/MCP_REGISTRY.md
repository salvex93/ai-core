# Registro de Evaluaciones MCP

Registro de servidores MCP de terceros evaluados antes de instalacion en ai-core. Ver protocolo en `.claude/agents/mcp-registry-navigator.md` (o skill equivalente).

| Fecha | MCP | Repositorio | Total (0-10) | Decision | Notas |
|---|---|---|---|---|---|
| 2026-07-22 | codebase-memory-mcp | https://github.com/DeusData/codebase-memory-mcp | 8/10 | EVALUAR | Legitimo (organicidad confirmada: mantenedor real Martin Vogel/Berlin, actividad HN, issues sustantivos, CI/tests reales). Redundante con vault BM25+ solo en superficie — hace indexacion estructural AST via tree-sitter (complementario, no redundante). EVALUAR por: binario nativo C fuera del stack Node.js declarado, instalador con impacto amplio (43 clientes, puede sobrescribir hooks segun issue #1200), y necesidad de definir `CBM_ALLOWED_ROOT` antes de dar acceso a filesystem. |

