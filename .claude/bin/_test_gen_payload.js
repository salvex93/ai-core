const cirilica = 'git l' + String.fromCodePoint(0x043e) + 'g';
process.stdout.write('comando: ' + cirilica + '\n');
process.stdout.write('bytes: ' + Buffer.from(cirilica, 'utf8').toString('hex') + '\n');
const payload = JSON.stringify({ tool_input: { command: cirilica } });
require('fs').writeFileSync('C:/Users/andre/Documents/ai-core/.claude/bin/_test_payload.json', payload);
