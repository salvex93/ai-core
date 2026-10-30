'use strict';
const { ADAPTERS } = require('./adapters');

// Arnes ajeno: el comando corre en el directorio de trabajo y recibe el prompt como $1
function externalAdapter(cmd) {
  if (!cmd || !cmd.trim()) throw new Error('adapter-cmd vacio');
  return {
    verified: true, parser: 'plain-text', bin: 'sh',
    setup: () => {},
    args: (prompt) => ['-c', cmd, 'bench', prompt],
  };
}

function registerExternal(cmd) {
  ADAPTERS.external = externalAdapter(cmd);
}

module.exports = { externalAdapter, registerExternal };
