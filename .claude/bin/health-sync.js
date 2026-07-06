'use strict';
/**
 * health-sync.js — Verificaciones síncronas del harness (< 3s).
 * Cubre: dependencias npm, skills, servidores MCP.
 * SRP: solo ejecuta checks, no genera reportes ni toca settings.
 */

const fs            = require('fs');
const path          = require('path');
const { execSync, spawn } = require('child_process');

// -------------------------------------------------------------------
// 1. DEPENDENCIAS NPM
// -------------------------------------------------------------------

/**
 * Compara package.json vs node_modules. Auto-instala si hay drift.
 * @param {string} root — ruta absoluta al directorio del proyecto
 * @returns {{ ok: boolean, count: number, installed: string[], missing: string[], autoFixed: boolean, error?: string }}
 */
function checkDependencies(root) {
  const pkgPath = path.join(root, 'package.json');
  const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const required = Object.keys(pkg.dependencies || {});

  const missing = required.filter(dep => {
    const depPkg = path.join(root, 'node_modules', dep, 'package.json');
    return !fs.existsSync(depPkg);
  });

  const installed = required
    .filter(dep => !missing.includes(dep))
    .map(dep => {
      const v = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', dep, 'package.json'), 'utf8')).version;
      return `${dep}@${v}`;
    });

  if (missing.length === 0) {
    return { ok: true, count: required.length, installed, missing: [], autoFixed: false };
  }

  // Auto-reparación
  try {
    execSync('npm install --prefer-offline', { cwd: root, stdio: 'pipe', timeout: 30_000 });
    const installedNow = required.map(dep => {
      const v = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', dep, 'package.json'), 'utf8')).version;
      return `${dep}@${v}`;
    });
    return { ok: true, count: required.length, installed: installedNow, missing, autoFixed: true };
  } catch (e) {
    return {
      ok: false, count: required.length, installed, missing, autoFixed: false,
      error: e.message.split('\n')[0],
    };
  }
}

// -------------------------------------------------------------------
// 2. SKILLS
// -------------------------------------------------------------------

/**
 * Verifica presencia de skills en disco y coherencia con CLAUDE.md.
 * @param {string} root
 * @returns {{ ok: boolean, count: number, declared: number, orphans: string[], missing: string[] }}
 */
function checkSkills(root) {
  const skillsDir    = path.join(root, '.claude', 'skills');
  const claudeMdPath = path.join(root, 'CLAUDE.md');

  // Skills en disco
  const inDisk = fs.readdirSync(skillsDir).filter(d =>
    fs.statSync(path.join(skillsDir, d)).isDirectory() &&
    fs.existsSync(path.join(skillsDir, d, 'SKILL.md'))
  );

  // Skills declarados en CLAUDE.md — extraer backtick-names de la tabla de auto-routing
  // Formato actual: columna de tabla con "`nombre-skill`" en filas | ... | `skill` |
  const claudeMd   = fs.readFileSync(claudeMdPath, 'utf8');
  const mentioned  = new Set([...claudeMd.matchAll(/`([a-z][a-z0-9-]+)`/g)].map(m => m[1]));
  const inClaudeMd = inDisk.filter(s => mentioned.has(s));

  const diskSet   = new Set(inDisk);
  const claudeSet = new Set(inClaudeMd);

  const orphans = inDisk.filter(s => !claudeSet.has(s));
  const missing = inClaudeMd.filter(s => !diskSet.has(s));

  return {
    ok:       orphans.length === 0 && missing.length === 0,
    count:    inDisk.length,
    declared: inClaudeMd.length,
    orphans,
    missing,
  };
}

// -------------------------------------------------------------------
// 3. SERVIDORES MCP
// -------------------------------------------------------------------

/**
 * Verifica que un servidor MCP stdio responde a initialize.
 * @param {{ name: string, script: string }} server
 * @param {string} root
 * @returns {Promise<{ server: string, ok: boolean, tools?: string[], latencyMs?: number, error?: string }>}
 */
function checkMcpServer(server, root) {
  return new Promise(resolve => {
    const TIMEOUT_MS = 3000;
    const t0 = Date.now();

    let proc;
    try {
      proc = spawn('node', [server.script], {
        cwd:   root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env:   process.env,
      });
    } catch (e) {
      return resolve({ server: server.name, ok: false, error: `spawn: ${e.message}` });
    }

    let buffer    = '';
    let done      = false;
    let initDone  = false; // inicializado — esperando tools/list
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      proc.kill();
      // Si ya teníamos initialize OK pero tools/list tardó, retornar éxito parcial
      if (initDone) {
        resolve({ server: server.name, ok: true, tools: [], latencyMs: Date.now() - t0 });
      } else {
        resolve({ server: server.name, ok: false, error: 'timeout 3s' });
      }
    }, TIMEOUT_MS);

    proc.stdout.on('data', chunk => {
      if (done) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // conservar línea incompleta

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          if (msg.result !== undefined && msg.id === 1 && !initDone) {
            // Respuesta al initialize — enviar tools/list
            initDone = true;
            const toolsReq = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n';
            proc.stdin.write(toolsReq);
          } else if (msg.result !== undefined && msg.id === 2) {
            // Respuesta al tools/list
            done = true;
            clearTimeout(timer);
            proc.kill();
            const tools = (msg.result.tools ?? []).map(t => t.name);
            resolve({ server: server.name, ok: true, tools, latencyMs: Date.now() - t0 });
          }
        } catch { /* JSON incompleto, seguir acumulando */ }
      }
    });

    proc.on('error', e => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ server: server.name, ok: false, error: e.message });
    });

    proc.on('exit', code => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0 && code !== null) {
        resolve({ server: server.name, ok: false, error: `exit code ${code}` });
      }
    });

    // Enviar initialize después de que el proceso esté listo
    const initMsg = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities:    {},
        clientInfo:      { name: 'health-check', version: '1.0' },
      },
    }) + '\n';

    proc.stdin.write(initMsg);
  });
}

/**
 * Verifica ambos servidores MCP en paralelo.
 * @param {string} root
 * @returns {Promise<Array>}
 */
async function checkMcpServers(root) {
  const servers = [
    { name: 'gemini-bridge',    script: path.join(root, 'scripts', 'mcp-gemini.js') },
    { name: 'anthropic-router', script: path.join(root, 'scripts', 'mcp-anthropic.js') },
  ];

  return Promise.all(servers.map(s => checkMcpServer(s, root)));
}

module.exports = { checkDependencies, checkSkills, checkMcpServers };
