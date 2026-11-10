---
name: verificar-flow-despesas-escalada
description: "Verifica o flow agendado 'Flow Despesas | Escalada ao gestor' (despesa em Precisa corrigir parada há mais de 3 dias passa a esperar o gestor). Use após mudar packages/deploy/provision-flow-despesas-escalada.ps1 ou packages/deploy/flows/despesas-escalada.json."
---
# Verificar flow Despesas | Escalada ao gestor

## Cobre
- `packages/deploy/provision-flow-despesas-escalada.ps1` e `packages/deploy/flows/despesas-escalada.json` (entrega E de `docs/superpowers/specs/2026-11-10-despesa-devolucao-design.md`).
- Regra: todo dia às 07:30 (Brasília), despesa com `cr40f_statusoperacional` = Precisa corrigir (100000001), `new_aguardandogestor` ≠ Sim e `modifiedon` há mais de 3 dias recebe `new_aguardandogestor` = Sim. Nada mais é gravado (status e motivo ficam).

## Sem DEV (qualquer ambiente, inclusive cloud)
1. `node --test packages/deploy/flows/despesas-escalada.test.mjs packages/deploy/flows-dev.test.mjs` → gatilho, limite de 3 dias em UTC, filtro, campo gravado, Terminate em falha, BOM e entrada na tabela do Deploy.
2. `node --test packages/deploy/*.test.mjs packages/deploy/flows/*.test.mjs` → nada mais quebrou.
3. O `.ps1` só é parseado no Windows PowerShell 5.1 (sem `pwsh` aqui, declare "não parseado").

## Só à mão, no DEV (flow novo não roda pelo Deploy)
Do checkout principal, na `develop` atualizada, com `az login --use-device-code`, nunca dois scripts em paralelo nem junto com o Deploy:
1. `powershell -File packages/deploy/provision-despesas-devolucao-schema.ps1` já aplicado (colunas da entrega A).
2. `powershell -File packages/deploy/provision-flow-despesas-escalada.ps1 [-ReferenciaDataverse <logical name>]` → cria o flow na AppBetinhos, liga e confirma `ativo`. Se o flow não ligar (`ConnectionAuthorizationFailed`), abra-o no Power Automate e autorize a conexão do Dataverse.
3. Prova: `modifiedon` não se altera por API, então use uma despesa real do DEV em Precisa corrigir parada há mais de 3 dias (ou espere uma completar 3 dias). No histórico do flow, `Paradas` devolve só despesas com `modifiedon` < agora − 3 dias e `Escalar` grava `new_aguardandogestor = true`; depois `#/despesas-operacionais` mostra a despesa na visão "Esperando gestor". Sem despesa parada, o resultado correto é `Paradas` vazio e nenhuma gravação.
4. Segunda execução no mesmo dia: `Paradas` vazio (a flag já é Sim), nenhuma gravação.

## Cuidados
- O flow não aciona a Análise IA: o gatilho dela só observa `cr40f_statusanexo`.
- PROD só pelo repositório (solução), nunca por este script (é só DEV).
