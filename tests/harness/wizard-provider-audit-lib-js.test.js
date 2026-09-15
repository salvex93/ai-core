'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { REPO } = require('./_shared');

describe('lib/wizard-provider-audit.js', () => {
  const { auditarUsoDeProviders } = require(
    path.join(REPO, '.claude', 'bin', 'lib', 'wizard-provider-audit.js')
  );
  let scriptsDir;

  before(() => {
    scriptsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-audit-scripts-'));
  });
  after(() => { fs.rmSync(scriptsDir, { recursive: true, force: true }); });

  test('repositorio real de ai-core: sin bypass fuera de la lista blanca conocida', () => {
    const r = auditarUsoDeProviders(path.join(REPO, 'scripts'));

    assert.equal(r.conforme, true, JSON.stringify(r.hallazgos));
    assert.deepEqual(r.hallazgos, []);
  });

  test('detecta un require directo del SDK de Anthropic fuera de la lista blanca', () => {
    fs.writeFileSync(
      path.join(scriptsDir, 'bypass-fake.js'),
      "'use strict';\nconst Anthropic = require('@anthropic-ai/sdk');\nmodule.exports = { Anthropic };\n"
    );

    const r = auditarUsoDeProviders(scriptsDir);

    assert.equal(r.conforme, false);
    assert.equal(r.hallazgos.length, 1);
    assert.match(r.hallazgos[0].archivo, /bypass-fake\.js$/);
    assert.match(r.hallazgos[0].razon, /@anthropic-ai\/sdk/);
  });

  test('detecta un require directo del SDK de Gemini fuera de la lista blanca', () => {
    fs.writeFileSync(
      path.join(scriptsDir, 'bypass-gemini.js'),
      "'use strict';\nconst { GoogleGenAI } = require('@google/genai');\n"
    );

    const r = auditarUsoDeProviders(scriptsDir);

    assert.equal(r.conforme, false);
    assert.ok(r.hallazgos.some((h) => /bypass-gemini\.js$/.test(h.archivo)));
  });

  test('una mencion en comentario/prosa no cuenta como bypass -- solo require/import real', () => {
    const dirLimpio = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-audit-clean-'));
    fs.writeFileSync(
      path.join(dirLimpio, 'solo-prosa.js'),
      "'use strict';\n// este modulo NO usa @anthropic-ai/sdk directamente, ver ModelRegistry\nmodule.exports = {};\n"
    );

    const r = auditarUsoDeProviders(dirLimpio);
    fs.rmSync(dirLimpio, { recursive: true, force: true });

    assert.equal(r.conforme, true);
    assert.deepEqual(r.hallazgos, []);
  });
});
