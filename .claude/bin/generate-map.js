const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require(path.resolve(__dirname, '../../package.json'));
const { detectStack } = require('./detect-stack');

// CORE_PATH = raiz del submodulo ai-core
// HOST_PATH = raiz del proyecto anfitrion (donde se ejecuta el comando)
const CORE_PATH = path.resolve(__dirname, '../..');
const HOST_PATH = process.cwd();

function lsFiles(cwd) {
  try {
    return execSync('git ls-files', { cwd, encoding: 'utf-8' })
      .split('\n')
      .filter(f => f.length > 0 && !f.startsWith('node_modules/'))
      .sort();
  } catch {
    return [];
  }
}

function getBranch(cwd) {
  try {
    return execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function buildDirMap(files) {
  const map = {};
  const rootFiles = [];
  files.forEach(file => {
    const parts = file.split('/');
    if (parts.length === 1) {
      rootFiles.push(file);
    } else {
      const dirKey = parts[0] + '/';
      if (!map[dirKey]) map[dirKey] = [];
      map[dirKey].push(file);
    }
  });
  return { map, rootFiles };
}

function generateContextMap() {
  const isStandalone = HOST_PATH === CORE_PATH;

  // Archivos del submodulo ai-core
  const coreFiles = lsFiles(CORE_PATH);
  const { map: coreMap, rootFiles: coreRootFiles } = buildDirMap(coreFiles);

  // Archivos del proyecto anfitrion (si aplica)
  let hostFiles = [];
  let hostMap   = {};
  let hostRootFiles = [];
  if (!isStandalone) {
    hostFiles = lsFiles(HOST_PATH).filter(f => !f.startsWith('.claude/ai-core/'));
    const built = buildDirMap(hostFiles);
    hostMap      = built.map;
    hostRootFiles = built.rootFiles;
  }

  const branch = getBranch(isStandalone ? CORE_PATH : HOST_PATH);
  const stack  = isStandalone ? null : detectStack(HOST_PATH);

  const contextMap = {
    version,
    last_updated: new Date().toISOString(),
    branch,
    stack: stack ? { techs: stack.techs, labels: stack.labels } : null,
    host: {
      root: isStandalone ? 'ai-core/' : HOST_PATH,
      directories: isStandalone ? coreMap : hostMap,
      root_files:  isStandalone ? coreRootFiles : hostRootFiles,
      excluded: ['node_modules/', '.git/'],
      total_files: isStandalone ? coreFiles.length : hostFiles.length,
    },
    core: isStandalone ? null : {
      root: CORE_PATH,
      directories: coreMap,
      root_files:  coreRootFiles,
      excluded: ['node_modules/', '.git/'],
      total_files: coreFiles.length,
    },
  };

  // Escribir en .claude/ del proyecto anfitrion (o del core si standalone)
  const outputDir = isStandalone
    ? path.join(CORE_PATH, '.claude')
    : path.join(HOST_PATH, '.claude');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'CONTEXT_MAP.json');
  fs.writeFileSync(outputPath, JSON.stringify(contextMap, null, 2), 'utf-8');

  const total = isStandalone ? coreFiles.length : hostFiles.length + coreFiles.length;
  console.log(`[SUCCESS] AI-CORE Mapeo completado. Archivos indexados: ${total}.`);
}

generateContextMap();
