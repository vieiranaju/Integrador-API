/**
 * services/lutasService.js
 *
 * Comunica com as duas instâncias da API de Lutas:
 *
 *   Instância 1 — Spring Boot / Railway
 *     Autenticação: API Key fixa no header X-API-KEY
 *
 *   Instância 2 — FastAPI / Python
 *     Autenticação: JWT Bearer (token obtido no login via credenciais do frontend)
 *
 * GET lista: busca das duas instâncias e une os resultados
 * GET por ID / PUT / DELETE: escolhe a instância pelo query param ?instancia=1 ou 2
 * POST: envia para as duas instâncias (best-effort — falha em uma não cancela a outra)
 *
 * Conceito de SD: Agregação de dados de múltiplas fontes distribuídas.
 */

const axios = require('axios');
const APIS = require('../config/apis');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');

// ─── Headers de autenticação ────────────────────────────────────────────────

/** Instância 1 usa API Key fixa */
function headersI1() {
  return { 'X-API-KEY': APIS.lutas.instancia1.apiKey };
}

/** Instância 2 usa JWT Bearer da sessão do usuário */
function headersI2(sessionId) {
  const token = tokenManager.getToken(sessionId, 'lutas2');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// ─── Funções de serviço ─────────────────────────────────────────────────────

async function listar(sessionId) {
  const chaveCache = `lutas:lista:${sessionId}`;
  const emCache = cache.get(chaveCache);
  if (emCache) return emCache; // Retorna do cache se disponível

  const resultado = [];

  // Busca na instância 1
  try {
    const resp = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas`, { headers: headersI1() });
    // Adiciona _instancia para identificar a origem no frontend
    resp.data.forEach(item => resultado.push({ ...item, _instancia: 1 }));
  } catch (e) {
    console.warn('[Lutas I1] Falha no GET:', e.message);
  }

  // Busca na instância 2 (se configurada e com token)
  if (APIS.lutas.instancia2.baseUrl) {
    const hdrs = headersI2(sessionId);
    if (hdrs) {
      try {
        const resp = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas`, { headers: hdrs });
        resp.data.forEach(item => resultado.push({ ...item, _instancia: 2 }));
      } catch (e) {
        console.warn('[Lutas I2] Falha no GET:', e.message);
      }
    }
  }

  cache.set(chaveCache, resultado);
  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }

  // Instância 2
  const hdrs = headersI2(sessionId);
  if (!hdrs) throw { status: 401, message: 'Token da Lutas I2 não disponível. Informe as credenciais no login.' };
  const resp = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs });
  return { ...resp.data, _instancia: 2 };
}

async function criar(body, sessionId) {
  cache.invalidar('lutas:lista');
  const resultado = {};

  // Cria na instância 1
  try {
    const resp = await axios.post(`${APIS.lutas.instancia1.baseUrl}/lutas`, body, { headers: headersI1() });
    resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
  } catch (e) {
    resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
  }

  // Cria na instância 2 (se configurada)
  if (APIS.lutas.instancia2.baseUrl) {
    const hdrs = headersI2(sessionId);
    if (hdrs) {
      try {
        const resp = await axios.post(`${APIS.lutas.instancia2.baseUrl}/lutas`, body, { headers: hdrs });
        resultado.instancia2 = { sucesso: true, dado: { ...resp.data, _instancia: 2 } };
      } catch (e) {
        resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
      }
    }
  }

  return resultado;
}

async function atualizar(id, body, instancia, sessionId) {
  cache.invalidar('lutas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.put(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, body, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }

  const hdrs = headersI2(sessionId);
  if (!hdrs) throw { status: 401, message: 'Token da Lutas I2 não disponível.' };
  const resp = await axios.put(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, body, { headers: hdrs });
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia, sessionId) {
  cache.invalidar('lutas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    await axios.delete(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { mensagem: `Luta ${id} deletada na instância 1` };
  }

  const hdrs = headersI2(sessionId);
  if (!hdrs) throw { status: 401, message: 'Token da Lutas I2 não disponível.' };
  await axios.delete(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs });
  return { mensagem: `Luta ${id} deletada na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
