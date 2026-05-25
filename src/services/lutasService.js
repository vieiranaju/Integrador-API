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
 */

const axios = require('axios');
const APIS = require('../config/apis');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');



/** Instância 1 usa API Key fixa */
function headersI1() {
  return { 'X-API-KEY': APIS.lutas.instancia1.apiKey };
}

/** Instância 2 usa JWT Bearer da sessão do usuário */
async function headersI2(sessionId) {
  let token = tokenManager.getToken(sessionId, 'lutas2');
  if (!token) {
    token = await tokenManager.tentarAuthNovamente(sessionId, 'lutas2');
  }
  return token ? { Authorization: `Bearer ${token}` } : null;
}



async function listar(sessionId) {
  const cacheKeyI1 = `lutas:lista:i1`; // Não depende da sessão porque I1 usa API Key fixa
  const cacheKeyI2 = `lutas:lista:i2:${sessionId}`; // Depende da sessão (JWT)
  
  const emCacheI1 = cache.get(cacheKeyI1);
  const emCacheI2 = cache.get(cacheKeyI2);
  const resultado = [];

  const promessas = [];

  // Instância 1
  if (!emCacheI1) {
    promessas.push(axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas`, { headers: headersI1(), timeout: 15000 }));
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI1, id: 'i1' }));
  }

  // Instância 2 (se configurada e com token)
  if (APIS.lutas.instancia2.baseUrl) {
    if (!emCacheI2) {
      const hdrs2Promise = headersI2(sessionId).then(hdrs2 => {
        if (!hdrs2) throw new Error('Falha ao reautenticar on-the-fly para I2');
        return axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas`, { headers: hdrs2, timeout: 15000 });
      });
      promessas.push(hdrs2Promise);
    } else {
      promessas.push(Promise.resolve({ isCache: true, data: emCacheI2, id: 'i2' }));
    }
  }

  const resultados = await Promise.allSettled(promessas);

  // Processa resultados (podem ser 1 ou 2 promises dependendo de APIS.lutas.instancia2.baseUrl)
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
      if (!isI1 && res.reason?.response?.status === 401) {
        console.warn('[Lutas I2] 401 Recebido. Reautenticando próxima vez...');
        tokenManager.tentarAuthNovamente(sessionId, 'lutas2');
      }
      console.warn(`[Lutas I${isI1 ? 1 : 2}] Falha no GET:`, res.reason.message || res.reason);
    }
  }

  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }

  // Instância 2
  const hdrs = await headersI2(sessionId);
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
    const hdrs = await headersI2(sessionId);
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

  const hdrs = await headersI2(sessionId);
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

  const hdrs = await headersI2(sessionId);
  if (!hdrs) throw { status: 401, message: 'Token da Lutas I2 não disponível.' };
  await axios.delete(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: hdrs });
  return { mensagem: `Luta ${id} deletada na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
