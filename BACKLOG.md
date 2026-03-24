# BACKLOG — ai-core

Este archivo registra hallazgos de auditorias, deuda tecnica detectada y estados de infraestructura relevantes para el Proyecto Anfitrion. Uso OBLIGATORIO de tabla Markdown con las siguientes columnas exactas.

| #Tarea | Notas / Contexto | cTipo | Descripción | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquía | Estimación | Planner | Compromiso |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | OAuth2 bloqueante en CLI. NotebookLM cubre el caso de uso. Service Account como alternativa futura (Tarea 2). | Infra | Nodo RAG: Integración Google Drive (MCP). Cancelado por incompatibilidad estructural del flujo OAuth2 interactivo con entornos CLI-first. | Andrew | 2026-03-23 | 2026-03-24 | Cancelado | Alta | 2h | N/A | Core |
| 2 | Alternativa a Tarea 1. Eliminada como prioritaria en auditoria 2026-03-24: introduce dependencias de Google Cloud IAM no justificadas para el caso de uso central del ai-core. | Infra | Evaluar integración RAG via Service Account de Google (sin OAuth interactivo). | TBD | Pendiente | 2026-03-24 | Cancelado | Baja | N/A | N/A | Backlog |
| 3 | Arquitectura alternativa recomendada en auditoria 2026-03-24. Sin OAuth, sin dependencia de Google, funciona offline y en entornos air-gapped. Requiere configurar MCP filesystem en el proyecto anfitrion y agregar DOCS_PATH al .env. | Infra | Implementar RAG local via servidor MCP filesystem (@modelcontextprotocol/server-filesystem) montado sobre directorio docs/ del proyecto anfitrion como alternativa primaria a NotebookLM para repositorios nuevos. | Andrew | Pendiente | Pendiente | Pendiente | Media | TBD | N/A | Core |
