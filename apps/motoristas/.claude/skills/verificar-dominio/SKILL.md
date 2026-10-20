---
name: verificar-dominio
description: "Verifica a camada de domínio e integração do App Motoristas: regras em src/lib (Dataverse, Flow, despesas, recibo, câmera, valores, versão de build), tipos e scripts de build. Use após mudar src/lib/**, src/types.ts, tests/**, scripts de build/deploy ou package.json."
---
# Verificar domínio e build

## Cobre
- Código: `src/lib/**`, `src/types.ts`, `src/*.d.ts`, `tests/**`, `scripts/*.cjs`, `scripts/*.ps1`, `package.json`.

## Preparar ambiente
- `npm ci` (lockfile `package-lock.json`). Node 24.

## Roteiro
1. `npm test` → `ℹ fail 0` (233 testes em 20/10/2026; o número só deve crescer).
2. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` → sem saída e exit 0.
3. Mudou payload do Dataverse (`src/lib/dataverse.ts`)? Confira nomes lógicos na metadata real do DEV (MCP `Dataverse_DEV`, somente leitura) antes de concluir. Ex.: `cr40f_observacoes` do recibo recebe "-" quando vazio.
4. Mudou o build (`scripts/build-react-singlefile.cjs`)? `npm run build` gera `dist/webresource-app-motoristas.html` com `window.__APP_BUILD_INFO` e sobe o PATCH; confira o carimbo `v… · dd/mm/aaaa HH:mm` na Início (ver `verificar-servicos`). Não versione `dist/` de builds de teste.

## Casos de borda
- `sanitizeCurrencyInput`: letras descartadas, "1.250" = milhar, 2 casas no máximo (`tests/currencyInput.test.ts`).
- `describeCameraError`: NotAllowed/NotFound/NotReadable/desconhecido (`tests/cameraErrors.test.ts`).
- `formatBuildStamp`: com e sem data de build (`tests/buildStamp.test.ts`).
- Logger de erros (`src/lib/appErrorLogger.ts` sobre `@betinhos-executive-service/ui/error-logger.js`): `tests/appErrorLogger.test.ts` cobre gravação via pacote, carimbo `v…`/`dd/mm/aaaa HH:mm`, redação de e-mail/telefone, aviso `appmotoristas:error`, `console.error`, fila antiga e modo mock. Prova no DEV: ver `verificar-app-geral`.
- CSS com chaves balanceadas (`tests/stylesSyntax.test.ts`): o esbuild só avisa e engole as regras seguintes; acontece em resolução de merge de `src/styles.css`.

## Evidência obrigatória
- Saída de `npm test` e do `tsc` salva em `.verificacao/<data>-<branch>/`.

## Limites
- Integração autenticada (Xrm, Flow, SharePoint) só em DEV com `npm run push`; PROD só por `scripts/deploy-prod.ps1` e com pedido explícito.
