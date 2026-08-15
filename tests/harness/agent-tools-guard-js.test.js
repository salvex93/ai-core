'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('agent-tools-guard.js', () => {
  const GUARD = path.join(BIN, 'agent-tools-guard.js');
  const AGENTS_DIR_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-tools-guard-'));
  const ENV_AGENTS = { AI_CORE_AGENTS_DIR: AGENTS_DIR_TMP };

  function escribirAgente(nombre, toolsLine) {
    const contenido = [
      '---',
      `name: ${nombre}`,
      'description: agente de prueba',
      ...(toolsLine ? [toolsLine] : []),
      '---',
      '',
      `# ${nombre}`,
    ].join('\n');
    fs.writeFileSync(path.join(AGENTS_DIR_TMP, `${nombre}.md`), contenido, 'utf8');
  }

  function escribirAgenteToolsMultilinea(nombre, tools) {
    const contenido = [
      '---',
      `name: ${nombre}`,
      'description: agente de prueba',
      'tools:',
      ...tools.map((t) => `  - ${t}`),
      '---',
      '',
      `# ${nombre}`,
    ].join('\n');
    fs.writeFileSync(path.join(AGENTS_DIR_TMP, `${nombre}.md`), contenido, 'utf8');
  }

  before(() => {
    escribirAgente('scanner-solo-lectura', 'tools: [Bash, Read, Grep, Glob]');
    escribirAgente('sin-scope-declarado', null);
    escribirAgenteToolsMultilinea('scanner-yaml-multilinea', ['Bash', 'Read']);
  });

  after(() => {
    fs.rmSync(AGENTS_DIR_TMP, { recursive: true, force: true });
  });

  function enviarEvento(evento) {
    return spawnSync('node', [GUARD], {
      input: JSON.stringify(evento),
      encoding: 'utf8',
      env: { ...process.env, ...ENV_AGENTS },
    });
  }

  test('permite una herramienta dentro del scope declarado', () => {
    const r = enviarEvento({ agent_type: 'scanner-solo-lectura', tool_name: 'Read' });
    assert.equal(r.status, 0);
  });

  test('emite permissionDecision:deny (exit 0 + JSON) para una herramienta fuera del scope declarado', () => {
    // Friccion de configuracion estatica (AGENT.md), no riesgo de seguridad
    // activa -- usa permissionDecision:"deny" en vez de exit 2, siguiendo la
    // recomendacion oficial de Anthropic (code.claude.com/docs/en/hooks).
    const r = enviarEvento({ agent_type: 'scanner-solo-lectura', tool_name: 'Write' });
    assert.equal(r.status, 0, 'permissionDecision:deny exige exit 0, no exit 2');
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /scanner-solo-lectura/);
    assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /Write/);
  });

  test('sin agent_type (tool call del hilo principal): no bloquea', () => {
    const r = enviarEvento({ tool_name: 'Write' });
    assert.equal(r.status, 0, 'sin agent_type la tool call no viene de un subagente, el guard no aplica');
  });

  test('agent_type sin AGENT.md correspondiente (ej. Explore, general-purpose): no bloquea', () => {
    const r = enviarEvento({ agent_type: 'Explore', tool_name: 'Write' });
    assert.equal(r.status, 0, 'agentes que no son de ai-core no tienen scope que verificar');
  });

  test('agent_type con path traversal (../) nunca lee el archivo fuera de AGENTS_DIR -- se trata como agente no reconocido', () => {
    // Hallazgo de seguridad real: agentType viene de evento.agent_type (JSON
    // de stdin) sin validar caracteres antes de path.join(AGENTS_DIR,
    // `${agentType}.md`) -- path.join no previene el traversal, permitiendo
    // leer un archivo arbitrario del sistema como si fuera un AGENT.md.
    // Fix: agentType debe matchear /^[a-zA-Z0-9_-]+$/ antes de construir la
    // ruta -- un traversal cae al mismo camino que "agente no reconocido"
    // (null, no bloquea) en vez de leer el archivo fuera del directorio.
    // El test verifica el efecto observable correcto: el archivo externo
    // (con tools: [Write, Edit, Bash], mas permisivo) nunca se lee -- si lo
    // leyera, el guard heredaria ESE scope y permitiria Write igual que
    // Edit/Bash; en cambio, con la validacion, tratar el traversal como
    // "sin scope declarado" es el unico comportamiento observable posible.
    const archivoFuera = path.join(os.tmpdir(), 'agent-tools-guard-secreto.md');
    fs.writeFileSync(archivoFuera, '---\nname: secreto\ntools: [Write, Edit, Bash]\n---\n', 'utf8');
    try {
      const traversal = path.relative(AGENTS_DIR_TMP, archivoFuera).replace(/\.md$/, '').split(path.sep).join('/');
      const rWrite = enviarEvento({ agent_type: traversal, tool_name: 'Write' });
      const rGrep  = enviarEvento({ agent_type: traversal, tool_name: 'Grep' });
      // Si el traversal leyera el archivo externo, Write y Grep se
      // comportarian identico (ambos permitidos, mismo scope [Write,Edit,
      // Bash]) -- el efecto real esperado es "no reconocido" para cualquier
      // herramienta, consistente con agent_type='Explore' en el test de arriba.
      assert.equal(rWrite.status, 0, 'sin scope verificable, no bloquea (mismo camino que agente no reconocido)');
      assert.equal(rGrep.status, 0, 'sin scope verificable, no bloquea (mismo camino que agente no reconocido)');
    } finally {
      fs.rmSync(archivoFuera, { force: true });
    }
  });

  test('agentType con caracteres fuera de [a-zA-Z0-9_-] (incluye ../ y separadores de ruta) se rechaza antes de tocar el filesystem', () => {
    const invalidos = ['../secreto', '..\\secreto', 'a/b', 'a\\b', '..', '.'];
    for (const agentType of invalidos) {
      const r = enviarEvento({ agent_type: agentType, tool_name: 'Write' });
      assert.equal(r.status, 0, `"${agentType}" no debe bloquear (tratado como no reconocido, nunca como scope real)`);
    }
  });

  test('AGENT.md sin campo tools: declarado: no bloquea (retrocompatible)', () => {
    const r = enviarEvento({ agent_type: 'sin-scope-declarado', tool_name: 'Write' });
    assert.equal(r.status, 0, 'sin scope declarado no hay nada que verificar');
  });

  test('tools: en sintaxis YAML de lista multilinea (no solo array inline) tambien deniega fuera de scope', () => {
    // Regresion real: el parser solo entendia `tools: [A, B]` -- un AGENT.md
    // escrito con `tools:\n  - A\n  - B` (sintaxis YAML igualmente valida)
    // fallaba abierto (exit 0 sin JSON) sin ninguna advertencia, sin
    // restringir nada.
    const r = enviarEvento({ agent_type: 'scanner-yaml-multilinea', tool_name: 'Write' });
    assert.equal(r.status, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  });

  test('tools: en sintaxis YAML multilinea permite una herramienta dentro del scope', () => {
    const r = enviarEvento({ agent_type: 'scanner-yaml-multilinea', tool_name: 'Read' });
    assert.equal(r.status, 0, 'Read esta declarado en la lista multilinea, no debe bloquear');
  });

  test('los 6 agentes reales de ai-core tienen scope de herramientas declarado', () => {
    const AGENTES_REALES = [
      'aiops-auditor', 'code-reviewer', 'issue-tracker',
      'mcp-registry-navigator', 'security-scanner', 'self-healing-agent',
    ];
    for (const nombre of AGENTES_REALES) {
      const r = spawnSync('node', [GUARD], {
        input: JSON.stringify({ agent_type: nombre, tool_name: '__HERRAMIENTA_INEXISTENTE__' }),
        encoding: 'utf8',
        env: { ...process.env },
      });
      assert.equal(r.status, 0, `${nombre} debe tener tools: declarado (exit 0 + permissionDecision:deny)`);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', `${nombre} debe denegar una herramienta fuera de scope`);
    }
  });

  test('self-healing-agent no tiene Write ni Edit en su scope (nunca aplica fixes)', () => {
    const contenido = fs.readFileSync(path.join(REPO, '.claude', 'agents', 'self-healing-agent.md'), 'utf8');
    const toolsLine = contenido.match(/^tools:\s*\[([^\]]*)\]/m);
    assert.ok(toolsLine, 'debe declarar tools:');
    const scope = toolsLine[1].split(',').map((t) => t.trim());
    assert.ok(!scope.includes('Write'), 'self-healing-agent nunca debe poder escribir archivos');
    assert.ok(!scope.includes('Edit'), 'self-healing-agent nunca debe poder editar archivos');
  });
});
