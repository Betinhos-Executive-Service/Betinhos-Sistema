---
name: verificar-nota-motorista-sync
description: "Verifica a sincronização das notas Infleet → new_notamotorista: Custom API new_SincronizarNotasInfleet (SincronizarNotasInfleetPlugin.cs, NotaSync.cs), migration 20261119-2000-tabela-nota-motorista.ps1, register-sincronizarnotas-customapi.ps1, carga-notas-infleet.ps1 e o flow 'Infleet - Sincronizar notas dos motoristas' (provision-flow-nota-motorista.ps1, flows/nota-motorista-diario.json). Use após mudar qualquer um deles."
---
# Verificar sincronização das notas dos motoristas

## Cobre
- Tabela `new_notamotorista`: uma linha por motorista e período, upsert pela chave `new_chave` (`<funcionarioid>|90d`, `|AAAA-MM`, `|AAAA-MM-DD`). `new_periodo`: 100000000 90 dias, 100000001 Mês, 100000002 Dia. `new_situacao`: 100000000 Ok, 100000001 Em formação (km < 50 ou nota nula). Dia/mês sem km não ganha linha; linha nunca é apagada.
- Custom API `new_SincronizarNotasInfleet` (SYSTEM, token `infleet.token` da `cr40f_segredo`): entradas `Meses` (2), `Dias` (3), `Ate` (com `Ate`, não grava a 90 dias). Lotes de 15 períodos por chamada GraphQL (complexidade máxima 300); a 90 dias de todos sai primeiro; lote recusado é refeito item a item e só o motorista com id ruim fica em `falhas`; para aos 80 s com `incompleto: true`. Resposta `{motoristas, periodos, gravadas, falhas, incompleto}`, só ids.
- Flow diário às 05:00 (São Paulo): alerta por e-mail (`FLOW_NOTA_MOTORISTA_DESTINATARIOS`) quando a chamada falha, há `falhas` ou `incompleto`, e termina Failed.

## Local (sem Dataverse)
1. `export DOTNET_ROOT=$HOME/.dotnet PATH=$HOME/.dotnet:$PATH; dotnet test packages/plugins/Betinhos.DriverRecordSharing.Tests -p:SignAssembly=false` → `NotaSyncTests` e `SincronizarNotasInfleetPluginTests` passam (lotes, upsert idempotente, sem km sem linha, nota nula em formação, falha isolada, limite de tempo).
2. `node --test packages/deploy/flows-dev.test.mjs packages/deploy/migrations-ci.test.mjs` e `python3 -m json.tool packages/deploy/flows/nota-motorista-diario.json`.
3. Migration sem `-Apply` (dry-run) no DEV: lista o que criaria, sem gravar.

## DEV (escreve no DEV; só do checkout principal na develop e com ok do Renan)
1. Chave do plugin Active; `register-sincronizarnotas-customapi.ps1 -Apply` (idempotente, GUIDs fixos).
2. POST `new_SincronizarNotasInfleet` com `{"Dias":1,"Meses":0}` → `gravadas` > 0, `falhas` vazia, `incompleto` false, em menos de 60 s. Rodar de novo não aumenta a contagem de linhas.
3. Conferir 1 motorista contra a Infleet (3 dias): `new_nota` e `new_km` das linhas Dia batem com o `driverProfile` da mesma janela.
4. Carga: `carga-notas-infleet.ps1` (DEV; PROD só com `-Prod` e pedido do Renan), ~1 h; para após 2 meses seguidos sem linha.
5. Flow novo à mão (`provision-flow-nota-motorista.ps1`); depois a execução das 05:00 dá Succeeded e o Deploy seguinte deixa de acusar "flow novo".
