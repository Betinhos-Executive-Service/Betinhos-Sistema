# packages/planner — operação do Planner (sem UI)

Parte não-UI do repo antigo **Tela Planner** (`Betinhos-Executive-Service/tela-planner`, branch `main`), trazida sem mudança de comportamento durante a migração do Planner para `#/planner` no shell. A UI nova fica em `apps/shell/src/pages/planner/`.

> **Nada aqui deve ser executado contra o PROD.** O PROD está congelado por decisão do Renan. Use apenas o DEV (`org23b93544`) e só a partir do checkout principal na `main`.

Não há `package.json`: nenhum script é npm/pnpm, e nada entra no `pnpm typecheck`.

## Pastas

| Pasta | O que é |
|---|---|
| `scripts/` | PowerShell de Dataverse/Power Automate (flows do Planner, schema de cotação, registro de plugins, sitemap) e WAHA local |
| `power-platform/plugins/` | Plugins C# `PlannerNotifications` e `QuoteAutoNumberGuard` (+ testes). Os `.snk` são chaves de assinatura de assembly exigidas pelo Dataverse, não segredos de acesso |
| `power-platform/notifications/` | Documentação das notificações do Planner |
| `extension/` | Extensão do Chrome (Planner + WhatsApp Web + WAHA + triagem). Carregue sem empacotar em `chrome://extensions` |
| `serverless/` | Cloudflare Worker de triagem (`wrangler.toml`). Segredos via `wrangler secret put DEEPSEEK_API_KEY` / `TRIAGE_TOKEN`, nunca no arquivo |
| `docker-compose.waha.yml`, `.env.waha.example` | WAHA (API do WhatsApp) local |
| `DEPLOYMENT_CHECKLIST.md` | Checklist de deploy herdado do repo antigo |

## Como rodar

Todos em PowerShell, a partir de `packages/planner`:

- **WAHA local:** `./scripts/waha-install.ps1` (uma vez; cria `.env.waha.local` com chaves aleatórias, ignorado pelo Git), depois `./scripts/waha-start.ps1` / `./scripts/waha-stop.ps1`. Requer Docker.
- **Flows do Planner (DEV):** `./scripts/create-planner-immediate-flow.ps1`, `create-planner-daily-flow.ps1`, `create-planner-email-flow.ps1`, `create-planner-automatic-email-flow.ps1`, `disable-planner-legacy-channels.ps1`, `disable-quote-msplanner-flows.ps1` com `-EnvironmentUrl https://org23b93544.crm2.dynamics.com`.
- **Schema de cotação (DEV):** `ensure-quote-pedido-dev.ps1`, `ensure-quote-result-dev.ps1`, `ensure-quote-long-routes-dev.ps1`, `verify-quote-workflow-dev.ps1`, `grant-ideas-role-dev.ps1`.
- **Plugins:** `dotnet build` na pasta do plugin; depois `register-planner-notification-plugin.ps1` ou `register-quote-autonumber-guard.ps1` (usam o DLL de `power-platform/plugins/.../bin` por padrão). Testes: `dotnet test power-platform/plugins/QuoteAutoNumberGuard.Tests`.
- **Importação/sitemap:** `import-planner.ps1`, `remove-pedir-cotacao-sitemap.ps1`; `sitemapNavigation.mjs` é módulo auxiliar.
- **Worker:** `cd serverless; wrangler deploy` (somente quando autorizado).

Autenticação: os scripts pedem login via MSAL (device code/interativo). Nenhuma credencial fica no código.

## O que ficou no repo antigo

- `publish-webresource.ps1`, `publish-webresource.cmd` e `push-dev.ps1` foram copiados porque `verify-quote-workflow-dev.ps1` reaproveita as funções de schema de `publish-webresource.ps1`, mas **a publicação do WebResource `new_TelaPlanner` continua sendo feita no repo Tela Planner** até a validação da tela nova: esses scripts esperam `dist/webresource.html`, que só existe lá. Não rode `push-dev.ps1`/`publish-webresource.ps1` daqui.
- Scripts de build da UI (`dev.mjs`, `build-redirect-bridge.mjs`, `check-performance.mjs`, `inline-webresource.mjs`, `verify-webresource.mjs`, `write-version.mjs`), `src/`, `tests/`, `public/` e o build do WebResource não foram trazidos: pertencem à UI antiga.
