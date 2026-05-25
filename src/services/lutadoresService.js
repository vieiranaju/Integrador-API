/**
 * services/lutadoresService.js
 *
 * Comunica com as duas instâncias da API de Lutadores:
 *
 *   Instância 1 — Spring Boot / Render
 *     Autenticação: nenhuma (API pública)
 *     Respostas: JSON normal
 *     ⚠️  Path real: /api/lutadores (confirmado via /v3/api-docs)
 *
 *   Instância 2 — Java puro / Heroku (RSA-OAEP bidirecional)
 *     Autenticação: handshake RSA (feito automaticamente no startup)
 *     Respostas: array de chunks Base64 → descriptografados aqui
 *
 *   Conceito de SD: Segurança M2M (Machine-to-Machine) com criptografia assimétrica.
 *   O servidor criptografa as respostas com nossa chave pública; só nós podemos ler.
 *
 * Handshake RSA (executado uma vez no startup):
 *   1. GET /chave-publica  → obtemos a chave pública do servidor
 *   2. POST /handshake     → enviamos nossa chave pública ao servidor
 *   3. A partir daí, todas as respostas vêm criptografadas para nós
 */

const axios = require('axios');
const APIS = require('../config/apis');
const rsa = require('../utils/rsaHelper');
const cache = require('../utils/cache');

// Controla se o handshake com I2 foi realizado
let handshakeConcluido = false;

// ─── Handshake RSA (chamado no startup do servidor) ─────────────────────────

async function inicializarHandshake() {
  const baseUrl = APIS.lutadores.instancia2.baseUrl;
  if (!baseUrl || handshakeConcluido) return;

  try {
    // Passo 1: obtém a chave pública do servidor I2
    await axios.get(`${baseUrl}/chave-publica`);
    console.log('[Lutadores I2] Chave pública do servidor obtida.');

    // Passo 2: envia nossa chave pública ao servidor
    await axios.post(`${baseUrl}/handshake`, { publicKey: rsa.getChavePublica() });

    handshakeConcluido = true;
    console.log('[Lutadores I2] ✅ Handshake RSA concluído.');
  } catch (e) {
    console.warn('[Lutadores I2] ⚠️  Handshake falhou:', e.message);
  }
}

// ─── Descriptografia da resposta da I2 ─────────────────────────────────────

/**
 * A I2 indica respostas criptografadas com o header X-Content-Encrypted: true
 * Nesses casos, o corpo é um array de chunks Base64 que precisamos descriptografar
 */
function descriptografarSeNecessario(response) {
  if (response.headers['x-content-encrypted'] === 'true') {
    const chunks = JSON.parse(response.data); // response.data é string pois usamos responseType: 'text'
    const rawStr = rsa.descriptografarChunks(chunks);
    
    // API Heroku retorna JSON malformado com aspas duplas (ex: ""Socrates"")
    // Repara a string antes de fazer o parse
    try {
      return JSON.parse(rawStr);
    } catch (e) {
      const repairedStr = rawStr.replace(/""([^"]+)""/g, '"$1"');
      return JSON.parse(repairedStr);
    }
  }
  return JSON.parse(response.data);
}

// ─── Funções de serviço ─────────────────────────────────────────────────────

async function listar() {
  const resultado = [];
  const emCacheI1 = cache.get('lutadores:lista:i1');
  const emCacheI2 = cache.get('lutadores:lista:i2');

  // Retenta o handshake se falhou anteriormente
  if (!handshakeConcluido) {
    await inicializarHandshake();
  }

  // Se já temos as duas em cache, retorna rápido
  if (emCacheI1 && (emCacheI2 || !handshakeConcluido)) {
    if (emCacheI1) resultado.push(...emCacheI1);
    if (emCacheI2) resultado.push(...emCacheI2);
    return resultado;
  }

  // Prepara requisições apenas do que falta
  const promessas = [];
  if (!emCacheI1) {
    promessas.push(axios.get(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores`, { timeout: 25000 }));
  } else {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI1, id: 'i1' }));
  }

  if (!emCacheI2 && handshakeConcluido) {
    promessas.push(axios.get(`${APIS.lutadores.instancia2.baseUrl}/lutadores`, {
      timeout: 25000,
      responseType: 'text',
      transformResponse: [d => d],
    }));
  } else if (emCacheI2) {
    promessas.push(Promise.resolve({ isCache: true, data: emCacheI2, id: 'i2' }));
  } else {
    promessas.push(Promise.reject(new Error('Handshake I2 pendente')));
  }

  const [res1, res2] = await Promise.allSettled(promessas);

  // Processa I1
  if (res1.status === 'fulfilled') {
    if (res1.value.isCache) {
      resultado.push(...res1.value.data);
    } else {
      const novosI1 = [];
      res1.value.data.forEach(item => novosI1.push({ ...item, _instancia: 1 }));
      cache.set('lutadores:lista:i1', novosI1);
      resultado.push(...novosI1);
    }
  } else {
    console.warn('[Lutadores I1] Falha no GET:', res1.reason.message);
  }

  // Processa I2
  if (res2.status === 'fulfilled') {
    if (res2.value.isCache) {
      resultado.push(...res2.value.data);
    } else {
      try {
        const dados = descriptografarSeNecessario(res2.value);
        const lista = Array.isArray(dados) ? dados : [dados];
        const novosI2 = [];
        lista.forEach(item => novosI2.push({ ...item, _instancia: 2 }));
        cache.set('lutadores:lista:i2', novosI2);
        resultado.push(...novosI2);
      } catch (err) {
        console.warn('[Lutadores I2] Erro ao descriptografar:', err.message);
      }
    }
  } else {
    console.warn('[Lutadores I2] Falha no GET:', res2.reason.message);
  }

  return resultado;
}

async function buscarPorId(id, instancia) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const resp = await axios.get(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores/${id}`);
    return { ...resp.data, _instancia: 1 };
  }

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA com Lutadores I2 pendente.' };

  const resp = await axios.get(`${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}`, {
    responseType: 'text',
    transformResponse: [d => d],
  });
  return { ...descriptografarSeNecessario(resp), _instancia: 2 };
}

async function criar(campos) {
  cache.invalidar('lutadores:');
  const resultado = {};

  // I1 — Spring Boot aceita JSON no body (path com prefixo /api)
  try {
    const resp = await axios.post(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores`, campos);
    resultado.instancia1 = { sucesso: true, dado: { ...resp.data, _instancia: 1 } };
  } catch (e) {
    resultado.instancia1 = { sucesso: false, erro: e.response?.data || e.message };
  }

  // I2 — Java puro aceita os campos como query params (?nome=X&apelido=X&...)
  if (handshakeConcluido) {
    try {
      const queryParams = new URLSearchParams(campos).toString();
      const resp = await axios.post(
        `${APIS.lutadores.instancia2.baseUrl}/lutadores?${queryParams}`,
        null,
        { responseType: 'text', transformResponse: [d => d] }
      );
      const dado = descriptografarSeNecessario(resp);
      resultado.instancia2 = { sucesso: true, dado: { ...dado, _instancia: 2 } };
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

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA com Lutadores I2 pendente.' };
  const queryParams = new URLSearchParams(campos).toString();
  const resp = await axios.put(
    `${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}?${queryParams}`,
    null,
    { responseType: 'text', transformResponse: [d => d] }
  );
  return { ...descriptografarSeNecessario(resp), _instancia: 2 };
}

async function deletar(id, instancia) {
  cache.invalidar('lutadores:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    await axios.delete(`${APIS.lutadores.instancia1.baseUrl}/api/lutadores/${id}`);
    return { mensagem: `Lutador ${id} deletado na instância 1` };
  }

  if (!handshakeConcluido) throw { status: 503, message: 'Handshake RSA com Lutadores I2 pendente.' };
  await axios.delete(`${APIS.lutadores.instancia2.baseUrl}/lutadores/${id}`, {
    responseType: 'text', transformResponse: [d => d],
  });
  return { mensagem: `Lutador ${id} deletado na instância 2` };
}

module.exports = { inicializarHandshake, listar, buscarPorId, criar, atualizar, deletar };
