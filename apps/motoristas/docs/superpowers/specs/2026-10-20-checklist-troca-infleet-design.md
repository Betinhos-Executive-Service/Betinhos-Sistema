# Checklist na troca de carro detectada pela Infleet (entrega 2 de 3)

Data: 20/10/2026 · Depende da entrega 1 (`2026-10-20-checklist-ok-nao-ok-design.md`).

## Objetivo

Quando a Infleet mostrar que um carro da frota própria passou para outro motorista, quem **recebe** o carro ganha na hora um checklist, que registra quem **entregou**. Isso responde "em que estado o carro chegou depois do fulano", que é a base da entrega 3.

## Decisões

| Tema | Decisão |
|---|---|
| Gatilho | Mudança de motorista detectada pela Infleet. A sincronização existente (`new_SincronizarVeiculoAtual`, a cada 5 min) já grava `cr40f_veiculoatual` no funcionário. A troca é essa mudança, com origem Infleet. |
| Onde roda | Plugin novo `HandoverChecklistPlugin`, **assíncrono**, no Update de `cr40f_funcionarios.cr40f_veiculoatual` (com pré-imagem). Roda fora da transação da sincronização: uma falha no checklist não desfaz a sincronização e fica no log do job assíncrono. |
| Quem fez | Só quem recebe (o funcionário atualizado). |
| Quem entregou | Histórico de motorista do veículo na Infleet (`listVehicleDriverHistories`): o motorista anterior ao atual, mapeado para o funcionário por `new_infleetdriverid`. Se não der para identificar, o campo fica vazio e o checklist é criado assim mesmo ("Entregue por: não identificado"). |
| Filtros | Só veículo de frota própria (`new_propriedade` = Próprio, como no quinzenal). Ignora se o veículo novo estiver vazio, se o motorista anterior for o mesmo de quem recebe, ou se já existir checklist de troca para o mesmo veículo e recebedor nas últimas **2 h** (evita duplicar quando a Infleet oscila). |
| Checklist pendente do veículo | Um checklist que ainda não foi concluído é cancelado com o motivo "Substituído pelo checklist da troca", e o novo é criado para quem recebeu. |
| Prazo do quinzenal | Um checklist de troca concluído conta como vistoria e reinicia os 15 dias do veículo. |
| Push | O mesmo do quinzenal (`new_pushstatus` Pendente → flow existente). Texto: "Você recebeu o carro ABC1D23. Faça o checklist de recebimento." |

## Schema (`provision-checklists.ps1`)

- `new_origem`: nova opção **100000002 "Troca"**.
- `new_checklistveiculo`: `new_entreguepor` (lookup para `cr40f_funcionarios`, opcional) e `new_trocadetectadaem` (data/hora).
- Step assíncrono do `HandoverChecklistPlugin`, com filtering attribute `cr40f_veiculoatual`, registrado pelo `push-dev.ps1`. A configuração segura usa o mesmo token Infleet do `SyncCurrentVehiclePlugin`.

## Reuso

A criação do checklist (snapshot do modelo ativo, responsável e push) sai do `ChecklistCommandPlugin` para uma classe `ChecklistFactory`, usada pelo quinzenal, pelo manual (Solicitar) e pela troca. O gateway Infleet (`InfleetGraphQlGateway`) ganha `PreviousDriver(vehicleId, at)`.

## App Motoristas e Gestão

- App: o card do checklist mostra "Recebimento do carro · entregue por Fulano" quando a origem é Troca.
- Gestão: a coluna Origem mostra "Troca", e o detalhe mostra "Entregue por" e o horário da troca. O filtro por origem inclui Troca.

## Riscos

- A Infleet só vê o motorista que se identificou no rastreador. Se ninguém se identificar, não há troca detectada, e o quinzenal continua cobrindo o veículo.
- Identificação errada (outro motorista se identificando por engano) gera checklist indevido. A Gestão pode cancelar, e a janela de 2 h reduz o vai e volta.
- Atraso de até 5 min (intervalo da sincronização) mais o tempo da fila assíncrona.

## Testes

- Unidade (C#): decisão de criar ou ignorar (frota própria, mesmo motorista, janela de 2 h, veículo vazio), cancelamento do pendente e entregador não identificado.
- DEV: simular a troca atualizando `cr40f_veiculoatual` de um funcionário de teste. Conferir o checklist criado (origem Troca, entregue por), o push no flow e o card no app.
