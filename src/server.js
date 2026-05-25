/**
 * server.js — Ponto de entrada da API Integradora.
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const rsa             = require('./utils/rsaHelper');
const lutadoresService = require('./services/lutadoresService');
const apostasService   = require('./services/apostasService');

const verificarToken = require('./middleware/auth');
const errorHandler   = require('./middleware/errorHandler');

const rotaAuth        = require('./routes/auth');
const rotaLutas       = require('./routes/lutas');
const rotaLutadores   = require('./routes/lutadores');
const rotaApostas     = require('./routes/apostas');
const rotaApostadores = require('./routes/apostadores');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    nome: 'API Integradora — Fight Betting System',
    versao: '1.0.0',
    status: 'online',
    rotas: ['/auth/login', '/lutas', '/lutadores', '/apostas', '/apostadores'],
    instrucao: 'Faça login em POST /auth/login para obter o token.',
  });
});

app.use('/auth', rotaAuth);

app.use('/lutas',       verificarToken, rotaLutas);
app.use('/lutadores',   verificarToken, rotaLutadores);
app.use('/apostas',     verificarToken, rotaApostas);
app.use('/apostadores', verificarToken, rotaApostadores);

app.use(errorHandler);

async function iniciar() {
  console.log('\n=== API INTEGRADORA — INICIANDO ===\n');

  console.log('→ Gerando par de chaves RSA-2048...');
  await rsa.inicializar();

  console.log('→ Realizando handshake RSA com Lutadores I2...');
  await lutadoresService.inicializarHandshake();

  console.log('→ Carregando chave RSA da API Apostas I2...');
  await apostasService.inicializarApostas2();

  app.listen(PORT, () => {
    console.log(`\n Servidor rodando em http://localhost:${PORT}`);
    console.log('\nEndpoints disponíveis:');
    console.log(`  POST http://localhost:${PORT}/auth/login   ← faça login aqui primeiro`);
    console.log(`  GET  http://localhost:${PORT}/lutas`);
    console.log(`  GET  http://localhost:${PORT}/lutadores`);
    console.log(`  GET  http://localhost:${PORT}/apostas`);
    console.log(`  GET  http://localhost:${PORT}/apostadores`);
    console.log('\nTodas as rotas (exceto /auth/login) exigem: Authorization: Bearer <token>\n');
  });
}

iniciar().catch(err => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
