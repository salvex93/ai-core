'use strict';

/**
 * lib/policy-compliance.js — cumplimiento de la politica sobre los artefactos de la sesion.
 *
 * Funciones puras: reciben commits y archivos ya leidos y devuelven, por regla,
 * `cumple`, `incumple` o `sin_datos` con evidencia minima (hash corto del commit
 * o ruta del archivo). Nunca devuelve mensajes, nombres de autor ni contenido.
 * Reglas sin artefactos que las prueben quedan `sin_datos`: ausencia de evidencia
 * no es cumplimiento.
 */

const crypto = require('node:crypto');
const { canonicalizar } = require('./session-attestation.js');

const EXT_CODIGO = /\.(?:js|ts|py)$/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Terminos cortos como "IA" solo coinciden como palabra completa
const patronTerminos = (terminos) => new RegExp(`\\b(?:${terminos.map(escapeRe).join('|')})\\b`, 'i');

function veredicto(regla, evaluados, infractores) {
  if (evaluados === 0) return { regla, estado: 'sin_datos', evidencia: [] };
  return { regla, estado: infractores.length ? 'incumple' : 'cumple', evidencia: infractores };
}

/**
 * @param {object} datos
 * @param {{hash: string, autor: string, mensaje: string}[]} datos.commits
 * @param {{ruta: string, lineas: number}[]} datos.archivos
 * @param {object} datos.politica - contenido de policy.json
 * @returns {{regla: string, estado: string, evidencia: string[]}[]}
 */
function evaluarCumplimiento({ commits, archivos, politica }) {
  const patron = patronTerminos(politica.commit.bannedTerms);
  const codigo = archivos.filter(a => EXT_CODIGO.test(a.ruta));
  return [
    veredicto('commit.author', commits.length, commits.filter(c => c.autor !== politica.commit.author).map(c => c.hash)),
    veredicto('commit.bannedTerms', commits.length, commits.filter(c => patron.test(c.mensaje)).map(c => c.hash)),
    veredicto('code.maxLines', codigo.length, codigo.filter(a => a.lineas > politica.code.maxLines).map(a => a.ruta)),
  ];
}

function hashPolitica(politica) {
  return crypto.createHash('sha256').update(canonicalizar(politica), 'utf8').digest('hex');
}

module.exports = { evaluarCumplimiento, hashPolitica };
