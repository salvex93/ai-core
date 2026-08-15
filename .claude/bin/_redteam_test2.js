const { execFileSync } = require('node:child_process');
// U+041E (О cirilica) en vez de O latina, dentro de "DROP"
const payload = 'DR' + '\u041e' + 'P TABLE usuarios';
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
console.log('payload_codepoints=', [...payload].map(c => c.codePointAt(0).toString(16)));
console.log('stderr=' + stderr);
