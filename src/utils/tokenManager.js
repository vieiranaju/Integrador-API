const axios = require('axios');
const APIS  = require('../config/apis');

const sessoes = new Map();

async function fazerLogin(baseUrl, loginEndpoint, usuario, senha) {
  const corpo = { usuario, senha };
  const resp  = await axios.post(`${baseUrl}${loginEndpoint}`, corpo, { timeout: 10000 });
  return resp.data.token || resp.data.access_token || null;
}

async function registrarUsuario(baseUrl, usuario, senha) {
  const corpo = { usuario, senha, nome: usuario, username: usuario, password: senha, email: `${usuario}@integrador.com` };
  const endpoints = ['/auth/registrar', '/auth/register', '/auth/signup', '/register', '/usuarios'];

  for (const endpoint of endpoints) {
    try {
      await axios.post(`${baseUrl}${endpoint}`, corpo, { timeout: 8000 });
      return true;
    } catch (e) {
      if (e.response?.status === 409) return true; // usuário já existe
    }
  }
  return false;
}

async function loginComAutoRegistro(baseUrl, loginEndpoint, usuario, senha) {
  try {
    const token = await fazerLogin(baseUrl, loginEndpoint, usuario, senha);
    if (token) return token;
  } catch (e) {
    const status = e.response?.status;
    if (status && ![400, 401, 404, 422].includes(status)) throw e;
  }

  await registrarUsuario(baseUrl, usuario, senha);
  return await fazerLogin(baseUrl, loginEndpoint, usuario, senha);
}

async function autenticarAPIsExternas(sessionId, credenciais = {}) {
  const tokens = {};
  const erros  = {};

  if (credenciais.apostas1) {
    const { usuario, senha } = credenciais.apostas1;
    try {
      tokens.apostas1 = await loginComAutoRegistro(APIS.apostas.instancia1.baseUrl, '/auth/login', usuario, senha);
    } catch (e) {
      erros.apostas1 = e.response?.data?.message || e.message;
    }
  }

  if (credenciais.apostadores1) {
    const { usuario, senha } = credenciais.apostadores1;
    try {
      tokens.apostadores1 = await loginComAutoRegistro(APIS.apostadores.instancia1.baseUrl, '/login', usuario, senha);
    } catch (e) {
      erros.apostadores1 = e.response?.data?.message || e.message;
    }
  }

  sessoes.set(sessionId, { tokens, credenciais });
  return { tokens: Object.keys(tokens), erros };
}

function getToken(sessionId, api) {
  return sessoes.get(sessionId)?.tokens?.[api] || null;
}

async function tentarAuthNovamente(sessionId, api) {
  const sessao = sessoes.get(sessionId);
  if (!sessao?.credenciais?.[api]) return null;

  const { usuario, senha } = sessao.credenciais[api];

  try {
    let token = null;
    if (api === 'apostas1') {
      token = await loginComAutoRegistro(APIS.apostas.instancia1.baseUrl, '/auth/login', usuario, senha);
    } else if (api === 'apostadores1') {
      token = await loginComAutoRegistro(APIS.apostadores.instancia1.baseUrl, '/login', usuario, senha);
    }

    if (token) {
      sessao.tokens[api] = token;
      return token;
    }
  } catch (e) {
    console.warn(`[TokenManager] Reautenticação falhou para ${api}:`, e.message);
  }
  return null;
}

function removerSessao(sessionId) {
  sessoes.delete(sessionId);
}

function sessaoExiste(sessionId) {
  return sessoes.has(sessionId);
}

module.exports = { autenticarAPIsExternas, getToken, tentarAuthNovamente, removerSessao, sessaoExiste };
