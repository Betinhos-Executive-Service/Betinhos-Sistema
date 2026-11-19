---
name: verificar-minha-nota
description: "Verifica a tela Minha nota do App Motoristas (apps/motoristas/src/features/minha-nota/**) e a Custom API new_NotaInfleet (NotaInfleetPlugin/NotaInfleet.cs), que lê a tabela new_notamotorista. Use após mudar qualquer um deles."
---
# Verificar Minha nota (App Motoristas)

## Cobre
- Tela `MinhaNotaScreen.tsx`, contrato `notaInfleet.ts` (`schema` 1, `sincronizadoEm`, "Atualizada em dd/mm às HH:mm" em São Paulo), cache no aparelho (`notaCache.ts`, 1 h) e `useNotaInfleet.ts`.
- Custom API `new_NotaInfleet` (action, POST): lê a linha 90 dias e os meses Ok de `new_notamotorista` do motorista logado; não chama a Infleet. Comportamentos de condução sempre; os de câmera (JSON `new_outroscomportamentos`) só abaixo de 100.

## Local (sem Dataverse)
1. `cd apps/motoristas && pnpm typecheck && node --test --experimental-strip-types tests/notaInfleet.test.ts` → passam.
2. `export DOTNET_ROOT=$HOME/.dotnet PATH=$HOME/.dotnet:$PATH; dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false` → `NotaInfleetTests` e `NotaInfleetPluginTests` passam.
3. Mock (`pnpm --filter @betinhos/motoristas dev`, localhost): `#/minha-nota` mostra nota, selo, "Últimos 90 dias · km" e "Atualizada em 19/11 às 05:00". `?mockNota=formacao` (em formação com km e hora), `?mockNota=sem` (sem cadastro), `?mockNota=erro` (erro com tentar de novo), `?mockNota=55` (faixa Atenção). Print pela skill `print-ui`.

## DEV (somente leitura)
1. Há linha `|90d` do motorista em `new_notamotorista` (`new_chave eq '<funcionarioid>|90d'`), com `new_sincronizadoem` de hoje depois das 05:00.
2. POST `new_NotaInfleet` com `MSCRMCallerID` do usuário do motorista → `new_Result` com `schema` 1, `sincronizadoEm` igual ao `new_sincronizadoem` e `meses` em ordem crescente; responde em menos de 1 s.
3. No App do DEV, a tela abre em menos de 1 s e a hora bate com a da tabela. Motorista sem `new_infleetdriverid` vê "sem cadastro".
