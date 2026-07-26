'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('validate-agents.js', () => {
  const SCRIPT  = path.join(BIN, 'validate-agents.js');
  const AGENTS  = path.join(REPO, '.claude', 'agents');
  const TEST_AGENT = path.join(AGENTS, 'zz-test-agent-temp.md');

  function crearAgenteDePrueba(contenido) {
    fs.writeFileSync(TEST_AGENT, contenido, 'utf8');
  }

  function limpiar() {
    fs.rmSync(TEST_AGENT, { force: true });
  }

  function runValidate() {
    return spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
  }

  after(limpiar);

  test('el script existe', () => {
    assert.ok(fs.existsSync(SCRIPT), 'validate-agents.js debe existir en .claude/bin/');
  });

  test('agente conforme (con referencia inmutable) no genera hallazgos', () => {
    limpiar();
    // last_updated = hoy real (no una fecha fija) para no disparar el
    // chequeo de drift last_updated-vs-mtime, que compara contra el dia de
    // ejecucion del test -- mismo patron que crearSkillDePrueba en el
    // archivo hermano de skills.
    const hoy = new Date().toISOString().slice(0, 10);
    crearAgenteDePrueba([
      '---',
      'name: zz-test-agent-temp',
      'origin: ai-core',
      'version: 1.0.0',
      `last_updated: ${hoy}`,
      'provider: any',
      'loop: false',
      '---',
      '# Agente de prueba',
      '## Restricciones',
      '> Reglas de sesion activas: CLAUDE.md > este agente.',
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agent-temp');
    assert.ok(resultado, 'debe auditar el agente de prueba');
    assert.equal(resultado.status, 'CONFORME');
  });

  test('agente SIN referencia inmutable a CLAUDE.md genera hallazgo alto', () => {
    // Regresion real: mcp-registry-navigator.md no tenia esta linea y no
    // habia ningun chequeo automatico que lo detectara -- validate-globals.js
    // solo auditaba .claude/skills/, nunca .claude/agents/.
    limpiar();
    crearAgenteDePrueba([
      '---',
      'name: zz-test-agent-temp',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'provider: any',
      'loop: false',
      '---',
      '# Agente de prueba',
      '## Restricciones',
      '- Solo hacer X.',
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agent-temp');
    assert.ok(resultado, 'debe auditar el agente de prueba');
    assert.ok(
      resultado.hallazgos.some(h => h.desc.includes('referencia inmutable')),
      'debe reportar la falta de referencia inmutable a CLAUDE.md'
    );
  });

  test('agente que copia literalmente una regla del ANCLA genera hallazgo de copia', () => {
    limpiar();
    crearAgenteDePrueba([
      '---',
      'name: zz-test-agent-temp',
      'origin: ai-core',
      'version: 1.0.0',
      'last_updated: 2026-01-01',
      'provider: any',
      'loop: false',
      '---',
      '# Agente de prueba',
      'Español estricto. Sin code-switch. Sin emojis ni iconos.',
      '## Restricciones',
      '> Reglas de sesion activas: CLAUDE.md > este agente.',
    ].join('\n'));

    const r = runValidate();
    limpiar();
    const salida = JSON.parse(r.stdout);
    const resultado = salida.resultados.find(x => x.nombre === 'zz-test-agent-temp');
    assert.ok(resultado, 'debe auditar el agente de prueba');
    assert.ok(
      resultado.hallazgos.some(h => h.desc.includes('copia regla global')),
      'debe detectar la copia literal de la regla IDIOMA'
    );
  });

  test('los 7 agentes reales del ecosistema son conformes', () => {
    const r = spawnSync('node', [SCRIPT, '--json'], { encoding: 'utf8', cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
    const salida = JSON.parse(r.stdout);
    const noConformes = salida.resultados.filter(x => x.status !== 'CONFORME');
    assert.deepEqual(
      noConformes.map(x => ({ nombre: x.nombre, hallazgos: x.hallazgos })),
      [],
      'todos los agentes reales deben ser conformes tras el fix de mcp-registry-navigator.md'
    );
  });

  test('validate-agents registrado en package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    assert.ok(
      Object.values(pkg.scripts).some(s => s.includes('validate-agents.js')),
      'debe existir un script npm que ejecute validate-agents.js'
    );
  });
});
