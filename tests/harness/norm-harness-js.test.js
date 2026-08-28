'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');
const os     = require('node:os');
const { execSync, spawnSync } = require('node:child_process');
const { REPO, BIN, SKILLS, SETTINGS, runScript, tmpFile } = require('./_shared');

describe('norm-harness.js', () => {
  const SCRIPT = path.join(BIN, 'norm-harness.js');
  let tmpHost;

  // El gap de symlink silencioso solo se puede reproducir de forma real y
  // deterministica en un entorno donde fs.symlinkSync efectivamente falla sin
  // privilegios (Windows sin modo desarrollador/admin es el caso real que
  // origino el hallazgo). En entornos donde symlinkSync SI funciona (ej.
  // Linux/macOS en CI, o Windows con modo desarrollador activo) el test se
  // skipea en vez de forzar un mock artificial del filesystem.
  function symlinkFallaSinPrivilegios() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-probe-'));
    try {
      fs.writeFileSync(path.join(dir, 'target.txt'), 'x');
      fs.symlinkSync(path.join(dir, 'target.txt'), path.join(dir, 'link.txt'), 'file');
      return false; // symlink funciono -- no se puede reproducir el fallo aqui
    } catch {
      return true;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function crearProyectoAnfitrionTemporal() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'norm-harness-test-'));
    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@test.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    execSync('git add package.json', { cwd: dir });
    execSync('git commit -q -m "inicial"', { cwd: dir });
    return dir;
  }

  after(() => { if (tmpHost) fs.rmSync(tmpHost, { recursive: true, force: true }); });

  test('genera settings.json con los hooks completos en el proyecto anfitrion', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
    assert.equal(r.status, 0, `debe terminar sin error (stderr: ${r.stderr})`);

    const settingsPath = path.join(tmpHost, '.claude', 'settings.json');
    assert.ok(fs.existsSync(settingsPath), 'debe generar .claude/settings.json en el anfitrion');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const hooksStr = JSON.stringify(settings.hooks);

    // Regresion real: norm-harness.js mantenia una copia paralela de la
    // definicion de hooks, desincronizada de setup-settings.js -- le
    // faltaban estos 4 hooks agregados en sesiones anteriores.
    assert.ok(hooksStr.includes('subagent-guard'), 'debe incluir subagent-guard.js');
    assert.ok(hooksStr.includes('bash-verbosity-guard'), 'debe incluir bash-verbosity-guard.js');
    assert.ok(hooksStr.includes('memory-vault-prune-check'), 'debe incluir memory-vault-prune-check.js');
    assert.ok(JSON.stringify(settings.hooks.SubagentStop).includes('cross-verify-gate'), 'SubagentStop debe incluir cross-verify-gate.js');
  });

  test('detecta el stack (node) y agrega los permisos correspondientes', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    const settings = JSON.parse(fs.readFileSync(path.join(tmpHost, '.claude', 'settings.json'), 'utf8'));
    assert.ok(settings.permissions.allow.includes('Bash(npx*)'), 'debe agregar permisos de node detectados en el stack');
  });

  test('crea CLAUDE.md del anfitrion con la referencia al ai-core', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    const claudeMdPath = path.join(tmpHost, 'CLAUDE.md');
    assert.ok(fs.existsSync(claudeMdPath), 'debe crear CLAUDE.md en el anfitrion si no existia');
  });

  function estaVinculadoAlCore(claudeMdPath, coreClaudePath) {
    // symlink (Linux/macOS o Windows con modo dev/admin) o hardlink
    // (fallback en Windows sin privilegios de symlink -- mismo inode).
    const stat = fs.lstatSync(claudeMdPath);
    if (stat.isSymbolicLink()) {
      return fs.realpathSync(claudeMdPath) === fs.realpathSync(coreClaudePath);
    }
    return fs.statSync(claudeMdPath).ino === fs.statSync(coreClaudePath).ino;
  }

  test('reemplaza una copia obsoleta de CLAUDE.md (no vinculada) por un link al core', () => {
    // Regresion real: normalizeSymlinks() solo actuaba si el archivo NO
    // existia. Una copia estatica vieja del CLAUDE.md del core (ej. de una
    // version anterior de ai-core, congelada antes de que existiera el
    // link) quedaba huerfana para siempre -- ninguna corrida posterior la
    // reemplazaba, asi que la sesion seguia leyendo reglas obsoletas.
    tmpHost = crearProyectoAnfitrionTemporal();
    fs.writeFileSync(path.join(tmpHost, 'CLAUDE.md'), '# AI-CORE v0.0.1-obsoleto\n');

    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
    assert.equal(r.status, 0, `debe terminar sin error (stderr: ${r.stderr})`);

    const claudeMdPath = path.join(tmpHost, 'CLAUDE.md');
    const coreClaudePath = path.join(BIN, '..', '..', 'CLAUDE.md');
    assert.ok(
      estaVinculadoAlCore(claudeMdPath, coreClaudePath),
      'debe reemplazar la copia obsoleta por un link (symlink o hardlink) al CLAUDE.md real del core'
    );
  });

  test('no reescribe el link si ya apunta correctamente al CLAUDE.md del core', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    const claudeMdPath = path.join(tmpHost, 'CLAUDE.md');
    const coreClaudePath = path.join(BIN, '..', '..', 'CLAUDE.md');
    assert.ok(estaVinculadoAlCore(claudeMdPath, coreClaudePath), 'precondicion: la primera corrida debe dejar un link valido');

    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
    assert.equal(r.status, 0);
    assert.ok(estaVinculadoAlCore(claudeMdPath, coreClaudePath), 'debe seguir vinculado tras la segunda corrida');
  });

  test('fallo al crear el symlink de CLAUDE.md se reporta visible, no queda enmascarado por [SUCCESS] (gap de production-readiness, 2026-08-27)', { skip: !symlinkFallaSinPrivilegios() && 'este entorno permite symlinks sin privilegios especiales -- no se puede reproducir el fallo real de forma deterministica aqui' }, () => {
    // Hallazgo real de auditoria: normalizeSymlinks() atrapaba el error de
    // fs.symlinkSync en un catch interno que solo hacia console.error, sin
    // relanzar -- el try/catch externo del entry point nunca se enteraba, y
    // el script siempre terminaba con "[SUCCESS]" + exit 0 aunque el symlink
    // jamas se hubiera creado. En Windows sin modo desarrollador/privilegios
    // de administrador, fs.symlinkSync falla con EPERM de forma nativa y
    // reproducible -- no hace falta mockear nada, es el escenario real que
    // origino el gap.
    tmpHost = crearProyectoAnfitrionTemporal();
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    assert.equal(r.status, 0, 'un fallo de symlink es recuperable -- no debe bloquear el resto de la normalizacion');
    assert.doesNotMatch(r.stdout, /\[SUCCESS\][^\n]*$/m, 'el mensaje final no debe declarar exito puro si el symlink fallo');
    assert.match(r.stdout + r.stderr, /symlink/i, 'debe mencionar explicitamente el fallo de symlink en algun lugar de la salida');
  });

  test('elimina archivos legacy de la blacklist en el proyecto anfitrion', () => {
    tmpHost = crearProyectoAnfitrionTemporal();
    fs.writeFileSync(path.join(tmpHost, 'SECURITY_CHANGES_v2.4.0.md'), 'legacy');

    spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

    assert.ok(!fs.existsSync(path.join(tmpHost, 'SECURITY_CHANGES_v2.4.0.md')), 'debe eliminar el archivo legacy conocido');
  });

  describe('.gitignore del proyecto anfitrion', () => {
    test('crea .gitignore con ai-core/, assets de diseno y .env (nunca .env.example) si no existe', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const gitignorePath = path.join(tmpHost, '.gitignore');
      assert.ok(fs.existsSync(gitignorePath), 'debe crear .gitignore si no existia');

      const contenido = fs.readFileSync(gitignorePath, 'utf8');
      assert.match(contenido, /^ai-core\/$/m, 'debe ignorar ai-core/ cuando no es un submodulo git real');
      assert.match(contenido, /\*\.png/);
      assert.match(contenido, /^\.env$/m);
      assert.doesNotMatch(contenido, /\.env\.example/, 'jamas debe ignorar .env.example, solo .env real');
    });

    test('NO ignora ai-core/ si ya esta registrado como submodulo real en .gitmodules', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      fs.writeFileSync(
        path.join(tmpHost, '.gitmodules'),
        '[submodule "ai-core"]\n\tpath = ai-core\n\turl = https://github.com/salvex93/ai-core.git\n'
      );

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const gitignorePath = path.join(tmpHost, '.gitignore');
      const contenido = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
      assert.doesNotMatch(contenido, /^ai-core\/$/m, 'un submodulo real nunca debe ignorarse -- romperia su tracking');
    });

    test('no duplica entradas si .gitignore ya tiene ai-core/ o los patrones de assets', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      fs.writeFileSync(path.join(tmpHost, '.gitignore'), 'ai-core/\nnode_modules/\n*.png\n');

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const contenido = fs.readFileSync(path.join(tmpHost, '.gitignore'), 'utf8');
      const ocurrenciasAiCore = (contenido.match(/^ai-core\/$/gm) || []).length;
      const ocurrenciasPng    = (contenido.match(/^\*\.png$/gm) || []).length;
      assert.equal(ocurrenciasAiCore, 1, 'no debe duplicar la entrada ai-core/');
      assert.equal(ocurrenciasPng, 1, 'no debe duplicar el patron *.png');
      assert.match(contenido, /node_modules\//, 'debe preservar entradas ya existentes del usuario');
    });

    test('agrega los patrones nuevos preservando el contenido existente del usuario', () => {
      tmpHost = crearProyectoAnfitrionTemporal();
      fs.writeFileSync(path.join(tmpHost, '.gitignore'), '# comentario del usuario\ndist/\n');

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });

      const contenido = fs.readFileSync(path.join(tmpHost, '.gitignore'), 'utf8');
      assert.match(contenido, /# comentario del usuario/, 'no debe borrar contenido previo del usuario');
      assert.match(contenido, /dist\//);
      assert.match(contenido, /^ai-core\/$/m);
    });

    test('correr el harness dos veces seguidas no duplica el bloque de encabezado de comentarios', () => {
      // Regresion real: el filtro de entradas a agregar dejaba pasar los comentarios
      // ('# ...') sin chequear si ya estaban -- aAgregar.length nunca era 0 aunque solo
      // quedaran comentarios pendientes, asi que cada corrida re-escribia el encabezado
      // '# --- ai-core: no-desarrollo ... ---' completo, aunque ninguna entrada real
      // fuera nueva. Con 2+ corridas en la misma sesion (norm-harness.js se ejecuta al
      // inicio de cada sesion) el .gitignore acumulaba un bloque vacio por corrida.
      tmpHost = crearProyectoAnfitrionTemporal();
      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
      const primeraCorrida = fs.readFileSync(path.join(tmpHost, '.gitignore'), 'utf8');

      spawnSync('node', [SCRIPT], { encoding: 'utf8', cwd: tmpHost });
      const segundaCorrida = fs.readFileSync(path.join(tmpHost, '.gitignore'), 'utf8');

      assert.equal(segundaCorrida, primeraCorrida, 'la segunda corrida no debe modificar el .gitignore en absoluto');
      const ocurrenciasEncabezado = (segundaCorrida.match(/ai-core: no-desarrollo/g) || []).length;
      assert.equal(ocurrenciasEncabezado, 1, 'no debe duplicar el bloque de encabezado de comentarios');
    });
  });
});

// ─── ContextIndex.js ──────────────────────────────────────────────────────────
