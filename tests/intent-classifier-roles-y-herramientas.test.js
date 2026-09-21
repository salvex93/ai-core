'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { ROLES, obtenerSkillsPorRol, inferirSkills, systemPromptParaRol } = require('../scripts/services/AgentRoles');

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

  test('inferirSkills nunca devuelve mas de un tope razonable de skills -- el rol ARCHITECT tiene 25 skills completos y sin limite se inyectan ~164k tokens de SKILL.md en una sola llamada cuando el llamador no especifica skills', () => {
    const skillsArchitect = inferirSkills('disenar_sistema');
    assert.ok(skillsArchitect.length <= 12, `inferirSkills debe truncar a un maximo razonable, obtuvo ${skillsArchitect.length}`);
  });

  test('el tope de inferirSkills no trunca skills reales de roles ya por debajo del limite (AUDITOR conserva security-auditor)', () => {
    const skillsAuditor = inferirSkills('auditar_seguridad_critica');
    assert.ok(skillsAuditor.includes('security-auditor'), 'el tope no debe perder skills de roles con menos skills que el limite');
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
