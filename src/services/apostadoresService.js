/**
 * services/apostadoresService.js
 *
 * Comunica com as duas instâncias da API de Apostadores:
 *
 *   Instância 1 — Node.js / TypeScript / Vercel
 *     Autenticação: JWT HS256 (credenciais informadas no login do frontend)
 *     Campos em camelCase: { nome, idade, chavePix }
 *
 *   Instância 2 — FastAPI / Python / Render
 *     Autenticação: nenhuma (API pública)
 *     Campos em snake_case: { nome, idade, chave_pix }
 *     O integrador normaliza os campos automaticamente entre as duas instâncias.
 *
 *   Conceito de SD: Normalização de dados — o integrador padroniza formatos
 *   diferentes entre microserviços desenvolvidos por equipes distintas.
 */

const axios = require('axios');
const APIS = require('../config/apis');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');

// ─── Headers ────────────────────────────────────────────────────────────────

function headersI1(sessionId) {
  const token = tokenManager.getToken(sessionId, 'apostadores1');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

// ─── Normalização de campos ─────────────────────────────────────────────────

/** Converte para o formato camelCase que a I1 espera */
function paraI1(body) {
  return {
    nome:     body.nome,
    idade:    body.idade,
    chavePix: body.chavePix || body.chave_pix, // aceita ambos
  };
}

/** Converte para o formato snake_case que a I2 espera */
function paraI2(body) {
  return {
    nome:      body.nome,
    idade:     body.idade,
    chave_pix: body.chave_pix || body.chavePix, // aceita ambos
  };
}

// ─── Funções de serviço ─────────────────────────────────────────────────────

async function listar(sessionId) {
  const chaveCache = `apostadores:lista:${sessionId}`;
  const emCache = cache.get(chaveCache);
  if (emCache) return emCache;

  const resultado = [];

  // Instância 1 — precisa de token JWT
  const hdrs1 = headersI1(sessionId);
  if (hdrs1) {
    try {
      const resp = await axios.get(`${APIS.apostadores.instancia1.baseUrl}/apostadores`, { headers: hdrs1 });
      resp.data.forEach(item => resultado.push({ ...item, _instancia: 1 }));
    } catch (e) {
      console.warn('[Apostadores I1] Falha no GET:', e.message);
    }
  } else {
    console.warn('[Apostadores I1] Token não disponível. Informe credenciais apostadores1 no login.');
  }

  // Instância 2 — pública, sem autenticação
  try {
    const resp = await axios.get(`${APIS.apostadores.instancia2.baseUrl}/apostadores/`);
    resp.data.forEach(item => resultado.push({ ...item, _instancia: 2 }));
  } catch (e) {
    console.warn('[Apostadores I2] Falha no GET:', e.message);
  }

  cache.set(chaveCache, resultado);
  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostadores I1 não disponível. Informe credenciais no login.' };
    const resp = await axios.get(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  const resp = await axios.get(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`);
  return { ...resp.data, _instancia: 2 };
}

async function criar(body, sessionId) {
  cache.invalidar('apostadores:');
  const resultado = {};

  // Instância 1 — JWT + camelCase
  const hdrs1 = headersI1(sessionId);
  if (hdrs1) {
    try {
      const resp = await axios.post(`${APIS.apostadores.instancia1.baseUrl}/apostadores`, paraI1(body), { headers: hdrs1 });
      resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
    } catch (e) {
      resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
    }
  } else {
    resultado.instancia1 = { sucesso: false, erro: 'Token não disponível para I1' };
  }

  // Instância 2 — sem auth + snake_case
  try {
    const resp = await axios.post(`${APIS.apostadores.instancia2.baseUrl}/apostadores/`, paraI2(body));
    resultado.instancia2 = { sucesso: true, dado: { ...resp.data, _instancia: 2 } };
  } catch (e) {
    resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
  }

  return resultado;
}

async function atualizar(id, body, instancia, sessionId) {
  cache.invalidar('apostadores:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostadores I1 não disponível.' };
    const resp = await axios.put(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, paraI1(body), { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  const resp = await axios.put(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`, paraI2(body));
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia, sessionId) {
  cache.invalidar('apostadores:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostadores I1 não disponível.' };
    await axios.delete(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, { headers: hdrs });
    return { mensagem: `Apostador ${id} deletado na instância 1` };
  }

  await axios.delete(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`);
  return { mensagem: `Apostador ${id} deletado na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
