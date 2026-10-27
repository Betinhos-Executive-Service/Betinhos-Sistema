---
name: verificar-flow-servico-editado
description: "Verifica o patch do 'Flow Notificação Serviço Editado | Interno e Motoristas': coluna editada correta na notificação, sem disparo por colunas fora da lista. Use após mudar packages/deploy/patch-flow-servico-editado.ps1 ou antes de levar o patch ao PROD."
---
# Verificar flow Notificação Serviço Editado

## Cobre
- `packages/deploy/patch-flow-servico-editado.ps1` sobre o flow `3a12fce1-ec26-f111-88b4-7ced8da87663` (mesmo id no DEV, não gerenciado, e no PROD, gerenciado pela AppBetinhos).

## Problema que o patch resolve
- `filteringattributes` do gatilho tinha espaços duplos e quebra de linha: o flow disparava em qualquer update (troca de motorista/veículo etc.).
- `Compose_campo` lia o último registro de auditoria sem relação com a edição e só o primeiro atributo (nome técnico, ex.: `cr40f_veiculo`).
- Edição sem coluna de interesse e fora da janela de horário terminavam `Cancelled` (33 de 50 execuções no PROD em 27/10/2026).
- Depois: filtro limpo; espera de 15 s (a auditoria grava depois do gatilho); `Filter_auditoria` pega os registros de -3 s a +10 s do `modifiedon` (o `$filter` com `createdon` no conector devolve 0 linhas); `Compose_campo` lista todas as colunas de interesse com rótulo; sem coluna de interesse encerra `Succeeded` sem notificar.

## Roteiro (só DEV)
1. `powershell -File packages/deploy/patch-flow-servico-editado.ps1` → lista mudanças e termina em `DRY RUN` (ou `já está no formato final`).
2. `... -Apply` → backup em `packages/deploy/flows/backup/Flow-ServicoEditado-DEV-*.json`; flow ativo é desligado, gravado e religado.
3. Ligar o flow no DEV (`statecode = 1`). Destinatário do DEV: só conta `onmicrosoft` (conferir `new_notificacoesoperacionais`).
4. Usar a reserva de teste OS-1927 (`5125e169-a0c9-f111-a05c-7ced8da8c473`, status 202410001, sem motorista) via PATCH em `cr40f_reservadeveculoses`, com 25 s entre edições:
   - saída para agora+1h → campo "Data e horário de saída";
   - destino + observações juntos → "Destino, Observações da operação";
   - `cr40f_email` → nenhuma execução.
5. Ler as execuções (API do Flow, resource `https://service.flow.microsoft.com/`): `Filter_auditoria` com 1 linha, `Compose_campo` conforme acima, `Send_push_notification_V2` Succeeded.
6. Restaurar a OS-1927 (saída 2026-10-17T14:00Z, destino "Aeroporto de Congonhas (TESTE UX AUDIT)", obs e e-mail nulos).
7. Reverter: `... -Apply -Restaurar <backup>`.

## Cuidados
- O guard de acentuação do script ignora "AMANHÃ" (texto legítimo do flow).
- PROD só com autorização explícita; o script é só DEV e o PROD precisa do mesmo patch dentro da solução.
