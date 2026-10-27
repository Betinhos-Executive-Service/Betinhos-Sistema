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

## Logger de erros (`src/lib/appErrorLogger.ts` → pacote `@betinhos-executive-service/ui/error-logger.js`)
- `tests/appErrorLogger.test.ts` cobre gravação via pacote, versão de build, redação de e-mail/telefone, aviso `appmotoristas:error`, `console.error` e modo mock.
- Prévia local (mock): no console da página, `window.__APP_REPORT_ERROR(new Error('teste x@y.com'),{action:'verificacao'})` → toast com `[redacted-email]`; `setTimeout(()=>{throw new Error('teste')})` → pop-up crítico "Processo não foi concluído". `localStorage['betinhos-error-log-queue-v1:App Motoristas']` continua vazio (mock não grava).
- DEV autenticado (só com a trava `~/.claude/locks/dataverse-dev.lock`): publique só o WebResource (`scripts/deploy-webresource.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/ -WebResourceName new_app-motoristas-v2 -SolutionUniqueName AppBetinhos`), force um erro no app aberto, confira a linha em `new_appmotoristaslogs` (`new_appname` = App Motoristas, `new_appversion` = versão do build, `new_useremail`) e apague a linha de teste. Sem login no navegador: rode `reportAppError` do `src/lib/appErrorLogger.ts` em Node com um `window` falso cujo `Xrm.WebApi.createRecord` faz POST em `new_appmotoristaslogs` com o token de `az account get-access-token --resource https://org23b93544.crm2.dynamics.com` e `__APP_BUILD_INFO` do `dist/` publicado; leia a linha, apague e confirme 404.

## Casos de borda
- URL direta do web resource (host `*.dynamics.com`, sem `Xrm`): Custom APIs e dados caem em `fetchWebApi`; `tests/customApi.test.ts` cobre. Qualquer módulo novo que exija `Xrm` direto quebra só nesse modo.
- Viewport 390×844 e desktop; landscape baixo quando a tela tiver modo compacto.

## Evidência obrigatória
- Saídas de teste e TypeScript; screenshot da tela afetada na prévia.

## Limites
- Integração Dataverse/Flow só no app publicado (DEV com login). PROD é somente leitura.
