#!/usr/bin/env node
/**
 * setup-settings.js
 * Regenera .claude/settings.json con las rutas absolutas del repositorio actual.
 * Ejecutar tras clonar o mover el repositorio a una nueva ruta o equipo.
 * Compatible: Linux, macOS, Windows (WSL y nativo con Node >= 20).
 *
 * Uso: node .claude/bin/setup-settings.js
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { buildHooksSection } = require('./hooks-definition');
const { BASE_PERMISSIONS, AI_CORE_EXTRA_PERMISSIONS, DENY_PERMISSIONS } = require('./lib/base-permissions');
const { writeMcpJson } = require('./lib/mcp-config');

// AI_CORE_SETTINGS_TARGET_DIR permite regenerar settings.json/.mcp.json
// sobre una copia aislada del repo (tests) en vez del checkout real -- los
// hooks siguen apuntando a los scripts reales (BIN/SCRIPTS via __dirname),
// solo el DESTINO de escritura cambia (G26: evita mutar settings.json/
// .mcp.json/git-config reales durante ejecucion paralela de tests).
const REPO          = path.resolve(__dirname, '..', '..');
const TARGET_DIR     = process.env.AI_CORE_SETTINGS_TARGET_DIR || REPO;
const SETTINGS_PATH = path.join(TARGET_DIR, '.claude', 'settings.json');
const BIN           = path.join(REPO, '.claude', 'bin');
const SCRIPTS       = path.join(REPO, 'scripts');

// En Windows path.join genera backslashes — Claude Code necesita forward slashes.
function fwd(p) { return p.split(path.sep).join('/'); }

const bin     = (s) => `"${fwd(path.join(BIN, s))}"`;
const scripts = (s) => `"${fwd(path.join(SCRIPTS, s))}"`;

const settings = {
  skillListingBudgetFraction: 0.03,
  // Umbral de auto-compact nativo fijado explicitamente por debajo del
  // default de Claude Code (~95% de la ventana de contexto) -- confirmado
  // en investigacion de mercado (2026-09-01, gist comparativo de context
  // compaction entre Claude Code/Codex CLI/OpenCode/Amp) que el default
  // nativo "a menudo es demasiado tarde" segun feedback real de usuarios.
  // Compactar antes estira mas la cuota de sesion/semana de Claude Pro
  // (recurso mas escaso que tokens de API en este proyecto). Formato
  // documentado (code.claude.com/docs/en/model-config): numero absoluto de
  // tokens o sufijo "k"/"M". 85% de una ventana tipica de 200k ~= 170000.
  autoCompactWindow: 170000,
  permissions: {
    allow: [...BASE_PERMISSIONS, ...AI_CORE_EXTRA_PERMISSIONS],
    deny: [...DENY_PERMISSIONS],
  },
  hooks: buildHooksSection(bin, fwd(os.tmpdir())),
};

fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');

// mcpServers no tiene efecto dentro de settings.json (verificado contra
// code.claude.com/docs/en/mcp, 2026-09-22, hallazgo de gobierno G12) -- la
// unica ubicacion efectiva es .mcp.json (project scope) en la raiz del proyecto destino.
writeMcpJson(TARGET_DIR, REPO);

// Activa los hooks git versionados (calidad, mensaje, identidad) y fija la
// identidad de autor si falta. Solo cuando el TARGET es un checkout git
// propio; como submodulo de un anfitrion, o contra un destino aislado sin
// .git, no se toca ningun git config.
if (fs.existsSync(path.join(TARGET_DIR, '.git', 'config'))) {
  const r = require('child_process').spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: TARGET_DIR });
  console.log(`[setup-settings] core.hooksPath=.githooks ${r.status === 0 ? 'activo' : 'no pudo configurarse'}`);
  require('./lib/git-identity').asegurarIdentidad(TARGET_DIR);
}
console.log(`[setup-settings] settings.json actualizado — v3.10.0 hooks completos.`);
console.log(`[setup-settings] REPO: ${fwd(TARGET_DIR)}`);
console.log(`[setup-settings] Plataforma: ${os.platform()} | Node: ${process.version}`);
