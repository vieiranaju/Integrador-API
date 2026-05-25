require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const rsa              = require('./utils/rsaHelper');
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

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    nome: 'API Integradora — Fight Betting System',
    versao: '1.0.0',
    rotas: ['/auth/login', '/lutas', '/lutadores', '/apostas', '/apostadores'],
    instrucao: 'Faça login em POST /auth/login para obter o token.',
  });
});

app.use('/auth',        rotaAuth);
app.use('/lutas',       verificarToken, rotaLutas);
app.use('/lutadores',   verificarToken, rotaLutadores);
app.use('/apostas',     verificarToken, rotaApostas);
app.use('/apostadores', verificarToken, rotaApostadores);

app.use(errorHandler);

async function iniciar() {
  await rsa.inicializar();
  await lutadoresService.inicializarHandshake();
  await apostasService.inicializarApostas2();

  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

iniciar().catch(err => {
  console.error('Erro ao iniciar:', err);
  process.exit(1);
});
