'use strict';

// Descarta texto citado (mensaje de commit y cuerpo de heredoc) que no es un
// comando real de shell, para que un guard no se autobloquee al documentar.
function enmascararComando(cmd) {
  const sinMensaje = /\bgit\s+commit\b/.test(cmd)
    ? cmd.replace(/-m\s+(["'])(?:(?!\1).)*\1/gs, '-m "..."').replace(/-F\s+\S+/g, '-F ...')
    : cmd;
  return sinMensaje.replace(
    /<<-?\s*(['"]?)([A-Za-z_]\w*)\1([\s\S]*?)\n[ \t]*\2\b/g,
    (_m, _c, delimitador) => `<<'${delimitador}'\n...\n${delimitador}`
  );
}

module.exports = { enmascararComando };
