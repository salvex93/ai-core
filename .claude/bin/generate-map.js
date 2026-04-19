const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function generateContextMap() {
  const projectRoot = process.cwd();

  const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  const filesOutput = execSync('git ls-files', { encoding: 'utf-8' });
  const files = filesOutput
    .split('\n')
    .filter((f) => f.length > 0 && !f.startsWith('node_modules/'))
    .sort();

  const map = {};
  const rootFiles = [];

  files.forEach((file) => {
    const parts = file.split('/');

    if (parts.length === 1) {
      rootFiles.push(file);
    } else {
      const dirKey = parts[0] + '/';

      if (!map[dirKey]) {
        map[dirKey] = [];
      }

      map[dirKey].push(file);
    }
  });

  const contextMap = {
    version: '2.6.2',
    last_updated: new Date().toISOString(),
    branch,
    map: {
      root: 'ai-core/',
      directories: map,
      root_files: rootFiles,
      excluded: ['node_modules/', '.git/'],
      total_files: files.length
    }
  };

  const outputPath = path.join(projectRoot, '.claude', 'CONTEXT_MAP.json');
  fs.writeFileSync(outputPath, JSON.stringify(contextMap, null, 2), 'utf-8');

  console.log(`[SUCCESS] AI-CORE Mapeo completado. Archivos indexados: ${files.length}.`);
}

generateContextMap();
