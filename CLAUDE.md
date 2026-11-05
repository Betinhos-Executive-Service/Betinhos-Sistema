# CLAUDE.md — Sistema Betinhos

## Publicação (develop → DEV, main → PROD)

Decisão do Renan, 05/11/2026: o GitHub é o único caminho de publicação. Ninguém publica pelo Power Platform; as soluções continuam fazendo o transporte por baixo.

- **Branches.** PRs entram na `develop`. A `main` só recebe a `develop` inteira (PR `develop → main`, merge do Renan). O merge automático do plantão (`.claude/entrega-autonoma.json`) vai só até a `develop`, nunca na `main`.
- **DEV.** Push na `develop` dispara o workflow "Deploy" (`deploy.yml`, environment `dev`), que roda `pnpm push` na conta de serviço. A descrição do `cr40f_SistemaBetinhos.html` guarda versão e commit (`vX.Y.Z <sha>`); a versão parte da maior entre a do repo e a publicada, então nunca retrocede. Scripts que alteram o DEV à mão (`provision-*`, `push:plugin:*`, `sitemap:*`, `pnpm push` local) rodam só do checkout principal na `develop` atualizada, nunca de feature, worktree ou sessão cloud, e nunca dois em paralelo.
- **Distribuição.** No fim de todo `pnpm push`, `packages/deploy/solucoes/distribuir-apos-push.ps1` distribui nas 4 soluções (`BetinhosCore`, `BetinhosAutomacao`, `BetinhosInterface`, `BetinhosMotoristas`) o que entrou na AppBetinhos do DEV e confere. Nunca derruba o push; se a conferência não zerar, mostra "ATENCAO" e o export fica barrado até corrigir (skill `verificar-solucoes`). Tipo de componente novo pede regra em `packages/deploy/solucoes/regras.json`.
- **PROD.** Push na `main` dispara o workflow "Produção" (`producao.yml`). `packages/deploy/caminho-publicacao.mjs` escolhe o caminho pelos arquivos mudados desde a tag `prod-publicado`:
  - só a tela (`apps/shell`, `packages/dataverse`, lock) → direto ao PROD (`push-front-prod.ps1`, environment `prod-front`, sem revisor; vira camada Active que o próximo import das soluções retira);
  - qualquer outra coisa (ou arquivo desconhecido) → "Publicar soluções" (`publicar.yml`, `test-e-prod`): trava do commit (a tela do DEV tem de ser a da `main`), conferência e export do DEV, ensaio no TEST, backup e PROD com os mesmos pacotes e aprovação do Renan no environment `prod`; perda reprova (skill `verificar-solucoes`);
  - só documentação/CI/skills → nada; a tag anda.
  A tag só anda quando a publicação passa.
- "Publicar soluções" à mão continua valendo (`test`, `test-e-prod` ou `prod`) para refazer um ensaio. "Retirar AppBetinhos" (`retirar-caixa.yml`) é a segunda janela da promoção. Para zerar o TEST, `pac admin copy` do PROD (como no ensaio de 22/10/2026).
- Nada que mude o PROD fica fora do repositório: valor que difere por ambiente vai em variável de ambiente ou connection reference, nunca fixo no flow. Nunca publicar no PROD por outro caminho.

## Ambiente cloud (sessões cloud do Claude Code)

- Ambiente em claude.ai/code: variável `NODE_AUTH_TOKEN` (token GitHub com `read:packages`), sem credenciais do Dataverse. O preparo da VM roda no hook SessionStart (`.claude/hooks/session-start.sh` → `scripts/cloud-setup.sh`, log em `/tmp/cloud-setup.log`), porque o token não chega ao setup script do ambiente; o setup script pode ficar vazio.
- Na VM o app roda em modo mock (`isLocalHost()`): sem dados do Dataverse, só navegação e UI. Dá para codar, rodar `pnpm typecheck`, `pnpm test`, `pnpm dev` (porta 36472) e verificar a UI no Chromium headless.
- Comportamento que depende de dados reais, Custom API, plugin ou Flow não é verificável na VM: a sessão cloud entrega o PR e declara essa parte como "não verificada na nuvem"; a verificação com Dataverse DEV é feita localmente.
- Sessões cloud nunca executam `pnpm push`, `pnpm wr` de publicação, `sitemap:*`, `push:plugin:*` nem scripts de `packages/deploy/provision-*` (todos alteram o Dataverse e exigem a `develop` no checkout principal).
- Skills de verificação ficam em `.claude/skills/` (versionadas) para valerem também nas VMs.
