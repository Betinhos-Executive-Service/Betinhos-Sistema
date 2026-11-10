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
| `Flow Aviso Motorista \| Enviar` | `scripts/provision-aviso-motorista-flows.ps1` | Entrega Power Apps e Web Push em paralelo; grava Enviado, Falhou ou Sem app. Novo que deixou de valer (saiu de Programado ou trocou o motorista) vira Cancelado sem push |
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
6. `scripts/virada-aviso-motorista.ps1 -Apply`: liga o Enviar, cancela o acumulado anterior, liga a Vigia e só então desliga os antigos.

Ordem invertida (flows antigos desligados antes dos novos) deixaria janela sem aviso; o script não faz isso. Durante alguns segundos pode sair push em dobro.

No DEV, "Novo Serviço" e "Retirado" já estão em rascunho (06/11/2026); só "Resetar" está ligado. O snapshot da virada guarda isso e a reversão respeita.

### Reversão

`scripts/virada-aviso-motorista.ps1 -Reverter -Apply` religa os antigos que estavam ligados e desliga os novos, nessa ordem. Exige o snapshot em `backup/aviso-motorista/` do mesmo checkout em que a virada rodou. Os steps seguem ativos; para tirar o plugin de cena, desative os três steps `DriverRecordSharing - Aviso motorista ...`.

A proteção provisória dos flows antigos (`scripts/patch-flow-troca-motorista.ps1`) foi removida depois da virada no PROD (09/11/2026): os flows antigos ficaram desligados e o script só valia para eles.

## PROD

**Executado em 09/11/2026.** Publicação 42665223806 do Sistema Betinhos (Core 1.0.0.20, Automacao 1.0.0.19, Interface 1.0.0.18); referência `new_webpushmotoristas` vinculada depois do import pelo dono da conexão (`WEBPUSH_VINCULAR_DEPOIS`, Sistema #342); virada às 16:21 (Brasília): `Enviar` e `Vigia` ligados, "Novo Serviço", "Retirado" e "Resetar" desligados. Teste real na OS-11965: Novo e Retirado enviados, motorista sem app como Sem app.

Estado antes, lido em 06/11/2026, só leitura: BetinhosCore, Automacao, Interface e Motoristas instaladas (03/11) sobre a AppBetinhos 1.0.0.268; "Novo Serviço", "Retirado" e "Resetar" ligados; tabela e flows novos ausentes; 3 operadores; 26 serviços Programado futuros.

### Caminho

O PROD recebe pelo workflow **Publicar soluções** do Sistema Betinhos (as 4 soluções, ensaio no TEST, backup e aprovação do Renan). `scripts/deploy-prod.ps1` importa a AppBetinhos inteira e não restaura estados: **não use nesta entrega**.

Toda mudança na `main` do Sistema Betinhos que não seja só tela ou plugin dispara esse workflow. Com a distribuição zerada, **a próxima publicação aprovada leva o aviso ao motorista junto**, mesmo sem ninguém pedir.

### O que a publicação faz sozinha

- `restaurar-estados.ps1` devolve o estado da foto de antes do import: os 3 flows antigos seguem ligados no PROD, embora desligados no DEV.
- Flows novos chegam desligados e pedem conexão.
- Os 3 steps novos ficam ativos com o import. Tabela e referências vêm antes, porque Core e Automacao importam nessa ordem.

Logo: **depois do import a regra da visualização já vale, os antigos seguem entregando e os avisos acumulam em Pendente.** Não há janela sem aviso.

### Antes de aprovar

1. **Web Push (bloqueante):** ver a seção abaixo.
2. **Teste no celular** feito no DEV.
3. **Operadores:** os 3 passam a receber os alertas da Vigia, sem silêncio noturno, além do "Serviço Não Visualizado" que continua ligado.
4. **Janela:** faça a virada no mesmo dia do import, em horário de pouco movimento.

### Web Push: bloqueia a publicação em uma etapa só

Lido em 06/11/2026: no PROD não existem o conector `App Motoristas Web Push`, a referência `new_webpushmotoristas` nem a tabela `new_inscricaopushmotorista`, e "Novo Serviço" e "Retirado" ainda não têm Web Push. No DEV os dois flows já têm, e isso vale para toda publicação, não só para o aviso.

Por isso a conexão não pode ser criada antes de publicar: ela depende do conector, que está na BetinhosCore. E publicar tudo de uma vez leva "Novo Serviço" e "Retirado" ligados a uma referência sem conexão: **eles podem não religar, e o PROD ficaria sem aviso nenhum**. Isso não foi testado; no TEST a referência existe sem conexão e o flow está desligado, o que não prova nem descarta o risco.

**Decisão do Renan (06/11/2026):** provar no ensaio. Com o TEST recém-copiado do PROD, depois do import tente ligar "Novo Serviço" à mão e depois devolva o estado. Só libere o PROD se ligar. Se não ligar, siga a ordem abaixo.

Ordem se o risco se confirmar:

1. Publicar só a `BetinhosCore` (input `solucoes`): traz conector e tabelas, sem steps nem flows.
2. Renan cria a conexão no PROD, com o segredo do Worker.
3. Vincular a referência a essa conexão no import da `BetinhosAutomacao`, por `--settings-file`. Exige ajuste em `importar-solucoes.ps1`, no Sistema Betinhos, porque hoje o import não passa essa configuração.
4. Ensaiar no TEST e publicar o restante.

### Roteiro

1. `pac admin backup` do PROD e cópia PROD → TEST, como manda a promoção das soluções.
2. Publicar `alvo=test`. No TEST, flows e steps novos ficam desligados; confira comparação sem perda.
3. Publicar `alvo=prod` com o rótulo do backup. Confira no resumo que os 3 flows antigos seguem ligados e que `Flow Aviso Motorista | Enviar` e `| Vigia` aparecem em `fluxosNovosDesligados`.
4. Vincule as conexões dos dois flows no PROD.
5. Faça a virada na ordem abaixo. Todo passo é ação no PROD e precisa do OK do Renan.
   1. Ligar `Enviar`.
   2. Cancelar os avisos Pendente e Sem app criados antes de ligar.
   3. Ligar `Vigia`.
   4. Desligar "Novo Serviço", "Retirado" e "Resetar". Se falhar, religue os que desligou.
6. Em seguida, uma troca real numa reserva combinada com a operação: Novo e Retirado em Enviado, e uma rodada da Vigia com sucesso.

`virada-aviso-motorista.ps1` faz o passo 5, mas é bloqueado no PROD por `assert-dev-environment.ps1`. Liberar exige `BETINHOS_ALLOW_DIRECT_PROD=1` numa execução decidida pelo Renan; a alternativa é o portal, seguindo a mesma ordem. Depois, rode `audit-prod-layers.ps1` para confirmar que nada ficou em camada Active.

### Reversão

Religue os 3 antigos e depois desligue `Enviar` e `Vigia`, nessa ordem. Com a falha do plugin bloqueando gravações, desative os 3 steps `DriverRecordSharing - Aviso motorista ...`: é o que mais importa, porque esse erro impede salvar reservas.

## Modelos de flow

Sete `provision-*.ps1` leem a definição de "Novo Serviço | Motoristas" para copiar as referências de conexão. Eles leem o `clientdata`, que existe com o flow desligado. **Desligar não quebra; excluir quebra.** Mantenha "Novo Serviço", "Retirado" e "Resetar" desligados, sem excluir.

## Como verificar

Skill `.claude/skills/verificar-aviso-motorista/SKILL.md`.
