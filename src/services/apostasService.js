/**
 * services/apostasService.js
 *
 * Comunica com as duas instâncias da API de Apostas:
 *
 *   Instância 1 — Node.js / Vercel
 *     Autenticação: JWT RS256 (credenciais informadas no login do frontend)
 *     Todas as rotas protegidas exigem: Authorization: Bearer <token>
 *
 *   Instância 2 — Node.js / 187.77.235.119:5555
 *     Autenticação: RSA + AES-256-CBC híbrido (automático)
 *     Todas as rotas exigem o header: X-Encrypted: true
 *     Body do POST deve ser criptografado: { encryptedKey, iv, encryptedData }
 *
 *   Conceito de SD: Diferentes estratégias de segurança para proteger dados financeiros
 *   em trânsito entre microserviços distribuídos.
 */

const axios = require('axios');
const APIS = require('../config/apis');
const rsa = require('../utils/rsaHelper');
const tokenManager = require('../utils/tokenManager');
const cache = require('../utils/cache');

// Controla se a chave pública da I2 foi carregada
let chaveI2Carregada = false;

// ─── Inicialização da I2 (chamado no startup) ────────────────────────────────

async function inicializarApostas2() {
  const baseUrl = APIS.apostas.instancia2.baseUrl;
  if (!baseUrl || chaveI2Carregada) return;

  try {
    // Obtém a chave pública RSA do servidor para criptografar os dados enviados
    const resp = await axios.get(`${baseUrl}/crypto/public-key`, { timeout: 10000 });
    const chave = resp.data?.publicKey || resp.data;
    rsa.setChaveApostas2(chave);
    chaveI2Carregada = true;
    console.log('[Apostas I2] ✅ Chave pública RSA carregada.');
  } catch (e) {
    console.warn('[Apostas I2] ⚠️  Não foi possível carregar chave pública:', e.message);
  }
}

// ─── Headers ────────────────────────────────────────────────────────────────

function headersI1(sessionId) {
  const token = tokenManager.getToken(sessionId, 'apostas1');
  return token ? { Authorization: `Bearer ${token}` } : null;
}

// ─── Funções de serviço ─────────────────────────────────────────────────────

async function listar(sessionId, filtros = {}) {
  const queryStr = new URLSearchParams(filtros).toString();
  const chaveCache = `apostas:lista:${sessionId}:${queryStr}`;
  const emCache = cache.get(chaveCache);
  if (emCache) return emCache;

  const resultado = [];

  // Instância 1 — precisa de token JWT
  const hdrs1 = headersI1(sessionId);
  if (hdrs1) {
    try {
      const url = `${APIS.apostas.instancia1.baseUrl}/apostas${queryStr ? '?' + queryStr : ''}`;
      const resp = await axios.get(url, { headers: hdrs1 });
      resp.data.forEach(item => resultado.push({ ...item, _instancia: 1 }));
    } catch (e) {
      console.warn('[Apostas I1] Falha no GET:', e.message);
    }
  } else {
    console.warn('[Apostas I1] Token não disponível. Informe credenciais apostas1 no login.');
  }

  // Instância 2 — X-Encrypted: true obrigatório (GET não criptografa o body, só o header)
  try {
    const resp = await axios.get(`${APIS.apostas.instancia2.baseUrl}/apostas`, {
      headers: { 'X-Encrypted': 'true' },
      timeout: 15000,
    });
    resp.data.forEach(item => resultado.push({ ...item, _instancia: 2 }));
  } catch (e) {
    console.warn('[Apostas I2] Falha no GET:', e.message);
  }

  cache.set(chaveCache, resultado, 30000); // Cache curto para dados financeiros (30s)
  return resultado;
}

async function buscarPorId(id, instancia, sessionId) {
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = headersI1(sessionId);
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

  // Instância 1 — JWT Bearer no header, body JSON normal
  const hdrs1 = headersI1(sessionId);
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

  // Instância 2 — body criptografado com RSA+AES (se a chave foi carregada)
  try {
    let payload;

    if (chaveI2Carregada) {
      // Criptografa o body automaticamente antes de enviar
      payload = rsa.criptografarParaApostas2(body);
    } else {
      // Fallback sem criptografia (pode ser rejeitado pela API)
      payload = body;
    }

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
    const hdrs = headersI1(sessionId);
    if (!hdrs) throw { status: 401, message: 'Token da Apostas I1 não disponível.' };
    const resp = await axios.put(`${APIS.apostas.instancia1.baseUrl}/apostas/${id}`, body, { headers: hdrs });
    return { ...resp.data, _instancia: 1 };
  }

  // I2 — apenas o campo 'valor' é atualizado conforme a API
  const resp = await axios.put(`${APIS.apostas.instancia2.baseUrl}/apostas/${id}`, body, {
    headers: { 'X-Encrypted': 'true', 'Content-Type': 'application/json' }, timeout: 15000,
  });
  return { ...resp.data, _instancia: 2 };
}

async function deletar(id, instancia, sessionId) {
  cache.invalidar('apostas:');
  const inst = Number(instancia) || 1;

  if (inst === 1) {
    const hdrs = headersI1(sessionId);
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
