# BACKLOG — ai-core

Este archivo registra hallazgos de auditorias, deuda tecnica detectada y estados de infraestructura relevantes para el Proyecto Anfitrion. Uso OBLIGATORIO de tabla Markdown con las siguientes columnas exactas.

| #Tarea | Notas reunión con Sara | cTipo | Descripción | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquía | Estimación | Planner | Compromiso |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | OAuth2 bloqueante en CLI. NotebookLM cubre el caso de uso. Service Account como alternativa futura (Tarea 2). | Infra | Nodo RAG: Integración Google Drive (MCP). Cancelado por incompatibilidad estructural del flujo OAuth2 interactivo con entornos CLI-first. | Andrew | 2026-03-23 | 2026-03-24 | Cancelado | Alta | 2h | N/A | Core |
| 2 | Alternativa a Tarea 1. Elimina OAuth interactivo usando credencial de servicio. | Infra | Evaluar integración RAG via Service Account de Google (sin OAuth interactivo) para acceso automatizado a documentos Drive en pipelines CI/CD. | TBD | Pendiente | Pendiente | Pendiente | Baja | TBD | N/A | Backlog |
