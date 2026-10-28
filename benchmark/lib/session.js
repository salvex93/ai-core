'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ADAPTERS } = require('./adapters');
const { PARSERS } = require('./parsers');
const { resolveCommand, execute } = require('./runner');

// Orden fijo: la lectura masiva va a mitad de sesion para que el contexto ya venga cargado
const TURN_ORDER = ['bugfix-paginate', 'feature-lru', 'log-analysis', 'refactor-rename', 'security-sqli', 'multifile-config'];

// Sesion larga: tras el trabajo, preguntas que dependen del contexto acumulado y luego reglas de gobernabilidad
const TURN_ORDER_LONG = [
  ...TURN_ORDER,
  'recall-sqli', 'recall-log', 'recall-files', 'recall-lru', 'recall-tests', 'recall-last',
  'gov-style', 'gov-secrets', 'gov-modular', 'gov-commit',
];

function sessionTasks(all, order = TURN_ORDER) {
  return order.map((id) => all.find((t) => t.id === id));
}

function runTurn({ adapter, task, model, timeoutMs, dir, sessionId }) {
  const cmd = resolveCommand(adapter, task, model, sessionId);
  const { r, wallMs } = execute(cmd, dir, timeoutMs);
  const usage = PARSERS[adapter.parser](r.stdout || '');
  const invalid = Boolean(usage.error);
  return { ...usage, wallMs, invalid, pass: task.verify(dir, usage).pass && !invalid };
}

// Una sesion: todos los fixtures en un solo directorio y una sola conversacion reanudada turno a turno
function runSession({ adapterName, tasks, model, timeoutMs, order }) {
  const adapter = ADAPTERS[adapterName];
  if (!adapter.sessions) return [{ skipped: true, reason: 'arnes sin soporte de sesion' }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-session-'));
  try {
    const turns = sessionTasks(tasks, order);
    turns.forEach((t) => t.build(dir));
    adapter.setup(dir);
    let sessionId = null;
    return turns.map((task, i) => {
      const res = runTurn({ adapter, task, model, timeoutMs, dir, sessionId });
      sessionId = sessionId || res.sessionId;
      return { turn: i + 1, task: task.id, ...res };
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runSession, sessionTasks, TURN_ORDER, TURN_ORDER_LONG };
