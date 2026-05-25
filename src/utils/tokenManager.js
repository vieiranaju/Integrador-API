/**
 * utils/tokenManager.js — Gerencia tokens JWT das APIs externas por sessão.
 */

const axios = require('axios');
const APIS = require('../config/apis');

const sessoes = new Map();

async function tentarRegistrar(baseUrl, usuario, senha, endpoints) {
  const corpo = { usuario, senha, nome: usuario, username: usuario, password: senha, email: `${usuario}@integrador.com` };

  for (const endpoint of endpoints) {
    try {
      await axios.post(`${baseUrl}${endpoint}`, corpo, { timeout: 8000 });
      console.log(`[TokenManager] Usuário "${usuario}" registrado em ${endpoint}`);
      return true;
    } catch (e) {
      if (e.response?.status === 409) {
        console.log(`[TokenManager] Usuário já existe em ${endpoint}, tentando login...`);
        return true;
      }
    }
  }
  return false;
}

/**
 * Tenta fazer login em uma API externa.
 * Se falhar por credenciais inválidas, tenta registrar o usuário e faz login novamente.
 *
 * @param {string} baseUrl
 * @param {string} loginEndpoint
 * @param {string[]} registroEndpoints
 * @param {string} usuario
 * @param {string} senha
 * @param {string} campoToken - Campo onde o token vem na resposta ('token' ou 'access_token')
 * @returns {Promise<string|null>}
 */
async function loginComAutoRegistro(baseUrl, loginEndpoint, registroEndpoints, usuario, senha, campoToken = 'token') {
  const corpo = { usuario, senha };

  try {
    const resp = await axios.post(`${baseUrl}${loginEndpoint}`, corpo, { timeout: 10000 });
    const token = resp.data[campoToken] || resp.data.token || resp.data.access_token;
    if (token) return token;
  } catch (e) {
    const status = e.response?.status;

    if (status && ![400, 401, 404, 422].includes(status)) {
      throw new Error(`Erro ${status} ao fazer login`);
    }

    console.log(`[TokenManager] Login falhou (${status}) — tentando registrar o usuário...`);
  }

  const registrado = await tentarRegistrar(baseUrl, usuario, senha, registroEndpoints);

  if (!registrado) {
    throw new Error('Não foi possível registrar o usuário nas APIs externas.');
  }

  const resp = await axios.post(`${baseUrl}${loginEndpoint}`, corpo, { timeout: 10000 });
  const token = resp.data[campoToken] || resp.data.token || resp.data.access_token;
  if (!token) throw new Error('Token não retornado após registro.');
  return token;
}

/**
 * Faz login (com auto-registro) nas APIs externas e salva os tokens na sessão.
 *
 * @param {string} sessionId
 * @param {object} credenciais - { apostas1: {usuario, senha}, apostadores1: {...} }
 * @returns {Promise<{ tokens: string[], erros: object }>}
 */
async function autenticarAPIsExternas(sessionId, credenciais = {}) {
  const tokens = {};
  const erros = {};

  if (credenciais.apostas1) {
    const { usuario, senha } = credenciais.apostas1;
    try {
      tokens.apostas1 = await loginComAutoRegistro(
        APIS.apostas.instancia1.baseUrl,
        '/auth/login',
        ['/auth/registrar', '/auth/register', '/auth/signup', '/register', '/usuarios'],
        usuario, senha
      );
      console.log('[TokenManager] Apostas (I1) autenticada');
    } catch (e) {
      erros.apostas1 = e.response?.data?.message || e.message;
      console.warn('[TokenManager] Apostas (I1):', erros.apostas1);
    }
  }

  if (credenciais.apostadores1) {
    const { usuario, senha } = credenciais.apostadores1;
    try {
      tokens.apostadores1 = await loginComAutoRegistro(
        APIS.apostadores.instancia1.baseUrl,
        '/login',
        ['/register', '/auth/register', '/usuarios', '/auth/signup'],
        usuario, senha
      );
      console.log('[TokenManager] Apostadores (I1) autenticada');
    } catch (e) {
      erros.apostadores1 = e.response?.data?.message || e.message;
      console.warn('[TokenManager] Apostadores (I1):', erros.apostadores1);
    }
  }

  sessoes.set(sessionId, { tokens, credenciais });

  return { tokens: Object.keys(tokens), erros };
}

/** Retorna o token de uma API para uma sessão específica. */
function getToken(sessionId, api) {
  return sessoes.get(sessionId)?.tokens?.[api] || null;
}

/**
 * Tenta reautenticar uma API on-the-fly se o token falhou ou expirou.
 *
 * @param {string} sessionId
 * @param {string} api
 * @returns {Promise<string|null>}
 */
async function tentarAuthNovamente(sessionId, api) {
  const sessao = sessoes.get(sessionId);
  if (!sessao || !sessao.credenciais || !sessao.credenciais[api]) return null;

  const cred = sessao.credenciais[api];
  let token = null;

  try {
    if (api === 'apostas1') {
      token = await loginComAutoRegistro(APIS.apostas.instancia1.baseUrl, '/auth/login', ['/auth/registrar', '/auth/register', '/auth/signup', '/register', '/usuarios'], cred.usuario, cred.senha);
    } else if (api === 'apostadores1') {
      token = await loginComAutoRegistro(APIS.apostadores.instancia1.baseUrl, '/login', ['/register', '/auth/register', '/usuarios', '/auth/signup'], cred.usuario, cred.senha);
    }

    if (token) {
      sessao.tokens[api] = token;
      console.log(`[TokenManager] Reautenticação on-the-fly concluída para ${api}`);
      return token;
    }
  } catch (e) {
    console.warn(`[TokenManager] Falha na reautenticação on-the-fly para ${api}:`, e.message);
  }
  return null;
}

/** Remove a sessão ao fazer logout. */
function removerSessao(sessionId) {
  sessoes.delete(sessionId);
}

/** Verifica se uma sessão existe. */
function sessaoExiste(sessionId) {
  return sessoes.has(sessionId);
}

module.exports = { autenticarAPIsExternas, getToken, tentarAuthNovamente, removerSessao, sessaoExiste };
