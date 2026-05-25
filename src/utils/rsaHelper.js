/**
 * rsaHelper.js — Criptografia assimétrica usada pelo integrador.
 *
 * RSA-OAEP: descriptografa respostas da API Lutadores I2 (chunks Base64).
 * RSA+AES-256-CBC híbrido: criptografa dados enviados à API Apostas I2.
 * RSA-PSS + SHA256: gera assinaturas M2M para a API Lutas I2.
 */

const crypto = require('crypto');
const fs = require('fs');

let _chavePrivada = null;
let _chavePublicaB64 = null;

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
        publicKeyEncoding: { type: 'spki', format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
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
 *
 * @param {string[]} chunks
 * @returns {string} JSON string descriptografado
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
 * @param {string} pemOuString
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
 * Retorna { encryptedKey, iv, encryptedData }.
 *
 * @param {object|string} dados
 * @returns {{ encryptedKey: string, iv: string, encryptedData: string }}
 */
function criptografarParaApostas2(dados) {
  if (!_apostas2ChavePublica) {
    throw new Error('[RSA] Chave pública da API Apostas I2 não foi carregada ainda.');
  }

  const chaveAES = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-cbc', chaveAES, iv);
  const dadosStr = typeof dados === 'string' ? dados : JSON.stringify(dados);
  let dadosCriptografados = cipher.update(dadosStr, 'utf8', 'base64');
  dadosCriptografados += cipher.final('base64');

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

let _lutas2ChavePrivada = null;

function carregarChavePrivadaLutas2() {
  if (_lutas2ChavePrivada) return _lutas2ChavePrivada;

  // Aceita PRIVATE_KEY_LUTAS2 (nome interno) ou PRIVATE_KEY_PEM (nome da documentação/Railway)
  const rawKey = process.env.PRIVATE_KEY_LUTAS2 || process.env.PRIVATE_KEY_PEM;

  if (rawKey) {
    _lutas2ChavePrivada = rawKey.replace(/\\n/g, '\n');
  } else {
    try {
      _lutas2ChavePrivada = fs.readFileSync('lutas2_private_key.pem', 'utf8');
    } catch (e) {
      console.warn('[RSA] Chave privada não encontrada! Configure PRIVATE_KEY_LUTAS2 ou PRIVATE_KEY_PEM no Railway.');
    }
  }
  return _lutas2ChavePrivada;
}

/**
 * Gera assinatura RSA-PSS para autenticação M2M na API Lutas I2.
 *
 * @param {string} nomeIntegrador
 * @param {string} rota
 * @returns {string} Assinatura em Base64
 */
function gerarAssinaturaLutas2(nomeIntegrador, rota) {
  const privateKey = carregarChavePrivadaLutas2();
  if (!privateKey) throw new Error('Chave privada da Lutas I2 não configurada.');

  const mensagem = `${nomeIntegrador}:${rota}`;
  const assinatura = crypto.sign('sha256', Buffer.from(mensagem), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
  });

  return assinatura.toString('base64');
}

module.exports = {
  inicializar,
  getChavePublica,
  descriptografarChunks,
  setChaveApostas2,
  temChaveApostas2,
  criptografarParaApostas2,
  gerarAssinaturaLutas2,
};
