'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ADAPTERS } = require('./adapters');
const { PARSERS } = require('./parsers');

function resolveCommand(adapter, task, model, resumeId) {
  const args = adapter.args(task.prompt, model, resumeId);
  if (!args) return null;
  return adapter.bin ? { bin: adapter.bin, args } : { bin: args[0], args: args.slice(1) };
}

function execute(cmd, cwd, timeoutMs, extraEnv = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd.bin, cmd.args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...extraEnv } });
  return { r, wallMs: Date.now() - t0 };
}

// Una corrida aislada: fixture nuevo, arnes instalado, agente, verificador
function runOne({ adapterName, task, model, timeoutMs }) {
  const adapter = ADAPTERS[adapterName];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `bench-${task.id}-`));
  try {
    task.build(dir);
    adapter.setup(dir);
    const cmd = resolveCommand(adapter, task, model);
    if (!cmd) return { skipped: true, reason: `${adapter.envVar} no definido` };
    const { r, wallMs } = execute(cmd, dir, timeoutMs, adapter.env ? adapter.env() : {});
    const usage = PARSERS[adapter.parser](r.stdout || '');
    const timedOut = Boolean(r.error && r.error.code === 'ETIMEDOUT');
    const verdict = task.verify(dir, usage);
    // Un error del arnes (login, cuota) invalida la corrida: no es un fallo de la tarea
    const invalid = Boolean(usage.error);
    return { ...usage, wallMs, timedOut, invalid, pass: verdict.pass && !timedOut && !invalid, detail: verdict.detail };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runOne, resolveCommand, execute };
