import subprocess, os
payload = 'DR' + 'ОP TABLE usuarios'
env = dict(os.environ)
env['AI_CORE_BREAK_GLASS_DIR'] = '/tmp/ai-core-redteam-bg'
env['CLAUDE_TOOL_INPUT_command'] = payload
r = subprocess.run(['node', '.claude/bin/destructive-op-guard.js'], env=env, capture_output=True, text=True)
print('EXIT_CODE=', r.returncode)
print('payload_repr=', repr(payload))
print('stderr=', r.stderr)
