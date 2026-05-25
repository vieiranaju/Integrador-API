const axios = require('axios');
const APIS  = require('../config/apis');
const cache = require('../utils/cache');
const rsa   = require('../utils/rsaHelper');

function headersI1() {
  return { 'X-API-KEY': APIS.lutas.instancia1.apiKey };
}

function headersI2(rota) {
  const nome = APIS.lutas.instancia2.nomeIntegrador;
  return {
    'x-api-nome':   nome,
    'x-assinatura': rsa.gerarAssinaturaLutas2(nome, rota),
  };
}

async function buscarDeInstancia(instancia, rota, hdrs) {
  const url = instancia === 1
    ? `${APIS.lutas.instancia1.baseUrl}${rota}`
    : `${APIS.lutas.instancia2.baseUrl}${rota}`;
  const resp = await axios.get(url, { headers: hdrs, timeout: 15000 });
  return resp.data;
}

async function listar() {
  const cacheI1 = cache.get('lutas:lista:i1');
  const cacheI2 = cache.get('lutas:lista:i2');

  const [res1, res2] = await Promise.allSettled([
    cacheI1
      ? Promise.resolve(cacheI1)
      : buscarDeInstancia(1, '/lutas', headersI1()).then(dados => {
          const lista = dados.map(item => ({ ...item, _instancia: 1 }));
          cache.set('lutas:lista:i1', lista);
          return lista;
        }),
    cacheI2
      ? Promise.resolve(cacheI2)
      : buscarDeInstancia(2, '/lutas/', headersI2('/lutas/')).then(dados => {
          const lista = dados.map(item => ({ ...item, _instancia: 2 }));
          cache.set('lutas:lista:i2', lista);
          return lista;
        }),
  ]);

  const resultado = [];
  if (res1.status === 'fulfilled') resultado.push(...res1.value);
  else console.warn('[Lutas I1] Falha:', res1.reason.message);

  if (res2.status === 'fulfilled') resultado.push(...res2.value);
  else console.warn('[Lutas I2] Falha:', res2.reason.message);

  return resultado;
}

async function buscarPorId(id, instancia) {
  const inst = Number(instancia) || 1;
  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { ...resp.data, _instancia: 1 };
  }
  const resp = await axios.get(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: headersI2(`/lutas/${id}`) });
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

  try {
    const resp = await axios.post(`${APIS.lutas.instancia2.baseUrl}/lutas/`, body, { headers: headersI2('/lutas/') });
    resultado.instancia2 = { sucesso: true, dado: { ...resp.data, _instancia: 2 } };
  } catch (e) {
    resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
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
  const resp = await axios.put(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, body, { headers: headersI2(`/lutas/${id}`) });
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia) {
  cache.invalidar('lutas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    await axios.delete(`${APIS.lutas.instancia1.baseUrl}/lutas/${id}`, { headers: headersI1() });
    return { mensagem: `Luta ${id} deletada na instância 1` };
  }
  await axios.delete(`${APIS.lutas.instancia2.baseUrl}/lutas/${id}`, { headers: headersI2(`/lutas/${id}`) });
  return { mensagem: `Luta ${id} deletada na instância 2` };
}

module.exports = { listar, buscarPorId, criar, atualizar, deletar };
