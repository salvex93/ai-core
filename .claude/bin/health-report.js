'use strict';
/**
 * health-report.js — Generador de markdown para el reporte de salud del harness.
 * SRP: solo produce strings formateados. No toca disco, no hace checks.
 */

/**
 * @param {{ deps: object, skills: object, mcp: Array }} results
 * @param {{ version: string, ts: string, sessionId: string }} meta
 * @returns {string}
 */
function buildSyncReport(results, meta) {
  const { deps, skills, mcp } = results;
  const rows = [
    tableRow('Dependencias npm',   deps.ok   ? 'OK'        : 'ERROR',   depDetail(deps)),
    tableRow('Skills',             skills.ok ? 'OK'        : 'AVISO',   skillDetail(skills)),
    ...mcp.map(s => tableRow(`MCP ${s.server}`, s.ok ? 'OK' : 'ERROR', mcpDetail(s))),
    tableRow('Version drift',      'PENDIENTE', 'verificacion asincrona en curso'),
    tableRow('Modelos Anthropic',  'PENDIENTE', 'verificacion asincrona en curso'),
  ];

  const issues = [
    !deps.ok   && `dependencias npm`,
    !skills.ok && `skills`,
    ...mcp.filter(s => !s.ok).map(s => `MCP ${s.server}`),
  ].filter(Boolean);

  const resumen = issues.length === 0
    ? '**Estado general: OK**'
    : `**Estado general: ${issues.length} ERROR(ES) — ${issues.join(', ')}**`;

  return [
    `# HEALTH REPORT — AI-CORE v${meta.version}`,
    '',
    `Generado: ${meta.ts} | Sesion: ${meta.sessionId}`,
    '',
    '## Resumen Ejecutivo',
    '',
    '| Check | Estado | Detalle |',
    '|---|---|---|',
    ...rows,
    '',
    resumen,
    '',
    '## Detalle por Seccion',
    '',
    '### Dependencias npm',
    '',
    depSection(deps),
    '',
    '### Skills (.claude/skills/)',
    '',
    skillSection(skills),
    '',
    '### Servidores MCP',
    '',
    ...mcp.map(mcpSection),
    '',
    '---',
    '_Verificaciones asincronas en curso en background..._',
    '',
  ].join('\n');
}

/**
 * @param {Array} versionResults
 * @param {object} modelsResult
 * @returns {string}
 */
function buildAsyncSection(versionResults, modelsResult) {
  const lines = [
    '',
    '## Verificaciones Asincronas',
    '',
    `_Completadas: ${new Date().toISOString()}_`,
    '',
    '### Version Drift de Dependencias',
    '',
    '| Paquete | Instalado | Disponible | Accion |',
    '|---|---|---|---|',
  ];

  for (const r of versionResults) {
    const accion = r.error
      ? `ERROR: ${r.error}`
      : r.drift
        ? `npm install ${r.dep}@latest`
        : 'OK';
    lines.push(`| ${r.dep} | ${r.installed} | ${r.latest ?? '?'} | ${accion} |`);
  }

  lines.push('');
  lines.push('### Modelos Anthropic');
  lines.push('');

  if (modelsResult.skipped) {
    lines.push(`Estado: OMITIDO — ${modelsResult.reason}`);
    lines.push('Para habilitar: agregar ANTHROPIC_API_KEY=sk-ant-... al archivo .env del ai-core.');
  } else if (modelsResult.error) {
    lines.push(`Estado: ERROR — ${modelsResult.error}`);
  } else {
    if (modelsResult.nuevos.length > 0) {
      lines.push(`NUEVOS modelos disponibles (no en ModelRouter.js): ${modelsResult.nuevos.join(', ')}`);
    }
    if (modelsResult.retirados.length > 0) {
      lines.push(`POSIBLEMENTE RETIRADOS (en ModelRouter.js, no en API): ${modelsResult.retirados.join(', ')}`);
    }
    if (modelsResult.nuevos.length === 0 && modelsResult.retirados.length === 0) {
      lines.push('Estado: OK — catalogo de modelos sincronizado con la API de Anthropic.');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('_Proxima verificacion: al inicio de la siguiente sesion de Claude Code_');
  lines.push('');

  return lines.join('\n');
}

/**
 * @param {boolean} hasIssues
 * @param {number} issueCount
 * @param {string} date
 * @returns {string}
 */
function buildBanner(hasIssues, issueCount, date) {
  if (!hasIssues) return `[HEALTH-CHECK OK | ${date} | 0 issues]`;
  return `[HEALTH-CHECK ${issueCount} ISSUE(S) | ${date} | ver .claude/HEALTH_REPORT.md]`;
}

// --- Helpers internos ---

function tableRow(check, estado, detalle) {
  return `| ${check} | ${estado} | ${detalle} |`;
}

function depDetail(deps) {
  if (deps.ok && deps.autoFixed) return `autoreparado: ${deps.missing.join(', ')}`;
  if (deps.ok)                   return `${deps.count}/3 instaladas`;
  return `ERROR: ${deps.missing.join(', ')} — ${deps.error ?? 'npm install fallo'}`;
}

function skillDetail(skills) {
  if (skills.ok) return `${skills.count} presentes, todos con frontmatter valido`;
  return `invalidos: ${skills.invalid.join(', ')}`;
}

function mcpDetail(s) {
  if (!s.ok) return `ERROR: ${s.error}`;
  return `${(s.tools ?? []).length} herramientas — ${s.latencyMs}ms`;
}

function depSection(deps) {
  if (deps.ok && !deps.autoFixed) {
    return `Instaladas: ${deps.installed.join(', ')}\nEstado: todas presentes en node_modules.`;
  }
  if (deps.autoFixed) {
    return [
      `Faltaban: ${deps.missing.join(', ')}`,
      `Accion automatica: npm install ejecutado exitosamente.`,
      `Instaladas ahora: ${deps.installed.join(', ')}`,
    ].join('\n');
  }
  return `ERROR: ${deps.error}\nFaltantes: ${deps.missing.join(', ')}\nAccion manual: ejecuta npm install en la raiz del proyecto.`;
}

function skillSection(skills) {
  const lines = [`Conteo en disco: ${skills.count}`];
  if (skills.invalid.length) {
    lines.push(`Invalidos (frontmatter name/description incorrecto): ${skills.invalid.join(', ')}`);
    lines.push('Accion: verificar que "name:" coincida con la carpeta y "description:" no este vacia.');
  } else {
    lines.push('Invalidos: ninguno');
  }
  return lines.join('\n');
}

function mcpSection(s) {
  if (!s.ok) return `${s.server}: ERROR — ${s.error}`;
  return `${s.server}: OK — tools: ${(s.tools ?? []).join(', ')} — latencia: ${s.latencyMs}ms`;
}

module.exports = { buildSyncReport, buildAsyncSection, buildBanner };
