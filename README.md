# Mailobot - Motor de Descoberta de Leads

Infraestrutura de coleta e automação de dados para descobrir leads qualificados para campanhas B2B (negócios locais) e B2C (intenção de compra).

## Requisitos

- Node.js 18+
- PostgreSQL
- Redis
- PM2 (opcional, para produção)

> **Ubuntu 24.04:** Guia completo de instalação em [docs/INSTALACAO-UBUNTU-24.04.md](docs/INSTALACAO-UBUNTU-24.04.md)

## Instalação

```bash
npm install
npx playwright install chromium
```

## Configuração

Copie `.env.example` para `.env` e configure:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/mailobot
REDIS_URL=redis://localhost:6379
PORT=3000
API_KEY=your-secret-api-key
PLAYWRIGHT_HEADLESS=true
SCRAPER_DELAY_MS=2000
SCRAPER_TIMEOUT_MS=30000
```

## Migrations

```bash
npm run migrate
```

## Execução

### Desenvolvimento (processos separados)

```bash
# Terminal 1 - API
npm run server

# Terminal 2 - Scheduler
npm run scheduler

# Terminal 3 - Workers (todos)
npm run worker

# Ou workers individuais:
npm run worker:maps
npm run worker:instagram
npm run worker:intent
```

### Produção com PM2

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs
```

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
│   └── index.js
├── scrapers/
│   ├── maps-scraper.js
│   ├── instagram-scraper.js
│   └── intent-scraper.js
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
5. Leads são salvos no banco (com desduplicação por telefone/instagram/email)

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
