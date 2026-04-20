const fs = require('fs');
const path = require('path');

function detoxRootDirectory() {
  const { execSync } = require('child_process');
  const projectRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  const protectedFiles = ['CLAUDE.md', 'README.md'];
  let purgedCount = 0;

  const files = fs.readdirSync(projectRoot);

  files.forEach((file) => {
    if (path.extname(file) === '.md' && !protectedFiles.includes(file)) {
      const filePath = path.join(projectRoot, file);
      try {
        fs.unlinkSync(filePath);
        purgedCount++;
      } catch (err) {
        console.error(`Error eliminando ${file}:`, err.message);
      }
    }
  });

  console.log(`[SUCCESS] AI-CORE Detox ejecutado. Archivos purgados: ${purgedCount}.`);
}

detoxRootDirectory();
