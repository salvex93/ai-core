const { execFileSync } = require('node:child_process');
// git reset --hard: el regex /\bgit\s+reset\s+.*--hard\b/ no tiene flag 'i'.
// Alternar mayusculas en "reset"/"hard" (Windows/git en PowerShell no distingue
// case en el binario, pero el argumento --hard si es sensible a mayusculas
// para git realmente -- git normaliza subcomandos, veamos si el regex lo nota).
const payload = 'git ReSeT --HaRd HEAD~1';
const env = Object.assign({}, process.env, {
  AI_CORE_BREAK_GLASS_DIR: 'C:\\Users\\andre\\AppData\\Local\\Temp\\ai-core-redteam-bg',
  CLAUDE_TOOL_INPUT_command: payload,
});
let exitCode = 0;
let stderr = '';
try {
  execFileSync('node', ['.claude/bin/destructive-op-guard.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  exitCode = e.status;
  stderr = e.stderr ? e.stderr.toString() : '';
}
console.log('EXIT_CODE=' + exitCode);
console.log('payload=' + payload);
console.log('stderr=' + stderr);
