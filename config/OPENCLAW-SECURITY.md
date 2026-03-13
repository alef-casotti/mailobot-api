# Configuração de Segurança OpenClaw

Este projeto inclui uma configuração restritiva do OpenClaw para uso seguro com assistência de IA.

## Uso

```bash
export OPENCLAW_CONFIG_PATH=./config/openclaw.json
openclaw gateway
```

No Windows (PowerShell):

```powershell
$env:OPENCLAW_CONFIG_PATH = ".\config\openclaw.json"
openclaw gateway
```

## Medidas Implementadas

| Medida | Configuração |
|--------|--------------|
| **Permissões por ferramenta** | `tools.allow` apenas: read, web_search, web_fetch, sessions_list, session_status |
| **Exec security** | `tools.exec.security: "deny"` — nenhum comando shell |
| **Elevated desativado** | `tools.elevated.enabled: false` |
| **Workspace read-only** | `sandbox.workspaceAccess: "ro"` — impede escrita no projeto |
| **Caminhos sensíveis** | Sandbox não monta ~/.ssh, ~/.aws, ~/.config, ~/.gnupg, ~/.kube, /etc |

## Ferramentas Permitidas

- **read** — Leitura de arquivos do projeto
- **web_search** — Pesquisa na web (requer API key)
- **web_fetch** — Busca de conteúdo de URLs
- **sessions_list** / **session_status** — Listagem de sessões

## Ferramentas Bloqueadas

- write, edit, apply_patch — Escrita/edição de arquivos
- exec, bash, process — Execução de comandos
- gateway — Reinício do gateway
- group:nodes — Acesso a dispositivos
- group:memory — Memória persistente

## Permitir Edição de Código

Para desenvolvimento com edição habilitada, altere em `config/openclaw.json`:

1. `workspaceAccess`: `"ro"` → `"rw"`
2. Em `tools.allow`, adicione: `"write"`, `"edit"`, `"apply_patch"`
3. Remova `write`, `edit`, `"apply_patch"` de `tools.deny`

**Atenção:** Isso permite que o agente modifique arquivos do projeto.
