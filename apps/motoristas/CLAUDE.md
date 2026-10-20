@AGENTS.md

## Ambiente cloud (sessões cloud do Claude Code)

- Sessão cloud usa o ambiente "Padrão" de claude.ai/code, com setup script vazio. O preparo da VM roda no hook SessionStart do repo (`.claude/hooks/session-start.sh`, registrado em `.claude/settings.json`), só quando `CLAUDE_CODE_REMOTE=true`: executa `scripts/cloud-setup.sh` (Node 24, `npm ci` pelo `package-lock.json`, Chromium, `tsc` estrito e `npm test`), grava o PATH do Node no `$CLAUDE_ENV_FILE` e põe no contexto a última linha (`[cloud-setup] Pronto. ...` ou `[cloud-setup] FALHOU ...`). Log completo em `/tmp/cloud-setup.log`. Exige a variável `NODE_AUTH_TOKEN` no ambiente cloud (token GitHub com `read:packages`, o mesmo do Sistema Betinhos), porque o logger de erros vem de `@betinhos-executive-service/ui` no GitHub Packages; o `.npmrc` do repo lê essa variável. Sem ela o setup para com `ERRO: defina NODE_AUTH_TOKEN`. Nada de credenciais do Dataverse.
- Se a sessão abrir com `FALHOU`, leia `/tmp/cloud-setup.log`, corrija e rode `bash scripts/cloud-setup.sh` antes de codar.
- Chromium já vem na imagem em `$PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (build 1194) e o CDN do Playwright é bloqueado: para screenshot na VM use `npx playwright@1.56.1` (casa com esse build) e não baixe outro navegador.
- Gerenciador oficial: npm (`package-lock.json`). O `pnpm-lock.yaml` está defasado; não use pnpm na VM.
- Na VM o app roda em modo mock (`localhost` em `src/lib/dataverse.ts`): dá para codar, rodar `npm test`, o `tsc` estrito, `npm run build` e `npm run dev` (porta 5173) e verificar a UI no Chromium headless.
- Não verificável na nuvem: dados reais do Dataverse, Flows, plugins (`plugins/`, .NET), câmera/mídia de dispositivo, comportamento dentro do Power Apps/model-driven. A sessão cloud entrega o PR e declara essa parte como "não verificada na nuvem"; a validação com o Dataverse DEV é feita localmente.
- Sessões cloud nunca executam `npm run push`, `npm run deploy:webresource`, `scripts/deploy-*.ps1`, `scripts/push-dev.ps1`, scripts `*.console.js` de schema/permissões nem nada que escreva no Dataverse (DEV ou PROD). Esses scripts são PowerShell/Windows e exigem autenticação local.
- Skills de verificação ficam em `.claude/skills/` (versionadas) para valerem também nas VMs.
