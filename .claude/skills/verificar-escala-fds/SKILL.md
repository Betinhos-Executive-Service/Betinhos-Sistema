---
name: verificar-escala-fds
description: Verifica a Escala FDS (apps/escala-fds): testes, typecheck, build, modo mock local e, no DEV, a tela autenticada e o log de erros em new_appmotoristaslog.
---

# Verificar Escala FDS

Código: `apps/escala-fds` (branch `feat/escala-fds-simples` e derivadas). WebResource `cr40f_EscalaFDS.html`, aberto pelo botão **Escala FDS** da grade de Reservas de Veículos (painel de 520px).

## 1. Local
1. `pnpm --dir apps/escala-fds test` e `pnpm --dir apps/escala-fds typecheck` (se o corepack recusar a versão do pnpm, rode `npx vitest run` e `npx tsc --noEmit` dentro de `apps/escala-fds`).
2. Servidor: `node packages/deploy/dev-restart.mjs 36481 apps/escala-fds` → http://localhost:36481 (o primeiro carregamento do Vite leva ~30 s).
3. Em localhost a tela entra em modo mock: aparece "Dados de exemplo (fora do Dataverse)", a lista de motoristas com Plantão/Trabalha e o selo `v0.0.x · dd/mm/aaaa HH:mm` no canto.
4. Clique em Plantão/Trabalha de um motorista: o botão muda de estado e o autosave roda sem erro no console.

## 2. Logger de erros (`@betinhos/ui/error-logger`)
- Instalado em `src/main.tsx` (`appName: 'Escala FDS'`, `appVersion: v<package.json>`), wrapper `loggedFetch` em `src/data/source.ts` (falhas HTTP/rede da Web API) e `logAppError` nos catches de carregar/salvar em `src/App.tsx`.
- Mock: no console da página `setTimeout(() => { throw new Error('teste') })`. Esperado: só o erro no console, nenhuma chave `betinhos-error-log-queue-v1:*` no localStorage e nenhuma requisição a `new_appmotoristaslogs`.
- Teste unitário: `src/data/errorLogger.test.ts`.

## 3. DEV (https://org23b93544.crm2.dynamics.com)
1. Trava `~/.claude/locks/dataverse-dev.lock` antes de publicar; apague ao terminar.
2. Build: `node ../../packages/deploy/bump-version.mjs . && npx tsc --noEmit && npx vite build && node ../../packages/deploy/inline-webresource.mjs dist` (em `apps/escala-fds`).
3. Publicação: `packages/deploy/push-dev.ps1 -AppDir apps/escala-fds -ResourceName cr40f_EscalaFDS.html -DisplayName "Escala fim de semana"` (precisa do `.env` na raiz; sem schema novo, o passo `provision-escala-fds.ps1` pode ser pulado).
4. Abra `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_EscalaFDS.html` logado; confira a versão no selo.
5. Force `setTimeout(() => { throw new Error('teste error-logger Escala FDS') })` no console do frame da tela. Confira a linha em `new_appmotoristaslogs` (`new_appname = 'Escala FDS'`, `new_appversion`, `new_screen`, `new_useremail`) e apague a linha de teste (GET depois deve dar 404).

PROD (orgf261ae8e) é somente leitura.
