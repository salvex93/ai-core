#!/usr/bin/env node
// AI-CORE v2.6.0 | Arquitectura por salvex93

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform();
const homeDir = os.homedir();

const CORE_PATH = path.resolve(__dirname, '..', '..');

const projectDir = process.cwd();
const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
const skillsDirPath = path.join(projectDir, '.claude', 'skills');

function getSessionsDir() {
  if (platform === 'win32') {
    return path.resolve(homeDir, 'AppData', 'Roaming', '.claude', 'sessions');
  } else if (platform === 'darwin') {
    return path.resolve(homeDir, 'Library', 'Application Support', '.claude', 'sessions');
  } else {
    return path.resolve(homeDir, '.config', '.claude', 'sessions');
  }
}

function isGitRepository(dir) {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: dir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isSymlink(targetPath) {
  try {
    const stat = fs.lstatSync(targetPath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function removeRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.readdirSync(targetPath).forEach(file => {
      removeRecursive(path.join(targetPath, file));
    });
    fs.rmdirSync(targetPath);
  } else {
    fs.unlinkSync(targetPath);
  }
}

function createSymlink(linkPath, targetPath, isDir = false) {
  removeRecursive(linkPath);

  if (platform === 'win32' && isDir) {
    fs.symlinkSync(targetPath, linkPath, 'junction');
  } else {
    fs.symlinkSync(targetPath, linkPath, isDir ? 'dir' : 'file');
  }
}

function autoUpdate() {
  if (!isGitRepository(CORE_PATH)) return;

  try {
    execSync('git pull origin main --quiet', {
      cwd: CORE_PATH,
      stdio: 'ignore',
    });
  } catch {
  }
}

function normalizeSymlinks() {
  const coreClaude = path.join(CORE_PATH, 'CLAUDE.md');
  if (!isSymlink(claudeMdPath)) {
    try {
      createSymlink(claudeMdPath, coreClaude, false);
    } catch (err) {
      if (err.code === 'EPERM') {
        console.error('[!] ERROR: Permisos insuficientes para crear enlaces simbolicos. Ejecuta como Administrador.');
        process.exit(1);
      }
    }
  }

  const coreSkills = path.join(CORE_PATH, '.claude', 'skills');
  if (!isSymlink(skillsDirPath)) {
    try {
      createSymlink(skillsDirPath, coreSkills, true);
    } catch (err) {
      if (err.code === 'EPERM') {
        console.error('[!] ERROR: Permisos insuficientes para crear enlaces simbolicos. Ejecuta como Administrador.');
        process.exit(1);
      }
    }
  }
}

function purgeSessionsDir() {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) return;

  fs.readdirSync(sessionsDir).forEach(file => {
    removeRecursive(path.join(sessionsDir, file));
  });
}

function injectProjectRules() {
  const projectClaudeDir = path.join(projectDir, '.claude');
  if (!fs.existsSync(projectClaudeDir)) {
    fs.mkdirSync(projectClaudeDir, { recursive: true });
  }

  const projectSettingsPath = path.join(projectClaudeDir, 'settings.json');
  let settings = {};

  if (fs.existsSync(projectSettingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(projectSettingsPath, 'utf8'));
    } catch {
      settings = {};
    }
  }

  if (!settings.permissions) {
    settings.permissions = {};
  }

  if (!settings.permissions.allow) {
    settings.permissions.allow = [];
  }

  if (!settings.permissions.allow.includes('Read') && !settings.permissions.allow.includes('Read(.claude)')) {
    settings.permissions.allow.push('Read');
  }

  fs.writeFileSync(projectSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

autoUpdate();
normalizeSymlinks();
injectProjectRules();
purgeSessionsDir();

console.log('[SUCCESS] AI-CORE v2.6.0 | salvex93 | Entorno Sincronizado.');
