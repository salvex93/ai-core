'use strict';

// Descarta texto citado (mensaje de commit y cuerpo de heredoc) que no es un
// comando real de shell, para que un guard no se autobloquee al documentar.
// Solo se oculta lo que de verdad no se ejecuta: un heredoc hacia un
// interprete o una sustitucion dentro de -m SI se ejecutan y quedan visibles.

const INTERPRETE = /\b(?:ba|z|da|k|c|fi|a)?sh\b|\b(?:python|perl|ruby|node|php|lua|osascript|deno|bun)\w*\b|\b(?:eval|source|xargs|exec)\b/;
const SEPARADORES = [';', '&&', '||', '|', '\n'];

function inicioDeSegmento(texto) {
  return Math.max(0, ...SEPARADORES.map((s) => (texto.lastIndexOf(s) >= 0 ? texto.lastIndexOf(s) + s.length : 0)));
}

function esMensajeDeCommit(cmd, offset, coincidencia, comilla) {
  if (comilla === '"' && /\$\(|`/.test(coincidencia)) return false;
  const previo = cmd.slice(0, offset);
  return /\bgit\s+commit\b/.test(previo.slice(inicioDeSegmento(previo)));
}

function enmascararMensajes(cmd) {
  if (!/\bgit\s+commit\b/.test(cmd)) return cmd;
  return cmd
    .replace(/-m\s+(["'])(?:(?!\1).)*\1/gs, (m, comilla, offset) => (esMensajeDeCommit(cmd, offset, m, comilla) ? '-m "..."' : m))
    .replace(/-F\s+\S+/g, '-F ...');
}

function lineaDe(cmd, offset) {
  const inicio = cmd.lastIndexOf('\n', offset - 1) + 1;
  const fin = cmd.indexOf('\n', offset);
  return cmd.slice(inicio, fin === -1 ? cmd.length : fin);
}

function enmascararHeredocs(cmd) {
  return cmd.replace(
    /<<-?\s*(['"]?)([A-Za-z_]\w*)\1([\s\S]*?)\n[ \t]*\2\b/g,
    (m, _c, delimitador, _cuerpo, offset) => (INTERPRETE.test(lineaDe(cmd, offset)) ? m : `<<'${delimitador}'\n...\n${delimitador}`)
  );
}

function enmascararComando(cmd) {
  return enmascararHeredocs(enmascararMensajes(cmd));
}

module.exports = { enmascararComando };
