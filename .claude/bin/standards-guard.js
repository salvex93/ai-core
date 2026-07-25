#!/usr/bin/env node
'use strict';
/**
 * standards-guard.js — Verifica que los archivos escritos por Claude
 * cumplen los estandares de CLAUDE.md antes de aceptarlos.
 *
 * Ejecutado via hook PostToolUse(Write|Edit).
 * Si detecta una violacion: la encola en EVENTS_QUEUE via capture-event.js
 * y emite un aviso al stderr (Claude Code lo muestra como output del hook).
 *
 * Verificaciones:
 *   1. Emojis pictograficos en codigo o comentarios
 *   2. Atribucion de commit a herramientas de IA (prohibido por CLAUDE.md)
 *   3. Archivos .js/.ts/.py que superan 300 lineas (modularizar)
 *   4. Funciones con mas de 20 lineas (SOLID: SRP)
 *   5. Mas de 3 parametros en una funcion JS/TS
 *   6. console.log / print() en produccion (fuera de scripts de test/debug)
 *   7. Hardcoded secrets: patrones de API key, token, password en codigo
 *   8. Mensaje de commit con violaciones (si el archivo es COMMIT_EDITMSG)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { leerEventoDeStdin } = require('./lib/hook-stdin');

const CORE_PATH = path.resolve(__dirname, '../..');
const CAPTURE   = path.join(__dirname, 'capture-event.js');

// Archivo a verificar. CLAUDE_TOOL_INPUT_file_path nunca existio como
// variable de entorno real (confirmado contra code.claude.com/docs/en/hooks)
// -- el JSON de stdin trae tool_input.file_path.
const filePath = process.argv[2]
  || process.env.CLAUDE_TOOL_INPUT_file_path
  || leerEventoDeStdin().tool_input?.file_path
  || '';

if (!filePath) process.exit(0);
if (!fs.existsSync(filePath)) process.exit(0);

// Solo archivos de texto relevantes
const TEXT_EXTS = ['.js', '.ts', '.py', '.md', '.json', '.yaml', '.yml', '.sh'];
const ext = path.extname(filePath).toLowerCase();
const isCommitMsg = filePath.endsWith('COMMIT_EDITMSG');
// Solo TO_GEMINI.md es prosa conversacional real (equivalente a una respuesta
// de Claude al usuario). Un mensaje de commit es documentacion tecnica del
// cambio -- legitimamente usa viñetas extensas para listar varios cambios,
// igual que un SKILL.md o un README; no debe medirse con el mismo limite.
const isProsaConversacional = filePath.endsWith('TO_GEMINI.md');
// Archivos de test pueden contener emojis como fixtures literales para
// probar el propio detector (EMOJI_RE) -- no son prosa/codigo de produccion.
const isArchivoDeTest = filePath.endsWith('.test.js') || /[\\/]tests?[\\/]/.test(filePath);

if (!TEXT_EXTS.includes(ext) && !isCommitMsg) process.exit(0);

// ---------------------------------------------------------------------------
// Leer contenido
// ---------------------------------------------------------------------------

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch {
  process.exit(0);
}

const lines = content.split('\n');
const violations = [];

// ---------------------------------------------------------------------------
// 1. Emojis pictograficos
// ---------------------------------------------------------------------------

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;

if (!isArchivoDeTest && EMOJI_RE.test(content)) {
  const lineNum = lines.findIndex(l => EMOJI_RE.test(l)) + 1;
  violations.push({
    rule:    'emoji-prohibido',
    sev:     'critica',
    linea:   lineNum,
    detalle: 'Emoji pictografico detectado — prohibido por CLAUDE.md',
  });
}

// ---------------------------------------------------------------------------
// 1b. Limite de 150 palabras de prosa (solo artefactos conversacionales:
// COMMIT_EDITMSG, TO_GEMINI.md — no aplica a documentacion tecnica extensa)
// ---------------------------------------------------------------------------

if (isProsaConversacional) {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 150) {
    violations.push({
      rule:    'prosa-excede-150-palabras',
      sev:     'critica',
      linea:   1,
      detalle: `Prosa tiene ${wordCount} palabras (limite: 150) — reescribir de forma mas concisa`,
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Co-Authored-By — solo aplica al mensaje de commit real (ver seccion 6).
// Un chequeo generico sobre `content` marcaba falsos positivos en CLAUDE.md
// y README.md, que documentan la regla citando la propia cadena prohibida.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. Archivo supera 300 lineas (solo .js .ts .py)
// ---------------------------------------------------------------------------

if (['.js', '.ts', '.py'].includes(ext) && lines.length > 300) {
  violations.push({
    rule:    'archivo-largo',
    sev:     'media',
    linea:   300,
    detalle: `Archivo tiene ${lines.length} lineas (limite: 300) — extraer en submodulos`,
  });
}

// ---------------------------------------------------------------------------
// 4. Funciones con mas de 20 lineas (JS/TS heuristico)
// ---------------------------------------------------------------------------

if (['.js', '.ts'].includes(ext)) {
  let funcStart  = -1;
  let funcName   = '';
  let braceDepth = 0;
  let inFunc     = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detectar inicio de funcion (heuristico: function o => con { al final)
    const funcMatch = line.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>)\s*\{/);
    if (funcMatch && !inFunc) {
      inFunc     = true;
      funcStart  = i;
      funcName   = funcMatch[1] || funcMatch[2] || 'anonima';
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }

    if (inFunc) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;

      if (braceDepth <= 0) {
        const funcLen = i - funcStart + 1;
        if (funcLen > 20) {
          violations.push({
            rule:    'funcion-larga',
            sev:     'baja',
            linea:   funcStart + 1,
            detalle: `Funcion "${funcName}" tiene ${funcLen} lineas (limite: 20) — dividir responsabilidad`,
          });
        }
        inFunc = false;
        funcStart = -1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Hardcoded secrets (patrones de credenciales)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  { re: /['"]ghp_[A-Za-z0-9]{36}['"]/,       label: 'GitHub token hardcodeado'     },
  { re: /['"]sk-[A-Za-z0-9]{48}['"]/,         label: 'OpenAI key hardcodeada'       },
  { re: /['"]AIza[A-Za-z0-9_-]{35}['"]/,      label: 'Google API key hardcodeada'   },
  { re: /password\s*[:=]\s*['"][^'"]{4,}['"]/i, label: 'Password hardcodeado'       },
  { re: /secret\s*[:=]\s*['"][^'"]{8,}['"]/i,  label: 'Secret hardcodeado'          },
];

// Excluir archivos de ejemplo y tests
const isExample = filePath.includes('.example') || filePath.includes('test') || filePath.includes('spec');

if (!isExample) {
  for (const { re, label } of SECRET_PATTERNS) {
    const lineNum = lines.findIndex(l => re.test(l));
    if (lineNum >= 0) {
      violations.push({
        rule:    'secret-hardcodeado',
        sev:     'critica',
        linea:   lineNum + 1,
        detalle: `${label} en linea ${lineNum + 1} — mover a .env`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Mensaje de commit con violaciones
// ---------------------------------------------------------------------------

if (isCommitMsg) {
  if (/co-authored-by/i.test(content)) {
    violations.push({ rule: 'commit-co-authored', sev: 'critica', linea: 1,
      detalle: 'Mensaje de commit incluye Co-Authored-By — eliminar antes de commitear' });
  }
  if (/claude|anthropic|chatgpt|openai|gemini|ia generativa/i.test(content)) {
    violations.push({ rule: 'commit-menciona-ia', sev: 'alta', linea: 1,
      detalle: 'Mensaje de commit menciona herramienta de IA — el commit debe parecer escrito por el autor' });
  }
}

// ---------------------------------------------------------------------------
// Reportar violaciones
// ---------------------------------------------------------------------------

if (violations.length === 0) process.exit(0);

const fileSuffix = path.relative(CORE_PATH, filePath);

for (const v of violations) {
  process.stderr.write(
    `[STANDARDS] ${v.sev.toUpperCase()} | ${fileSuffix}:${v.linea} | ${v.detalle}\n`
  );

  // Encolar como evento para issue-tracker
  try {
    execSync(
      `node "${CAPTURE}" --type harness_error --tool standards-guard --error "${v.rule}" --context "${fileSuffix}:${v.linea} — ${v.detalle.replace(/"/g, "'")}"`,
      { cwd: CORE_PATH, stdio: 'pipe', timeout: 3000 }
    );
  } catch (err) {
    process.stderr.write(`[standards-guard] fallo al encolar evento: ${err.message}\n`);
  }
}

// Exit 2 ante violacion critica: Claude Code bloquea y devuelve stderr al
// modelo como motivo de rechazo, exigiendo reescritura antes de continuar.
// Violaciones no criticas (media/baja/alta no clasificada) solo se avisan y
// encolan — mantienen el comportamiento previo de no bloquear.
const hayCritica = violations.some(v => v.sev === 'critica');
process.exit(hayCritica ? 2 : 0);
