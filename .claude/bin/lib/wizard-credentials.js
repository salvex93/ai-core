'use strict';
/**
 * wizard-credentials.js
 * Validacion ACTIVA real de credenciales externas del wizard -- nunca solo
 * formato/longitud del string. Cada validador hace la llamada minima que
 * demuestra que la credencial funciona hoy contra el servicio real:
 *   - GitHub: GET api.github.com/user con el token.
 *   - Proveedores de IA: ModelRegistry.chat() con un mensaje de 1 token,
 *     reusando el mismo adapter que usa el resto del harness (nunca se
 *     reimplementa HTTP/auth por proveedor aqui).
 *   - SSH: NUNCA pide ni lee la clave privada. Solo confirma que el alias
 *     existe en ~/.ssh/config y que ssh-agent tiene alguna identidad cargada
 *     (`ssh-add -L`) -- prueba de posesion sin tocar el material secreto.
 *
 * Toda funcion de red acepta su dependencia (fetch/chat/comandos ssh) como
 * parametro inyectable para poder testear sin red real ni ssh-agent real.
 */

async function validarGitHubToken(token, fetchImpl = globalThis.fetch) {
  if (!token) {
    return { valido: false, razon: 'GITHUB_TOKEN vacio en .env' };
  }

  try {
    const res = await fetchImpl('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ai-core-wizard' },
    });
    if (!res.ok) {
      return { valido: false, razon: `GitHub rechazo el token (HTTP ${res.status}) -- invalido o expirado` };
    }
    return { valido: true, razon: 'GET api.github.com/user respondio 200' };
  } catch (err) {
    return { valido: false, razon: `Fallo de red validando GITHUB_TOKEN: ${err.message}` };
  }
}

async function validarProveedorIA(provider, apiKey, chatImpl) {
  if (!apiKey) {
    return { valido: false, razon: `${provider}: sin API key configurada en .env` };
  }

  try {
    await chatImpl(provider, [{ role: 'user', content: 'ping' }], { max_tokens: 4 });
    return { valido: true, razon: `${provider}: llamada minima de validacion respondio OK` };
  } catch (err) {
    return { valido: false, razon: `${provider}: ${err.message}` };
  }
}

function validarSshHostAlias(alias, deps) {
  const { leerSshConfig, listarIdentidadesAgent } = deps;

  if (!alias) {
    return { valido: false, razon: 'SSH_HOST_ALIAS vacio en .env' };
  }

  const config = leerSshConfig();
  const patronHost = new RegExp(`^Host\\s+.*\\b${alias}\\b`, 'mi');
  if (!patronHost.test(config)) {
    return { valido: false, razon: `Alias "${alias}" no declarado en ~/.ssh/config` };
  }

  try {
    const identidades = listarIdentidadesAgent();
    if (!identidades || !identidades.trim()) {
      return { valido: false, razon: 'ssh-agent no tiene ninguna identidad cargada (ssh-add)' };
    }
  } catch (err) {
    return { valido: false, razon: `ssh-agent sin identidad cargada: ${err.message}` };
  }

  return { valido: true, razon: `Alias "${alias}" declarado y ssh-agent tiene identidad cargada` };
}

module.exports = { validarGitHubToken, validarProveedorIA, validarSshHostAlias };
