# 05. Variáveis de ambiente e scripts

**Nenhum valor secreto é reproduzido aqui.** Só nomes, finalidade e onde são lidos.

## 1. Variáveis e configurações

### Build / app (front)

| Nome | Onde é lida | Finalidade | Observação |
|---|---|---|---|
| `VITE_FLOW_GERAR_VOUCHER_URL` | `scripts/build-react-singlefile.cjs` (embutida em `window.__APP_FLOW_ENV`) | URL do gatilho HTTP do Flow de voucher; reserva quando a variável Dataverse está vazia/ilegível | Vira texto dentro do HTML publicado; ver risco S2 em `07` |
| `VITE_FLOW_SALVAR_FOTOS_MANUTENCAO_URL` | idem | URL do Flow que salva arquivos no OneDrive | idem |
| `VITE_FLOW_ENVIAR_RECIBO_CLIENTE_URL`, `VITE_FLOW_LEITURA_RAPIDA_URL`, `VITE_FLOW_DESPESA_ASYNC_URL` | só referenciadas como chave em `dataverse.ts` (`FLOW_URLS`) | Fallback dessas URLs | O script de build **não** as embute; sem a variável Dataverse correspondente ficam vazias |
| `NODE_AUTH_TOKEN` | `.npmrc` (`//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`) | Instalar `@betinhos-executive-service/ui` do GitHub Packages (token com `read:packages`) | Obrigatória para `npm ci`/`npm install`; `scripts/cloud-setup.sh` aborta sem ela |
| `PORT` | `scripts/dev-server.cjs`, `serve-dist.cjs` | Porta do servidor local | Sem `PORT`, `dev` lê `~/.codex/dev-ports.json` (caminho absoluto → porta); sem reserva, falha (sem porta alternativa) |

### Variáveis de ambiente do Dataverse (lidas em runtime pelo app e pelos plugins)

| Schema name | Lida por | Finalidade |
|---|---|---|
| `new_FlowURLFlowGerarVoucherAppMotoristasv2` | app (`resolveFlowUrl`) | URL do Flow de voucher |
| `new_FlowURLFlowSalvarArquivosOnedrive` | app | URL do Flow de upload OneDrive |
| `new_FlowURLFlowEnviarReciboCliente` | app | URL do Flow de e-mail do recibo |
| `new_FlowURLDespesaLeituraRapida` | app | URL do Flow de leitura rápida de comprovante |
| `new_FlowURLDespesaAsync` | app | URL do Flow de upload assíncrono de despesa (a presença decide o modo `async`) |
| `new_URLFlowListarArquivosSharePoint`, `new_URLFlowConsultarArquivosSharePoint` | plugin `VehiclePhotoGateway` (`EnvironmentVariables.Read`) | Foto do passageiro |
| `new_AnthropicKeyObservacaoMotorista` | plugin `OrganizeObservationPlugin` (reserva da configuração segura do step) | Chave da API usada para organizar observação. Segredo; ver `07` (S1) |

O app lê `environmentvariabledefinitions`/`environmentvariablevalues` com o usuário logado, e usa o valor atual ou o padrão da definição. Valor vazio não é cacheado.

### Scripts / plugins / QA (somente nomes)

| Nome | Usada em | Finalidade |
|---|---|---|
| `CHROME_PATH`, `APP_MOTORISTAS_URL`, `CDP_PORT`, `APP_PORT`, `VIEWPORT_HEIGHT`, `REDUCED`, `FOTO` | `scripts/qa/*.cjs`, `qa-cdp-*.cjs`, `capture-demo-screens.cjs` | Navegador, URL e parâmetros dos testes de UI por CDP |
| `APP_EXPENSE_DEV_TOKEN` | `deploy-expense-webresource-dev.ps1`, `provision-expense-upload-dev.ps1`, `expense-upload-dv.py` | Token para operar o DEV do upload de despesas (segredo) |
| `DRIVER_RECORD_SHARING_ACCESS_TOKEN` | `register-/validate-/verify-driver-record-sharing-plugin*.ps1` | Token de acesso ao DEV para registrar/validar plugin (segredo) |
| `BETINHOS_ALLOW_DIRECT_PROD=1` | `scripts/lib/assert-dev-environment.ps1` | Exceção consciente para hotfix direto no PROD (cria camada Active) |
| `MINIPDF_SAMPLE` | testes de `MiniPdf` | Saída de amostra de PDF |
| `CLAUDE_CODE_REMOTE`, `CLAUDE_ENV_FILE`, `CLAUDE_PROJECT_DIR` | hook `.claude/hooks/session-start.sh`, `cloud-setup.sh` | Ambiente cloud do Claude Code |

### Arquivos de segredo fora do repositório (só os caminhos)

- `%USERPROFILE%\.betinhos\stripe-dev.env` (linha `STRIPE_SECRET_KEY=...`), lido por `scripts/lib/stripe-key.ps1` para `provision-cobranca-qr.ps1`.
- `Skill Agendamento\infleet-mcp\.env` (linha `INFLEET_TOKEN=...`), procurado por `scripts/lib/infleet-token.ps1` subindo as pastas; usado pelos `provision-*` de Infleet/checklists/comunicados.
- `~/.codex/dev-ports.json`: reservas de porta de dev (não secreto).

## 2. Scripts npm (`package.json`)

| Comando | O que faz (lido no script) |
|---|---|
| `npm run dev` | `scripts/dev-server.cjs`: build inicial com `--no-version`, serve `dist/` em `127.0.0.1` na porta reservada, observa `src/` e rebuilda; reinicia o próprio servidor se a porta é deste checkout |
| `npm run build` | `scripts/build-react-singlefile.cjs`: gera `dist/webresource-app-motoristas.html` e `dist/index.html`, copia `src/pwa/sw.js` para `dist/sw.js`; **incrementa o PATCH** de `package.json` e `package-lock.json` |
| `npm test` | `node --test --experimental-strip-types tests/*.test.ts` |
| `npm run check:hygiene` | `tests/repositoryHygiene.test.ts` (sem exports, binários, ZIPs ou URLs credenciadas versionadas) |
| `npm run preview` | `scripts/serve-dist.cjs`: serve `dist/` |
| `npm run push` | `scripts/push-dev.ps1` (publica no **DEV**) e depois, se existir, `distribuir-apos-push.ps1` do repositório irmão "Sistema Betinhos" (caminho absoluto fixo no `package.json`); senão só avisa |
| `npm run deploy:webresource` | `scripts/deploy-webresource.ps1` (somente o web resource) |
| `npm run demo:capture` | `scripts/capture-demo-screens.cjs`: screenshots em `public/screens/` |
| `npm run demo:render` / `demo:video` | Remotion (`remotion/index.ts`). **Não confirmado**: a pasta `remotion/` não existe neste worktree |

Gate de tipos (documentado em `AGENTS.md`, sem script npm): `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`.

## 3. Catálogo de scripts (`scripts/`)

Finalidades pelo cabeçalho/nome; só os marcados "lido" tiveram conteúdo inspecionado.

| Grupo | Arquivos | Notas |
|---|---|---|
| Build/dev | `build-react-singlefile.cjs` (lido), `build-react-webresource.cjs`, `build-single-file.cjs`, `inline-dist-single-file.cjs`, `dev-server.cjs` (lido), `serve-dist.cjs` | Só `build-react-singlefile.cjs` e `dev-server.cjs` são chamados pelo `package.json`; os outros três builds são **não confirmados** como em uso |
| Publicação DEV | `push-dev.ps1` (lido), `deploy-webresource.ps1`, `register-driver-record-sharing-plugin-webapi.ps1`, `register-driver-record-sharing-plugin.ps1`, `publicar-plugin-dev.mjs` (Node, Linux/macOS), `push-expense-upload-dev.ps1`, `deploy-expense-webresource-dev.ps1` | Todos travados para o DEV por `scripts/lib/assert-dev-environment.ps1` |
| Publicação PROD | `deploy-prod.ps1` (lido), `audit-prod-layers.ps1`, `remove-prod-active-layer.ps1` | Único caminho para PROD: solução gerenciada. Ver `06` |
| Provisionamento (DEV, `-Apply`) | `provision-comunicados.ps1`, `provision-comunicados-push-flow.ps1`, `provision-checklists.ps1`, `provision-checklist-flows.ps1`, `provision-checklist-planner-flow.ps1`, `provision-treinamentos-push.ps1`, `provision-termo-multa-push-flow.ps1`, `provision-motorista-push-flows.ps1`, `provision-push-redirect.ps1`, `provision-current-vehicle.ps1`, `provision-infleet-vehicle.ps1`, `provision-cobranca-qr.ps1`, `provision-observacao-organizada.ps1`, `provision-exchange-lifecycle.ps1`, `provision-exchange-lifecycle-webresources.ps1`, `provision-possession-concurrency-keys.ps1`, `provision-base-locations.ps1`, `provision-expense-upload-dev.ps1` | `push-dev.ps1` chama vários em sequência (ver `06`) |
| Schema (consoles JS colados no navegador) | `create-*-schema*.console.js`, `create-*-table-console.js`, `criar-despesas-operacionais-dataverse.console.js`, `configure-*.console.js`, `add-*.console.js`, `setup-service-vehicle-origin.console.js`, `unify-receipt-tables.console.js` etc. | Escrevem no Dataverse; uso manual |
| Permissões | `grant-*.ps1`, `grant-*.console.js`, `enable-*-field-security.*` | Escrevem papéis/segurança |
| Backfill/reparo | `backfill-*.console.js`, `repair-*.ps1/.js`, `reconcile-exchange-generals.ps1`, `fix-collision-attachment-choice-labels.console.js` | Escrevem dados; **exigem confirmação antes de uso** |
| Auditoria (leitura) | `audit-*.console.js/.ps1/.cjs/.mjs`, `schema-index.cjs`, `extract-context.cjs`, `inspect-schema-option.cjs`, `diagnose-*.console.js` | Somente leitura pelo nome; **não confirmado** caso a caso |
| Verificação E2E (DEV) | `verify-*.ps1`, `smoke-*-dev.ps1`, `preflight-comunicados-dev.ps1`, `qa-expense-upload-dev.ps1` | Alguns gravam no DEV (ex.: `smoke-checklists-dev.ps1` troca o carro atual de um funcionário) |
| QA de UI (CDP/Playwright) | `qa/verify-*.cjs`, `qa-cdp-*.cjs`, `tmp-via-dutra.spec.js` | Precisam de navegador Chromium e do app em execução |
| Cloud | `cloud-setup.sh`, `testa-cloud-setup.sh` | Preparo da VM do Claude Code |
| Higiene | `check-repository-hygiene.ps1` | Chama `npm run check:hygiene` |
| Outros | `cobranca-qr-webhook-flow.cjs`, `expense-upload-flow.cjs` (definições de Flow sem credenciais), `expense-upload-dv.py`, `generate-service-vehicle-corrections.py`, `import-despesas-operacionais-csv.ps1`, `seed-*`, `create-docker-slides.mjs`, `test-onedrive-photo-preview.ps1`, `update-third-party-fixed-vehicles.console.js`, `find-solution-missing-option-labels.ps1` | Uso pontual |

## 4. Logs e diagnóstico

- Console do navegador: prefixo `[AppMotoristas:Dataverse]`.
- Tabela `new_appmotoristaslog` (erros do app) e `plugintracelog` (plugins; linha `OperationalLog {json}`).
- `docs/dataverse-plugin-flowchart.html`, `docs/CHECKLIST.md` e `docs/evidencias/*` trazem material anterior (não conferido aqui).
