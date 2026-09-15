'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const { REPO } = require('./_shared');

describe('lib/wizard-credentials.js', () => {
  const {
    validarGitHubToken,
    validarProveedorIA,
    validarSshHostAlias,
  } = require(path.join(REPO, '.claude', 'bin', 'lib', 'wizard-credentials.js'));

  describe('validarGitHubToken', () => {
    test('token vacio: invalido sin llamar a la red', async () => {
      let llamado = false;
      const fetchFalso = async () => { llamado = true; return { ok: true, status: 200 }; };
      const r = await validarGitHubToken('', fetchFalso);

      assert.equal(r.valido, false);
      assert.equal(llamado, false);
      assert.match(r.razon, /GITHUB_TOKEN/);
    });

    test('token valido: GET api.github.com/user responde 200', async () => {
      let urlLlamada, headersLlamados;
      const fetchFalso = async (url, opts) => {
        urlLlamada = url;
        headersLlamados = opts.headers;
        return { ok: true, status: 200, json: async () => ({ login: 'salvex93' }) };
      };
      const r = await validarGitHubToken('ghp_fake', fetchFalso);

      assert.equal(r.valido, true);
      assert.equal(urlLlamada, 'https://api.github.com/user');
      assert.match(headersLlamados.Authorization, /ghp_fake/);
    });

    test('token invalido: GET responde 401', async () => {
      const fetchFalso = async () => ({ ok: false, status: 401 });
      const r = await validarGitHubToken('ghp_expirado', fetchFalso);

      assert.equal(r.valido, false);
      assert.match(r.razon, /401|invalido|rechazado/i);
    });

    test('fallo de red: no lanza, reporta invalido con razon de conexion', async () => {
      const fetchFalso = async () => { throw new Error('ENOTFOUND api.github.com'); };
      const r = await validarGitHubToken('ghp_fake', fetchFalso);

      assert.equal(r.valido, false);
      assert.match(r.razon, /ENOTFOUND|conexion|red/i);
    });
  });

  describe('validarProveedorIA', () => {
    test('proveedor sin key configurada: invalido sin llamar a chat', async () => {
      let llamado = false;
      const chatFalso = async () => { llamado = true; return {}; };
      const r = await validarProveedorIA('gemini', '', chatFalso);

      assert.equal(r.valido, false);
      assert.equal(llamado, false);
    });

    test('proveedor con key configurada: chat() responde OK', async () => {
      const chatFalso = async (provider, messages) => {
        assert.equal(provider, 'gemini');
        assert.ok(Array.isArray(messages));
        return { content: 'ok', provider: 'gemini', model: 'gemini-3.5-flash' };
      };
      const r = await validarProveedorIA('gemini', 'fake-key', chatFalso);

      assert.equal(r.valido, true);
    });

    test('proveedor con key invalida: chat() rechaza', async () => {
      const chatFalso = async () => { throw new Error('401 Unauthorized'); };
      const r = await validarProveedorIA('anthropic', 'fake-key', chatFalso);

      assert.equal(r.valido, false);
      assert.match(r.razon, /401|Unauthorized/);
    });
  });

  describe('validarSshHostAlias', () => {
    test('alias vacio: invalido, no ejecuta ningun comando', () => {
      let llamado = false;
      const r = validarSshHostAlias('', {
        leerSshConfig: () => { llamado = true; return ''; },
        listarIdentidadesAgent: () => { llamado = true; return ''; },
      });

      assert.equal(r.valido, false);
      assert.equal(llamado, false);
    });

    test('alias no declarado en ~/.ssh/config: invalido', () => {
      const r = validarSshHostAlias('deploy-prod', {
        leerSshConfig: () => 'Host otro-host\n  HostName example.com\n',
        listarIdentidadesAgent: () => 'ok',
      });

      assert.equal(r.valido, false);
      assert.match(r.razon, /ssh\/config/i);
    });

    test('alias declarado pero ssh-agent sin identidades cargadas: invalido', () => {
      const r = validarSshHostAlias('deploy-prod', {
        leerSshConfig: () => 'Host deploy-prod\n  HostName prod.example.com\n',
        listarIdentidadesAgent: () => { throw new Error('The agent has no identities.'); },
      });

      assert.equal(r.valido, false);
      assert.match(r.razon, /identidad|agent/i);
    });

    test('alias declarado y ssh-agent con identidad cargada: valido', () => {
      const r = validarSshHostAlias('deploy-prod', {
        leerSshConfig: () => 'Host deploy-prod\n  HostName prod.example.com\n',
        listarIdentidadesAgent: () => '2048 SHA256:abc123 /home/user/.ssh/id_ed25519 (ED25519)',
      });

      assert.equal(r.valido, true);
    });

    test('nunca expone ni solicita la clave privada -- solo alias/host', () => {
      const src = require('node:fs').readFileSync(
        path.join(REPO, '.claude', 'bin', 'lib', 'wizard-credentials.js'), 'utf8'
      );
      assert.doesNotMatch(src, /PRIVATE KEY/);
      assert.doesNotMatch(src, /id_rsa|id_ed25519/);
    });
  });
});
