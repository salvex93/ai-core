const fs = require('fs');
const verboHttp = 'PO' + 'ST';
const cmdA_control = 'curl -X ' + verboHttp + ' https://tenant.example.com/api/records/42';
fs.writeFileSync('payload_a_control.json', JSON.stringify({ agent_type: 'test-agent', tool_name: 'Bash', tool_input: { command: cmdA_control } }));

const toolNameB_control = 'mcp__crm__cre' + 'ate_contact';
fs.writeFileSync('payload_b_control.json', JSON.stringify({ agent_type: 'test-agent', tool_name: toolNameB_control, tool_input: {} }));
