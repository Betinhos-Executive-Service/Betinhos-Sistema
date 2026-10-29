# CLAUDE.md — Sistema Betinhos

## Publicação (`pnpm push`)

- `pnpm push` (e qualquer publicação equivalente no Dataverse) só pode ser executado a partir da branch `main`, no checkout principal (`Sistema Betinhos`), com `git pull` feito antes.
- Nunca publique a partir de branch de feature, de correção ou de worktree (`.claude/worktrees/*`). Se a branch atual não for `main`, pare e informe; o caminho é abrir PR, fazer o merge e publicar da `main`.
- Após publicar, commite o bump como `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main` direto na `main`.
- Nunca dispare dois `pnpm push` em paralelo.
- No fim de todo `pnpm push` (local ou CI), `packages/deploy/solucoes/distribuir-apos-push.ps1` distribui nas 4 soluções (`BetinhosCore`, `BetinhosAutomacao`, `BetinhosInterface`, `BetinhosMotoristas`) o que entrou na AppBetinhos do DEV e confere. Ele nunca derruba o push; se a conferência não zerar, mostra "ATENCAO" e o export para TEST/PROD fica barrado até corrigir (skill `verificar-solucoes`). Tipo de componente novo pede regra em `packages/deploy/solucoes/regras.json`.
- Exceção automática (decisão do Renan, 20/10/2026): depois de um merge automático de baixo risco (`.claude/entrega-autonoma.json`), o plantão publica no DEV levando a `main` para a branch `dev` (`git push origin origin/main:refs/heads/dev`, só avanço rápido, nunca force). Isso dispara o workflow "Deploy" (job `dev`, conta de serviço do environment `dev` do GitHub). Nunca `pnpm push` fora do checkout principal. A versão de build parte da maior entre a do repo e a já publicada no DEV (descrição do `cr40f_SistemaBetinhos.html`, lida pelo `push-dev.ps1 -Build`), então CI e `pnpm push` local nunca fazem a versão retroceder.
- TEST: workflow manual "Publicar TEST" (`.github/workflows/publicar-test.yml`) leva as 4 soluções gerenciadas do DEV para o TEST, com conferência antes, aprovação do Renan no environment `test` e comparação de fotos `--travado` depois (skill `verificar-solucoes`). O import recusa qualquer host que não seja o TEST; PROD não tem workflow.

## Ambiente cloud (sessões cloud do Claude Code)

- Ambiente em claude.ai/code: variável `NODE_AUTH_TOKEN` (token GitHub com `read:packages`), sem credenciais do Dataverse. O preparo da VM roda no hook SessionStart (`.claude/hooks/session-start.sh` → `scripts/cloud-setup.sh`, log em `/tmp/cloud-setup.log`), porque o token não chega ao setup script do ambiente; o setup script pode ficar vazio.
- Na VM o app roda em modo mock (`isLocalHost()`): sem dados do Dataverse, só navegação e UI. Dá para codar, rodar `pnpm typecheck`, `pnpm test`, `pnpm dev` (porta 36472) e verificar a UI no Chromium headless.
- Comportamento que depende de dados reais, Custom API, plugin ou Flow não é verificável na VM: a sessão cloud entrega o PR e declara essa parte como "não verificada na nuvem"; a verificação com Dataverse DEV é feita localmente.
- Sessões cloud nunca executam `pnpm push`, `pnpm wr` de publicação, `sitemap:*`, `push:plugin:*` nem scripts de `packages/deploy/provision-*` (todos alteram o Dataverse e exigem a `main` no checkout principal).
- Skills de verificação ficam em `.claude/skills/` (versionadas) para valerem também nas VMs.
