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
 *   diferentes entre microserviços desenvolvidos por equipes distintas.
 */

const axios = require('axios');
const APIS = require('../config/apis');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');



async function headersI1(sessionId) {
  let token = tokenManager.getToken(sessionId, 'apostadores1');
  if (!token) {
    token = await tokenManager.tentarAuthNovamente(sessionId, 'apostadores1');
  }
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}



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



async function listar(sessionId) {
  const resultado = [];
  const emCacheI1 = cache.get(`apostadores:lista:i1:${sessionId}`);
  const emCacheI2 = cache.get('apostadores:lista:i2');

  if (emCacheI1 && emCacheI2) {
    resultado.push(...emCacheI1, ...emCacheI2);
    return resultado;
  }

  const promessas = [];

  // Instância 1
  if (!emCacheI1) {
    // A função headersI1 já tenta reautenticar se o token estiver ausente
    const hdrs1Promise = headersI1(sessionId).then(hdrs1 => {
      if (!hdrs1) throw new Error('Falha ao reautenticar on-the-fly para I1');
      return axios.get(`${APIS.apostadores.instancia1.baseUrl}/apostadores`, { headers: hdrs1, timeout: 15000 });
    });
    promessas.push(hdrs1Promise);
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI1, id: 'i1' }));
  }

  // Instância 2
  if (!emCacheI2) {
    promessas.push(axios.get(`${APIS.apostadores.instancia2.baseUrl}/apostadores/`, { timeout: 15000 }));
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI2, id: 'i2' }));
  }

  const [res1, res2] = await Promise.allSettled(promessas);

  // Processa I1
  if (res1.status === 'fulfilled') {
    if (res1.value.isCache) {
      resultado.push(...res1.value.data);
    } else {
      const novosI1 = [];
      res1.value.data.forEach(item => novosI1.push({ ...item, _instancia: 1 }));
      cache.set(`apostadores:lista:i1:${sessionId}`, novosI1);
      resultado.push(...novosI1);
    }
  } else {
    // Se falhar com 401 mesmo após o retry (token velho/expirado na sessão)
    if (res1.reason?.response?.status === 401) {
      console.warn('[Apostadores I1] 401 Recebido. Reautenticando próxima vez...');
      tokenManager.tentarAuthNovamente(sessionId, 'apostadores1'); // Deixa preparado pro próximo F5
    }
    console.warn('[Apostadores I1] Falha no GET:', res1.reason.message || res1.reason);
  }

  // Processa I2
  if (res2.status === 'fulfilled') {
    if (res2.value.isCache) {
      resultado.push(...res2.value.data);
    } else {
      const novosI2 = [];
      res2.value.data.forEach(item => novosI2.push({ ...item, _instancia: 2 }));
      cache.set('apostadores:lista:i2', novosI2);
      resultado.push(...novosI2);
    }
  } else {
    console.warn('[Apostadores I2] Falha no GET:', res2.reason.message);
  }

  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await headersI1(sessionId);
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
  const hdrs1 = await headersI1(sessionId);
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
    const hdrs = await headersI1(sessionId);
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
    const hdrs = await headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostadores I1 não disponível.' };
    await axios.delete(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, { headers: hdrs });
    return { mensagem: `Apostador ${id} deletado na instância 1` };
  }

  await axios.delete(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`);
  return { mensagem: `Apostador ${id} deletado na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
