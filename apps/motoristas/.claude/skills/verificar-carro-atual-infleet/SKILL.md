---
name: verificar-carro-atual-infleet
description: Verifica a sincronização do carro atual do motorista pela Infleet (SyncCurrentVehiclePlugin, planner, gateway GraphQL, flow de 5 min com alerta por e-mail) e a guarda de configuração segura do deploy-prod. Use ao mudar esses arquivos ou quando o flow "Infleet - Sincronizar carro atual dos motoristas" falhar.
---

# Verificar carro atual pela Infleet

## 1. Testes unitários (sempre)
```powershell
cd plugins/DriverRecordSharing.Tests; dotnet test --nologo -v q
```
Em worktree, copie antes `plugins/DriverRecordSharing/DriverRecordSharing.snk` do checkout principal (é ignorado pelo git; não gere chave nova).
Cobrem em `CurrentVehicleSyncPlannerTests`: troca, sem mudança, cadastro de placa nova, terceiro ignorado e limpeza (só quando a Infleet devolve o motorista com `vehicle: null` e a origem do carro atual é Infleet).

## 2. Formato da Infleet (somente leitura)
MCP Infleet `consultar_graphql` com a mesma consulta do gateway:
`query{ drivers: listDriversPaginated(limit:500){ id vehicle{ plate } } }`
Deve vir uma lista em `drivers`; motorista sem carro vem com `vehicle: null`. Compare com `cr40f_funcionarios` (`new_infleetdriverid`, `cr40f_veiculoatual`, `new_origemveiculoatual`).

## 3. Guarda do deploy (somente leitura, PROD ou DEV)
`Get-StepsWithoutSecureConfig` em `scripts/deploy-prod.ps1` lista os 4 steps da Infleet sem configuração segura. Rode o `deploy-prod.ps1` sem `-Apply` (dry run): avisos "PROD ja esta sem configuracao segura" indicam step quebrado. Nunca leia o conteúdo da configuração segura.

## 4. Flow e alerta (DEV, só a partir da main)
`scripts/provision-current-vehicle.ps1` sem `-Apply` mostra o plano. Com `-Apply` (main, checkout principal) grava o flow com o escopo `Alertar_falha`.
Prova do alerta no DEV: desvincule a configuração segura do step de teste, espere 2 execuções com falha → 1 e-mail; a 3ª falha não manda outro; reponha o token com o registrador e confira `flowruns` voltando a `Succeeded`.

## Não verificável sem Dataverse
Limpeza real do carro atual e o e-mail dependem do DEV; numa VM cloud declare "não verificado na nuvem".
