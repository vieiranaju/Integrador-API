const axios        = require('axios');
const APIS         = require('../config/apis');
const rsa          = require('../utils/rsaHelper');
const tokenManager = require('../utils/tokenManager');
const cache        = require('../utils/cache');

let chaveI2Carregada = false;

async function inicializarApostas2() {
  if (chaveI2Carregada) return;
  try {
    const resp = await axios.get(`${APIS.apostas.instancia2.baseUrl}/crypto/public-key`, { timeout: 10000 });
    rsa.setChaveApostas2(resp.data?.publicKey || resp.data);
    chaveI2Carregada = true;
    console.log('[Apostas I2] Chave pública RSA carregada.');
  } catch (e) {
    console.warn('[Apostas I2] Não foi possível carregar chave pública:', e.message);
  }
}

async function getTokenI1(sessionId) {
  let token = tokenManager.getToken(sessionId, 'apostas1');
  if (!token) token = await tokenManager.tentarAuthNovamente(sessionId, 'apostas1');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

async function listar(sessionId, filtros = {}) {
  if (!chaveI2Carregada) await inicializarApostas2();

  const queryStr = new URLSearchParams(filtros).toString();
  const cacheI1  = cache.get(`apostas:lista:i1:${sessionId}:${queryStr}`);
  const cacheI2  = cache.get(`apostas:lista:i2:${queryStr}`);

  const [res1, res2] = await Promise.allSettled([
    cacheI1
      ? Promise.resolve(cacheI1)
      : getTokenI1(sessionId).then(hdrs => {
          if (!hdrs) throw new Error('Token I1 não disponível');
          const url = `${APIS.apostas.instancia1.baseUrl}/apostas${queryStr ? '?' + queryStr : ''}`;
          return axios.get(url, { headers: hdrs, timeout: 15000 }).then(resp => {
            const lista = resp.data.map(item => ({ ...item, _instancia: 1 }));
            cache.set(`apostas:lista:i1:${sessionId}:${queryStr}`, lista, 30000);
            return lista;
          });
        }),
    cacheI2
      ? Promise.resolve(cacheI2)
      : axios.get(`${APIS.apostas.instancia2.baseUrl}/apostas`, { headers: { 'X-Encrypted': 'true' }, timeout: 15000 }).then(resp => {
          const lista = resp.data.map(item => ({ ...item, _instancia: 2 }));
          cache.set(`apostas:lista:i2:${queryStr}`, lista, 30000);
          return lista;
        }),
  ]);

  const resultado = [];
  if (res1.status === 'fulfilled') resultado.push(...res1.value);
  else console.warn('[Apostas I1] Falha:', res1.reason.message);

  if (res2.status === 'fulfilled') resultado.push(...res2.value);
  else console.warn('[Apostas I2] Falha:', res2.reason.message);

  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
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

  const hdrs1 = await getTokenI1(sessionId);
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
    const resp    = await axios.post(`${APIS.apostas.instancia2.baseUrl}/apostas`, payload, {
      headers: { 'X-Encrypted': 'true', 'Content-Type': 'application/json' }, timeout: 15000,
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
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
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
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
    await axios.delete(`${APIS.apostas.instancia1.baseUrl}/apostas/${id}`, { headers: hdrs });
    return { mensagem: `Aposta ${id} deletada na instância 1` };
  }

  await axios.delete(`${APIS.apostas.instancia2.baseUrl}/apostas/${id}`, {
    headers: { 'X-Encrypted': 'true' }, timeout: 15000,
  });
  return { mensagem: `Aposta ${id} deletada na instância 2` };
}

module.exports = { inicializarApostas2, listar, buscarPorId, criar, atualizar, deletar };
