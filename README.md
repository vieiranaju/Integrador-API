# API Integradora — Fight Betting System

API Gateway centralizada para o sistema distribuído de apostas em lutas da UENP.
Agrega **4 domínios** com **2 instâncias cada**, totalizando 8 microserviços externos.

---

## Como Rodar

```bash
# 1. Instale as dependências
npm install

# 2. Copie e configure o .env
copy .env.example .env

# 3. Inicie em modo de desenvolvimento
npm run dev
```

API disponível em: `http://localhost:4000`

---

## Fluxo de Autenticação

### 1. Login no Integrador

```http
POST /auth/login
Content-Type: application/json

{
  "usuario": "admin",
  "senha": "admin123",
  "credenciaisExternas": {
    "apostas1":     { "usuario": "SEU_USUARIO", "senha": "SUA_SENHA" },
    "apostadores1": { "usuario": "SEU_USUARIO", "senha": "SUA_SENHA" },
    "lutas2":       { "usuario": "SEU_USUARIO", "senha": "SUA_SENHA" }
  }
}
```

> **Nota:** `credenciaisExternas` é opcional. Apenas as APIs que precisam de JWT precisam de credenciais.
> A API Lutadores I2 faz handshake RSA automaticamente. A API Apostas I2 não precisa de login.

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tipo": "Bearer",
  "expira_em": "24h",
  "apisAutenticadas": ["apostas1", "apostadores1"]
}
```

### 2. Usar o Token

Inclua em todas as requisições:
```
Authorization: Bearer <seu_token>
```

---

## Endpoints

| Método | Rota                  | Descrição                            |
|--------|-----------------------|--------------------------------------|
| POST   | `/auth/login`         | Login (público)                      |
| POST   | `/auth/logout`        | Logout (remove sessão)               |
| GET    | `/auth/status`        | Status da sessão                     |
| GET    | `/lutas`              | Lista lutas de ambas as instâncias   |
| GET    | `/lutas/:id`          | Busca luta por ID                    |
| POST   | `/lutas`              | Cria luta nas duas instâncias        |
| PUT    | `/lutas/:id`          | Atualiza luta                        |
| DELETE | `/lutas/:id`          | Deleta luta                          |
| GET    | `/lutadores`          | Lista lutadores (I1 + I2 descriptografado) |
| GET    | `/lutadores/:id`      | Busca lutador por ID                 |
| POST   | `/lutadores`          | Cria lutador nas duas instâncias     |
| PUT    | `/lutadores/:id`      | Atualiza lutador                     |
| DELETE | `/lutadores/:id`      | Deleta lutador                       |
| GET    | `/apostas`            | Lista apostas (aceita ?id_apostador) |
| GET    | `/apostas/:id`        | Busca aposta por ID                  |
| POST   | `/apostas`            | Cria aposta (I2 usa RSA+AES automático) |
| PUT    | `/apostas/:id`        | Atualiza aposta                      |
| DELETE | `/apostas/:id`        | Deleta aposta                        |
| GET    | `/apostadores`        | Lista apostadores de ambas instâncias |
| GET    | `/apostadores/:id`    | Busca apostador por ID               |
| POST   | `/apostadores`        | Cria apostador (normaliza camelCase↔snake_case) |
| PUT    | `/apostadores/:id`    | Atualiza apostador                   |
| DELETE | `/apostadores/:id`    | Deleta apostador                     |

### Query Params

- `?instancia=1` ou `?instancia=2` — Direciona GET/:id, PUT e DELETE para instância específica
- `?id_apostador=X` — Filtra apostas por apostador (no GET /apostas)

---

## Arquitetura das APIs Externas

| Domínio      | I1 — Tech          | I1 — Auth            | I2 — Tech          | I2 — Auth / Cripto        |
|--------------|--------------------|----------------------|--------------------|---------------------------|
| **Lutas**    | Spring Boot/Java   | `X-API-KEY`          | FastAPI/Python     | JWT                       |
| **Lutadores**| Spring Boot/Render | Nenhuma              | Java puro/Heroku   | RSA-OAEP bidirecional  |
| **Apostas**  | Node.js/Vercel     | JWT RS256            | Node.js/IP         | RSA-2048 + AES-256-CBC  |
| **Apostadores**| Node.js/Vercel   | JWT HS256            | FastAPI/Render     | Nenhuma (RSA no banco)    |

---

## Como Funciona a Criptografia

### API Lutadores I2 (RSA-OAEP Bidirecional)
1. No startup, o integrador **gera um par de chaves RSA-2048**
2. Busca a **chave pública do servidor** (`GET /chave-publica`)
3. Envia nossa chave pública via **handshake** (`POST /handshake`)
4. As respostas chegam como **array de chunks Base64** → descriptografados automaticamente

### API Apostas I2 (RSA + AES-256-CBC Híbrido)
1. No startup, carrega a **chave pública RSA do servidor** (`GET /crypto/public-key`)
2. Para cada POST: gera **chave AES aleatória**, cifra os dados com AES, cifra a chave AES com RSA
3. Envia `{ encryptedKey, iv, encryptedData }` com header `X-Encrypted: true`

---

## Estrutura do Projeto

```
integrador/
├── src/
│   ├── server.js              # Entry point
│   ├── config/
│   │   └── apis.js            # URLs e configs das APIs externas
│   ├── middleware/
│   │   ├── auth.js            # Validação JWT do integrador
│   │   └── errorHandler.js    # Tratamento de erros
│   ├── services/
│   │   ├── lutasService.js    # API Lutas (X-API-KEY + JWT)
│   │   ├── lutadoresService.js# API Lutadores (RSA-OAEP handshake)
│   │   ├── apostasService.js  # API Apostas (JWT + RSA+AES)
│   │   └── apostadoresService.js # API Apostadores (JWT + sem auth)
│   ├── routes/
│   │   ├── auth.js            # /auth/*
│   │   ├── lutas.js           # /lutas/*
│   │   ├── lutadores.js       # /lutadores/*
│   │   ├── apostas.js         # /apostas/*
│   │   └── apostadores.js     # /apostadores/*
│   └── utils/
│       ├── rsaHelper.js       # RSA-OAEP + AES-256-CBC
│       ├── cache.js           # Cache em memória (node-cache)
│       └── tokenManager.js    # Tokens JWT das APIs externas por sessão
├── .env.example
├── .env
└── package.json
```

---

## Variáveis de Ambiente

| Variável              | Padrão                          | Descrição                          |
|-----------------------|---------------------------------|------------------------------------|
| `PORT`                | `4000`                          | Porta do integrador                |
| `JWT_SECRET`          | (obrigatório)                   | Chave secreta do JWT do integrador |
| `JWT_EXPIRES_IN`      | `24h`                           | Validade do token                  |
| `ADMIN_USUARIO`       | `admin`                         | Usuário padrão                     |
| `ADMIN_SENHA`         | `admin123`                      | Senha padrão (trocar em produção!) |
| `APOSTAS2_BASE_URL`   | `http://187.77.235.119:5555`    | URL da API Apostas I2              |
| `CACHE_TTL`           | `60`                            | TTL do cache de dados (segundos)   |
| `TOKEN_CACHE_TTL`     | `3600`                          | TTL dos tokens externos (segundos) |

---

## Projeto Acadêmico

Disciplina de **Sistemas Distribuídos** — UENP  
API Integradora (Gateway) que centraliza múltiplos microserviços com autenticações e criptografias heterogêneas.
