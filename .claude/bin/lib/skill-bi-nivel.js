'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const esTextoNoVacio = v => typeof v === 'string' && v.trim().length > 0;
const esListaDeTextos = v => Array.isArray(v) && v.every(esTextoNoVacio);

function leerManifest(file) {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return { error: 'manifest.json debe ser un objeto JSON' };
    }
    return { manifest };
  } catch (err) {
    return { error: `manifest.json ilegible o con JSON invalido: ${err.message}` };
  }
}

function validarCamposManifest(manifest, nombre) {
  const hallazgos = [];
  if (manifest.id !== nombre) {
    hallazgos.push({ sev: 'alta', desc: `manifest.json: id "${manifest.id}" no coincide con la carpeta "${nombre}"` });
  }
  if (!esListaDeTextos(manifest.triggers) || manifest.triggers.length === 0) {
    hallazgos.push({ sev: 'alta', desc: 'manifest.json: triggers debe ser una lista no vacia de textos' });
  }
  if (!esListaDeTextos(manifest.tools)) {
    hallazgos.push({ sev: 'alta', desc: 'manifest.json: tools debe ser una lista de textos' });
  }
  if (!esTextoNoVacio(manifest.summary)) {
    hallazgos.push({ sev: 'alta', desc: 'manifest.json: summary debe ser un texto no vacio' });
  }
  return hallazgos;
}

function validarRules(file) {
  const vacio = !fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim().length === 0;
  return vacio ? [{ sev: 'critica', desc: 'rules.md no existe o esta vacio' }] : [];
}

function estadoDe(hallazgos) {
  if (hallazgos.some(h => h.sev === 'critica')) return 'CRITICO';
  if (hallazgos.some(h => h.sev === 'alta')) return 'NO_CONFORME';
  return hallazgos.length > 0 ? 'ADVERTENCIA' : 'CONFORME';
}

function esBiNivel(skillDir) {
  return fs.existsSync(path.join(skillDir, 'manifest.json'));
}

function auditarBiNivel(skillDir) {
  const nombre = path.basename(skillDir);
  const { manifest, error } = leerManifest(path.join(skillDir, 'manifest.json'));
  if (error) return { nombre, status: 'CRITICO', hallazgos: [{ sev: 'critica', desc: error }] };

  const hallazgos = [
    ...validarCamposManifest(manifest, nombre),
    ...validarRules(path.join(skillDir, 'rules.md')),
  ];
  return { nombre, status: estadoDe(hallazgos), hallazgos };
}

module.exports = { esBiNivel, auditarBiNivel };
