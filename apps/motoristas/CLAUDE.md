@AGENTS.md

## Ambiente cloud (sessões cloud do Claude Code)

- A sessão cloud abre na raiz do Betinhos-Sistema e usa o preparo dele (hook `SessionStart` da raiz, `scripts/cloud-setup.sh`: Node 24, `pnpm install` do workspace, Chromium). Ele é verificado pela `verificar-ambiente-cloud` da raiz.
- Gerenciador: pnpm (`pnpm-lock.yaml` da raiz). Os comandos do app rodam em `apps/motoristas`: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`.
- Chromium já vem na imagem em `$PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (build 1194) e o CDN do Playwright é bloqueado: para screenshot na VM use `playwright@1.56.1` (casa com esse build) e não baixe outro navegador.
- Na VM o app roda em modo mock (`localhost` em `src/data/dataverse/cliente.ts`): dá para codar, testar, buildar, subir o dev server e verificar a UI no Chromium headless.
- Não verificável na nuvem: dados reais do Dataverse, Flows, plugins (.NET), câmera/mídia de dispositivo, comportamento dentro do Power Apps/model-driven. A sessão cloud entrega o PR e declara essa parte como "não verificada na nuvem".
- Publicação: o app vai ao DEV pelo workflow Deploy do Sistema (push na `develop`) e ao PROD pelo `publicar.yml` (merge `develop → main`). Sessões cloud nunca executam `pnpm deploy:webresource`, `scripts/deploy-*.ps1`, scripts `*.console.js` de schema/permissões nem nada que escreva no Dataverse (DEV ou PROD).
- Skills de verificação do app ficam em `apps/motoristas/.claude/skills/` (índice em `verificar-index.md`).

## PWA (app instalável)

- Só na URL direta do web resource (`*.dynamics.com`, janela de topo). `src/lib/pwa.ts` injeta manifest (data URL, `src/lib/pwaManifest.ts`), metas do iOS e registra o service worker; no Power Apps (iframe) e em localhost não faz nada.
- Service worker = web resource JS `new_app-motoristas-v2-sw` (fonte `src/pwa/sw.js`, copiado para `dist/sw.js` no build, publicado no DEV pelo Deploy do Sistema (peça `motoristasSw`)). Escopo `/WebResources/`. Cacheia só o HTML do app para abrir sem rede; dados, fotos e login nunca entram no cache. Mudou o SW: suba `CACHE` em `sw.js`.
- Ícones em `src/assets/pwa/` (fundo navy do DS, logo Betinhos B).
