# CLAUDE.md — Sistema Betinhos

## Publicação (`pnpm push`)

- `pnpm push` (e qualquer publicação equivalente no Dataverse) só pode ser executado a partir da branch `main`, no checkout principal (`Sistema Betinhos`), com `git pull` feito antes.
- Nunca publique a partir de branch de feature, de correção ou de worktree (`.claude/worktrees/*`). Se a branch atual não for `main`, pare e informe; o caminho é abrir PR, fazer o merge e publicar da `main`.
- Após publicar, commite o bump como `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main` direto na `main`.
- Nunca dispare dois `pnpm push` em paralelo.

## Ambiente cloud (sessões cloud do Claude Code)

- Ambiente em claude.ai/code: setup script `bash scripts/cloud-setup.sh`; variável `NODE_AUTH_TOKEN` (token GitHub com `read:packages`). Sem credenciais do Dataverse.
- Na VM o app roda em modo mock (`isLocalHost()`): sem dados do Dataverse, só navegação e UI. Dá para codar, rodar `pnpm typecheck`, `pnpm test`, `pnpm dev` (porta 36472) e verificar a UI no Chromium headless.
- Comportamento que depende de dados reais, Custom API, plugin ou Flow não é verificável na VM: a sessão cloud entrega o PR e declara essa parte como "não verificada na nuvem"; a verificação com Dataverse DEV é feita localmente.
- Sessões cloud nunca executam `pnpm push`, `pnpm wr` de publicação, `sitemap:*`, `push:plugin:*` nem scripts de `packages/deploy/provision-*` (todos alteram o Dataverse e exigem a `main` no checkout principal).
- Skills de verificação ficam em `.claude/skills/` (versionadas) para valerem também nas VMs.
