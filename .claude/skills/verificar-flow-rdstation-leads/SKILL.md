---
name: verificar-flow-rdstation-leads
description: "Verifica o patch do 'Flow API RD Station BD para Leads' que manda o lead ao RD mesmo com passageiro sem cliente (cr40f_bancodedados.cr40f_cliente vazio), e a migration que torna o Cliente obrigatório. Use após mudar packages/deploy/patch-flow-rdstation-leads.ps1 ou antes de levar o patch ao PROD."
---
# Verificar flow RD Station (lead sem cliente)

## Cobre
- `packages/deploy/patch-flow-rdstation-leads.ps1` sobre o flow `0fce14c4-4a34-f111-88b4-6045bd3c4061` (mesmo id no DEV e no PROD, ativo nos dois; gatilho create/update em `cr40f_bancodedados`).
- `packages/deploy/migrations/20261117-1430-passageiro-cliente-obrigatorio.ps1` (RequiredLevel do `cr40f_cliente` para ApplicationRequired; aplicada pelo Deploy).

## Problema
- `Get_a_row_by_ID` lia `cr40f_clientes1s` com `recordId` vazio quando o passageiro não tinha cliente → `WorkflowOperationParametersRuntimeMissingValue`, lead não ia ao RD e chegava "ERRO NO FLOW" (Carly Shedlick, Deny Dos Santos, Dave Danyluk; 9 falhas de 06 a 12/11/2026 no PROD).
- Depois: `Initialize_empresa` (variável vazia) → `Condition_tem_email` → `Condition_tem_cliente` (Get + `Set_empresa` só com cliente) → `HTTP_Obter_Token`; `company` = `variables('empresa')`.
- O clientdata tem credenciais do RD: nunca imprima nem anexe o clientdata ou o backup (`packages/deploy/flows/backup/`, fora do git).

## Roteiro (só DEV)
pwsh precisa de `export DOTNET_ROOT=$HOME/.dotnet PATH=$HOME/.dotnet:$HOME/.dotnet/tools:$PATH`.
0. Local: `pwsh -File packages/deploy/patch-flow-rdstation-leads.ps1 -Ambiente DEV -Arquivo <backup.json> -Saida <scratch>/novo.json` → `Initialize_empresa` herda o runAfter original; `Condition_tem_email <- Initialize_empresa`; `HTTP_Obter_Token <- Condition_tem_cliente`.
1. Simulação: `... -Ambiente DEV` → lista as mudanças e `DRY RUN`, ou `já está no formato final`.
2. Aplicar: `... -Ambiente DEV -Apply` → backup e `atualizado (statecode 1)`.
3. Prova ponta a ponta: crie um passageiro de teste (`cr40f_bancodedadoses`, e-mail de teste próprio, sem cliente), espere a execução (API `api.flow.microsoft.com`, token `az` para `https://service.flow.microsoft.com/`, `environments/25a2ab78-cf07-ee41-a124-457aa2c29aea/flows/<id>/runs`) → `Succeeded`, `Condition_tem_cliente` sem Get, payload com `company=''`. Ligue o cliente (`cr40f_Cliente@odata.bind`) → nova execução `Succeeded` com `company=<nome do cliente>`. Apague o passageiro de teste.
4. Migration: `pwsh -File packages/deploy/migrations/20261117-1430-passageiro-cliente-obrigatorio.ps1` (dry run) → "mudaria ... para ApplicationRequired" ou "ja e obrigatoria". O `-Apply` fica com o Deploy.
5. Reverter o flow: `... -Ambiente DEV -Apply -Restaurar <backup>`.

## PROD (só com autorização explícita do Renan)
- `... -Ambiente PROD` (simulação) e `... -Ambiente PROD -Apply -ConfirmarProd`.
- Prova: próximo passageiro sem cliente gera execução `Succeeded` sem e-mail "ERRO NO FLOW".

## Evidência
- Saída do dry run, linha do backup e status/ações das duas execuções de teste.
