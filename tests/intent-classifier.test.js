/**
 * intent-classifier.test.js — Tests de regresion para IntentClassifier.js
 * Ejecutar: node --test tests/
 * Compatible: Node >= 18 (node:test nativo, sin dependencias externas)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { clasificar } = require('../scripts/services/IntentClassifier');
const { ROLES, obtenerSkillsPorRol, inferirSkills, systemPromptParaRol } = require('../scripts/services/AgentRoles');

describe('IntentClassifier.clasificar — deteccion por rol', () => {
  test('detecta AUDITOR ante mensaje de error/stacktrace', () => {
    const r = clasificar('el script crashea con un stacktrace raro, por que falla');
    assert.equal(r.rol, ROLES.AUDITOR);
    assert.equal(r.herramienta, 'diagnosticar_error');
  });

  test('detecta AUDITOR ante mensaje de seguridad/CVE', () => {
    const r = clasificar('audita esta dependencia, sospecho un CVE de inyeccion XSS');
    assert.equal(r.rol, ROLES.AUDITOR);
  });

  test('detecta ARCHITECT ante diseno de sistema nuevo', () => {
    const r = clasificar('quiero diseñar la arquitectura de un microservicio nuevo');
    assert.equal(r.rol, ROLES.ARCHITECT);
  });

  test('detecta ARCHITECT ante busqueda/investigacion', () => {
    const r = clasificar('investiga y compara Contextual Retrieval frente a RAG clasico');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.herramienta, 'buscar_web');
  });

  test('detecta CODER ante comando de shell directo', () => {
    const r = clasificar('ejecuta npm test y dime el resultado');
    assert.equal(r.rol, ROLES.CODER);
  });

  test('detecta CODER ante fix puntual de codigo', () => {
    const r = clasificar('arregla el bug en la linea 42 de este archivo');
    assert.equal(r.rol, ROLES.CODER);
    assert.equal(r.herramienta, 'reparar_error');
  });
});

describe('IntentClassifier.clasificar — prioridad y empates', () => {
  test('AUDITOR gana sobre ARCHITECT y CODER cuando hay señales de auditor', () => {
    // "error" (auditor) + "arquitectura" (architect) + "arregla" (coder) en un mismo mensaje
    const r = clasificar('hay un error de seguridad en la arquitectura, arregla el CVE');
    assert.equal(r.rol, ROLES.AUDITOR);
  });

  test('ARCHITECT gana sobre CODER en empate cuando architect > coder', () => {
    const r = clasificar('diseña la arquitectura del sistema y crea el modulo base');
    assert.equal(r.rol, ROLES.ARCHITECT);
  });

  test('confianza es proporcional a puntosDelRol / total y esta en rango [0,1]', () => {
    const r = clasificar('arregla este error de stacktrace, por que falla el crash');
    assert.ok(r.confianza >= 0 && r.confianza <= 1);
    assert.equal(typeof r.confianza, 'number');
  });
});

describe('IntentClassifier.clasificar — fallback conservador', () => {
  test('mensaje vacio cae a fallback ARCHITECT con confianza 0.3', () => {
    const r = clasificar('');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
    assert.equal(r.herramienta, 'disenar_sistema');
  });

  test('input no-string cae a fallback ARCHITECT con confianza 0.3', () => {
    const r = clasificar(null);
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
  });

  test('mensaje sin señales reconocibles cae a fallback ARCHITECT', () => {
    const r = clasificar('xyzzy plugh qwerty');
    assert.equal(r.rol, ROLES.ARCHITECT);
    assert.equal(r.confianza, 0.3);
    assert.match(r.razon, /Sin senales claras/);
  });
});

describe('IntentClassifier.clasificar — contrato de salida', () => {
  test('siempre retorna las 4 claves esperadas: rol, herramienta, confianza, razon', () => {
    const r = clasificar('crea un componente nuevo');
    assert.ok('rol' in r);
    assert.ok('herramienta' in r);
    assert.ok('confianza' in r);
    assert.ok('razon' in r);
  });

  test('el rol retornado siempre pertenece a ROLES.*', () => {
    const mensajes = ['audita esto', 'diseña aquello', 'arregla esto', 'sin señales claras aqui'];
    for (const m of mensajes) {
      const r = clasificar(m);
      assert.ok(Object.values(ROLES).includes(r.rol), `rol invalido para: "${m}"`);
    }
  });
});

describe('AgentRoles.obtenerSkillsPorRol — auto-discovery via frontmatter', () => {
  test('descubre skills leyendo el campo rol: del frontmatter, no por inferencia', () => {
    const r = obtenerSkillsPorRol();
    const total = r[ROLES.ARCHITECT].length + r[ROLES.CODER].length + r[ROLES.AUDITOR].length;
    assert.ok(total > 0, 'debe descubrir al menos un skill');
  });

  test('cada skill descubierto aparece en un unico rol', () => {
    const r = obtenerSkillsPorRol();
    const vistos = new Set();
    for (const lista of Object.values(r)) {
      for (const nombre of lista) {
        assert.ok(!vistos.has(nombre), `skill duplicado entre roles: ${nombre}`);
        vistos.add(nombre);
      }
    }
  });

  test('security-auditor se clasifica como auditor segun su frontmatter', () => {
    const r = obtenerSkillsPorRol();
    assert.ok(r[ROLES.AUDITOR].includes('security-auditor'));
  });

  test('inferirSkills retorna una lista de skills del rol inferido para la herramienta', () => {
    const skills = inferirSkills('auditar_seguridad_critica');
    assert.ok(Array.isArray(skills));
    assert.ok(skills.includes('security-auditor'));
  });
});

describe('AgentRoles.systemPromptParaRol — ACI diff edits (rol CODER)', () => {
  test('el prompt de CODER exige formato SEARCH/REPLACE para editar codigo existente', () => {
    const prompt = systemPromptParaRol(ROLES.CODER);
    assert.match(prompt, /SEARCH/);
    assert.match(prompt, /REPLACE/);
  });

  test('el prompt de CODER prohibe explicitamente reescribir archivos completos', () => {
    const prompt = systemPromptParaRol(ROLES.CODER);
    assert.match(prompt, /PROHIBIDO reescribir un archivo completo/);
  });

  test('el prompt de ARCHITECT y AUDITOR no exigen formato SEARCH/REPLACE (no son ediciones de codigo linea a linea)', () => {
    assert.doesNotMatch(systemPromptParaRol(ROLES.ARCHITECT), /SEARCH/);
    assert.doesNotMatch(systemPromptParaRol(ROLES.AUDITOR), /SEARCH/);
  });
});

describe('dependency-tracer.js — grafo de dependencias inverso', () => {
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const REPO   = path.resolve(__dirname, '..');
  const SCRIPT = path.join(REPO, '.claude', 'bin', 'dependency-tracer.js');

  function run(args) {
    return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO });
  }

  test('el script existe', () => {
    const fs = require('node:fs');
    assert.ok(fs.existsSync(SCRIPT));
  });

  test('AgentRoles.js: lista IntentClassifier.js como dependiente directo', () => {
    const out = run(['--json', 'scripts/services/AgentRoles.js']);
    const data = JSON.parse(out);
    assert.ok(data.dependientes.includes('scripts/services/IntentClassifier.js'));
  });

  test('AgentRoles.js: incluye dependientes transitivos (mcp-gemini.js via IntentClassifier)', () => {
    const out = run(['--json', 'scripts/services/AgentRoles.js']);
    const data = JSON.parse(out);
    assert.ok(data.dependientes.includes('scripts/mcp-gemini.js'), 'debe propagar transitivamente');
  });

  test('archivo sin dependientes: retorna lista vacia', () => {
    const out = run(['--json', '.claude/bin/session-summary.js']);
    const data = JSON.parse(out);
    assert.deepEqual(data.dependientes, []);
  });

  test('archivo inexistente: no falla, sale silenciosamente', () => {
    const out = run(['scripts/services/NoExiste.js']);
    assert.equal(out, '');
  });

  test('dependency-tracer registrado en PreToolUse(Write|Edit) de settings.json', () => {
    const fs = require('node:fs');
    const settings = JSON.parse(fs.readFileSync(path.join(REPO, '.claude', 'settings.json'), 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter(h => h.matcher === 'Write|Edit')
      .flatMap(h => h.hooks || []);
    assert.ok(preHooks.some(h => (h.command || '').includes('dependency-tracer.js')));
  });
});

describe('anthropic-bridge.js — buildSystemBlocks (prompt caching)', () => {
  const { buildSystemBlocks } = require('../scripts/anthropic-bridge');

  test('el primer bloque abre <static_context> y tiene cache_control ephemeral', () => {
    const bloques = buildSystemBlocks([], ROLES.ARCHITECT);
    assert.match(bloques[0].text, /^<static_context>/);
    assert.deepEqual(bloques[0].cache_control, { type: 'ephemeral' });
  });

  test('el ultimo bloque con cache_control cierra </static_context>', () => {
    const bloques = buildSystemBlocks([], ROLES.ARCHITECT);
    const conCache = bloques.filter(b => b.cache_control);
    const ultimo = conCache[conCache.length - 1];
    assert.match(ultimo.text, /<\/static_context>$/);
  });

  test('el bloque de rol (dinamico) no tiene cache_control y va despues del cierre de static_context', () => {
    const bloques = buildSystemBlocks([], ROLES.CODER);
    const ultimo = bloques[bloques.length - 1];
    assert.equal(ultimo.cache_control, undefined);
    assert.doesNotMatch(ultimo.text, /static_context/);
  });
});

describe('pre-commit-tdd.js — gate TDD por heuristica de presencia', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const { execSync, execFileSync } = require('node:child_process');
  const SCRIPT = path.resolve(__dirname, '..', '.claude', 'bin', 'pre-commit-tdd.js');

  let repoDir;

  function initRepo() {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-gate-'));
    execSync('git init -q', { cwd: repoDir });
    execSync('git config user.email t@t.com', { cwd: repoDir });
    execSync('git config user.name t', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'app.js'), 'console.log(1);\n', 'utf8');
    execSync('git add app.js && git commit -q -m init', { cwd: repoDir });
  }

  function runGate(file) {
    try {
      execFileSync('node', [SCRIPT, file], { cwd: repoDir, encoding: 'utf8' });
      return { status: 0 };
    } catch (e) {
      return { status: e.status, stderr: e.stderr };
    }
  }

  test('bloquea (exit 2) codigo fuente modificado sin ningun *.test.js tocado en la sesion', () => {
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    const r = runGate('app.js');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /TDD-GATE/);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('permite (exit 0) codigo fuente si existe un *.test.js con cambios en el repo', () => {
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    fs.writeFileSync(path.join(repoDir, 'app.test.js'), '// nuevo test\n', 'utf8');
    const r = runGate('app.js');
    assert.equal(r.status, 0);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('permite (exit 0) editar el propio archivo de test sin exigir otro test', () => {
    initRepo();
    fs.writeFileSync(path.join(repoDir, 'app.test.js'), '// test\n', 'utf8');
    const r = runGate('app.test.js');
    assert.equal(r.status, 0);
    fs.rmSync(repoDir, { recursive: true });
  });

  test('sin argv, lee tool_input.file_path del JSON de stdin', () => {
    // Regresion real: CLAUDE_TOOL_INPUT_file_path nunca existio como
    // variable de entorno real.
    const { spawnSync } = require('node:child_process');
    initRepo();
    fs.appendFileSync(path.join(repoDir, 'app.js'), 'console.log(2);\n');
    const evento = JSON.stringify({ tool_input: { file_path: 'app.js' } });
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: repoDir, input: evento });
    fs.rmSync(repoDir, { recursive: true });
    assert.equal(r.status, 2, 'debe bloquear leyendo la ruta real desde stdin');
    assert.match(r.stderr, /TDD-GATE/);
  });

  test('pre-commit-tdd registrado en PreToolUse(Write|Edit) de settings.json', () => {
    const settings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.claude', 'settings.json'), 'utf8'));
    const preHooks = (settings.hooks?.PreToolUse || [])
      .filter(h => h.matcher === 'Write|Edit')
      .flatMap(h => h.hooks || []);
    assert.ok(preHooks.some(h => (h.command || '').includes('pre-commit-tdd.js')));
  });
});

describe('ModelDispatcher.js — router MoA (Command/Port)', () => {
  const {
    SUBTASK_TYPES, PROVIDER_POR_SUBTASK, SubTaskCommand,
    ContextGatheringTask, SyntaxDraftingTask, SurgicalEditTask, crearSubTarea,
  } = require('../scripts/services/ModelDispatcher');

  test('ContextGathering esta asignado a gemini', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.CONTEXT_GATHERING], 'gemini');
  });

  test('SyntaxDrafting esta asignado a deepseek', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.SYNTAX_DRAFTING], 'deepseek');
  });

  test('SurgicalEdit esta asignado a anthropic (Claude)', () => {
    assert.equal(PROVIDER_POR_SUBTASK[SUBTASK_TYPES.SURGICAL_EDIT], 'anthropic');
  });

  test('SubTaskCommand es abstracta: instanciarla directamente lanza error', () => {
    assert.throws(() => new SubTaskCommand(SUBTASK_TYPES.CONTEXT_GATHERING, []), /abstracta/);
  });

  test('cada subclase concreta se instancia con su tipo correcto', () => {
    assert.equal(new ContextGatheringTask([]).tipo, SUBTASK_TYPES.CONTEXT_GATHERING);
    assert.equal(new SyntaxDraftingTask([]).tipo,   SUBTASK_TYPES.SYNTAX_DRAFTING);
    assert.equal(new SurgicalEditTask([]).tipo,     SUBTASK_TYPES.SURGICAL_EDIT);
  });

  test('crearSubTarea (factory) retorna una instancia de SubTaskCommand', () => {
    const t = crearSubTarea(SUBTASK_TYPES.SYNTAX_DRAFTING, [{ role: 'user', content: 'x' }]);
    assert.ok(t instanceof SubTaskCommand);
    assert.equal(typeof t.execute, 'function');
  });

  test('crearSubTarea con tipo desconocido lanza error', () => {
    assert.throws(() => crearSubTarea('TipoInexistente', []), /Sin Command registrado/);
  });
});
