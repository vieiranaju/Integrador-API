/**
 * middleware/auth.js
 *
 * Verifica o token JWT antes de processar qualquer rota protegida.
 * Se o token for válido, disponibiliza os dados do usuário em req.usuario.
 *
 * Conceito de SD: Autenticação centralizada — o integrador valida uma única vez
 * e repassa internamente para as APIs externas.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_padrao';

function verificarToken(req, res, next) {
  // O token deve vir no header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      erro: 'Token não fornecido. Use: Authorization: Bearer <seu_token>',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify lança exceção se o token for inválido ou expirado
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload; // { sub: "admin", sessionId: "uuid", iat, exp }
    next(); // Continua para a rota
  } catch (err) {
    const mensagem =
      err.name === 'TokenExpiredError'
        ? 'Token expirado. Faça login novamente.'
        : 'Token inválido.';
    return res.status(401).json({ erro: mensagem });
  }
}

module.exports = verificarToken;
