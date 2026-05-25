/**
 * services/apostasService.js — Integração com as duas instâncias da API de Apostas.
 *
 * Instância 1: JWT Bearer (credenciais fornecidas no login).
 * Instância 2: RSA+AES-256-CBC híbrido (criptografia automática).
 */

const axios = require('axios');
const APIS = require('../config/apis');
const rsa = require('../utils/rsaHelper');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');

let chaveI2Carregada = false;

async function inicializarApostas2() {
  const baseUrl = APIS.apostas.instancia2.baseUrl;
  if (!baseUrl || chaveI2Carregada) return;

  try {
    const resp = await axios.get(`${baseUrl}/crypto/public-key`, { timeout: 10000 });
    const chave = resp.data?.publicKey || resp.data;
    rsa.setChaveApostas2(chave);
    chaveI2Carregada = true;
    console.log('[Apostas I2] Chave pública RSA carregada.');
  } catch (e) {
    console.warn('[Apostas I2] Não foi possível carregar chave pública:', e.message);
  }
}

async function headersI1(sessionId) {
  let token = tokenManager.getToken(sessionId, 'apostas1');
  if (!token) {
    token = await tokenManager.tentarAuthNovamente(sessionId, 'apostas1');
  }
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function listar(sessionId, filtros = {}) {
  const queryStr = new URLSearchParams(filtros).toString();
  const cacheKeyI1 = `apostas:lista:i1:${sessionId}:${queryStr}`;
  const cacheKeyI2 = `apostas:lista:i2:${queryStr}`;

  const emCacheI1 = cache.get(cacheKeyI1);
  const emCacheI2 = cache.get(cacheKeyI2);
  const resultado = [];

  if (!chaveI2Carregada) {
    await inicializarApostas2();
  }

  if (emCacheI1 && emCacheI2) {
    resultado.push(...emCacheI1, ...emCacheI2);
    return resultado;
  }

  const promessas = [];

  if (!emCacheI1) {
    const url = `${APIS.apostas.instancia1.baseUrl}/apostas${queryStr ? '?' + queryStr : ''}`;
    const hdrs1Promise = headersI1(sessionId).then(hdrs1 => {
      if (!hdrs1) throw new Error('Falha ao reautenticar on-the-fly para I1');
      return axios.get(url, { headers: hdrs1, timeout: 15000 });
    });
    promessas.push(hdrs1Promise);
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI1, id: 'i1' }));
  }

  if (!emCacheI2) {
    promessas.push(axios.get(`${APIS.apostas.instancia2.baseUrl}/apostas`, {
      headers: { 'X-Encrypted': 'true' },
      timeout: 15000,
    }));
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI2, id: 'i2' }));
  }

  const [res1, res2] = await Promise.allSettled(promessas);

  if (res1.status === 'fulfilled') {
    if (res1.value.isCache) {
      resultado.push(...res1.value.data);
    } else {
      const novosI1 = [];
      res1.value.data.forEach(item => novosI1.push({ ...item, _instancia: 1 }));
      cache.set(cacheKeyI1, novosI1, 30000);
      resultado.push(...novosI1);
    }
  } else {
    if (res1.reason?.response?.status === 401) {
      tokenManager.tentarAuthNovamente(sessionId, 'apostas1');
    }
    console.warn('[Apostas I1] Falha no GET:', res1.reason.message || res1.reason);
  }

  if (res2.status === 'fulfilled') {
    if (res2.value.isCache) {
      resultado.push(...res2.value.data);
    } else {
      const novosI2 = [];
      res2.value.data.forEach(item => novosI2.push({ ...item, _instancia: 2 }));
      cache.set(cacheKeyI2, novosI2, 30000);
      resultado.push(...novosI2);
    }
  } else {
    console.warn('[Apostas I2] Falha no GET:', res2.reason.message);
  }

  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostas I1 não disponível. Informe credenciais no login.' };
    const resp = await axios.get(`${APIS.apostas.instancia1.baseUrl}/apostas/${id}`, { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  const resp = await axios.get(`${APIS.apostas.instancia2.baseUrl}/apostas/${id}`, {
    headers: { 'X-Encrypted': 'true' }, timeout: 15000,
  });
  return { ...resp.data, _instancia: 2 };
}

async function criar(body, sessionId) {
  cache.invalidar('apostas:lista');
  const resultado = {};

  const hdrs1 = await headersI1(sessionId);
  if (hdrs1) {
    try {
      const resp = await axios.post(`${APIS.apostas.instancia1.baseUrl}/apostas`, body, { headers: hdrs1 });
      resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
    } catch (e) {
      resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
    }
  } else {
    resultado.instancia1 = { sucesso: false, erro: 'Token não disponível para I1' };
  }

  try {
    const payload = chaveI2Carregada ? rsa.criptografarParaApostas2(body) : body;

    const resp = await axios.post(`${APIS.apostas.instancia2.baseUrl}/apostas`, payload, {
      headers: { 'X-Encrypted': 'true', 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    resultado.instancia2 = { sucesso: true, dado: { ...resp.data, _instancia: 2 } };
  } catch (e) {
    resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
  }

  return resultado;
}

async function atualizar(id, body, instancia, sessionId) {
  cache.invalidar('apostas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostas I1 não disponível.' };
    const resp = await axios.put(`${APIS.apostas.instancia1.baseUrl}/apostas/${id}`, body, { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  const resp = await axios.put(`${APIS.apostas.instancia2.baseUrl}/apostas/${id}`, body, {
    headers: { 'X-Encrypted': 'true', 'Content-Type': 'application/json' }, timeout: 15000,
  });
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia, sessionId) {
  cache.invalidar('apostas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostas I1 não disponível.' };
    await axios.delete(`${APIS.apostas.instancia1.baseUrl}/apostas/${id}`, { headers: hdrs });
    return { mensagem: `Aposta ${id} deletada na instância 1` };
  }

  await axios.delete(`${APIS.apostas.instancia2.baseUrl}/apostas/${id}`, {
    headers: { 'X-Encrypted': 'true' }, timeout: 15000,
  });
  return { mensagem: `Aposta ${id} deletada na instância 2` };
}

module.exports = { inicializarApostas2, listar, buscarPorId, criar, atualizar, deletar };
