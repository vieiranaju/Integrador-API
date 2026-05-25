/**
 * middleware/auth.js — Valida o token JWT antes de processar rotas protegidas.
 * Disponibiliza os dados do usuário em req.usuario se o token for válido.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_padrao';

function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      erro: 'Token não fornecido. Use: Authorization: Bearer <seu_token>',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    const mensagem =
      err.name === 'TokenExpiredError'
        ? 'Token expirado. Faça login novamente.'
        : 'Token inválido.';
    return res.status(401).json({ erro: mensagem });
  }
}

module.exports = verificarToken;
