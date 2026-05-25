/**
 * tokenManager.js
 *
 * Guarda os tokens JWT das APIs externas para cada usuário logado.
 *
 * Fluxo:
 *   1. Usuário faz login no integrador, enviando também as credenciais das APIs externas
 *   2. O integrador faz login em cada API externa e guarda os tokens aqui
 *   3. Quando o usuário faz uma requisição, o integrador pega o token certo daqui
 *
 * Conceito de SD: Gerenciamento centralizado de identidade (Single Sign-On simplificado).
 */

const axios = require('axios');
const APIS = require('../config/apis');

// Mapa de sessões: { sessionId → { apostas1: "token...", apostadores1: "token..." } }
const sessoes = new Map();

/**
 * Faz login nas APIs externas que precisam de JWT e salva os tokens.
 *
 * @param {string} sessionId - ID único da sessão do usuário
 * @param {object} credenciais - { apostas1: {usuario, senha}, apostadores1: {usuario, senha}, lutas2: {...} }
 * @returns {{ tokens: string[], erros: object }}
 */
async function autenticarAPIsExternas(sessionId, credenciais = {}) {
  const tokens = {};
  const erros = {};

  // --- API Apostas (instância 1) — JWT RS256 ---
  if (credenciais.apostas1) {
    try {
      const { usuario, senha } = credenciais.apostas1;
      const resp = await axios.post(`${APIS.apostas.instancia1.baseUrl}/auth/login`, { usuario, senha });
      tokens.apostas1 = resp.data.token;
      console.log('[TokenManager] ✅ Apostas (I1) autenticada');
    } catch (e) {
      erros.apostas1 = e.response?.data?.message || e.message;
      console.warn('[TokenManager] ⚠️  Apostas (I1):', erros.apostas1);
    }
  }

  // --- API Apostadores (instância 1) — JWT HS256 ---
  if (credenciais.apostadores1) {
    try {
      const { usuario, senha } = credenciais.apostadores1;
      const resp = await axios.post(`${APIS.apostadores.instancia1.baseUrl}/login`, { usuario, senha });
      tokens.apostadores1 = resp.data.token;
      console.log('[TokenManager] ✅ Apostadores (I1) autenticada');
    } catch (e) {
      erros.apostadores1 = e.response?.data?.message || e.message;
      console.warn('[TokenManager] ⚠️  Apostadores (I1):', erros.apostadores1);
    }
  }

  // --- API Lutas (instância 2) — JWT (se URL configurada) ---
  if (credenciais.lutas2 && APIS.lutas.instancia2.baseUrl) {
    try {
      const { usuario, senha } = credenciais.lutas2;
      const resp = await axios.post(`${APIS.lutas.instancia2.baseUrl}/login`, { usuario, senha });
      tokens.lutas2 = resp.data.token || resp.data.access_token;
      console.log('[TokenManager] ✅ Lutas (I2) autenticada');
    } catch (e) {
      erros.lutas2 = e.response?.data?.message || e.message;
      console.warn('[TokenManager] ⚠️  Lutas (I2):', erros.lutas2);
    }
  }

  // Salva os tokens da sessão
  sessoes.set(sessionId, tokens);

  return { tokens: Object.keys(tokens), erros };
}

/** Retorna o token de uma API para uma sessão específica */
function getToken(sessionId, api) {
  return sessoes.get(sessionId)?.[api] || null;
}

/** Remove a sessão ao fazer logout */
function removerSessao(sessionId) {
  sessoes.delete(sessionId);
}

/** Verifica se uma sessão existe */
function sessaoExiste(sessionId) {
  return sessoes.has(sessionId);
}

module.exports = { autenticarAPIsExternas, getToken, removerSessao, sessaoExiste };
