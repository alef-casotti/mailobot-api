# Mailobot - Motor de Descoberta de Leads

Infraestrutura de coleta e automação de dados para descobrir leads qualificados para campanhas B2B (negócios locais) e B2C (intenção de compra).

---

## Guia Completo: Rodar o Projeto Localmente

Este guia cobre tudo o que você precisa instalar, configurar e executar para rodar o Mailobot no seu ambiente local.

---

## 1. Requisitos do Sistema

| Requisito | Versão | Descrição |
|-----------|--------|-----------|
| Node.js | 18+ | Runtime JavaScript |
| PostgreSQL | 14+ | Banco de dados |
| Redis | 6+ | Fila de jobs e cache |
| PM2 | — | Opcional, para produção |

---

## 2. Instalar Dependências do Sistema

### Windows (Laragon / Chocolatey / Manual)

**Node.js:**
- Se usar **Laragon**: Node.js já vem incluído. Verifique com `node -v`.
- Ou baixe em: https://nodejs.org/ (versão LTS 20+)

**PostgreSQL:**
- Baixe em: https://www.postgresql.org/download/windows/
- Ou via Chocolatey: `choco install postgresql`
- Durante a instalação, anote a senha do usuário `postgres`.

**Redis:**
- Baixe em: https://github.com/microsoftarchive/redis/releases
- Ou via Chocolatey: `choco install redis-64`
- Ou use WSL2 com Redis instalado no Linux.

**Alternativa com Docker (Windows):**
```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mailobot postgres:16
docker run -d -p 6379:6379 redis:7-alpine
```

### Linux (Ubuntu/Debian)

Guia detalhado em **[docs/INSTALACAO-UBUNTU-24.04.md](docs/INSTALACAO-UBUNTU-24.04.md)**. Resumo:

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Redis
sudo apt install -y redis-server

# Dependências do Playwright (Chromium)
sudo npx playwright install-deps chromium
```

### macOS

```bash
# Node.js (via Homebrew)
brew install node@20

# PostgreSQL
brew install postgresql@16
brew services start postgresql@16

# Redis
brew install redis
brew services start redis
```

---

## 3. Criar Banco de Dados (PostgreSQL)

### Windows (pgAdmin ou psql)

```sql
CREATE USER mailobot WITH PASSWORD 'sua_senha_segura';
CREATE DATABASE mailobot OWNER mailobot;
GRANT ALL PRIVILEGES ON DATABASE mailobot TO mailobot;
```

### Linux/macOS (terminal)

```bash
sudo -u postgres psql
```

Depois execute os comandos SQL acima.

---

## 4. Clonar e Instalar o Projeto

```bash
# Clonar (se ainda não tiver)
git clone <url-do-repositorio> mailobot-api
cd mailobot-api

# Instalar dependências npm
npm install

# Instalar Chromium para o Playwright
npx playwright install chromium
```

---

## 5. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
# Linux/macOS:
cp .env.example .env
# Windows (PowerShell):
Copy-Item .env.example .env

# Editar .env (use seu editor preferido)
```

Configure o arquivo `.env`:

```env
# Database - use as credenciais criadas no passo 3
DATABASE_URL=postgresql://mailobot:sua_senha_segura@localhost:5432/mailobot

# Redis
REDIS_URL=redis://localhost:6379

# API
PORT=3000
API_KEY=gere-uma-chave-secreta-forte

# Scraper (opcional)
PLAYWRIGHT_HEADLESS=true
SCRAPER_DELAY_MS=2000
SCRAPER_TIMEOUT_MS=30000
```

> **Dica:** Gere uma API key segura: `openssl rand -hex 32` (Linux/mac) ou use um gerador online.

---

## 6. Executar Migrations

```bash
npm run migrate
```

Deve aparecer mensagem de sucesso. As tabelas `campaigns` e `leads` serão criadas.

---

## 7. Rodar o Projeto Localmente

O Mailobot precisa de **3 processos** rodando ao mesmo tempo:

### Terminal 1 — API (servidor HTTP)

```bash
npm run server
```

A API ficará disponível em `http://localhost:3000`.

### Terminal 2 — Scheduler (verifica campanhas a cada 10 min)

```bash
npm run scheduler
```

### Terminal 3 — Workers (processa jobs da fila)

```bash
npm run worker
```

Ou workers individuais:
```bash
npm run worker:maps      # Google Maps + Instagram
npm run worker:instagram # Hashtags
npm run worker:intent    # Intenção de compra
```

---

## 8. Verificar se Está Funcionando

```bash
# Health check
curl http://localhost:3000/health

# Listar campanhas (use sua API_KEY do .env)
curl -H "X-Api-Key: sua_api_key" http://localhost:3000/campaigns
```

---

## 9. Produção com PM2 (opcional)

```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 status
pm2 logs
```

---

## Resumo Rápido (Checklist)

- [ ] Node.js 18+ instalado
- [ ] PostgreSQL instalado e banco `mailobot` criado
- [ ] Redis instalado e rodando
- [ ] `npm install` e `npx playwright install chromium`
- [ ] `.env` configurado (copiado de `.env.example`)
- [ ] `npm run migrate` executado
- [ ] 3 terminais: `npm run server`, `npm run scheduler`, `npm run worker`

---

## Documentação Adicional

| Documento | Descrição |
|-----------|-----------|
| [docs/INSTALACAO-UBUNTU-24.04.md](docs/INSTALACAO-UBUNTU-24.04.md) | Instalação detalhada no Ubuntu 24.04 |
| [docs/API.md](docs/API.md) | Documentação completa da API |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Deploy automático e CI/CD |

---

## Documentação da API

Guia completo com exemplos, melhores práticas e dicas para obter os melhores leads:

**[docs/API.md](docs/API.md)** — Documentação completa da API

### Resumo

**Autenticação:** Header `X-Api-Key` ou query `api_key` com o valor configurado em `API_KEY`.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /campaigns | Criar campanha |
| GET | /campaigns | Listar campanhas (filtros: user_id, status, tipo) |
| GET | /campaigns/:id | Detalhes da campanha |
| PATCH | /campaigns/:id | Atualizar campanha |
| GET | /campaigns/:id/leads | Listar leads da campanha |

### Tipos de campanha

- `NEGOCIO_LOCAL` — Google Maps + Instagram (B2B)
- `DESCOBERTA_NO_INSTAGRAM` — Busca por hashtags
- `INTENCAO_DE_COMPRA` — Usuários engajados em publicações
- `EMPRESAS_LINKEDIN` — Empresas no LinkedIn (nome, indústria, funcionários, site, descrição)

## Estrutura do Projeto

```
mailobot/
├── api/
│   └── campaign-api.js
├── scheduler/
│   └── campaign-runner.js
├── workers/
│   ├── maps-worker.js
│   ├── instagram-worker.js
│   ├── intent-worker.js
│   ├── linkedin-worker.js
│   └── index.js
├── scrapers/
│   ├── maps-scraper.js
│   ├── instagram-scraper.js
│   ├── intent-scraper.js
│   └── linkedin-scraper.js
├── queue/
│   └── redis.js
├── database/
│   ├── db.js
│   ├── campaigns-repository.js
│   ├── leads-repository.js
│   ├── migrate.js
│   └── migrations/
├── utils/
│   ├── helpers.js
│   └── logger.js
├── config/
│   ├── openclaw.json
│   └── OPENCLAW-SECURITY.md
├── server.js
├── ecosystem.config.js
└── package.json
```

## Fluxo

1. Usuário cria campanha via API
2. Scheduler roda a cada 10 minutos e verifica campanhas ativas
3. Para cada campanha com déficit de leads, adiciona job na fila Redis
4. Workers consomem jobs e executam scrapers
5. Leads são salvos no banco (com desduplicação por telefone/instagram/email/linkedin_url)

## Segurança OpenClaw

Se usar OpenClaw com este projeto, há uma config restritiva em `config/openclaw.json`:

```bash
OPENCLAW_CONFIG_PATH=./config/openclaw.json openclaw gateway
```

Medidas: exec negado, workspace read-only, apenas ferramentas essenciais. Ver `config/OPENCLAW-SECURITY.md`.

## Pontos de Atenção

- **Instagram/Google Maps**: Podem bloquear scraping. Use delays, proxies e headless realista conforme necessário.
- **Rate limiting**: Respeite limites das plataformas.
- **Logs**: Use `LOG_LEVEL=debug` para mais detalhes.
