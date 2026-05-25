/**
 * rsaHelper.js
 *
 * Centraliza toda a criptografia assimétrica usada pelo integrador.
 *
 * Este arquivo lida com dois tipos de criptografia:
 *
 * 1. RSA-OAEP (para API Lutadores I2 — Heroku)
 *    - O servidor criptografa as respostas com a nossa chave pública
 *    - Nós descriptografamos com a nossa chave privada
 *    - As respostas chegam como um array de "pedaços" (chunks) em Base64
 *
 * 2. RSA + AES-256-CBC Híbrido (para API Apostas I2 — 187.77.235.119:5555)
 *    - RSA sozinho não suporta dados grandes (max ~190 bytes)
 *    - Solução: criptografar os DADOS com AES (rápido, sem limite)
 *              e a CHAVE AES com RSA (seguro)
 *    - Enviamos: { encryptedKey, iv, encryptedData }
 *
 * Conceito de SD: Criptografia assimétrica garante confidencialidade
 * em comunicações entre microserviços distribuídos.
 */

const crypto = require('crypto');

// Par de chaves do integrador (gerado uma vez no startup)
let _chavePrivada = null;   // Chave privada PEM — usada para DESCRIPTOGRAFAR
let _chavePublicaB64 = null; // Chave pública Base64 — enviada no handshake

// Chave pública da API Apostas I2 — usada para CRIPTOGRAFAR os dados enviados
let _apostas2ChavePublica = null;

/**
 * Gera o par de chaves RSA-2048 do integrador.
 * Chamado uma única vez quando o servidor inicia.
 */
async function inicializar() {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'der' },   // DER para enviar como Base64
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, // PEM para usar no Node
      },
      (err, chavePublicaDer, chavePrivadaPem) => {
        if (err) return reject(err);
        _chavePublicaB64 = chavePublicaDer.toString('base64');
        _chavePrivada = chavePrivadaPem;
        console.log('[RSA] Par de chaves RSA-2048 gerado com sucesso.');
        resolve();
      }
    );
  });
}

/** Retorna a chave pública em Base64 para enviar no handshake */
function getChavePublica() {
  return _chavePublicaB64;
}

/**
 * Descriptografa a resposta da API Lutadores I2.
 * A resposta chega como um array de strings Base64 (cada uma é um "chunk" RSA).
 * Juntamos todos os bytes descriptografados e fazemos JSON.parse.
 */
function descriptografarChunks(chunks) {
  const bytes = [];

  for (const chunk of chunks) {
    const buffer = Buffer.from(chunk, 'base64');
    const decriptado = crypto.privateDecrypt(
      { key: _chavePrivada, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      buffer
    );
    bytes.push(...decriptado);
  }

  return Buffer.from(bytes).toString('utf8');
}

/**
 * Armazena a chave pública da API Apostas I2 para criptografar os dados enviados.
 */
function setChaveApostas2(pemOuString) {
  _apostas2ChavePublica = pemOuString;
}

/** Retorna true se a chave da Apostas I2 já foi carregada */
function temChaveApostas2() {
  return !!_apostas2ChavePublica;
}

/**
 * Criptografa dados com RSA+AES para enviar à API Apostas I2.
 *
 * Passo a passo:
 *   1. Gera uma chave AES aleatória de 256 bits
 *   2. Criptografa os dados com AES-256-CBC (rápido para dados grandes)
 *   3. Criptografa a chave AES com RSA (seguro para chaves pequenas)
 *   4. Retorna { encryptedKey, iv, encryptedData } que a API espera
 */
function criptografarParaApostas2(dados) {
  if (!_apostas2ChavePublica) {
    throw new Error('[RSA] Chave pública da API Apostas I2 não foi carregada ainda.');
  }

  // Gera chave AES e vetor de inicialização aleatórios
  const chaveAES = crypto.randomBytes(32); // 256 bits
  const iv = crypto.randomBytes(16);       // 128 bits

  // Criptografa os dados com AES
  const cipher = crypto.createCipheriv('aes-256-cbc', chaveAES, iv);
  const dadosStr = typeof dados === 'string' ? dados : JSON.stringify(dados);
  let dadosCriptografados = cipher.update(dadosStr, 'utf8', 'base64');
  dadosCriptografados += cipher.final('base64');

  // Criptografa a chave AES com RSA
  const chaveCriptografada = crypto
    .publicEncrypt(
      { key: _apostas2ChavePublica, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      chaveAES
    )
    .toString('base64');

  return {
    encryptedKey: chaveCriptografada,
    iv: iv.toString('base64'),
    encryptedData: dadosCriptografados,
  };
}

module.exports = {
  inicializar,
  getChavePublica,
  descriptografarChunks,
  setChaveApostas2,
  temChaveApostas2,
  criptografarParaApostas2,
};
