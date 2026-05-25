/**
 * server.js — Ponto de entrada da API Integradora
 *
 * Este arquivo:
 *   1. Carrega as variáveis de ambiente (.env)
 *   2. Prepara as criptografias necessárias (RSA)
 *   3. Registra todas as rotas
 *   4. Inicia o servidor na porta configurada
 *
 * múltiplos microserviços distribuídos de forma transparente para o cliente.
 *
 * Fluxo de uma requisição:
 *   Frontend → /lutas → verificarToken → lutasService → API Lutas (I1 + I2) → resposta unificada
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

// Utilitários
const rsa             = require('./utils/rsaHelper');
const lutadoresService = require('./services/lutadoresService');
const apostasService   = require('./services/apostasService');

// Middleware
const verificarToken = require('./middleware/auth');
const errorHandler   = require('./middleware/errorHandler');

// Rotas
const rotaAuth        = require('./routes/auth');
const rotaLutas       = require('./routes/lutas');
const rotaLutadores   = require('./routes/lutadores');
const rotaApostas     = require('./routes/apostas');
const rotaApostadores = require('./routes/apostadores');

const app  = express();
const PORT = process.env.PORT || 4000;



// Permite que o frontend acesse a API (Cross-Origin Resource Sharing)
app.use(cors({
  origin: '*', // Em produção, substitua '*' pela URL do seu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json()); // Interpreta o body das requisições como JSON



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


// O middleware verificarToken valida o token antes de qualquer rota abaixo

app.use('/lutas',       verificarToken, rotaLutas);
app.use('/lutadores',   verificarToken, rotaLutadores);
app.use('/apostas',     verificarToken, rotaApostas);
app.use('/apostadores', verificarToken, rotaApostadores);



app.use(errorHandler);



async function iniciar() {
  console.log('\n=== API INTEGRADORA — INICIANDO ===\n');

  // Passo 1: Gera o par de chaves RSA do integrador
  // Necessário para descriptografar respostas da API Lutadores I2
  console.log('→ Gerando par de chaves RSA-2048...');
  await rsa.inicializar();

  // Passo 2: Handshake RSA com API Lutadores I2
  // Registra nossa chave pública no servidor para ele criptografar as respostas para nós
  console.log('→ Realizando handshake RSA com Lutadores I2...');
  await lutadoresService.inicializarHandshake();

  // Passo 3: Carrega a chave pública da API Apostas I2
  // Necessário para criptografar os dados que enviamos a ela
  console.log('→ Carregando chave RSA da API Apostas I2...');
  await apostasService.inicializarApostas2();

  // Passo 4: Inicia o servidor
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
