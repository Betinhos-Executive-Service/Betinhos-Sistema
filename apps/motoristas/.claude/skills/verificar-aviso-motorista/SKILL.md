---
name: verificar-aviso-motorista
description: "Verifica o aviso de troca de motorista: DriverNoticePlugin (zerar visualização na mesma gravação e outbox new_avisomotorista), flows Enviar e Vigia e a virada dos flows antigos. Use após mudar plugins/DriverRecordSharing/DriverNotice*, scripts/*aviso-motorista*, ou ao publicar a virada."
---
# Verificar aviso ao motorista

## Cobre
- Código: `plugins/DriverRecordSharing/DriverNoticePlugin.cs`, `DriverNoticeRules.cs`, `DriverNoticeWriter.cs`.
- Testes: `plugins/DriverRecordSharing.Tests/DriverNoticePluginTests.cs`.
- Scripts: `packages/deploy/provision-aviso-motorista.ps1`, `packages/deploy/provision-flow-aviso-motorista.ps1`, `scripts/virada-aviso-motorista.ps1`.
- Contrato e ordem de publicação: `docs/virada-aviso-motorista.md`.

## Regras que não podem quebrar
- Motorista mudou (qualquer status, qualquer caminho, inclusive limpar): `new_visualizacaodomotorista` zera no Target da pré-operação, sem Update extra. Regravar o mesmo motorista não zera.
- Serviço com `cr40f_ot`: não mexe em `new_foiprogramado`; quem projeta é o ciclo da troca de carro.
- Falha ao criar o aviso derruba a gravação (`[DRIVER_NOTICE_FAILED]`). Não troque por try/catch silencioso.
- O aviso nasce com o serviço de sistema (`CreateOrganizationService(null)`), nunca com o usuário que salvou.
- A Vigia reenvia voltando o aviso para Pendente: o texto do push mora só no Enviar.
- Janela da saída (`docs/vigia-janela-saida.md`): reenvio só ao motorista 4 h antes (grava `new_reenviadoem`), alerta à operação 3 h antes; nunca antes de `new_prazovisualizacao`; horário entre 22h e 6h vai para 20h/21h da véspera. Falhou e Sem app de aviso Novo esperam a hora do alerta; Retirado e Pendente parado (por `modifiedon`) alertam na hora.
- O `-Apply` dos flows recusa sem a coluna `new_reenviadoem` e só desliga o flow antigo "Flow Notificação Serviço Não Visualizado | Interno e Motoristas" com a Vigia ligada.
- A tabela vem antes dos steps: `push-dev.ps1` provisiona antes de publicar o plugin, e o registro recusa sem ela.
- Virada: novo liga antes de antigo desligar; reversão no sentido inverso. Flows antigos ficam desligados, nunca excluídos (sete scripts leem "Novo Serviço" como modelo).

## Preparar ambiente
- Copie `plugins/DriverRecordSharing/DriverRecordSharing.snk` (gitignored) do checkout principal para o worktree; não gere chave nova.

## Roteiro local
1. `cd plugins/DriverRecordSharing.Tests && dotnet test -v q --filter DriverNoticePluginTests` → `Com falha: 0`.
2. Suíte inteira: `dotnet test -v q` → `Com falha: 0`.
3. Dry-run dos três scripts (DEV, só leitura). Para `-EnvironmentUrl` do PROD, cada um deve recusar com `Publicacao direta bloqueada`.

## Roteiro no DEV (depois do merge e do `npm run push` da `main`)
Use uma reserva sem cliente, OT ou manutenção, com saída no futuro (OS-1929 serviu em 06/11/2026), e as contas `TESTE` e `teste 2`, que têm usuário ativo. Motorista com e-mail e sem usuário ativo (`Fulaninho do cruze`) é recusado pelo compartilhamento. Programado sem motorista é bloqueado por regra existente. No DEV o único operador é o Renan. Conclua com a consulta de `new_avisomotoristas` por `_new_reserva_value`.

| Ação | Esperado |
| --- | --- |
| Trocar motorista em Programado (já visualizado) | Visualização vazia na mesma gravação; Novo do novo e Retirado do antigo; Enviar grava Enviado |
| Regravar o mesmo motorista | Nada muda; nenhum aviso |
| Limpar motorista saindo de Programado (na mesma gravação) | Visualização vazia; só Retirado; o Novo vira Cancelado na próxima rodada da Vigia |
| Trocar em Confirmado | Visualização vazia; `new_foiprogramado` false; nenhum aviso |
| Confirmado → Programado | Só Novo |
| Motorista sem `cr40f_emailmicrosoft` | Aviso Sem app; a Vigia alerta a operação uma vez, na hora do alerta (3 h antes da saída) |
| Saída daqui a 6 h, não visualizado | Nada até 4 h antes; aí `new_reenviadoem` preenchido e Enviado de novo; alerta só 3 h antes |
| Saída às 2h, não visualizado | Reenvio às 20h e alerta às 21h da véspera |
| Saída daqui a 1 h, não visualizado | Reenvio e alerta juntos no prazo (aviso + 30 min) |
| Trocar duas vezes antes de o primeiro ver | Novo do primeiro vira Cancelado |
| Prazo vencido sem visualizar | Operação alertada, push reenviado, `new_alertadoem` preenchido, um único alerta |
| Motorista abre o serviço | Próxima rodada da Vigia: Visto com `new_vistoem` |
| Serviço sai de Programado | Próxima rodada: Cancelado |

## Não verificável só com código
Entrega real do push no celular. Plugin, flows, `$expand`, alertas e reenvio foram provados no DEV em 06/11/2026.

## Evidência
Saída do `dotnet test`, dos dry-runs e, no DEV, as linhas de `new_avisomotoristas` e as execuções dos dois flows.
