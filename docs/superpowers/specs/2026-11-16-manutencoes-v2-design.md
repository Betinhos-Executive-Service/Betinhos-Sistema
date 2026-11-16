# Manutenções v2: encaixe, programação na Geral e um caminho só para concluir (design)

16/11/2026. Decisões do Renan na sessão de revisão do processo de manutenções.

## Por que existe

A revisão partiu de duas dores: **o dia a dia da operação** (pedir, encaixar, programar e fechar se perde) e **o desenho técnico** (peças fora do repositório e regras duplicadas). O retrato de hoje:

- O sistema supõe aprovar, depois programar com data e hora. Na prática, o gestor de frota só **encaixa** o pedido num dia ou numa semana, e quem define motorista, dia e hora é o **gestor de operação**, na Geral.
- Aprovar chama o flow "Agendar manutenção" (`new_FlowUrlManutencao`), que não está no repositório e cria o item da Geral (`cr40f_om`). Uma regra de negócio, também fora do repositório, muda o status quando `cr40f_datadaaprovacao` é gravada, e por isso a tela não grava essa data.
- Existem dois caminhos para Realizado. O App grava as fotos, a nota fiscal e a despesa. O "Concluir" do shell grava só valor, oficina e data, sem despesa.
- Desde que a classificação pela Jev saiu (commit `9079d5f3`), ninguém preenche `new_servicosmanutencao`. Sem esse campo, a preventiva não reconhece o que foi feito, a reincidência não conta e o motor proativo perde efeito sem avisar.
- A finalização no App não pede o km. "Dinheiro" e "Pedido de compra" gravam o mesmo código (`202410001`).
- A tela de Pendências e a Custom API `cr40f_FrotaPendencias` contam "agendada" de jeitos diferentes, então os totais do e-mail e da tela não batem.

## Quem usa

- **Motorista** (App): pede a manutenção, leva o carro, paga e finaliza. Às vezes quem leva não é quem pediu.
- **Gestor de frota** (shell, Frota): vê os pedidos e encaixa cada um num dia ou numa semana. Encaixar é aprovar; não há aprovação por valor nem orçamento. Também pode abrir manutenção.
- **Gestor de operação** (shell, Geral): define motorista, dia e hora dentro da janela, como faz com os serviços.
- **Financeiro**: confere a despesa depois, no fluxo de despesas que já existe.

## Decisões

1. Encaixar é aprovar: um passo só, de Solicitado para Agendado.
2. A janela é um dia ou uma semana, de **segunda a domingo**.
3. **Uma linha na Geral por manutenção** (abordagem 2). Ela guarda só a programação: quando e quem. Tudo o que é da manutenção (problema, fotos, valor, serviços) fica em `cr40f_manutencoes`. O Renan preferia a manutenção só na tabela dela (abordagem 1), mas escolheu a 2 porque a programação se comporta como a de um serviço: push, visualização pelo motorista, agenda do App, ordenação, paginação e agrupamento da Geral já funcionam sobre essa tabela.
4. Na Geral, a linha de manutenção tem **outra cara e outra cor** e aparece entre os serviços, no lugar da data (desenho B). Cada visão tem um liga/desliga "Mostrar manutenções".
5. O motorista **não vê nem é avisado** até a manutenção ser programada. O push sai **só quando ela é programada com o nome dele**, pela regra que os serviços já usam.
6. O gestor de frota trabalha na **Frota › Manutenções**, com uma fila "A encaixar" e uma gaveta.
7. Janela vencida sem conclusão fica **atrasada**: continua na Geral e na agenda e entra nas Pendências da Frota.
8. **Quem finaliza escolhe os serviços** realizados (catálogo) e informa o km. O gestor pode corrigir a classificação depois.
9. **Um caminho só para Realizado:** o App e o shell concluem pela mesma Custom API, com os mesmos campos, e criam a mesma despesa.

## Ciclo de vida

```
Solicitado ──gestor de frota encaixa (dia | semana)──▶ Agendado ──gestor de operação programa (motorista, dia, hora)──▶ Programado
   │                                                    ▲   │                                                              │
   │                                                    └───┴──── reagendar (nova janela; tira o motorista) ◀──────────────┤
   │                                                                                                                       │
   ├──▶ Reprovado (comentário obrigatório)                          motorista finaliza no App, ou escritório no shell ─────┴──▶ Realizado
   └──▶ Cancelado (de qualquer estado antes de Realizado)
```

| Estado (`cr40f_status`) | Código | Como chega | Quem | O que aparece |
|---|---|---|---|---|
| Solicitado | `0` | pedido no App ou no shell | motorista ou gestor de frota | fila "A encaixar" na Frota |
| **Agendado** (hoje "Aprovado"; muda só o rótulo) | `202410001` | `Agendar` | gestor de frota | linha "a programar" na Geral, no 1º dia da janela; o motorista não vê |
| Programado | `202410005` | linha da Geral programada com motorista (espelho) | gestor de operação | agenda do motorista e push só para ele |
| Realizado | `202410002` | `Concluir` | motorista (App) ou escritório (shell) | despesa criada; linha da Geral concluída |
| Reprovado | `100000002` | `Reprovar` | gestor de frota | a linha da Geral, se existir, é cancelada |
| Cancelado | `100000001` | `Cancelar` | gestor de frota | a linha da Geral, se existir, é cancelada |

- **Atrasada não é um estado.** É calculada: `janela fim` < hoje e estado Agendado ou Programado.
- **Reagendar** grava a nova janela, volta para Agendado e tira o motorista da linha da Geral. O plugin de push que já existe manda "Retirado" a quem estava programado.
- **Trocar o motorista** de uma linha programada faz o motorista novo receber "Novo" e o anterior receber "Retirado". A regra já existe (`DriverNoticeRules`).

## Dados

Todo o schema entra por migration (`packages/deploy/migrations/AAAAMMDD-HHMM-*.ps1`), conforme o README da pasta.

### `cr40f_manutencoes`

- Novas colunas `cr40f_janelainicio` e `cr40f_janelafim` (só data, sem hora). Num encaixe por dia, as duas são iguais.
- Nova coluna `cr40f_kmrealizado` (inteiro): km informado por quem conclui. `cr40f_kmatual` continua sendo o km do pedido. A preventiva passa a usar `cr40f_kmrealizado` quando existir (plano 2).
- `cr40f_status`: o rótulo `202410001` muda de "Aprovado" para "Agendado".
- `cr40f_pagamento`: ganha a opção "Dinheiro" (`202410003`). Na despesa, Dinheiro vira "Particular (Reembolso)", como o Pix. Hoje o App manda Dinheiro para "Cartão de crédito".
- `cr40f_datadaaprovacao` passa a guardar a data do encaixe, gravada por `Agendar`, depois que a regra de negócio "Aprovado" sair.
- `new_servicosmanutencao` e `new_categoriasmanutencao` voltam a ser preenchidos, agora por quem conclui. `new_classificacaoorigem` fica Manual. Hoje essas colunas não têm script no repositório. A primeira migration confere que elas existem e falha com mensagem clara se faltarem, porque o plugin depende delas.
- `cr40f_agendarpara` deixa de ser escrito. A coluna fica, por ter histórico.

### Linha da Geral (`cr40f_reservadeveculos`)

- Categoria `new_categoriadoitem` = Manutenção (`100000001`), ligada pelo lookup `cr40f_om`.
- Guarda o veículo e a saída (`cr40f_dataehorriodesada`), que fica no início da janela até a programação e depois na data e hora programadas. Guarda também motorista, status e `new_foiprogramado`, como nos serviços.
- Não guarda problema, foto nem valor.
- **No máximo uma linha ativa por manutenção.** `Agendar` reaproveita a linha que já existe.

## Regras no servidor

Ficam no `Cr40f.Frota.Plugin`, que já tem registrador (`Cr40f.Frota.Registrar`), testes e publicação pelo Deploy (secret `PLUGIN_SNK_FROTA`). Cada ação é uma Custom API ligada à manutenção. Nenhuma depende de flow.

| Custom API | Entrada | O que faz |
|---|---|---|
| `cr40f_ManutencaoAgendar` | janela início e fim, comentário opcional | Aceita Solicitado, Agendado ou Programado. Cria ou atualiza a linha da Geral: veículo, saída = início da janela, sem motorista, não programada (se estava programada, tira o motorista). Grava a janela, `cr40f_datadaaprovacao` (só no primeiro encaixe), o comentário e o status Agendado. |
| `cr40f_ManutencaoReprovar` | comentário (obrigatório) | Só a partir de Solicitado. Grava Reprovado e cancela a linha da Geral, se houver. |
| `cr40f_ManutencaoCancelar` | comentário | Vale em qualquer estado antes de Realizado. Grava Cancelado e cancela a linha da Geral. |
| `cr40f_ManutencaoConcluir` | serviços (um ou mais), km, data, valor > 0, pagamento, estabelecimento, cidade, comentário, quem realizou, links da nota fiscal e das fotos finais (já enviados) | Numa só transação: grava a manutenção como Realizado (com serviços, categorias derivadas do catálogo e origem Manual), cria ou atualiza a despesa da categoria Manutenção ligada por `cr40f_manutencao` e conclui a linha da Geral. Devolve o id da despesa e o estado do anexo: quem chamou sobe a nota fiscal na despesa (arquivo não passa pela Custom API), como o App já faz hoje. **Repetir é seguro:** se já estiver Realizado, só garante a despesa e a linha concluída. |

**Espelho da programação:** um step pós-operação no Update da linha da Geral, filtrado por `cr40f_status` e `cr40f_motorista`, só na categoria Manutenção.
- Status Programado e motorista preenchido → a manutenção vira Programado.
- Saiu de Programado (sem estar concluída nem cancelada) → a manutenção volta a Agendado.
- Não muda manutenção Realizada, Reprovada ou Cancelada.

**Programar fora da janela:** a Geral avisa, mas não bloqueia.

**Saem:** o flow "Agendar manutenção" e a variável `new_FlowUrlManutencao`, a regra de negócio "Aprovado", a transição "Programar" do shell e a escrita de `cr40f_agendarpara`.

## Shell

### Frota › Manutenções (`apps/shell/src/pages/frota`)

- **Fila "A encaixar"**: manutenções Solicitado, ordenadas por grau (Urgente primeiro) e, dentro do grau, pela mais antiga.
- **Gaveta da manutenção**, uma só, usada pela Frota e pela Geral. Mostra o pedido, as fotos e o histórico, e oferece:
  - **Encaixar ou reagendar:** Dia | Semana (seg–dom) e comentário ao motorista → `Agendar`.
  - **Reprovar** (comentário obrigatório) e **Cancelar**.
  - **Concluir:** os mesmos campos do App, inclusive o envio da nota fiscal e das fotos finais pelo caminho de fotos que já existe → `Concluir`.
  - **Corrigir a classificação** (o que já existe em `ClassificacaoManutencao.tsx`).
- **"Nova manutenção"**: gaveta própria no lugar do formulário nativo. O gestor pode abrir e já encaixar.
- `domain/transitions.ts` passa a refletir o ciclo novo. A proteção contra gravação concorrente (`StaleError`) continua.

### Geral (`apps/shell/src/pages/geral`)

- As linhas de categoria Manutenção são desenhadas diferente: barra e fundo laranja, ícone, "Manutenção · veículo", problema, grau, janela e status. Os dados da manutenção vêm de um `link-entity` por `cr40f_om`, que o código acrescenta à visão.
- O motorista e a data/hora de saída ficam editáveis como nos serviços. Os demais campos de serviço não aparecem nessas linhas.
- Selo **"atrasada"** quando a janela passou.
- Clicar na linha abre a gaveta da manutenção.
- **"Mostrar manutenções"**: liga/desliga salvo na visão, que entra no FetchXML como condição de `new_categoriadoitem`. Vem ligado nas visões de programação e desligado nas demais (faturamento, por exemplo).
- Ordenação, paginação, contagem e "Agrupar por" não mudam.

### Pendências, e-mail semanal e agente

- "Aprovar" vira **"A encaixar"**.
- "Agendada" (vencida ou nos próximos 7 dias) vira **"Atrasada"** (janela vencida).
- "Programar" sai. É tarefa da operação, na Geral.
- "Prioridade parada" conta a partir de `createdon` enquanto Solicitado, e de `cr40f_datadaaprovacao` depois do encaixe.
- A tela (`domain/pendencias.ts`) e a Custom API (`Regras.cs`) passam a contar igual, com a paridade conferida em `Fixtures/paridade.json`. O tipo de proposta `FrotaAgendadaVencida` do agente passa a se chamar `FrotaAtrasada`.
- A preventiva continua como está. Ela volta a funcionar porque `new_servicosmanutencao` passa a ser preenchido na conclusão.

## App Motoristas

- **Finalizar** (`features/finalizar`, `maintenanceFinalize.ts`):
  - **Serviços realizados**: obrigatório, um ou mais, numa lista agrupada por categoria, com o mesmo catálogo de `manutencaoCatalogo.json`.
  - **Km na finalização**: obrigatório. Avisa, sem bloquear, se for menor que o km do pedido.
  - **"Dinheiro"** passa a ser uma opção de pagamento própria.
  - As fotos e a nota fiscal sobem como hoje. Em seguida o App chama `cr40f_ManutencaoConcluir` e deixa de gravar o status, a despesa e a conclusão da Geral por conta própria. A fila offline (`features/envio-pendente`) continua: a chamada pode ser repetida.
- **Agenda e push**: nada muda. Já leem a linha da Geral com `cr40f_om`, e o push já sai na programação.
- **Pedido**: nada muda (continua só com internet).

## Virada

1. **Conversão dos registros em aberto**, por um script idempotente ensaiado no DEV. Primeiro roda **só gerando um relatório**, depois grava:
   - Aprovado com linha da Geral → Agendado, com janela = dia da saída da linha.
   - Linha programada com motorista → Programado, com janela = dia da saída.
   - Programado sem linha da Geral, mais de uma linha ativa, ou linha sem veículo → só entra no relatório, para decisão do Renan.
2. Retirar a regra de negócio "Aprovado" e o flow "Agendar manutenção" do DEV, e depois das soluções, para que cheguem ao PROD pelo caminho normal.
3. Atualizar `docs/auto/04-contratos-dados-shell.md` (ainda cita `new_FlowUrlClassificarManutencao` e diz que `new_fotomanutencao` não é usada) e a documentação do App.

## Entrega

PRs separados na `develop`, nesta ordem:

1. **Schema e servidor:** migrations, as quatro Custom APIs, o espelho e os testes em C#.
2. **Shell › Frota:** fila "A encaixar", gaveta, "Nova manutenção", Concluir pelo shell, Pendências alinhadas com a Custom API, e paridade e agente atualizados.
3. **Shell › Geral:** linha de manutenção, selo "atrasada" e liga/desliga.
4. **App:** finalizar com serviços, km, Dinheiro e a Custom API.
5. **Virada:** conversão, retirada do flow e da regra de negócio, documentação. Só depois de 1 a 4 verificados no DEV.

## Testes e verificação

- **C#** (`Cr40f.Frota.Plugin.Tests`):
  - transições permitidas e recusadas de cada Custom API;
  - `Agendar` reaproveita a linha e tira o motorista ao reagendar;
  - `Concluir` repetido não duplica despesa;
  - o espelho ignora manutenção encerrada e linhas de outras categorias.
- **Shell (Vitest):**
  - `transitions`, fila "A encaixar" e cálculo de "atrasada";
  - desenho da linha de manutenção na Geral e liga/desliga gravado na visão;
  - paridade das Pendências com a Custom API.
- **App (Vitest):** validação da finalização (serviços, km, Dinheiro) e repetição da chamada pela fila offline.
- **DEV:** nova skill `verificar-manutencoes` com o ciclo completo: pedir no App, encaixar na Frota, programar na Geral, conferir o push, finalizar no App, conferir a despesa e a linha concluída, e forçar uma "atrasada".

## Fora desta revisão (próximos passos)

- Cadastro de oficinas (hoje `cr40f_estabelecimento` é texto livre).
- Abrir manutenção a partir do "Não OK" do checklist.
- Pedido de manutenção offline no App.
- Plano preventivo por veículo.
- Avisar o gestor de frota quando chega um pedido novo.
- Reunir as fotos num lugar só: hoje ficam nas colunas da manutenção, em `new_fotomanutencao` e em `cr40f_provamidia`.
