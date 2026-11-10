# Vigia pela janela da saída (plano, 10/11/2026)

Motivo: a Vigia alerta a operação 30 min depois do aviso, mesmo com a saída no dia seguinte (prints da Deborah, 10/11 12:20: OS-11345, OS-11416, OS-11418 e OS-11953, todas saindo em 11/11). O flow antigo "Serviço Não Visualizado" ainda repete o alerta 1 h antes da saída.

## Regras novas (decisões do Renan, 10/11/2026)

Se o motorista visualizar a qualquer momento, nada mais sai.

1. **Aviso:** push na hora em que o serviço é programado para o motorista (sem mudança).
2. **Reenvio ao motorista:** 4 h antes da saída, só para ele.
3. **Alerta à operação:** 3 h antes da saída.
4. **Em cima da hora:** nenhum dos dois sai antes de aviso + 30 min (o `new_prazovisualizacao` gravado pelo plugin, que não muda). Programado às 07:30 para sair às 10:00: reenvio e alerta às 08:00. Saída em menos de 2 h: o prazo já vence na hora, e os dois saem na próxima rodada da Vigia.
5. **Madrugada:** se o horário calculado cair entre 22h e 6h (America/Sao_Paulo), antecipa para a véspera: reenvio às 20h e alerta às 21h. Se a véspera já passou (serviço programado depois das 21h para sair de madrugada ou cedo), sai na hora, respeitando o item 4.
6. **Sem silêncio noturno** fora da regra 5.
7. **Flow antigo** "Flow Notificação Serviço Não Visualizado | Interno e Motoristas" desligado. A Vigia fica sozinha.

Em fórmula, com `prazo` = `new_prazovisualizacao`:

- `reenvio = max(prazo, ajuste_noite(saída − 4 h, 20h da véspera))`
- `alerta = max(prazo, ajuste_noite(saída − 3 h, 21h da véspera))`

## Exemplos reais (PROD, 10/11/2026)

| Serviço | Saída | Aviso | Reenvio | Alerta |
| --- | --- | --- | --- | --- |
| OS-11418 | 11/11 17:30 | 10/11 11:44 | 11/11 13:30 | 11/11 14:30 |
| OS-11953 | 11/11 17:00 | 10/11 11:23 | 11/11 13:00 | 11/11 14:00 |
| OS-11967 | 10/11 18:30 | 09/11 19:09 | 10/11 14:30 | 10/11 15:30 |
| OS-11345 | 11/11 08:00 | 10/11 11:22 | 10/11 20:00 | 10/11 21:00 |
| OS-11416 | 11/11 07:30 | 10/11 11:44 | 10/11 20:00 | 10/11 21:00 |

## Implementação

- A regra muda só na Vigia (`packages/deploy/provision-flow-aviso-motorista.ps1`). O plugin não muda.
- O reenvio deixa de depender do alerta e ganha marca própria: coluna `new_reenviadoem` em `new_avisomotorista` (schema à mão no DEV, PROD pelas soluções).
- Os scripts vieram da tag `pre-monorepo` do repositório antigo: schema em `packages/deploy/provision-aviso-motorista.ps1` (coluna `new_reenviadoem`, à mão, antes do primeiro Deploy) e flows em `packages/deploy/provision-flow-aviso-motorista.ps1`, no mapa `packages/deploy/flows-dev.mjs` (o Deploy publica Enviar e Vigia sozinho e recusa se a coluna faltar).
- O reenvio regrava o aviso como Pendente; o alerta de "Pendente parado" passa a contar de `modifiedon`, para não alertar no mesmo minuto do reenvio.
- Com a Vigia ligada, o `-Apply` desliga o flow antigo no DEV; o PROD recebe o estado pelas soluções.
- "Falhou" e "Sem app" seguem o mesmo horário do alerta (assumido; hoje alertam na hora).

## Verificação no DEV

- Reserva de teste com saída em 6 h: aviso na hora, reenvio 4 h antes sem notificação à operação, alerta 3 h antes, nenhum alerta do flow antigo.
- Saída em 1 h: reenvio e alerta na primeira rodada da Vigia.
- Saída às 07:30 do dia seguinte programada às 11h: reenvio às 20h e alerta às 21h da véspera.
