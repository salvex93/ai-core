#!/usr/bin/env node
// Por que: garantiza que el BACKLOG.md de 12 columnas exista en el proyecto anfitrion
// antes de que el agente inicie su sesion. Si el archivo no existe, los hallazgos de
// la sesion no tienen donde persistir y se pierden al cerrarla (Regla 7).

'use strict';

const fs   = require('fs');
const path = require('path');

// El nucleo vive como submodulo en .claude/ai-core/ del proyecto anfitrion.
// Dos niveles arriba desde scripts/ apunta a la raiz del anfitrion.
const HOST_ROOT    = path.resolve(__dirname, '../../');
const BACKLOG_PATH = path.join(HOST_ROOT, 'BACKLOG.md');
const PROJECT_NAME = path.basename(HOST_ROOT);
const TODAY        = new Date().toISOString().slice(0, 10);

const BACKLOG_TEMPLATE = `# BACKLOG — ${PROJECT_NAME}

Este archivo registra hallazgos de auditorias, deuda tecnica detectada y estados de infraestructura. Uso OBLIGATORIO de tabla Markdown con las siguientes columnas exactas.

| #Tarea | Notas / Contexto | cTipo | Descripción | Responsable | Fecha inicio (Real) | Fecha Fin (Real) | Estatus | Jerarquía | Estimación | Planner | Compromiso |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Generado automaticamente por el hook de sesion de ai-core | Chore | Inicializacion del BACKLOG.md por scripts/init-backlog.js | N/A | ${TODAY} | ${TODAY} | Terminado | Baja | 0h | N/A | Core |
`;

if (fs.existsSync(BACKLOG_PATH)) {
  process.stdout.write(`[Brain-Sync] BACKLOG.md detectado: ${BACKLOG_PATH}\n`);
} else {
  fs.writeFileSync(BACKLOG_PATH, BACKLOG_TEMPLATE, 'utf8');
  process.stdout.write(`[Brain-Sync] BACKLOG.md creado en: ${BACKLOG_PATH}\n`);
}
