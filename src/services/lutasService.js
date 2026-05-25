/**
 * services/lutasService.js — Integração com as duas instâncias da API de Lutas.
 *
 * GET lista: busca das duas instâncias e une os resultados.
 * GET por ID / PUT / DELETE: escolhe a instância pelo query param ?instancia=1 ou 2.
 * POST: envia para as duas instâncias (best-effort).
 */

const axios = require('axios');
const APIS = require('../config/apis');
const cache = require('../utils/cache');
const rsa = require('../utils/rsaHelper');

function headersI1() {
  return { 'X-API-KEY': APIS.lutas.instancia1.apiKey };
}

function headersI2(rota) {
  const nomeIntegrador = APIS.lutas.instancia2.nomeIntegrador;
  return {
    'x-api-nome': nomeIntegrador,
    'x-assinatura': rsa.gerarAssinaturaLutas2(nomeIntegrador, rota),
  };
}

async function listar() {
  const cacheKeyI1 = `lutas:lista:i1`;
  const cacheKeyI2 = `lutas:lista:i2`;

  const emCacheI1 = cache.get(cacheKeyI1);
  const emCacheI2 = cache.get(cacheKeyI2);
  const resultado = [];

  const promessas = [];

  if (!emCacheI1) {
    promessas.push(axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas`, { headers: headersI1(), timeout: 15000 }));
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI1, id: 'i1' }));
  }

  if (APIS.lutas.instancia2.baseUrl) {
    if (!emCacheI2) {
      try {
        const hdrs2 = headersI2('/lutas/');
        promessas.push(axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/`, { headers: hdrs2, timeout: 15000 }));
      } catch (e) {
        promessas.push(Promise.reject(e));
      }
    } else {
      promessas.push(Promise.resolve({ isCache: true, data: emCacheI2, id: 'i2' }));
    }
  }

  const resultados = await Promise.allSettled(promessas);

  const errosI2 = [];

  for (let i = 0; i < resultados.length; i++) {
    const res = resultados[i];
    const isI1 = (i === 0);

    if (res.status === 'fulfilled') {
      if (res.value.isCache) {
        resultado.push(...res.value.data);
      } else {
        const novos = [];
        res.value.data.forEach(item => novos.push({ ...item, _instancia: isI1 ? 1 : 2 }));
        cache.set(isI1 ? cacheKeyI1 : cacheKeyI2, novos);
        resultado.push(...novos);
      }
    } else {
      const err = res.reason;
      const status  = err.response?.status;
      const body    = err.response?.data;
      const msg     = err.message;

      if (!isI1) {
        console.error('[Lutas I2] Falha M2M:',
          status ? `HTTP ${status}` : 'sem resposta',
          body   ? JSON.stringify(body) : msg
        );
        errosI2.push({ status, body, msg });
      } else {
        console.warn('[Lutas I1] Falha no GET:', msg);
      }
    }
  }

  if (errosI2.length > 0) {
    resultado._erroI2 = errosI2[0];
  }

  return resultado;
}

async function buscarPorId(id, instancia) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }

  const hdrs = headersI2(`/lutas/${id}`);
  const resp = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs });
  return { ...resp.data, _instancia: 2 };
}

async function criar(body) {
  cache.invalidar('lutas:lista');
  const resultado = {};

  try {
    const resp = await axios.post(`${APIS.lutas.instancia1.baseUrl}/lutas`, body, { headers: headersI1() });
    resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
  } catch (e) {
    resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
  }

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
