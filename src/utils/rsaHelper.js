const crypto = require('crypto');
const fs = require('fs');

let _chavePrivada    = null;
let _chavePublicaB64 = null;
let _chaveApostas2   = null;
let _chavePrivadaLutas2 = null;

async function inicializar() {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        publicKeyEncoding:  { type: 'spki',  format: 'der' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      },
      (err, chavePublicaDer, chavePrivadaPem) => {
        if (err) return reject(err);
        _chavePublicaB64 = chavePublicaDer.toString('base64');
        _chavePrivada    = chavePrivadaPem;
        resolve();
      }
    );
  });
}

function getChavePublica() {
  return _chavePublicaB64;
}

function descriptografarChunks(chunks) {
  const bytes = [];
  for (const chunk of chunks) {
    const decriptado = crypto.privateDecrypt(
      { key: _chavePrivada, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(chunk, 'base64')
    );
    bytes.push(...decriptado);
  }
  return Buffer.from(bytes).toString('utf8');
}

function setChaveApostas2(chave) {
  _chaveApostas2 = chave;
}

function temChaveApostas2() {
  return !!_chaveApostas2;
}

function criptografarParaApostas2(dados) {
  if (!_chaveApostas2) throw new Error('Chave pública da Apostas I2 não carregada.');

  const chaveAES = crypto.randomBytes(32);
  const iv       = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-cbc', chaveAES, iv);
  const dadosStr = typeof dados === 'string' ? dados : JSON.stringify(dados);
  const dadosCriptografados = cipher.update(dadosStr, 'utf8', 'base64') + cipher.final('base64');

  const chaveCriptografada = crypto
    .publicEncrypt(
      { key: _chaveApostas2, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      chaveAES
    )
    .toString('base64');

  return {
    encryptedKey:  chaveCriptografada,
    iv:            iv.toString('base64'),
    encryptedData: dadosCriptografados,
  };
}

function gerarAssinaturaLutas2(nomeIntegrador, rota) {
  if (!_chavePrivadaLutas2) {
    const rawKey = process.env.PRIVATE_KEY_LUTAS2 || process.env.PRIVATE_KEY_PEM;
    if (rawKey) {
      _chavePrivadaLutas2 = rawKey.replace(/\\n/g, '\n');
    } else {
      try {
        _chavePrivadaLutas2 = fs.readFileSync('private_key.pem', 'utf8');
      } catch (e) {
        throw new Error('Chave privada da Lutas I2 não encontrada.');
      }
    }
  }

  const mensagem = `${nomeIntegrador}:${rota}`;
  return crypto
    .sign('sha256', Buffer.from(mensagem), {
      key: _chavePrivadaLutas2,
      padding:    crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
    })
    .toString('base64');
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
