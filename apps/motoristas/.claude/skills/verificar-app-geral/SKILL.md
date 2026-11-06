---
name: verificar-app-geral
description: "Verificação base do App Motoristas: testes Node, TypeScript estrito, build single-file e prévia local sem erros. Use após mudar qualquer arquivo de src/, tests/ ou scripts/ que não tenha uma skill verificar-<area> mais específica, ou junto com ela quando a mudança tocar src/App.tsx ou src/styles.css."
---
# Verificar app (geral)

## Cobre
- Código: `src/**` (App, telas, componentes, lib), `tests/**`, `scripts/**`.
- Áreas com skill própria (rode as duas): gastos → `verificar-gastos`.

## Preparar ambiente
- Node instalado; dependências do repositório principal (`App Motoristas/node_modules`) resolvem também nos worktrees. Se faltar `@betinhos-executive-service/ui` (GitHub Packages): `NODE_AUTH_TOKEN=$(gh auth token) npm install` (o `.npmrc` do repo usa a variável; nunca grave o token).
- Dev server: `PORT=<porta livre> node scripts/dev-server.cjs` → `http://127.0.0.1:<porta>/`. Ele reescreve `dist/`; use `git checkout -- dist` antes do commit se não for publicar.

## Roteiro
1. `npm test` → `ℹ fail 0`.
2. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → sem saída.
3. Dev server sobe e imprime `[dev] build atualizado` (build single-file sem erro).
4. Navegador interno em `/?dev=preview` → a lista de demos aparece (Botões, Tela inicial, Serviços, Gastos...). Abra a tela afetada pela mudança e interaja com o controle alterado.
5. `read_console_messages` com `onlyErrors: true` → sem erros.

## Logger de erros (`src/shared/appErrorLogger.ts` → pacote `@betinhos-executive-service/ui/error-logger.js`)
- `tests/appErrorLogger.test.ts` cobre gravação via pacote, versão de build, redação de e-mail/telefone, aviso `appmotoristas:error`, `console.error` e modo mock.
- Prévia local (mock): no console da página, `window.__APP_REPORT_ERROR(new Error('teste x@y.com'),{action:'verificacao'})` → toast com `[redacted-email]`; `setTimeout(()=>{throw new Error('teste')})` → pop-up crítico "Processo não foi concluído". `localStorage['betinhos-error-log-queue-v1:App Motoristas']` continua vazio (mock não grava).
- DEV autenticado (só com a trava `~/.claude/locks/dataverse-dev.lock`): publique só o WebResource (`scripts/deploy-webresource.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/ -WebResourceName new_app-motoristas-v2 -SolutionUniqueName AppBetinhos`), force um erro no app aberto, confira a linha em `new_appmotoristaslogs` (`new_appname` = App Motoristas, `new_appversion` = versão do build, `new_useremail`) e apague a linha de teste. Sem login no navegador: rode `reportAppError` do `src/shared/appErrorLogger.ts` em Node com um `window` falso cujo `Xrm.WebApi.createRecord` faz POST em `new_appmotoristaslogs` com o token de `az account get-access-token --resource https://org23b93544.crm2.dynamics.com` e `__APP_BUILD_INFO` do `dist/` publicado; leia a linha, apague e confirme 404.

## Onde ficam as telas

- `src/App.tsx` só orquestra: estado transversal, hooks das features e a ordem das rotas. Cada tela é montada em `src/features/<x>/rotas.tsx` (`rotasX(screen, props)`); quem mexe numa tela edita a rota e o hook da feature.

## Refatoração sem mudança visual (`scripts/qa/screens-baseline.cjs`)

- Antes de mexer: `npm run build -- --no-version` e `node scripts/qa/screens-baseline.cjs capture <tmp>/antes` (16 telas do mock por rota hash, relógio congelado em 28/10/2026 12:00Z, animações e selo de build desligados).
- Depois: mesmo build, `capture <tmp>/depois` e `compare <tmp>/antes <tmp>/depois`. Esperado `OK: 16 telas idênticas.`; qualquer `DIFERE` = abrir os dois PNGs.
- Volte o `dist/` (`git checkout -- dist`) se o PR não for de publicação. `--no-version` evita mexer na versão do `package.json`.
- Fluxos (finalizar, voucher, comunicados, detalhe, checklist): sirva `dist/` antigo e novo em portas diferentes (servidor estático simples, a página é `/webresource-app-motoristas.html`) e rode `scripts/qa/verify-ux-flows.cjs` e `scripts/qa/verify-checklist-send.cjs <pasta> sucesso|foto|registro` com `APP_MOTORISTAS_URL` em cada um; os resultados têm de bater. Em 28/10/2026 a `main` já falhava em "Finalizar: confirma a observação já escrita".
- Contratos também cobertos por `tests/moduleExports.test.ts` (exports de `src/lib`, `src/app`, `src/data`; atualize com `UPDATE_SNAPSHOT=1` só quando a mudança for intencional) e `tests/hashRouteCharacterization.test.ts`.

## Casos de borda
- PWA (`src/lib/pwa*.ts`, `src/pwa/sw.js`): `tests/pwa.test.ts` cobre o manifest; instalação só se prova no DEV pela URL direta (Chrome: Application > Manifest sem erros e botão Instalar; SW ativo com escopo `/WebResources/`; iPhone: Adicionar à Tela de Início).
- Web Push (`src/lib/webPush.ts`, `WebPushLink`, handlers `push`/`notificationclick` em `src/pwa/sw.js`): `tests/webPush.test.ts` cobre estados e registro. Desligado enquanto `WEB_PUSH_PUBLIC_KEY` estiver vazia (botão some). Com a chave: no DEV pela URL direta, ativar no Android e no iPhone instalado, conferir a linha em `new_inscricaopushmotorista` e o toque abrindo o item (plano em `docs/plano-web-push-pwa.md`).
- URL direta do web resource (host `*.dynamics.com`, sem `Xrm`): Custom APIs e dados caem em `fetchWebApi`; `tests/customApi.test.ts` cobre. Qualquer módulo novo que exija `Xrm` direto quebra só nesse modo.
- Viewport 390×844 e desktop; landscape baixo quando a tela tiver modo compacto.

## Evidência obrigatória
- Saídas de teste e TypeScript; screenshot da tela afetada na prévia.

## Limites
- Integração Dataverse/Flow só no app publicado (DEV com login). PROD é somente leitura.
