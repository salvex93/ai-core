'use strict';

/**
 * Verifica el gate de calidad medible de .claude/agents/mcp-registry-
 * navigator.md -- hallazgo de auditoria de scaffolding 2026-08-15: el
 * agente calculaba la puntuacion (0-10) sin declarar el umbral exacto que
 * la convierte en decision INSTALAR/EVALUAR/RECHAZAR, obligando a un
 * subagente de contexto cero a inventarlo cada vez que el umbral real ya
 * vivia solo en el skill homonimo, no referenciado desde el agente.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');

const REPO = path.resolve(__dirname, '..', '..');
const AGENT_MD = path.join(REPO, '.claude', 'agents', 'mcp-registry-navigator.md');
const SKILL_MD = path.join(REPO, '.claude', 'skills', 'mcp-registry-navigator', 'SKILL.md');

describe('mcp-registry-navigator.md — gate de calidad medible declarado', () => {
  test('el agente declara el umbral exacto INSTALAR >= 8 / EVALUAR 5-7 / RECHAZAR < 5', () => {
    const contenido = fs.readFileSync(AGENT_MD, 'utf8');
    assert.match(contenido, />=\s*8:?\s*INSTALAR/i, 'debe declarar el umbral de INSTALAR');
    assert.match(contenido, /5-7:?\s*EVALUAR/i, 'debe declarar el umbral de EVALUAR');
    assert.match(contenido, /<\s*5:?\s*RECHAZAR/i, 'debe declarar el umbral de RECHAZAR');
  });

  test('el umbral del agente coincide con el umbral del skill homonimo (no dos fuentes de verdad distintas)', () => {
    const contenidoAgente = fs.readFileSync(AGENT_MD, 'utf8');
    const contenidoSkill  = fs.readFileSync(SKILL_MD, 'utf8');
    // Mismo umbral literal en ambos archivos -- si alguno cambia sin el otro,
    // el agente y el skill quedarian dando decisiones distintas para el
    // mismo puntaje.
    assert.match(contenidoSkill, />=\s*8:?\s*INSTALAR/i);
    assert.match(contenidoSkill, /5-7:?\s*EVALUAR/i);
    assert.match(contenidoSkill, /<\s*5:?\s*RECHAZAR/i);
    assert.ok(contenidoAgente.includes('mismo umbral que'), 'el agente debe referenciar explicitamente al skill como fuente del umbral');
  });
});
