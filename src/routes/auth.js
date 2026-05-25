/**
 * routes/auth.js
 *
 * Rota de autenticação do integrador.
 *
 * POST /auth/login
 *   1. Valida as credenciais do integrador (usuario + senha)
 *   2. Usa as credenciais externas para logar nas APIs que precisam de JWT
 *   3. Cria uma sessão e gera o token JWT do integrador
 *   4. Retorna o token para o frontend usar em todas as requisições
 *
 * POST /auth/logout
 *   Remove a sessão do servidor
 *
 * GET /auth/status
 *   Verifica se o token ainda está válido
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const tokenManager = require('../utils/tokenManager');
const verificarToken = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET   = process.env.JWT_SECRET   || 'chave_secreta_padrao';
const JWT_EXPIRES  = process.env.JWT_EXPIRES_IN || '24h';

// ─── POST /auth/login ────────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const { usuario, senha, credenciaisExternas = {} } = req.body;

    // Validação básica
    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe usuario e senha.' });
    }

    // Cria uma sessão única para este usuário
    const sessionId = uuid();

    // Faz login nas APIs externas com as credenciais fornecidas pelo frontend
    const { tokens: autenticadas, erros } = await tokenManager.autenticarAPIsExternas(
      sessionId,
      credenciaisExternas
    );

    // Gera o token JWT do integrador (inclui o sessionId para identificar a sessão)
    const token = jwt.sign(
      { sub: usuario, sessionId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      tipo: 'Bearer',
      expira_em: JWT_EXPIRES,
      apisAutenticadas: autenticadas,             // Lista de APIs externas que autenticaram
      erros: Object.keys(erros).length ? erros : undefined, // Erros de APIs externas (se houver)
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ───────────────────────────────────────────────────────

router.post('/logout', verificarToken, (req, res) => {
  tokenManager.removerSessao(req.usuario.sessionId);
  res.json({ mensagem: 'Logout realizado com sucesso.' });
});

// ─── GET /auth/status ────────────────────────────────────────────────────────

router.get('/status', verificarToken, (req, res) => {
  res.json({
    usuario: req.usuario.sub,
    sessaoAtiva: tokenManager.sessaoExiste(req.usuario.sessionId),
  });
});

module.exports = router;
