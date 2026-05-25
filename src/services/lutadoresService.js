const axios = require('axios');
const APIS  = require('../config/apis');
const rsa   = require('../utils/rsaHelper');
const cache = require('../utils/cache');

let handshakeConcluido = false;

async function inicializarHandshake() {
  if (handshakeConcluido) return;
  const baseUrl = APIS.lutadores.instancia2.baseUrl;

  try {
    await axios.get(`${baseUrl}/chave-publica`);
    await axios.post(`${baseUrl}/handshake`, { publicKey: rsa.getChavePublica() });
    handshakeConcluido = true;
    console.log('[Lutadores I2] Handshake RSA concluído.');
  } catch (e) {
    console.warn('[Lutadores I2] Handshake falhou:', e.message);
  }
}

function descriptografar(response) {
  if (response.headers['x-content-encrypted'] === 'true') {
    const chunks = JSON.parse(response.data);
    const rawStr = rsa.descriptografarChunks(chunks);
    try {
      return JSON.parse(rawStr);
    } catch (e) {
      return JSON.parse(rawStr.replace(/""([^"]+)""/g, '"$1"'));
    }
  }
  return JSON.parse(response.data);
}

const opcoesI2 = { responseType: 'text', transformResponse: [d => d] };

async function listar() {
  if (!handshakeConcluido) await inicializarHandshake();

  const cacheI1 = cache.get('lutadores:lista:i1');
  const cacheI2 = cache.get('lutadores:lista:i2');

  const [res1, res2] = await Promise.allSettled([
    cacheI1
      ? Promise.resolve(cacheI1)
      : axios.get(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores`, { timeout: 25000 }).then(resp => {
          const lista = resp.data.map(item => ({ ...item, _instancia: 1 }));
          cache.set('lutadores:lista:i1', lista);
          return lista;
        }),
    cacheI2
      ? Promise.resolve(cacheI2)
      : axios.get(`${APIS.lutadores.instancia2.baseUrl}/lutadores`, { ...opcoesI2, timeout: 25000 }).then(resp => {
          const dados = descriptografar(resp);
          const lista = (Array.isArray(dados) ? dados : [dados]).map(item => ({ ...item, _instancia: 2 }));
          cache.set('lutadores:lista:i2', lista);
          return lista;
        }),
  ]);

  const resultado = [];
  if (res1.status === 'fulfilled') resultado.push(...res1.value);
  else console.warn('[Lutadores I1] Falha:', res1.reason.message);

  if (res2.status === 'fulfilled') resultado.push(...res2.value);
  else console.warn('[Lutadores I2] Falha:', res2.reason.message);

  return resultado;
}

async function buscarPorId(id, instancia) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores/${id}`);
    return { ...resp.data, _instancia: 1 };
  }

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA pendente.' };
  const resp = await axios.get(`${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}`, opcoesI2);
  return { ...descriptografar(resp), _instancia: 2 };
}

async function criar(campos) {
  cache.invalidar('lutadores:');
  const resultado = {};

  try {
    const resp = await axios.post(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores`, campos);
    resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
  } catch (e) {
    resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
  }

  if (handshakeConcluido) {
    try {
      const query = new URLSearchParams(campos).toString();
      const resp  = await axios.post(`${APIS.lutadores.instancia2.baseUrl}/lutadores?${query}`, null, opcoesI2);
      resultado.instancia2 = { sucesso: true, dado: { ...descriptografar(resp), _instancia: 2 } };
    } catch (e) {
      resultado.instancia2 = { sucesso: false, erro: e.response?.data || e.message };
    }
  }

  return resultado;
}

async function atualizar(id, campos, instancia) {
  cache.invalidar('lutadores:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.put(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores/${id}`, campos);
    return { ...resp.data, _instancia: 1 };
  }

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA pendente.' };
  const query = new URLSearchParams(campos).toString();
  const resp  = await axios.put(`${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}?${query}`, null, opcoesI2);
  return { ...descriptografar(resp), _instancia: 2 };
}

async function deletar(id, instancia) {
  cache.invalidar('lutadores:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    await axios.delete(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores/${id}`);
    return { mensagem: `Lutador ${id} deletado na instância 1` };
  }

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA pendente.' };
  await axios.delete(`${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}`, opcoesI2);
  return { mensagem: `Lutador ${id} deletado na instância 2` };
}

module.exports = { inicializarHandshake, listar, buscarPorId, criar, atualizar, deletar };
