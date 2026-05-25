const axios        = require('axios');
const APIS         = require('../config/apis');
const tokenManager = require('../utils/tokenManager');
const cache        = require('../utils/cache');

async function getTokenI1(sessionId) {
  let token = tokenManager.getToken(sessionId, 'apostadores1');
  if (!token) token = await tokenManager.tentarAuthNovamente(sessionId, 'apostadores1');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

function paraI1(body) {
  return { nome: body.nome, idade: body.idade, chavePix: body.chavePix || body.chave_pix };
}

function paraI2(body) {
  return { nome: body.nome, idade: body.idade, chave_pix: body.chave_pix || body.chavePix };
}

async function listar(sessionId) {
  const cacheI1 = cache.get(`apostadores:lista:i1:${sessionId}`);
  const cacheI2 = cache.get('apostadores:lista:i2');

  const [res1, res2] = await Promise.allSettled([
    cacheI1
      ? Promise.resolve(cacheI1)
      : getTokenI1(sessionId).then(hdrs => {
          if (!hdrs) throw new Error('Token I1 não disponível');
          return axios.get(`${APIS.apostadores.instancia1.baseUrl}/apostadores`, { headers: hdrs, timeout: 15000 }).then(resp => {
            const lista = resp.data.map(item => ({ ...item, _instancia: 1 }));
            cache.set(`apostadores:lista:i1:${sessionId}`, lista);
            return lista;
          });
        }),
    cacheI2
      ? Promise.resolve(cacheI2)
      : axios.get(`${APIS.apostadores.instancia2.baseUrl}/apostadores/`, { timeout: 15000 }).then(resp => {
          const lista = resp.data.map(item => ({ ...item, _instancia: 2 }));
          cache.set('apostadores:lista:i2', lista);
          return lista;
        }),
  ]);

  const resultado = [];
  if (res1.status === 'fulfilled') resultado.push(...res1.value);
  else console.warn('[Apostadores I1] Falha:', res1.reason.message);

  if (res2.status === 'fulfilled') resultado.push(...res2.value);
  else console.warn('[Apostadores I2] Falha:', res2.reason.message);

  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
    const resp = await axios.get(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  const resp = await axios.get(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`);
  return { ...resp.data, _instancia: 2 };
}

async function criar(body, sessionId) {
  cache.invalidar('apostadores:');
  const resultado = {};

  const hdrs1 = await getTokenI1(sessionId);
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
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
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
    const hdrs = await getTokenI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token I1 não disponível.' };
    await axios.delete(`${APIS.apostadores.instancia1.baseUrl}/apostadores/${id}`, { headers: hdrs });
    return { mensagem: `Apostador ${id} deletado na instância 1` };
  }

  await axios.delete(`${APIS.apostadores.instancia2.baseUrl}/apostadores/${id}`);
  return { mensagem: `Apostador ${id} deletado na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
