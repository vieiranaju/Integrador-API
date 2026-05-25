/**
 * services/lutasService.js
 *
 * Comunica com as duas instâncias da API de Lutas:
 *
 *   Instância 1 — Spring Boot / Railway
 *     Autenticação: API Key fixa no header X-API-KEY
 *
 *   Instância 2 — Vercel / Node.js
 *     Autenticação: M2M RSA-PSS (headers x-api-nome e x-assinatura)
 *
 * GET lista: load balancer aleatório (50/50) com fallback
 * GET por ID: load balancer aleatório (50/50) com fallback
 * PUT / DELETE: escolhe a instância pelo query param ?instancia=1 ou 2
 * POST: envia para as duas instâncias (best-effort — falha em uma não cancela a outra)
 *
 */

const axios = require('axios');
const APIS = require('../config/apis');
const cache = require('../utils/cache');
const rsa = require('../utils/rsaHelper');



/** Instância 1 usa API Key fixa */
function headersI1() {
  return { 'X-API-KEY': APIS.lutas.instancia1.apiKey };
}

/** Instância 2 usa assinatura RSA M2M */
function headersI2(rota) {
  const nomeIntegrador = APIS.lutas.instancia2.nomeIntegrador;
  return {
    'x-api-nome': nomeIntegrador,
    'x-assinatura': rsa.gerarAssinaturaLutas2(nomeIntegrador, rota),
  };
}



async function listar() {
  const cacheKey = `lutas:lista:lb`;
  const emCache = cache.get(cacheKey);
  if (emCache) return emCache;

  const first = Math.random() > 0.5;

  async function fetchInstancia(isI1) {
    if (isI1) {
      const res = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas`, { headers: headersI1(), timeout: 15000 });
      return res.data.map(item => ({ ...item, _instancia: 1 }));
    } else {
      if (!APIS.lutas.instancia2.baseUrl) throw new Error("I2 não configurada");
      const hdrs = headersI2('/lutas/');
      const res = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/`, { headers: hdrs, timeout: 15000 });
      return res.data.map(item => ({ ...item, _instancia: 2 }));
    }
  }

  try {
    const data = await fetchInstancia(first);
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.warn(`[Lutas] Falha na API (I${first ? 1 : 2}):`, err.message, '- Tentando fallback...');
    try {
      const data = await fetchInstancia(!first);
      cache.set(cacheKey, data);
      return data;
    } catch (err2) {
      throw { status: 500, message: `Ambas instâncias de Lutas falharam. Erro final: ${err2.message}` };
    }
  }
}

async function buscarPorId(id) {
  const first = Math.random() > 0.5;

  async function fetchInstancia(isI1) {
    if (isI1) {
      const res = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1(), timeout: 15000 });
      return { ...res.data, _instancia: 1 };
    } else {
      if (!APIS.lutas.instancia2.baseUrl) throw new Error("I2 não configurada");
      const hdrs = headersI2(`/lutas/${id}`);
      const res = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs, timeout: 15000 });
      return { ...res.data, _instancia: 2 };
    }
  }

  try {
    return await fetchInstancia(first);
  } catch (err) {
    console.warn(`[Lutas] Falha ao buscar ID ${id} na API (I${first ? 1 : 2}):`, err.message, '- Tentando fallback...');
    try {
      return await fetchInstancia(!first);
    } catch (err2) {
      throw { status: 404, message: `Luta ${id} não encontrada em nenhuma instância (Erro: ${err2.message})` };
    }
  }
}

async function criar(body) {
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
    try {
      const hdrs = headersI2('/lutas/');
      const resp = await axios.post(`${APIS.lutas.instancia2.baseUrl}/lutas/`, body, { headers: hdrs });
      resultado.instancia2 = { sucesso: true, dado: { ...resp.data, _instancia: 2 } };
    } catch (e) {
      resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
    }
  }

  return resultado;
}

async function atualizar(id, body, instancia) {
  cache.invalidar('lutas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.put(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, body, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }

  const hdrs = headersI2(`/lutas/${id}`);
  const resp = await axios.put(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, body, { headers: hdrs });
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia) {
  cache.invalidar('lutas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    await axios.delete(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { mensagem: `Luta ${id} deletada na instância 1` };
  }

  const hdrs = headersI2(`/lutas/${id}`);
  await axios.delete(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs });
  return { mensagem: `Luta ${id} deletada na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
