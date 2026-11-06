# Aviso ao motorista: virada sem depender da audit

Atualizado em 06/11/2026.

## O problema

Na troca de motorista, "Novo Serviço", "Retirado da Agenda" e "Resetar" liam a tabela `audit` para confirmar a troca. Quando outra gravação entrava logo depois (o DriverRecordSharing grava o veículo), a linha do motorista saía da janela e o flow terminava Cancelled sem agir: motorista novo sem push, antigo sem aviso, e a visualização do antigo ficava no registro, então "Serviço Não Visualizado" nunca alertava.

## Como ficou

| Peça | Onde | Papel |
| --- | --- | --- |
| `new_avisomotorista` | `scripts/provision-aviso-motorista.ps1` | Outbox: um aviso por motorista e evento |
| `DriverNoticePlugin` pré-operação | `plugins/DriverRecordSharing` | Motorista mudou: zera `new_visualizacaodomotorista` e ajusta `new_foiprogramado` na mesma gravação |
| `DriverNoticePlugin` pós-operação | `plugins/DriverRecordSharing` | Cria o aviso na transação da reserva, com o serviço de sistema |
| `Flow Aviso Motorista \| Enviar` | `scripts/provision-aviso-motorista-flows.ps1` | Entrega Power Apps e Web Push; grava Enviado, Falhou ou Sem app |
| `Flow Aviso Motorista \| Vigia` | idem | A cada 10 min: concilia, alerta a operação, reenvia o vencido |

Regras:

- **Visualização:** o motorista mudou, em qualquer status e por qualquer caminho (inclusive limpar o campo): zera na mesma gravação. Regravar o mesmo motorista não zera.
- **Foi Programado:** na troca de motorista vira "status final é Programado", exceto em serviço com `cr40f_ot`, em que quem projeta é o ciclo da troca de carro. Mudança só de status não passa por esta regra (o step filtra `cr40f_motorista`).
- **Novo:** status final Programado, com motorista, e (motorista mudou, ou status passou a Programado, ou Create).
- **Retirado:** motorista mudou, havia motorista antigo e o status anterior era Programado.
- **Sem app:** motorista sem `cr40f_emailmicrosoft`. Não dispara o Enviar; a Vigia alerta a operação.
- **Prazo do Novo:** agora + 30 min; saída em menos de 2 h (ou já passada): agora.
- **Falha ao criar o aviso derruba a gravação** (`[DRIVER_NOTICE_FAILED]`). Decisão aceita: serviço programado sem aviso é o defeito que a tabela elimina.

Situações do aviso (`new_situacao`): Pendente 100000000, Enviado 100000001, Falhou 100000002, Sem app 100000003, Visto 100000004, Cancelado 100000005. Tipo (`new_tipo`): Novo 100000000, Retirado 100000001.

O reenvio da Vigia volta o aviso para Pendente com `new_alertadoem` preenchido: o Enviar dispara de novo e o texto do push fica num lugar só. Pendente parado há mais de 5 min também é regravado como Pendente ao alertar, o que dá uma nova tentativa de entrega. Se o reenvio virar Falhou, não há segundo alerta: `new_alertadoem` já está preenchido.

## Diferença de comportamento

- "Retirado" agora olha o status **anterior**. Troca que tira o serviço de Programado na mesma gravação avisa o antigo; o flow antigo não avisava.
- O dia ("HOJE", "AMANHÃ") do Retirado passou a usar o fuso de São Paulo; o flow antigo comparava com UTC e errava à noite.
- A Vigia não tem silêncio noturno (decisão do Renan).

## Ordem de publicação no DEV

Nada disso sai de branch: o assembly é compartilhado e o `npm run push` sai da `main` atualizada.

1. Merge do PR na `main`.
2. `npm run push` na `main` atualizada. Provisiona a tabela (antes do plugin) e publica o assembly com os 3 steps.
   A partir daqui a regra da visualização já vale, e os avisos acumulam em Pendente sem entrega. Os flows antigos seguem atendendo.
3. `scripts/provision-aviso-motorista-flows.ps1 -Apply`. Cria os dois flows desligados.
4. Autorize as conexões dos flows no maker portal se a ativação pedir.
5. `scripts/virada-aviso-motorista.ps1` (dry-run) e confira `pré-requisitos OK`.
6. `scripts/virada-aviso-motorista.ps1 -Apply`: liga os novos, cancela o acumulado anterior e só então desliga os antigos.

Ordem invertida (flows antigos desligados antes dos novos) deixaria janela sem aviso; o script não faz isso. Durante alguns segundos pode sair push em dobro.

No DEV, "Novo Serviço" e "Retirado" já estão em rascunho (06/11/2026); só "Resetar" está ligado. O snapshot da virada guarda isso e a reversão respeita.

### Reversão

`scripts/virada-aviso-motorista.ps1 -Reverter -Apply` religa os antigos que estavam ligados e desliga os novos, nessa ordem. Exige o snapshot em `backup/aviso-motorista/` da mesma máquina. Os steps seguem ativos; para tirar o plugin de cena, desative os três steps `DriverRecordSharing - Aviso motorista ...`.

A proteção provisória dos flows antigos (`scripts/patch-flow-troca-motorista.ps1`, em PR próprio) perde o efeito com esta virada; depois dela, o script pode ser removido.

## PROD

**Ainda não definido e não executado.** `virada-aviso-motorista.ps1` e os `provision-*` são bloqueados no PROD por `assert-dev-environment.ps1`. O PROD só recebe pela solução AppBetinhos (`scripts/deploy-prod.ps1`).

Risco a resolver antes do primeiro deploy: o estado dos flows pode viajar na solução. Exportar depois da virada no DEV pode levar ao PROD os flows antigos desligados junto com plugin, tabela e flows novos em estados que precisam ser conferidos. Antes do deploy, confirme no zip o estado de cada flow e planeje a ligação dos novos antes do desligamento dos antigos, com as conexões já autorizadas no PROD.

O deploy precisa levar a tabela antes de o plugin ficar ativo; na mesma solução o import resolve a dependência.

## Modelos de flow

Sete `provision-*.ps1` leem a definição de "Novo Serviço | Motoristas" para copiar as referências de conexão. Eles leem o `clientdata`, que existe com o flow desligado. **Desligar não quebra; excluir quebra.** Mantenha "Novo Serviço", "Retirado" e "Resetar" desligados, sem excluir.

## Como verificar

Skill `.claude/skills/verificar-aviso-motorista/SKILL.md`.
