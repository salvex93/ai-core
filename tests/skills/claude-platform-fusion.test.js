const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', '..', '.claude', 'skills', 'claude-platform');
const FIXTURE = require(path.join(__dirname, '..', 'fixtures', 'claude-platform-fusion.json'));

const DISPARADORES = [
  'anthropic/@anthropic-ai/sdk',
  'cache de prompts',
  'tool use',
  'migrar',
  'agentes autonomos',
  'subagentes',
  'agent sdk',
  'managed agents',
  'herramientas integradas',
];

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function leerArchivo(ruta) {
  return fs.readFileSync(ruta, 'utf8');
}

function leerSkillCompleto() {
  const partes = [leerArchivo(path.join(SKILL_DIR, 'SKILL.md'))];
  const refs = path.join(SKILL_DIR, 'references');
  if (fs.existsSync(refs)) {
    for (const f of fs.readdirSync(refs)) partes.push(leerArchivo(path.join(refs, f)));
  }
  return partes.join('\n');
}

test('claude-platform existe con SKILL.md y frontmatter nombrado', () => {
  const md = leerArchivo(path.join(SKILL_DIR, 'SKILL.md'));
  assert.match(md, /^---\nname: claude-platform\n/);
});

test('el SKILL.md principal no supera 200 lineas (el detalle va en references/)', () => {
  const lineas = leerArchivo(path.join(SKILL_DIR, 'SKILL.md')).split('\n').length;
  assert.ok(lineas <= 200, `SKILL.md tiene ${lineas} lineas`);
});

test('la descripcion conserva los disparadores de los tres skills originales', () => {
  const md = leerArchivo(path.join(SKILL_DIR, 'SKILL.md'));
  const desc = md.match(/^description: (.+)$/m);
  assert.ok(desc, 'falta description en el frontmatter');
  const d = desc[1].toLowerCase();
  const faltan = DISPARADORES.filter((t) => !d.includes(t));
  assert.deepEqual(faltan, [], `disparadores perdidos: ${faltan.join(', ')}`);
});

for (const [origen, esperado] of Object.entries(FIXTURE)) {
  test(`conserva los encabezados propios de ${origen}`, () => {
    const contenido = leerSkillCompleto();
    const faltan = esperado.headings.filter((h) => !contenido.includes(h));
    assert.deepEqual(faltan, [], `encabezados perdidos: ${faltan.join(' | ')}`);
  });

  test(`conserva los bloques de codigo de ${origen}`, () => {
    const contenido = norm(leerSkillCompleto());
    const faltan = esperado.bloques.filter((b) => !contenido.includes(b));
    assert.equal(faltan.length, 0, `${faltan.length} bloque(s) perdido(s), primero: ${(faltan[0] || '').slice(0, 80)}`);
  });
}
