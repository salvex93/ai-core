#!/usr/bin/env node
/**
 * validate-globals.js
 * Audita que los skills descubiertos en .claude/skills/ (auto-discovery,
 * sin conteo fijo) sean conformes con las reglas globales de CLAUDE.md.
 *
 * Verifica:
 *   1. Que ningun skill copia el bloque PROTOCOLO DE SESION (debe referenciar, no copiar).
 *   2. Que cada skill tiene la referencia inmutable a CLAUDE.md.
 *   3. Que cada skill tiene las secciones obligatorias de estructura.
 *   4. Que ningun skill contradice reglas criticas de CLAUDE.md (emojis, ingles, etc.).
 *   5. Que el frontmatter de cada skill tiene name, version, origin y last_updated.
 *   6. Que name/description cumplen el schema abierto agentskills.io
 *      (agentskills.io/specification): name coincide con la carpeta, formato
 *      minusculas/numeros/guion simple, limites de longitud.
 *
 * Salida:
 *   - Tabla de conformidad por skill.
 *   - Lista de hallazgos con severidad.
 *   - Exit code 0 si todo es conforme, 1 si hay hallazgos criticos o altos.
 *
 * Uso:
 *   node .claude/bin/validate-globals.js
 *   node .claude/bin/validate-globals.js --json
 *   node .claude/bin/validate-globals.js --fix-drift   (actualiza last_updated automaticamente)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO     = path.resolve(__dirname, '..', '..');
const SKILLS   = path.join(REPO, '.claude', 'skills');
const JSON_OUT = process.argv.includes('--json');
const FIX_DRIFT = process.argv.includes('--fix-drift');
const HOY = new Date().toISOString().slice(0, 10);

// ─── Reglas que NO deben aparecer copiadas en los skills ─────────────────────
const REGLAS_NO_COPIAR = [
  'Modo Neanderthal (rol Coder activo): maximo 3 lineas',
  'Turnos >= 6: imprimir',
  'Turnos >= 15: imprimir',
];

// ─── Secciones obligatorias por skill ────────────────────────────────────────
const SECCIONES_OBLIGATORIAS = [
  'Cuando Activar Este Perfil',
  'Primera Accion al Activar',
  'Directiva de Interrupcion',
  'ALERTA_ARQUITECTONICA: REQUIERE_OPUSPLAN',
  'Restricciones del Perfil',
];

// ─── Referencia inmutable que debe estar en cada skill ───────────────────────
const REFERENCIA_INMUTABLE = 'Reglas de sesion activas: CLAUDE.md > este skill.';

// ─── Patrones que indican violacion de reglas globales ───────────────────────
// Emojis pictograficos reales (excluye digitos y ASCII que Unicode clasifica como Emoji)
const EMOJI_PICTOGRAFICO = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1FA00}-\u{1FAFF}]/u;

// Co-Authored-By se elimino de aqui: es una regla sobre COMMITS, no sobre el
// contenido de un SKILL.md -- un skill que documenta la regla (ej. en su
// seccion de Restricciones) mencionaba la cadena literal y disparaba un
// falso positivo (mismo patron ya corregido en standards-guard.js).
const VIOLACIONES = [
  { patron: EMOJI_PICTOGRAFICO,  desc: 'contiene emojis pictograficos (prohibido por CLAUDE.md)', sev: 'alta' },
];

// ─── Auditar un skill ─────────────────────────────────────────────────────────
function auditarSkill(skillDir) {
  const nombre = path.basename(skillDir);
  const file   = path.join(skillDir, 'SKILL.md');
  const hallazgos = [];

  if (!fs.existsSync(file)) {
    return { nombre, status: 'ERROR', hallazgos: [{ sev: 'critica', desc: 'SKILL.md no existe' }] };
  }

  const content = fs.readFileSync(file, 'utf8');

  // 1. Frontmatter
  if (!content.match(/^name:/m))        hallazgos.push({ sev: 'alta',   desc: 'frontmatter: falta "name:"' });
  if (!content.match(/^version:/m))     hallazgos.push({ sev: 'alta',   desc: 'frontmatter: falta "version:"' });
  if (!content.match(/^origin:/m))      hallazgos.push({ sev: 'alta',   desc: 'frontmatter: falta "origin:"' });
  if (!content.match(/^last_updated:/m))hallazgos.push({ sev: 'media',  desc: 'frontmatter: falta "last_updated:"' });
  if (!content.match(/^rol:\s*"?(architect|coder|auditor)"?\s*$/m))
    hallazgos.push({ sev: 'alta', desc: 'frontmatter: falta "rol:" valido (architect|coder|auditor)' });

  // 1b. Conformidad con el schema abierto agentskills.io (name/description) —
  // https://agentskills.io/specification
  // [ \t]* (no \s*) evita que un valor vacio cruce a la siguiente linea del
  // frontmatter y capture su contenido como si fuera el valor de este campo.
  const nameMatch = content.match(/^name:[ \t]*(.+)$/m);
  if (nameMatch) {
    const skillName = nameMatch[1].trim();
    if (skillName !== nombre) {
      hallazgos.push({ sev: 'alta', desc: `agentskills.io: name "${skillName}" no coincide con la carpeta "${nombre}"` });
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) {
      hallazgos.push({ sev: 'media', desc: `agentskills.io: name "${skillName}" no cumple el formato (minusculas, numeros, guion simple)` });
    }
    if (skillName.length > 64) {
      hallazgos.push({ sev: 'media', desc: 'agentskills.io: name supera 64 caracteres' });
    }
  }
  const descMatch = content.match(/^description:[ \t]*(.+)$/m);
  if (descMatch && descMatch[1].trim().length > 1024) {
    hallazgos.push({ sev: 'media', desc: 'agentskills.io: description supera 1024 caracteres' });
  }

  // 2. Secciones obligatorias
  for (const seccion of SECCIONES_OBLIGATORIAS) {
    if (!content.includes(seccion)) {
      hallazgos.push({ sev: 'alta', desc: `falta seccion: "${seccion}"` });
    }
  }

  // 3. Referencia inmutable (debe estar, no la copia)
  if (!content.includes(REFERENCIA_INMUTABLE)) {
    hallazgos.push({ sev: 'alta', desc: 'falta referencia inmutable a CLAUDE.md en Restricciones del Perfil' });
  }

  // 4. Reglas NO deben estar copiadas
  for (const regla of REGLAS_NO_COPIAR) {
    if (content.includes(regla)) {
      hallazgos.push({ sev: 'media', desc: `copia regla global (debe referenciar): "${regla.slice(0, 50)}..."` });
    }
  }

  // 5. Violaciones de reglas globales
  for (const v of VIOLACIONES) {
    if (v.patron.test(content)) {
      hallazgos.push({ sev: v.sev, desc: v.desc });
    }
  }

  // 6. Drift de last_updated vs git (via mtime como proxy)
  const lastUpdatedMatch = content.match(/^last_updated:\s*(\S+)/m);
  if (lastUpdatedMatch) {
    const declared = lastUpdatedMatch[1];
    const mtime    = fs.statSync(file).mtime.toISOString().slice(0, 10);
    if (declared < mtime && mtime === HOY) {
      hallazgos.push({ sev: 'baja', desc: `last_updated (${declared}) anterior a modificacion de hoy (${mtime})` });
      if (FIX_DRIFT) {
        const fixed = content.replace(/^last_updated:\s*\S+/m, `last_updated: ${HOY}`);
        fs.writeFileSync(file, fixed, 'utf8');
        hallazgos[hallazgos.length - 1].desc += ' [AUTO-CORREGIDO]';
      }
    }
  }

  const criticos = hallazgos.filter(h => h.sev === 'critica').length;
  const altos    = hallazgos.filter(h => h.sev === 'alta').length;
  const status   = criticos > 0 ? 'CRITICO'
                 : altos    > 0 ? 'NO_CONFORME'
                 : hallazgos.length > 0 ? 'ADVERTENCIA'
                 : 'CONFORME';

  return { nombre, status, hallazgos };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const skillDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(SKILLS, d.name))
  .sort();

const resultados = skillDirs.map(auditarSkill);

// CLAUDE.md ya no mantiene una lista/tabla de skills (routing via frontmatter
// description, ver "Seleccion de Skills" en CLAUDE.md) — no hay nada que
// comparar entre disco y CLAUDE.md en ese frente.
const hallazgosGlobales = [];

// ─── Salida ───────────────────────────────────────────────────────────────────
const totalCriticos   = resultados.flatMap(r => r.hallazgos).filter(h => h.sev === 'critica').length
                      + hallazgosGlobales.filter(h => h.sev === 'critica').length;
const totalAltos      = resultados.flatMap(r => r.hallazgos).filter(h => h.sev === 'alta').length
                      + hallazgosGlobales.filter(h => h.sev === 'alta').length;
const totalConformes  = resultados.filter(r => r.status === 'CONFORME').length;
const totalSkills     = resultados.length;

if (JSON_OUT) {
  console.log(JSON.stringify({ resultados, hallazgosGlobales, resumen: {
    total: totalSkills, conformes: totalConformes,
    criticos: totalCriticos, altos: totalAltos
  }}, null, 2));
} else {
  console.log('\n[VALIDATE-GLOBALS] Auditoria de conformidad con CLAUDE.md\n');
  console.log(`${'Skill'.padEnd(30)} ${'Estado'.padEnd(15)} Hallazgos`);
  console.log('-'.repeat(70));
  for (const r of resultados) {
    const tag = r.status === 'CONFORME'     ? 'OK  '
              : r.status === 'ADVERTENCIA'  ? 'WARN'
              : r.status === 'NO_CONFORME'  ? 'FAIL'
              : 'CRIT';
    const resumen = r.hallazgos.length === 0
      ? ''
      : r.hallazgos.map(h => `[${h.sev.toUpperCase()}] ${h.desc}`).join(' | ');
    console.log(`${r.nombre.padEnd(30)} [${tag}]          ${resumen}`);
  }

  if (hallazgosGlobales.length > 0) {
    console.log('\n[HALLAZGOS GLOBALES]');
    hallazgosGlobales.forEach(h => console.log(`  [${h.sev.toUpperCase()}] ${h.desc}`));
  }

  console.log(`\nRESUMEN: ${totalConformes}/${totalSkills} conformes | ${totalCriticos} criticos | ${totalAltos} altos`);
  if (totalCriticos > 0 || totalAltos > 0) {
    console.log('ESTADO: FALLO — hay hallazgos criticos o altos que deben corregirse.');
  } else if (totalConformes < totalSkills) {
    console.log('ESTADO: OK — sin hallazgos criticos ni altos, pero hay advertencias (media/baja) pendientes.');
  } else {
    console.log('ESTADO: OK — todos los skills son conformes con CLAUDE.md.');
  }
  console.log('');
}

process.exit(totalCriticos > 0 || totalAltos > 0 ? 1 : 0);
