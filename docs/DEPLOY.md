# Deploy Automático - GitHub Actions

Este documento descreve como configurar o deploy automático do Mailobot via GitHub Actions.

## Fluxo

1. **Push para `main`** → Deploy automático é disparado
2. **Manual** → Em Actions → Deploy → "Run workflow"

O workflow conecta via SSH ao servidor, faz pull do código, instala dependências, executa migrations e reinicia os processos PM2.

## Pré-requisitos no Servidor

- Ubuntu 24.04 (ou similar) com Node.js 20+, PostgreSQL, Redis
- Projeto clonado e configurado (ver [INSTALACAO-UBUNTU-24.04.md](INSTALACAO-UBUNTU-24.04.md))
- PM2 instalado e configurado
- Chave SSH para o usuário de deploy (sem senha recomendado)

## Configurar Secrets no GitHub

No repositório: **Settings → Secrets and variables → Actions** → New repository secret.

| Secret | Obrigatório | Descrição |
|--------|-------------|-----------|
| `DEPLOY_HOST` | Sim | IP ou hostname do servidor (ex: `192.168.1.10` ou `mailobot.seudominio.com`) |
| `DEPLOY_USER` | Sim | Usuário SSH (ex: `deploy` ou `ubuntu`) |
| `DEPLOY_SSH_KEY` | Sim | Chave privada SSH completa (conteúdo de `~/.ssh/id_rsa`) |
| `DEPLOY_PORT` | Não | Porta SSH (padrão: 22) |
| `DEPLOY_PATH` | Não | Caminho do projeto no servidor (padrão: `~/mailobot`) |

### Gerar chave SSH para deploy

No seu computador:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f deploy_key -N ""
```

- Adicione o conteúdo de `deploy_key` como secret `DEPLOY_SSH_KEY`
- No servidor, adicione o conteúdo de `deploy_key.pub` em `~/.ssh/authorized_keys` do usuário de deploy

## Deploy Manual no Servidor

Para fazer deploy manualmente (sem GitHub Actions):

```bash
cd /caminho/para/mailobot
chmod +x scripts/deploy.sh   # apenas na primeira vez
./scripts/deploy.sh main
```

Ou especificando outra branch:

```bash
./scripts/deploy.sh dev
```

## Branches

Por padrão, o deploy automático roda apenas em push para `main`. Para alterar, edite `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches: [main, production]  # adicione outras branches
```

## Solução de Problemas

### Erro de permissão SSH

- Verifique se a chave está correta em `DEPLOY_SSH_KEY`
- Confirme que `authorized_keys` no servidor contém a chave pública

### Erro "command not found: pm2"

- PM2 deve estar instalado globalmente: `npm install -g pm2`
- Ou use o caminho completo: `~/.nvm/versions/node/.../bin/pm2`

### Migrations falham

- Verifique `DATABASE_URL` no `.env` do servidor
- Execute manualmente: `npm run migrate` e confira os logs
