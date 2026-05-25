const express      = require('express');
const jwt          = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const tokenManager = require('../utils/tokenManager');
const verificarToken = require('../middleware/auth');

const router     = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET   || 'chave_secreta_padrao';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '24h';

router.post('/login', async (req, res, next) => {
  try {
    const { usuario, senha, credenciaisExternas = {} } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe usuario e senha.' });
    }

    const sessionId = uuid();
    const { tokens: autenticadas, erros } = await tokenManager.autenticarAPIsExternas(sessionId, credenciaisExternas);

    const token = jwt.sign({ sub: usuario, sessionId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      mensagem:       'Login realizado com sucesso!',
      token,
      tipo:           'Bearer',
      expira_em:      JWT_EXPIRES,
      apisAutenticadas: autenticadas,
      erros:          Object.keys(erros).length ? erros : undefined,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', verificarToken, (req, res) => {
  tokenManager.removerSessao(req.usuario.sessionId);
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

router.get('/status', verificarToken, (req, res) => {
  res.json({
    usuario:     req.usuario.sub,
    sessaoAtiva: tokenManager.sessaoExiste(req.usuario.sessionId),
  });
});

module.exports = router;
