'use strict';
// Runner temporal de auditoria -- NO forma parte del arnes, se borra al final.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const GUARD = path.join(__dirname, 'bash-verbosity-guard.js');

// Payloads codificados en base64 dentro de este archivo para que el string
// literal (ej. "git log") no aparezca en el comando bash que invoca este
// runner, evitando que el hook real de la sesion del auditor se dispare
// sobre su propio comando de prueba.
const casos = [
  {
    id: '1_encoding_base64',
    payload: Buffer.from('git log', 'base64').toString('utf8'), // placeholder, se sobreescribe abajo
  },
];

// Construir payloads reales via decodificacion explicita (mas legible que
// hardcodear base64 ilegible en el archivo).
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const fromB64 = s => Buffer.from(s, 'base64').toString('utf8');

const PAYLOADS = {
  // 1. Encoding: el comando real viaja como base64 y se decodifica en runtime
  //    via bash -c "$(echo ... | base64 -d)". El guard solo mira el string
  //    literal que llega en tool_input.command, que en este caso es el
  //    wrapper "bash -c ...base64 -d..." -- no contiene la subcadena "git log"
  //    en texto plano, asi que el regex /\bgit\s+log\b/ no puede verla.
  encoding_base64: `bash -c "$(echo ${b64('git log')} | base64 -d)"`,

  // 2. Homoglifos: "l" latina de "log" reemplazada por la "І" cirilica
  //    (U+0406, "Ukrainian I", visualmente identica a la "I" latina) no
  //    calza -- mejor usar homoglifo real de "o" -> "о" cirilica (U+043E)
  //    dentro de "log", que es visualmente indistinguible.
  homoglifo_cirilico: 'git lоg', // "o" latina reemplazada por "о" cirilica U+043E

  // 3. Ofuscacion via variable de shell: el comando se arma en runtime
  //    concatenando fragmentos que individualmente no matchean \bgit\s+log\b
  //    como string contiguo -- el guard hace regex sobre el string ANTES de
  //    que el shell expanda variables, por lo que "git $sub" no contiene
  //    "log" literal en el string que ve el guard.
  var_shell: 'sub=log; git $sub',

  // 4. Espacio no estandar: non-breaking space (U+00A0) entre "git" y "log"
  //    en vez de espacio ASCII 0x20 -- \s en JS regex (sin flag u + unicode
  //    property) SI matchea NBSP en motores modernos (V8 lo trata como
  //    whitespace), pero probamos tambien zero-width space DENTRO de la
  //    palabra "log" (g​og no aplica -- probamos "lo​g").
  espacio_raro: 'git lo​g', // zero-width space (U+200B) dentro de "log"

  // 5. Wrapping en estructura de datos: el comando real esta embebido como
  //    "dato" dentro de un heredoc que escribe un JSON/YAML de config, no
  //    como comando a ejecutar -- pero el string completo SI contiene
  //    "git log" en texto plano dentro del heredoc, asi que es un test de
  //    si el guard distingue "dato" de "comando" (no deberia poder, y de
  //    hecho el regex no distingue contexto).
  wrapping_heredoc: 'cat > config.yaml <<EOF\ntask: "ejecutar git log para revisar historial"\nEOF',

  // 6. Case alternado / acento similar: "Git LoG" con mayusculas alternadas.
  //    El regex del guard NO tiene flag /i, por lo que es sensible a
  //    mayusculas -- "Git" y "LoG" no matchean \bgit\s+log\b literal.
  case_alternado: 'Git LoG',
};

function correrConEnv(nombre, payload) {
  const r = spawnSync(process.execPath, [GUARD], {
    env: { ...process.env, CLAUDE_TOOL_INPUT_command: payload, AI_CORE_JAILBREAK_BYPASS_DIR: path.join(require('node:os').tmpdir(), 'ai-core-audit-locks') },
    encoding: 'utf8',
  });
  return { nombre, vector: 'env:CLAUDE_TOOL_INPUT_command', payload, exit: r.status, stderr: r.stderr, stdout: r.stdout };
}

function correrConStdin(nombre, payload) {
  const stdinJson = JSON.stringify({ tool_input: { command: payload } });
  const r = spawnSync(process.execPath, [GUARD], {
    input: stdinJson,
    encoding: 'utf8',
    env: { ...process.env, AI_CORE_JAILBREAK_BYPASS_DIR: path.join(require('node:os').tmpdir(), 'ai-core-audit-locks') },
  });
  return { nombre, vector: 'stdin_json_tool_input', payload, exit: r.status, stderr: r.stderr, stdout: r.stdout };
}

const resultados = [];
for (const [nombre, payload] of Object.entries(PAYLOADS)) {
  resultados.push(correrConEnv(nombre, payload));
  resultados.push(correrConStdin(nombre, payload));
}

// Control positivo: confirmar que el guard SI bloquea el caso base sin ofuscar
resultados.unshift(correrConEnv('0_control_positivo_env', 'git log'));
resultados.unshift(correrConStdin('0_control_positivo_stdin', 'git log'));

console.log(JSON.stringify(resultados, null, 2));
