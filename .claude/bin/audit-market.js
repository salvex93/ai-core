#!/usr/bin/env node
/**
 * audit-market.js
 * Compara la fecha de verificacion de cada skill (last_updated en su
 * frontmatter) contra la fecha de verificacion registrada de su dominio
 * tecnico en MARKET_STANDARDS.json, para detectar drift respecto al
 * mercado sin depender de llamadas automaticas a APIs externas.
 *
 * No hace ninguna llamada de red. Es un comando manual: reporta drift,
 * no lo corrige ni dispara research por si solo. Ver Protocolo de
 * Vigencia Tecnologica en CLAUDE.md para el paso de verificacion contra
 * fuente primaria antes de aplicar cualquier cambio a un skill.
 *
 * Uso:
 *   node .claude/bin/audit-market.js
 *   node .claude/bin/audit-market.js --json
 *   node .claude/bin/audit-market.js --skill ciso
 *   node .claude/bin/audit-market.js --stale-days 90
 *   node .claude/bin/audit-market.js --only-stale   # silencioso si no hay hallazgos, para el Protocolo de Arranque
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const REPO       = path.resolve(__dirname, '..', '..');
const SKILLS     = path.join(REPO, '.claude', 'skills');
const STANDARDS  = process.env.AI_CORE_MARKET_STANDARDS_PATH || path.join(REPO, '.claude', 'MARKET_STANDARDS.json');
const JSON_OUT     = process.argv.includes('--json');
const ONLY_STALE   = process.argv.includes('--only-stale');
const HOY        = new Date().toISOString().slice(0, 10);

function argValor(flag, defecto) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
}

const STALE_DAYS   = Number(argValor('--stale-days', '60'));
const SKILL_FILTRO = argValor('--skill', null);

function diasEntre(fechaIso, hoyIso) {
  const a = new Date(fechaIso);
  const b = new Date(hoyIso);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function leerFrontmatter(skillDir) {
  const file = path.join(SKILLS, skillDir, 'SKILL.md');
  if (!fs.existsSync(file)) return null;
  const content = fs.readFileSync(file, 'utf8');
  const lastUpdatedMatch = content.match(/^last_updated:\s*(\S+)/m);
  const versionMatch     = content.match(/^version:\s*(\S+)/m);
  return {
    lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1] : null,
    version:     versionMatch ? versionMatch[1] : null,
  };
}

if (!fs.existsSync(STANDARDS)) {
  console.error(`[audit-market] No existe ${path.relative(REPO, STANDARDS)}. Nada que auditar.`);
  process.exit(1);
}

let standards;
try {
  standards = JSON.parse(fs.readFileSync(STANDARDS, 'utf8'));
} catch (err) {
  console.error(`[audit-market] ${path.relative(REPO, STANDARDS)} tiene JSON invalido (${err.message}). Nada que auditar.`);
  process.exit(1);
}
const domains   = standards.domains || {};

// Invertir: skill -> [{domain, verified, sources}]
const skillDomainMap = new Map();
for (const [domainName, domainData] of Object.entries(domains)) {
  for (const skillName of domainData.skills || []) {
    if (!skillDomainMap.has(skillName)) skillDomainMap.set(skillName, []);
    skillDomainMap.get(skillName).push({
      domain: domainName,
      verified: domainData.verified,
      sources: domainData.sources || [],
    });
  }
}

const skillDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(s => !SKILL_FILTRO || s === SKILL_FILTRO)
  .sort();

const resultados = skillDirs.map(skillName => {
  const fm = leerFrontmatter(skillName);
  const dominios = skillDomainMap.get(skillName) || [];

  if (!fm || !fm.lastUpdated) {
    return { skill: skillName, status: 'SIN_FRONTMATTER', dominios: [], diasDesdeUpdate: null, diasDesdeVerificacion: null };
  }

  const diasDesdeUpdate = diasEntre(fm.lastUpdated, HOY);

  if (dominios.length === 0) {
    return { skill: skillName, status: 'SIN_DOMINIO_REGISTRADO', dominios: [], diasDesdeUpdate, diasDesdeVerificacion: null };
  }

  const masAntiguo = dominios.reduce((min, d) =>
    !min || d.verified < min.verified ? d : min, null);

  const diasDesdeVerificacion = diasEntre(masAntiguo.verified, HOY);
  const drift = fm.lastUpdated < masAntiguo.verified;

  let status = 'OK';
  if (diasDesdeVerificacion >= STALE_DAYS) status = 'STALE_MERCADO';
  if (drift) status = 'DRIFT_VS_MERCADO';

  return {
    skill: skillName,
    status,
    dominios: dominios.map(d => d.domain),
    fuentes: [...new Set(dominios.flatMap(d => d.sources))],
    lastUpdatedSkill: fm.lastUpdated,
    verificacionDominio: masAntiguo.verified,
    diasDesdeUpdate,
    diasDesdeVerificacion,
  };
});

const conDrift = resultados.filter(r => r.status === 'DRIFT_VS_MERCADO');
const stale     = resultados.filter(r => r.status === 'STALE_MERCADO');
const sinDominio = resultados.filter(r => r.status === 'SIN_DOMINIO_REGISTRADO');

if (ONLY_STALE) {
  // Modo silencioso para el Protocolo de Arranque: sin hallazgos, sin
  // output -- evita ruido en cada sesion. Con hallazgos, una linea
  // compacta por skill afectado (drift, stale, o sin dominio registrado).
  const hallazgos = [...conDrift, ...stale, ...sinDominio];
  if (hallazgos.length > 0) {
    console.log(`[AUDIT-MARKET] ${hallazgos.length} hallazgo(s) de vigencia:`);
    hallazgos.forEach(r => console.log(`  - ${r.skill}: ${r.status}${r.dominios.length ? ` (${r.dominios.join(', ')})` : ''}`));
  }
} else if (JSON_OUT) {
  console.log(JSON.stringify({ resultados, resumen: {
    total: resultados.length,
    drift: conDrift.length,
    stale: stale.length,
    sinDominio: sinDominio.length,
  }}, null, 2));
} else {
  console.log(`\n[AUDIT-MARKET] Vigencia de skills vs. dominios tecnicos (umbral stale: ${STALE_DAYS} dias)\n`);
  console.log(`${'Skill'.padEnd(28)} ${'Estado'.padEnd(20)} Dominio(s) | dias desde verificacion`);
  console.log('-'.repeat(90));
  for (const r of resultados) {
    const dominiosStr = r.dominios.length ? r.dominios.join(', ') : '(sin dominio registrado en MARKET_STANDARDS.json)';
    const diasStr = r.diasDesdeVerificacion !== null ? `${r.diasDesdeVerificacion}d` : '-';
    console.log(`${r.skill.padEnd(28)} [${r.status.padEnd(18)}] ${dominiosStr} | ${diasStr}`);
  }

  console.log(`\nRESUMEN: ${resultados.length} skills evaluados | ${conDrift.length} con drift vs. mercado | ${stale.length} con verificacion >= ${STALE_DAYS} dias | ${sinDominio.length} sin dominio registrado`);

  if (conDrift.length > 0) {
    console.log('\n[DRIFT] Estos skills tienen last_updated anterior a la fecha de verificacion de su dominio — revisar si el contenido sigue vigente:');
    conDrift.forEach(r => console.log(`  - ${r.skill}: dominio(s) ${r.dominios.join(', ')} verificado(s) ${r.verificacionDominio}, skill actualizado ${r.lastUpdatedSkill}`));
  }
  if (stale.length > 0) {
    console.log(`\n[STALE] Estos dominios no se re-verifican contra fuente primaria hace ${STALE_DAYS}+ dias — considerar re-verificar antes de confiar en su contenido:`);
    stale.forEach(r => console.log(`  - ${r.skill}: ${r.dominios.join(', ')} (${r.diasDesdeVerificacion} dias)`));
  }
  if (sinDominio.length > 0) {
    console.log('\n[SIN_DOMINIO] Estos skills no estan mapeados a ningun dominio en MARKET_STANDARDS.json — no se puede auditar su vigencia de mercado automaticamente:');
    sinDominio.forEach(r => console.log(`  - ${r.skill}`));
  }

  console.log('\nEste comando NO hace llamadas de red ni corrige nada por si solo. Para re-verificar un dominio contra fuente primaria, usar el research manual (WebSearch/WebFetch o el agente de research) y luego actualizar MARKET_STANDARDS.json con la fecha y fuente real.\n');
}

process.exit(0);
