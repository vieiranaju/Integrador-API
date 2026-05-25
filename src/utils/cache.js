const _cache = new Map();

const TTL_MS = (parseInt(process.env.CACHE_TTL, 10) || 60) * 1000;

function set(chave, dado, ttlMs = TTL_MS) {
  _cache.set(chave, { dado, expiraEm: Date.now() + ttlMs });
}

function get(chave) {
  const entrada = _cache.get(chave);
  if (!entrada) return null;
  if (Date.now() > entrada.expiraEm) {
    _cache.delete(chave);
    return null;
  }
  return entrada.dado;
}

function invalidar(prefixo) {
  for (const chave of _cache.keys()) {
    if (chave.startsWith(prefixo)) _cache.delete(chave);
  }
}

module.exports = { set, get, invalidar };
