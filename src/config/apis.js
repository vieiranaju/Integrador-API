/**
 * config/apis.js
 *
 * Configuração centralizada de todas as APIs externas.
 * Cada domínio tem duas instâncias (I1 e I2) rodando em servidores diferentes.
 *
 */
require('dotenv').config();

module.exports = {

  lutas: {
    instancia1: {
      // Spring Boot / Java — Railway
      // Autenticação: API Key fixa no header (simples e eficaz para M2M)
      baseUrl: process.env.LUTAS1_BASE_URL || 'https://bet3m-production.up.railway.app',
      apiKey:  process.env.LUTAS1_API_KEY  || 'bet3M-UENP',
    },
    instancia2: {
      // FastAPI / Python — URL configurável via .env
      // Autenticação: JWT Bearer (credenciais informadas no login do frontend)
      baseUrl: process.env.LUTAS2_BASE_URL || '',
    },
  },

  lutadores: {
    instancia1: {
      // Spring Boot / Java — Render
      // Autenticação: nenhuma (API pública)
      baseUrl: process.env.LUTADORES1_BASE_URL || 'https://api-lutadoressd.onrender.com',
    },
    instancia2: {
      // Java puro — Heroku
      // Autenticação: handshake RSA-OAEP (feito automaticamente no startup)
      baseUrl: process.env.LUTADORES2_BASE_URL || 'https://lutadores-api-22f61a69f511.herokuapp.com',
    },
  },

  apostas: {
    instancia1: {
      // Node.js / Express — Vercel
      // Autenticação: JWT RS256 (credenciais informadas no login do frontend)
      baseUrl: process.env.APOSTAS1_BASE_URL || 'https://api-aposta-lutas.vercel.app',
    },
    instancia2: {
      // Node.js / Express — IP fixo
      // Autenticação: RSA + AES-256-CBC híbrido (criptografia automática pelo integrador)
      baseUrl: process.env.APOSTAS2_BASE_URL || 'http://187.77.235.119:5555',
    },
  },

  apostadores: {
    instancia1: {
      // Node.js / TypeScript — Vercel
      // Autenticação: JWT HS256 (credenciais informadas no login do frontend)
      baseUrl: process.env.APOSTADORES1_BASE_URL || 'https://api-apostadores-fight-azure.vercel.app',
    },
    instancia2: {
      // FastAPI / Python — Render
      // Autenticação: nenhuma (API pública, PIX criptografado no banco)
      baseUrl: process.env.APOSTADORES2_BASE_URL || 'https://api-sd-df8o.onrender.com',
    },
  },

};
