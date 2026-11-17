'use strict';

// Reduce las formas con que se disfraza el nombre de un comando para que las reglas
// de patron lo vean como lo interpreta el shell: r\\m, "rm", 'rm' y curl${IFS}url.
// Solo se usa para evaluar reglas; nunca para ejecutar ni mostrar el comando.
function desofuscarComando(cmd) {
  return cmd
    .replace(/\$\{?IFS\}?/g, ' ')
    // En Windows la barra invertida es separador de ruta, no escape
    .replace(process.platform === 'win32' ? /(?!)/g : /\\(?=[A-Za-z0-9])/g, '')
    .replace(/(["'])([\w.\/-]+)\1/g, '$2');
}

module.exports = { desofuscarComando };
