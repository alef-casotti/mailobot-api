# Instalação do Mailobot no Ubuntu 24.04

Guia completo para instalar e configurar o Mailobot (Motor de Descoberta de Leads) no Ubuntu 24.04 LTS.

## Requisitos do Sistema

- Ubuntu 24.04 LTS
- Acesso sudo
- Conexão com a internet

## 1. Atualizar o Sistema

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Instalar Node.js 18+

### Opção A: Via NodeSource (recomendado)

```bash
# Instalar curl se não tiver
sudo apt install -y curl

# Adicionar repositório NodeSource para Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js
sudo apt install -y nodejs

# Verificar instalação
node -v   # deve mostrar v20.x.x
npm -v
```

### Opção B: Via nvm (Node Version Manager)

```bash
# Instalar nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc

# Instalar Node.js 20
nvm install 20
nvm use 20

# Verificar
node -v
npm -v
```

## 3. Instalar PostgreSQL

```bash
# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Iniciar e habilitar o serviço
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verificar status
sudo systemctl status postgresql
```

### Configurar banco de dados

```bash
# Trocar para o usuário postgres
sudo -u postgres psql

# No prompt do PostgreSQL, execute:
CREATE USER mailobot WITH PASSWORD 'sua_senha_segura';
CREATE DATABASE mailobot OWNER mailobot;
GRANT ALL PRIVILEGES ON DATABASE mailobot TO mailobot;
\q
```

> **Nota:** Substitua `sua_senha_segura` por uma senha forte. Anote para usar no `.env`.

## 4. Instalar Redis

```bash
# Instalar Redis
sudo apt install -y redis-server

# Iniciar e habilitar o serviço
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verificar se está rodando
redis-cli ping
# Deve retornar: PONG
```

## 5. Dependências do Playwright (Chromium)

O Playwright precisa de bibliotecas do sistema para rodar o Chromium em modo headless:

```bash
# Instalar dependências necessárias para o Chromium
sudo apt install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libatspi2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2
```

> **Alternativa:** Após instalar o projeto, execute `sudo npx playwright install-deps chromium` para instalar automaticamente as dependências detectadas.

## 6. Clonar ou Baixar o Projeto

```bash
# Se usar Git
git clone <url-do-repositorio> mailobot
cd mailobot

# Ou navegue até a pasta do projeto se já tiver os arquivos
cd /caminho/para/mailobot
```

## 7. Instalar Dependências do Projeto

```bash
# Instalar pacotes npm
npm install

# Instalar navegador Chromium para o Playwright
npx playwright install chromium
```

## 8. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar o arquivo .env
nano .env
```

Configure as variáveis conforme seu ambiente:

```env
# Database - use as credenciais criadas no passo 3
DATABASE_URL=postgresql://mailobot:sua_senha_segura@localhost:5432/mailobot

# Redis
REDIS_URL=redis://localhost:6379

# API
PORT=3000
API_KEY=gere-uma-chave-secreta-forte-aqui

# Scraper (opcional)
PLAYWRIGHT_HEADLESS=true
SCRAPER_DELAY_MS=2000
SCRAPER_TIMEOUT_MS=30000
```

> **Dica:** Gere uma API key segura com: `openssl rand -hex 32`

## 9. Executar Migrations

```bash
npm run migrate
```

Você deve ver a saída indicando que as migrations foram executadas com sucesso.

## 10. Testar a Instalação

### Modo desenvolvimento (3 terminais)

**Terminal 1 - API:**
```bash
npm run server
```

**Terminal 2 - Scheduler:**
```bash
npm run scheduler
```

**Terminal 3 - Workers:**
```bash
npm run worker
```

### Verificar se está funcionando

```bash
# Testar API (em outro terminal)
curl -H "X-Api-Key: sua_api_key" http://localhost:3000/campaigns
```

## 11. Produção com PM2 (opcional)

Para rodar em produção com reinício automático:

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar todos os processos
pm2 start ecosystem.config.js

# Ver status
pm2 status

# Ver logs
pm2 logs

# Configurar para iniciar no boot
pm2 startup
pm2 save
```

## Resumo dos Serviços

| Serviço      | Porta | Comando de verificação        |
|-------------|-------|-------------------------------|
| PostgreSQL  | 5432  | `sudo systemctl status postgresql` |
| Redis       | 6379  | `redis-cli ping`              |
| API Mailobot| 3000  | `curl http://localhost:3000/campaigns` |

## Solução de Problemas

### Erro de conexão com PostgreSQL

- Verifique se o PostgreSQL está rodando: `sudo systemctl status postgresql`
- Confirme usuário, senha e nome do banco no `DATABASE_URL`
- Se usar autenticação `peer`, considere alterar para `md5` em `pg_hba.conf`

### Erro de conexão com Redis

- Verifique: `redis-cli ping`
- Inicie o Redis: `sudo systemctl start redis-server`

### Playwright/Chromium não inicia

- Instale as dependências: `sudo npx playwright install-deps chromium`
- Em servidores sem interface gráfica, use `PLAYWRIGHT_HEADLESS=true` (já é o padrão)

### Porta 3000 em uso

- Altere a variável `PORT` no `.env` para outra porta (ex: 3001)

## Próximos Passos

- Consulte o [README principal](../README.md) para documentação da API e fluxo do sistema
- Configure firewall se expor a API externamente: `sudo ufw allow 3000`
- Para produção, considere usar um proxy reverso (nginx) e HTTPS
