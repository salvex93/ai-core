#!/usr/bin/env node
'use strict';
/**
 * destructive-op-guard.js — Gate preventivo sobre comandos Bash destructivos
 * sin confirmacion humana previa (Gobierno de Agentes, CLAUDE.md: "Human-in-
 * the-loop obligatorio para operaciones destructivas").
 *
 * Antes de este guard, esa regla era pura convencion en prosa -- ningun
 * mecanismo de codigo la hacia cumplir. Este hook bloquea (exit 2) ANTES de
 * ejecutar si el comando coincide con un patron destructivo conocido
 * (borrado recursivo, force-push, reset/clean irreversible, DDL/DML
 * destructivo de base de datos sin filtro, mensaje de commit con
 * Co-Authored-By o atribucion de autoria a una IA -- este ultimo cierra un
 * gap real: standards-guard.js ya bloqueaba esto pero solo si el mensaje se
 * escribia primero a un archivo via Write/Edit, un "git commit -m/-F"
 * directo por Bash no pasaba por ningun guard de contenido -- y comandos
 * destructivos de infraestructura: kubectl delete --all sin --dry-run,
 * terraform destroy/apply -destroy sin -target, terraform apply
 * -auto-approve, docker system prune --volumes, docker volume rm, git push
 * --delete de rama remota; sintaxis de cada uno verificada contra
 * kubernetes.io, developer.hashicorp.com/terraform, docs.docker.com y
 * git-scm.com), mostrando el comando exacto y el motivo. El bloqueo en
 * si YA es la aprobacion requerida: Claude Code no reintenta un comando
 * bloqueado sin que el humano lo apruebe explicitamente en el turno
 * siguiente (los hooks PreToolUse no pueden pausar a mitad de tool call para
 * pedir confirmacion interactiva real, solo bloquear con exit 2 y mostrar
 * contexto -- mismo mecanismo que code-exec-guard.js y bash-verbosity-guard.js).
 *
 * Deliberadamente conservador: solo bloquea patrones donde la alternativa
 * segura es inequivoca (--force-with-lease en vez de --force, git branch -d
 * en vez de -D, --dry-run antes de kubectl delete --all, -target antes de
 * terraform destroy). Ante duda, deja pasar -- falso negativo es preferible
 * a bloquear un flujo legitimo de forma constante. git push --delete de una
 * rama remota bloquea SIEMPRE (no distingue por nombre de rama): el riesgo
 * real es borrar main/master por error de nombre, y ese es exactamente el
 * caso donde la confirmacion humana explicita evita el dano irreversible.
 *
 * El comando llega por JSON en stdin (tool_input.command) -- mismo contrato
 * real de hooks confirmado contra code.claude.com/docs/en/hooks (ver
 * bash-verbosity-guard.js para el detalle de esta regresion).
 *
 * Reglas sin alternativa segura equivalente (rm -rf, git reset --hard, git
 * clean -f, git branch -D, terraform -auto-approve, docker prune/volume rm,
 * git push --delete, del/Remove-Item, TRUNCATE/DROP TABLE, DROP DATABASE)
 * marcan breakGlass:true -- en vez de bloquear sin salida, ofrecen el
 * mecanismo auditable de lib/break-glass.js (id de un solo uso, confirmacion
 * solo via el proximo mensaje real del usuario). Antes, "confirma
 * explicitamente con el usuario" era solo prosa sin ningun enforcement --
 * reintentar el mismo comando volvia a bloquear identico. La excepcion
 * previa de comentario literal ("-- confirmado"/"IF EXISTS...intencional")
 * en TRUNCATE/DROP TABLE/DROP DATABASE NO se retira, sigue siendo valida --
 * break-glass es una via adicional, no un reemplazo.
 *
 * Deliberadamente SIN break-glass (hard-stop absoluto, ninguna excepcion):
 * ofuscacion de comando via eval/Invoke-Expression/iex sobre variable, y
 * Co-Authored-By/atribucion de autoria de IA en mensajes de commit -- el
 * research de gobierno de agentes (2026-08-13) confirma que estos son los
 * casos de mayor blast radius (ejecucion arbitraria encadenada; integridad
 * de autoria del proyecto) donde ni AWS ni Kubernetes ofrecen equivalente de
 * break-glass en sus propios modelos de acceso de emergencia.
 *
 * Uso: node destructive-op-guard.js (recibe el evento PreToolUse por stdin)
 */

const { solicitarBreakGlass, accionAprobada } = require('./lib/break-glass');
const { normalizarTexto } = require('./lib/normalizar-texto');
const { tieneIndicioDeResolucionPrevia } = require('./lib/deteccion-resolucion-previa');

const GUARD_ID = 'destructive-op-guard';

function leerComandoDeStdin() {
  try {
    const fs  = require('node:fs');
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return '';
    const evento = JSON.parse(raw);
    return evento.tool_input?.command || '';
  } catch {
    return '';
  }
}

/**
 * Extrae el mensaje REAL que se va a commitear a partir de un comando
 * "git commit ...", ya sea inline (-m "...") o via archivo (-F <ruta>).
 * Este es el contenido que se inspecciona por Co-Authored-By/menciones de
 * IA -- a diferencia de `cmd` (mas abajo), que enmascara ese mismo texto
 * para que las REGLAS de comandos destructivos no se autobloqueen al
 * describirlo en prosa.
 *
 * @param {string} cmdOriginal - comando de shell completo, sin enmascarar
 * @returns {string} el mensaje real, o '' si no se pudo extraer
 */
function extraerMensajeCommit(cmdOriginal) {
  if (!/\bgit\s+commit\b/.test(cmdOriginal)) return '';

  const matchInline = cmdOriginal.match(/-m\s+(["'])((?:(?!\1).)*)\1/s);
  if (matchInline) return matchInline[2];

  const matchArchivo = cmdOriginal.match(/-F\s+(\S+)/);
  if (matchArchivo) {
    try {
      return require('node:fs').readFileSync(matchArchivo[1], 'utf8');
    } catch {
      return '';
    }
  }
  return '';
}

const cmdOriginal = process.env.CLAUDE_TOOL_INPUT_command
  || (!process.stdin.isTTY ? leerComandoDeStdin() : '');

if (!cmdOriginal) process.exit(0);

// Un git commit -m "..."/-F <archivo> puede mencionar cualquier patron
// destructivo como TEXTO DESCRIPTIVO del propio mensaje (ej. un commit que
// documenta este mismo guard) -- eso no es un comando real de shell, es
// contenido citado. Se descarta el argumento del mensaje antes de evaluar
// las reglas para no bloquear el commit que las documenta.
const cmdEnmascarado = /\bgit\s+commit\b/.test(cmdOriginal)
  ? cmdOriginal.replace(/-m\s+(["'])(?:(?!\1).)*\1/gs, '-m "..."')
               .replace(/-F\s+\S+/g, '-F ...')
  : cmdOriginal;

// Normalizacion Unicode antes de evaluar las REGLAS (hallazgo red-team
// 2026-08-15): homoglifos cirilicos (ej. "О" en "DRОP TABLE"), zero-width
// space y non-breaking space evadian el matching porque las reglas
// comparaban contra el string crudo. Deliberadamente NO se aplica
// toLowerCase() global: "git branch -D" (destructivo, sin --dry-run
// posible) debe seguir distinguiendose de "git branch -d" (seguro,
// alternativa explicita) -- normalizar el case aqui borraria esa
// distincion de seguridad. Cada regla que necesita case-insensitive ya
// declara su propio flag /i (ver REGLAS abajo); el fix de mayusculas para
// las reglas que carecian de /i (rm, git reset, git clean, "del /F /S") se
// aplica en el flag de cada regla especifica, no aqui.
const cmd = normalizarTexto(cmdEnmascarado);

// Mensaje REAL de commit (no enmascarado) -- se inspecciona por separado del
// loop de REGLAS porque necesita distinguir atribucion real de IA (bloquea)
// de una mencion en prosa sobre esta misma regla, ej. un commit que la
// documenta (no bloquea). CLAUDE.md: "PROHIBIDO incluir Co-Authored-By,
// menciones a Claude, IA o herramientas externas en cualquier mensaje de
// commit" -- standards-guard.js ya aplica esto cuando el mensaje se escribe
// primero a un archivo via Write/Edit, pero un "git commit -m/-F" ejecutado
// directo por Bash nunca pasaba por ese guard.
const mensajeCommit = extraerMensajeCommit(cmdOriginal);
if (mensajeCommit) {
  // Co-Authored-By es un trailer de formato inequivoco (Nombre <email>) --
  // nadie lo escribe como prosa casual, no necesita distincion de contexto.
  const trailerCoAuthored = /^co-authored-by:\s*.+<.+>/im;
  // Menciones de IA en CONTEXTO DE ATRIBUCION DE AUTORIA real (ej. "Generated
  // with Claude", "sugerido por ChatGPT") -- deliberadamente mas estricto que
  // una mencion neutra de la herramienta en prosa (ej. un commit que dice
  // "prohibir menciones a Claude" esta hablando DE la regla, no atribuyendo
  // autoria real, y no debe autobloquearse).
  const atribucionIA = /(generated (with|by)|written (with|by)|co-authored|sugerido(s)? por|generado(s)? (con|por)|escrito(s)? (con|por))\s+(claude|anthropic|chatgpt|openai|gemini|copilot|gpt-\d)/i;

  if (trailerCoAuthored.test(mensajeCommit) || atribucionIA.test(mensajeCommit)) {
    process.stderr.write(
      `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (mensaje de commit con rastro de IA): "${mensajeCommit.slice(0, 200)}"\n` +
      `Motivo: CLAUDE.md prohibe Co-Authored-By y menciones de autoria de IA en mensajes de commit -- el mensaje debe parecer escrito enteramente por el autor humano.\n` +
      `Reescribe el mensaje sin esa atribucion antes de reintentar el commit.\n`
    );
    process.exit(2);
  }
}

// Cada regla: patron que dispara el bloqueo + patron de excepcion (alternativa
// ya segura que no debe bloquearse) + motivo mostrado al operador.
const REGLAS = [
  {
    nombre: 'rm -rf',
    // Cubre combinada corta (-rf/-fr), formas largas (--recursive --force en
    // cualquier orden) y mezcla corta+larga (-r --force, --recursive -f) --
    // hallazgo de auditoria 2026-08-14: solo se cubria la forma corta combinada.
    // Flag /i agregado (hallazgo red-team 2026-08-15): "RM -rf" en
    // mayusculas evadia el bloqueo -- el nombre del comando no distingue
    // seguridad por case, a diferencia de flags como git branch -D/-d.
    disparo: /\brm\s+.*(?:(?:-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b)|(?:-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\b)|(?:(?:-r\b|--recursive\b).*(?:-f\b|--force\b))|(?:(?:-f\b|--force\b).*(?:-r\b|--recursive\b)))/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado recursivo forzado -- irreversible, sin papelera de reciclaje.',
  },
  {
    nombre: 'git push --force',
    disparo: /\bgit\s+push\b.*(--force\b|(?<!--force-with-lease)\s-f\b)/i,
    excepcion: /--force-with-lease/i,
    motivo: 'sobreescribe el historial remoto sin verificar si alguien mas pusheo -- usar --force-with-lease en su lugar.',
  },
  {
    nombre: 'git reset --hard',
    disparo: /\bgit\s+reset\s+.*--hard\b/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'descarta cambios locales sin posibilidad de recuperacion (working tree + index).',
  },
  {
    nombre: 'git clean -f',
    disparo: /\bgit\s+clean\s+.*-[a-zA-Z]*f/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra archivos no trackeados de forma irreversible -- puede incluir trabajo en progreso nunca commiteado.',
  },
  {
    nombre: 'git branch -D',
    disparo: /\bgit\s+branch\s+.*-D\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra una rama sin verificar si esta mergeada -- usar -d (minuscula) si la rama ya esta integrada.',
  },
  {
    // La palabra TRUNCATE/DROP TABLE dentro de un patron de busqueda (grep,
    // rg, findstr, ag) no ejecuta nada contra una base de datos -- es texto
    // a buscar, no DDL real. Sin esta exclusion, "grep TRUNCATE archivo.sql"
    // se bloqueaba igual que un TRUNCATE TABLE real ejecutado por psql/mysql.
    // La excepcion exige que la herramienta de busqueda aparezca ANTES del
    // patron destructivo en el comando (mismo lado del pipe/`;` que la
    // palabra) para no eximir un comando encadenado real como
    // "grep foo; psql -c TRUNCATE TABLE x", donde el TRUNCATE real esta en
    // otro comando distinto separado por ; o &&.
    nombre: 'DROP TABLE / TRUNCATE sin filtro',
    disparo: /\b(DROP\s+TABLE|TRUNCATE(\s+TABLE)?)\b/i,
    excepcion: /IF\s+EXISTS.*--\s*intencional|--\s*confirmado|\b(grep|rg|findstr|ag)\b[^;&|]*(DROP\s+TABLE|TRUNCATE)/i,
    breakGlass: true,
    motivo: 'elimina datos o estructura de tabla de forma irreversible sin backup verificado en el propio comando.',
  },
  {
    nombre: 'kubectl delete --all',
    disparo: /\bkubectl\s+delete\b.*(--all\b|--all-namespaces\b)/,
    excepcion: /--dry-run/,
    motivo: 'elimina todos los recursos del tipo/namespace indicado -- verificado contra kubernetes.io: "may result in inconsistency or data loss". Usar --dry-run=server primero para confirmar el alcance.',
  },
  {
    nombre: 'terraform destroy',
    disparo: /\bterraform\s+(destroy\b|apply\s+.*-destroy\b)/,
    excepcion: /-target\b/,
    motivo: 'destruye infraestructura viva -- HashiCorp recomienda "terraform plan -destroy" primero para revisar el alcance, o -target para acotar a un recurso especifico.',
  },
  {
    nombre: 'terraform apply -auto-approve',
    disparo: /\bterraform\s+apply\b.*-auto-approve\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'omite la revision interactiva del plan antes de aplicar -- HashiCorp advierte verificar que nada mas pueda cambiar la infraestructura fuera de este flujo.',
  },
  {
    nombre: 'docker system prune --volumes',
    disparo: /\bdocker\s+system\s+prune\b.*--volumes\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borra volumenes anonimos ademas de contenedores/imagenes/redes -- docker no los borra por defecto justamente para evitar perdida de datos.',
  },
  {
    nombre: 'docker volume rm',
    disparo: /\bdocker\s+volume\s+rm\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'elimina un volumen de datos de forma irreversible -- confirmar que no contiene datos que no esten respaldados en otro lugar.',
  },
  {
    nombre: 'git push --delete (borrado de rama remota)',
    // Sintaxis moderna --delete/-d, y la antigua "origin :rama" (equivalentes
    // segun git-scm.com) -- el lado izquierdo de ":" debe estar vacio para
    // que sea un borrado; "origin HEAD:main" (refspec normal) no debe matchear.
    disparo: /\bgit\s+push\s+\S+\s+(--delete\b|-d\b|:\S+)/,
    excepcion: null,
    breakGlass: true,
    motivo: 'elimina una rama del repositorio remoto -- confirmar que no es una rama protegida (main/master/develop) antes de reintentar.',
  },
  {
    nombre: 'DELETE/UPDATE sin WHERE',
    // Ancla al verbo DML destructivo (nunca a SELECT) y exige ausencia de
    // WHERE en toda la sentencia, no solo al final -- evita el falso
    // positivo de "DELETE FROM tabla WHERE id = $1" (uso rutinario).
    disparo: /\b(DELETE\s+FROM\s+\S+|UPDATE\s+\S+\s+SET\s+.+?)(;|"|$)/i,
    excepcion: /\bWHERE\b/i,
    motivo: 'modifica o elimina filas sin condicion -- afecta la tabla completa. Agregar WHERE para acotar el alcance, o confirmar explicitamente si el alcance total es intencional.',
  },
  {
    nombre: 'DROP DATABASE',
    disparo: /\bDROP\s+DATABASE\b/i,
    excepcion: /IF\s+EXISTS.*--\s*intencional|--\s*confirmado/i,
    breakGlass: true,
    motivo: 'elimina una base de datos completa de forma irreversible sin backup verificado en el propio comando.',
  },
  {
    // Equivalente nativo de Windows cmd.exe a "rm -rf" -- ausente hasta ahora
    // pese a que destructive-op-guard.js corre igual en Windows (settings.json
    // se genera y ejecuta en la misma maquina, ver hooks-definition.js).
    nombre: 'del /f /s /q (cmd.exe)',
    disparo: /\bdel\s+(\/[a-zA-Z]\s+)*\/[fF](\s+\/[a-zA-Z])*\s+\/[sS]\b|\bdel\s+(\/[a-zA-Z]\s+)*\/[sS](\s+\/[a-zA-Z])*\s+\/[fF]\b/,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado forzado y recursivo de archivos via cmd.exe -- equivalente Windows de "rm -rf", irreversible.',
  },
  {
    // Equivalente nativo de PowerShell a "rm -rf".
    // Alias reales de Remove-Item verificados contra learn.microsoft.com/
    // powershell/module/microsoft.powershell.management/remove-item
    // (2026-08-15, vigente 5.1/7+): ri, rd, rmdir, del, erase (ademas de
    // Remove-Item y rm ya cubiertos). Hallazgo red-team: "ri -Recurse
    // -Force" evadia el bloqueo porque solo el nombre completo del cmdlet
    // y "rm" estaban en el patron.
    nombre: 'Remove-Item -Recurse -Force (PowerShell, incluye alias reales)',
    disparo: /\b(Remove-Item|rm|ri|rd|rmdir|erase)\b.*(-Recurse\b.*-Force\b|-Force\b.*-Recurse\b)/i,
    excepcion: null,
    breakGlass: true,
    motivo: 'borrado forzado y recursivo de archivos via PowerShell (o su alias real) -- equivalente Windows de "rm -rf", irreversible.',
  },
];

// Deteccion basica de ofuscacion: un comando destructivo pasado como STRING
// a un evaluador (eval, Invoke-Expression, sh -c/bash -c con variable
// interpolada, o construido a partir de $(...)/${...} en vez de literal)
// puede evadir el matching de string literal de arriba. No decodifica el
// contenido real (eso requeriria un interprete de shell completo, fuera de
// alcance) -- bloquea el patron de evaluacion dinamica en si mismo cuando
// aparece junto a una fuente de datos no literal, que es la señal real de
// intento de evasion, no el uso legitimo de eval con un string constante.
const PATRON_OFUSCACION = /\b(eval|Invoke-Expression|iex)\s*[\s(]\s*(\$\{?\w+\}?|\$\(.+\)|`.+`)/i;
if (PATRON_OFUSCACION.test(cmd)) {
  process.stderr.write(
    `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (evaluacion dinamica de comando ofuscado): "${cmd}"\n` +
    'Motivo: el comando se construye/evalua desde una variable o substitucion en vez de literal -- no se puede verificar su contenido real antes de ejecutar, y es el patron tipico usado para evadir guards de comandos destructivos.\n' +
    'Reescribe el comando de forma literal (sin eval/Invoke-Expression/iex sobre una variable) para que pueda inspeccionarse antes de ejecutar.\n'
  );
  process.exit(2);
}

// Segunda causa raiz cerrada (red-team 2026-08-15): decodificacion
// (base64/hex/Buffer.from/atob) o fragmentacion en variables adyacentes
// ("A=..."; B=...; bash -c "$A$B"), ambas combinadas con una via de
// ejecucion real del resultado -- el contenido peligroso solo existe
// codificado o partido en el string, materializandose recien cuando el
// shell lo interpreta. Mismo tratamiento hard-stop que PATRON_OFUSCACION
// (sin break-glass): es la misma clase de evasion -- el comando no puede
// verificarse por contenido antes de ejecutar.
if (tieneIndicioDeResolucionPrevia(cmd)) {
  process.stderr.write(
    `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (decodificacion o fragmentacion previa a ejecucion): "${cmd}"\n` +
    'Motivo: el comando decodifica contenido (base64/hex) o lo reconstruye desde variables fragmentadas antes de ejecutarlo -- no se puede verificar su contenido real antes de correr, mismo riesgo que un comando destructivo literal.\n' +
    'Reescribe el comando de forma literal (sin decodificar ni fragmentar en variables antes de ejecutar) para que pueda inspeccionarse antes de correr.\n'
  );
  process.exit(2);
}

for (const regla of REGLAS) {
  if (regla.disparo.test(cmd) && !(regla.excepcion && regla.excepcion.test(cmd))) {
    if (regla.breakGlass && accionAprobada(GUARD_ID, cmd)) process.exit(0);

    if (regla.breakGlass) {
      const id = solicitarBreakGlass(GUARD_ID, cmd);
      process.stderr.write(
        `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (${regla.nombre}): "${cmd}"\n` +
        `Motivo: ${regla.motivo}\n` +
        `Si es intencional, confirma explicitamente respondiendo unicamente: CONFIRMAR-${id}\n` +
        '(valido solo por 5 minutos y solo para reintentar este comando exacto -- no autoriza otros comandos destructivos futuros).\n'
      );
      process.exit(2);
    }

    process.stderr.write(
      `[DESTRUCTIVE-OP-GUARD] BLOQUEADO (${regla.nombre}): "${cmd}"\n` +
      `Motivo: ${regla.motivo}\n`
    );
    process.exit(2);
  }
}

process.exit(0);
