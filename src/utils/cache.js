/**
 * cache.js
 *
 * Cache simples em memória usando um Map do JavaScript.
 * Evita chamar as APIs externas toda vez que o frontend faz uma requisição.
 *
 */

// Guarda os dados: { chave → { dado, expiraEm } }
const _cache = new Map();

// Tempo de vida padrão: 60 segundos (configurável no .env)
const TTL_MS = (parseInt(process.env.CACHE_TTL, 10) || 60) * 1000;

/** Salva um dado no cache com tempo de expiração */
function set(chave, dado, ttlMs = TTL_MS) {
  _cache.set(chave, { dado, expiraEm: Date.now() + ttlMs });
}

/** Retorna o dado se ainda estiver válido, ou null se expirado */
function get(chave) {
  const entrada = _cache.get(chave);
  if (!entrada) return null;

  if (Date.now() > entrada.expiraEm) {
    _cache.delete(chave); // Remove entradas expiradas
    return null;
  }

  return entrada.dado;
}

/** Remove entradas que começam com um prefixo (ex: 'lutas:' ao criar uma luta) */
function invalidar(prefixo) {
  for (const chave of _cache.keys()) {
    if (chave.startsWith(prefixo)) _cache.delete(chave);
  }
}

module.exports = { set, get, invalidar };
