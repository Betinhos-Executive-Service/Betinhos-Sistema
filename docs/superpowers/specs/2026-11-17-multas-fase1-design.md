# Multas, fase 1: prazos, avisos, passo a passo e tarefa no Planner

Data: 17/11/2026. Decisões de Renan e Júnior na conversa de 16 e 17/11/2026.
Documento do processo (sem tecnicalidade): https://claude.ai/artifact/PGwNyU3MAXTZ6oFgnsi7j8

## 1. Contexto

O processo de multas foi revisto do zero com o Júnior, que é dono do processo e também cuida do RH. O que os dados do PROD mostraram em 16/11/2026:

- Há multas com o prazo de indicação vencido ainda em "Notificar" ou "Notificado". Parte delas já está com "Indicado = Sim", mas o status nunca foi atualizado.
- Já houve NIC.
- O pagamento das guias não aproveita o desconto do SNE.
- "Descontado" é usado como fim de qualquer multa.
- O termo de multa nunca foi usado.

Os números ficam só no documento do processo, que é privado.

O Júnior vê as multas no portal da Senatran 1 ou 2 vezes por semana. A rotina dele no Claude in Chrome (uma skill na conta dele) cadastra as multas pelo MCP do Dataverse do PROD. O aviso ao motorista é feito pelo WhatsApp, com um dossiê: serviço do dia, rastreador e notificação.

A prioridade dele é **nunca perder prazo**. Ele recebe avisos por e-mail diário. O Renan pediu passo a passo "sem pra onde fugir" e uma tarefa automática no Planner para cada multa.

As 5 fases são:
1. Prazos e avisos (esta spec).
2. Desconto do mês e planilha da contabilidade.
3. Motorista resolve no app.
4. Entrada pelo e-Frotas.
5. Reincidência e Dashboard.

## 2. Objetivo e escopo

Nenhuma multa nova fica sem dono nem passa do prazo sem resposta.

**Entra nesta fase:**
- O passo a passo guiado da multa, com regras no servidor.
- O passo obrigatório quando o prazo vence.
- A tarefa no Planner para cada multa nova.
- O e-mail diário "Multas de hoje".
- A lista "pagar com 40%" a partir dos dados que a rotina do SNE preenche.
- A mensagem pronta para o WhatsApp com o dossiê.
- O ajuste da rotina do SNE.

**Fica fora:**
- A sugestão automática do condutor (fase 3).
- As parcelas e a tela de desconto do mês (fase 2).
- O termo no app (fase 3; o painel do termo fica escondido nesta fase).
- O e-Frotas (fase 4).
- A reincidência e o Dashboard (fase 5).
- A assinatura no celular para DSV e prefeituras (decisão: continuam no papel).
- O caso do locatário (raro).
- O fluxo completo de recurso (fica só um registro).

## 3. Etapas e passos

As etapas usam a coluna `cr40f_status` de `cr40f_multas`. Os valores continuam os mesmos e só os rótulos mudam; entra uma opção nova. Os registros que já existem não são migrados.

| Etapa | Valor | Rótulo anterior | Passos, nesta ordem |
|---|---|---|---|
| 1. Identificar o responsável | 202410000 | Notificar o Condutor | `DefinirResponsavel`: motorista (lookup `cr40f_motorista`), ou Empresa com motivo "culpa da empresa" |
| 2. Indicar no órgão | 202410004 | Condutor Notificado | a) `AvisarMotorista`, que grava `cr40f_datadeavisoaocondutor`; b) `RegistrarIndicacao` com canal e data, que grava `cr40f_canalindicacao` e `cr40f_datadeindicacao`; c) só quando o canal é Senatran, `RegistrarAceite`, que grava `cr40f_aceiteem` |
| 3. Pagar | 202410001 | Indicada | Sem `cr40f_vencimento` a multa fica em "aguardando penalidade" e não há passo. Com vencimento: `RegistrarPagamento` com data, valor pago e comprovante opcional |
| 4. Acertar | 202410006 | Pago | `RegistrarAcerto`: "lancei na folha" com o mês (`cr40f_competenciadesconto`), ou "empresa assume" com motivo |
| Encerrada | 202410005 | Finalizado | — |
| Em recurso | 202410002 | Recurso | `Recorrer` e `ResultadoRecurso` (deferido encerra; indeferido volta para Pagar). Mínimo |
| Cancelada | novo | — | `Cancelar` com motivo, a partir de qualquer etapa aberta |
| Descontado (antigo) | 202410003 | Descontado | Vale como encerrada. Não recebe gravação nova |

**Responsável.** Entra a coluna nova `cr40f_responsavel` (Motorista ou Empresa) com `cr40f_motivoempresa` (Prazo perdido ou Culpa da empresa). "Empresa assume" no acerto também grava esse motivo.

Nas multas antigas, o responsável vazio é mostrado a partir do `cr40f_motorista`. Isso inclui os funcionários de mentira "Empresa" e "Locatário".

Quando o responsável é Empresa, o passo `AvisarMotorista` não existe e o canal de indicação não é pedido: a etapa 2 é pulada e a multa vai direto para Pagar. Ao registrar o pagamento de uma multa da Empresa, o acerto ("empresa assume", com o motivo que já está gravado) é preenchido automaticamente e a multa encerra sem passar pelo passo de acerto.

**Prazo vencido.** O passo é obrigatório. Ele aparece quando a etapa é 1 ou 2 e `cr40f_dataparaindicar` é anterior a hoje (fuso de Brasília). Enquanto ele não for respondido, é o único passo aceito, e tem duas saídas:
- `PrazoVencido{indicou: true, data, canal}`: grava a indicação e segue para Pagar.
- `PrazoVencido{indicou: false}`: grava responsável Empresa com motivo "prazo perdido" e segue para Pagar, porque a empresa paga a guia.

**Próximo prazo**, usado na tela, na tarefa e no e-mail:
- etapas 1 e 2: `cr40f_dataparaindicar`;
- Pagar: `cr40f_vencimento`;
- Acertar: nenhum prazo.

## 4. Dados (uma migration)

`packages/deploy/migrations/AAAAMMDD-HHMM-multas-fase1.ps1`. É idempotente e só acrescenta.

**`cr40f_multas`, opções do status:** os rótulos novos da tabela acima e a opção "Cancelada".

**`cr40f_multas`, colunas novas:**

| Coluna | Tipo | Valores |
|---|---|---|
| `cr40f_responsavel` | choice | Motorista, Empresa |
| `cr40f_motivoempresa` | choice | Prazo perdido, Culpa da empresa |
| `cr40f_canalindicacao` | choice | Senatran, DSV Digital, Prefeitura |
| `cr40f_aceiteem` | data | |
| `cr40f_vencimento` | data | |
| `cr40f_valorcomdesconto` | moeda | |
| `cr40f_valorpago` | moeda | |
| `cr40f_pagaem` | data | |
| `cr40f_comprovantepagamento` | arquivo | |
| `cr40f_pdfpenalidade` | arquivo | |
| `cr40f_competenciadesconto` | data | 1º dia do mês |
| `cr40f_acertoem` | data | |
| `cr40f_encerradaem` | data | |
| `cr40f_canceladaem` | data | |
| `cr40f_motivocancelamento` | texto | |

Os arquivos de autuação que já existem (`cr40f_autodainfracao`) continuam sendo o PDF da notificação de autuação.

**`cr40f_funcionarios`:** `cr40f_recebeemailmultas` (sim/não).

**`cr40f_plannertarefa`:** lookup `cr40f_multa` → `cr40f_multas` e a opção "Multa" em `cr40f_origem`.

**Variável de ambiente:** `cr40f_MultasTravaModo`, com os valores `observar` (padrão) e `travar`.

## 5. Servidor (`Cr40f.Frota.Plugin`)

### 5.1 Regras da multa

Uma classe pura (`MultaEtapas`) concentra:
- a etapa;
- os passos pendentes da etapa;
- se o passo dado é válido;
- o próximo prazo;
- se o prazo venceu.

O shell tem um espelho em `apps/shell/src/pages/frota/domain/multaEtapas.ts`. Um teste de paridade com fixture JSON garante que os dois são iguais, no mesmo modelo de `paridade.test.ts` e `Fixtures/paridade.json`.

### 5.2 Custom API `cr40f_PassoMulta`

- **Entrada:** `MultaId` (guid), `Passo` (texto) e `DadosJson`.
- **Saída:** `MultaJson`, com etapa, passos pendentes, próximo prazo e prazo vencido.
- **Execução:** roda como quem chama. `executeprivilegename` = privilégio de gravar `cr40f_multas`.
- **Validação:** valida o passo com `MultaEtapas`, grava os campos do passo e avança a etapa quando a etapa fica completa.
- **Recusa:** com uma mensagem que diz o que fazer, por exemplo: "Avise o motorista antes de registrar a indicação."

### 5.3 Trava (pre-operation em Create e Update de `cr40f_multas`)

- **Campos de passo:** status, responsável, motivo, canal, as datas dos passos, valor pago, competência e motivo de cancelamento. Só mudam quando a gravação vem da `cr40f_PassoMulta`. A origem é conferida no `ParentContext`, que o cliente não consegue forjar.
- **Campos livres:** dados da notificação, vencimento, valor com desconto, PDFs e comentários.
- **Create:** exige `cr40f_novacoluna` (número do auto). Recusa número que já existe. Coloca o status em 202410000. O motorista é aceito sem mudar a etapa.
- **Modo `observar`:** não recusa nada. Escreve no trace o que recusaria e de onde veio a gravação.
- **Modo `travar`:** recusa.
- **Correção de dados por administrador:** usa o bypass nativo de lógica customizada.

### 5.4 Tarefa no Planner (post-operation síncrono em Create e Update de `cr40f_multas`)

Grava com o serviço do sistema. O modelo é o flow `checklist-planner.json`.

- **Criação.** Só no Create, ou seja, só para multas criadas depois da virada. Antes de criar, procura `cr40f_codigoorigem eq 'MULTA:<id>'` para não duplicar.
  - Responsáveis: a equipe Planner "Frota", com o principal primeiro e os membros. As relações gravadas são `cr40f_plannertarearesponsavel`, `cr40f_plannertarefaequipe`, `cr40f_EquipePlanner` e o responsável principal.
  - Eventos: "Tarefa criada." (100000000) e o evento de atribuição `notification:assignment` (100000003). O plugin `PlannerTaskEventNotificationPlugin`, que já existe, dispara o sininho.
- **Sincronia.** Em todo Update da multa que tenha tarefa:
  - **Título:** `Multa <auto> · <placa> · <próximo passo>`.
  - **Prazo:** o próximo prazo, às 12:00Z.
  - **Prioridade:** urgente com 3 dias ou menos (ou vencido), alta com 7 dias ou menos, média nos demais casos.
  - **Checklist:** `cr40f_checklistjson` com os passos e o estado de cada um.
  - **Descrição:** link `#/frota-multas?registro=multa:<id>`.
  - **Histórico:** um evento de mudança a cada etapa nova.
- **Fechamento.** A tarefa vai para Concluída (100000003) quando a multa fica Encerrada ou Cancelada. Se alguém concluir a tarefa com a multa aberta, a próxima sincronia a reabre.
- **Falha.** Uma falha na tarefa não pode impedir a gravação da multa: o erro vai para o trace e a sincronia seguinte tenta de novo. Fica em aberto no plano decidir se esse passo vai para um step assíncrono.
- **Não duplicar a cobrança.** O aviso de "vence hoje" e "atrasada" continua com a cobrança diária do Planner, que já existe.

### 5.5 Custom API `cr40f_MultasDoDia` (só leitura)

- **Entrada:** `Hoje`.
- **Saída:** `MultasJson`, com as seções do e-mail e as mesmas regras de 5.1.
- **Abrangência:** cobre todas as multas abertas, inclusive as antigas, que não têm tarefa.

### 5.6 Dossiê para o WhatsApp

Uma Custom API de leitura que devolve, para a multa, três coisas:
- o serviço da agenda daquela placa no horário da infração (cliente e horário);
- as viagens do Infleet em ±30 minutos, com o motorista;
- os dados da notificação.

A parte do Infleet reaproveita a coleta de evidências do termo: `EvidenciaInfleet.Coletar` em `Betinhos.DriverRecordSharing/TermoMultaCommandPlugin.cs`, com o token `infleet.token`. Por isso esta API fica no assembly `Betinhos.DriverRecordSharing`, com o nome `new_DossieMulta`. O shell monta o texto da mensagem a partir do retorno.

## 6. E-mail "Multas de hoje" (flow novo)

- **Quando:** dias úteis às 07:00, fuso de Brasília.
- **Dados:** chama a `cr40f_MultasDoDia`.
- **Para quem:** um e-mail para cada funcionário ativo com `cr40f_recebeemailmultas = true`. No começo, só o Júnior.
- **Seções**, nesta ordem. Cada linha tem o número do auto, a placa, o responsável, o prazo e o link para a multa (`new_URLSistemaBetinhos` + `#/frota-multas?registro=multa:<id>`):
  1. Prazo vencido: responda.
  2. Indicar até 7 dias, com o passo que falta.
  3. Aceite pendente na CNH Digital: indicada pela Senatran há 2 dias ou mais sem aceite.
  4. Pagar com 40% em até 5 dias.
  5. Aguardando acerto: a contagem, com link para a visão.
- **Sem itens:** não envia.
- **Falha:** Try/Catch que avisa `new_EmailAdminAvisos`, como em `frota-pendencias-semanal.json`.
- **Script:** `packages/deploy/provision-flow-multas-do-dia.ps1` com `flows/multas-do-dia.json`, mapeado em `flows-dev.mjs`. O flow é criado à mão uma vez no DEV, e depois o script e o Deploy o atualizam.
- **Resumo diário:** sai a linha de multa de `provision-flow-resumo-diario.ps1`, inclusive da função `Conferir`.

## 7. Shell

**Drawer da multa** (`frota/components/RegistroDrawer.tsx`, com componente novo `MultaPassoAPasso`). O modelo visual é a barra de etapas de `QuoteManagementDrawer.tsx`.

- **Topo:** número do auto, placa, responsável e próximo prazo. A cor é âmbar com 7 dias ou menos e vermelha quando vencido.
- **Barra de etapas:** cada etapa feita mostra a data, e a atual tem `aria-current="step"`.
- **Passo atual:** só ele fica aberto. O botão só libera com os campos obrigatórios preenchidos. Ele chama a `cr40f_PassoMulta` e mostra a recusa do servidor como está.
- **Passos feitos:** aparecem em resumo, só para leitura.
- **Prazo vencido:** ocupa o passo inteiro, com as duas saídas.
- **Avisar o motorista:** o botão "Copiar mensagem" monta o texto com o dossiê da 5.6 e trata a falha do clipboard selecionando o texto. Depois vem "Avisei".
- **Menu "Mais":** Cancelar e Em recurso, com motivo.
- **Dados e arquivos:** ficam recolhidos.
- **Formulário nativo:** "Abrir formulário" continua no rodapé.
- **O que sai:** os botões "Notificar condutor" e "Gerar contrato de indicação" (`transitions.ts`, os `FlowId` correspondentes e as variáveis `new_FlowUrl*` lidas em `frota/data/dataverse.ts`). O `TermoMultaPanel` fica escondido até a fase 3.

**Lista de multas** (`frota/domain/listas.ts`, `linhas.ts`):
- **Colunas:** auto, data, placa, responsável, etapa, próximo passo e próximo prazo.
- **Visões:**
  - Comigo, a padrão: multas com passo a dar;
  - Prazo vencido;
  - Aguardando penalidade;
  - Aguardando acerto;
  - Encerradas e canceladas;
  - Todas.

**Rótulos:** ficam num lugar só, `frota/data/schema.ts`. `funcionarios/data/schema.ts` e `dashboard/domain/codes.ts` passam a importar de lá. O Dashboard passa a decidir "resolvida" pelo valor, não pelo rótulo.

**Planner:**
- `TaskDrawer.tsx` ganha o botão "Abrir multa" quando a tarefa tem `cr40f_multa`, no mesmo padrão de "Cotação vinculada".
- A conclusão à mão fica bloqueada com a multa aberta, com a mensagem "A tarefa fecha sozinha quando a multa for encerrada", no padrão de `QUOTE_TASK_DONE_BLOCKED`.
- Os mapeadores leem o lookup novo e a origem "Multa".

**Ficha do funcionário:** a aba Multas mostra a etapa e abre o mesmo drawer.

**Mock:** uma multa em cada etapa, uma com prazo vencido e uma aguardando penalidade.

## 8. Rotina do SNE (skill do Júnior)

A versão nova do roteiro fica versionada em `docs/multas/rotina-sne.md`, e o Júnior copia o conteúdo para a skill dele no claude.ai. Mudanças:
1. **Multa nova:** sempre grava número do auto, órgão autuador (código e nome), placa, data e hora, local, código da infração, valor e `cr40f_dataparaindicar`, e anexa o PDF da notificação de autuação. Nunca grava status, responsável, canal nem as datas dos passos.
2. **Multas abertas sem vencimento:** procura a penalidade no portal e grava `cr40f_vencimento`, `cr40f_valorcomdesconto` e `cr40f_pdfpenalidade`.
3. **Duplicata:** se a gravação for recusada por número repetido, a rotina segue para a próxima multa.

## 9. Virada

- **Um PR para a `develop`.**
  - No DEV, o Deploy aplica a migration, o `Cr40f.Frota.Plugin` (APIs e steps pelo registrador `Cr40f.Frota.Registrar`), o `DriverRecordSharing` (`new_DossieMulta`) e a tela.
  - O flow do e-mail é criado à mão no DEV.
- **PROD:** vai por "Publicar soluções", com ensaio no TEST e aprovação do Renan.
- **Antes de ligar no PROD:** conferir se a equipe Planner "Frota" tem o Júnior como responsável principal, e marcar `cr40f_recebeemailmultas` na ficha dele.
- **Multas que já existem:** sem migração de dados e sem tarefa. Ganham os rótulos novos e aparecem no e-mail e em "Comigo".
- **Flows antigos que saem pelas soluções**, conferidos com a skill `verificar-solucoes`: "Flow Notificar Condutor Multas", "Flow Gerar Contrato" e "Flow Notificação Email Multa não Indicada". O último hoje só existe no PROD; antes de removê-lo, conferir se ele está numa das 4 soluções.
- **Trava:** começa em `observar`. O Renan passa para `travar` depois de 1 a 2 semanas sem registro inesperado.
- **Volta atrás:** pôr a trava em `observar`, e se preciso um PR de revert.

## 10. Testes e verificação

- **`Cr40f.Frota.Plugin.Tests`:**
  - cada passo válido e inválido por etapa;
  - prazo vencido e as duas saídas;
  - Empresa pulando a etapa 2;
  - a trava nos dois modos, recusa de duplicata e origem pelo `ParentContext`;
  - a tarefa: criar, não duplicar, sincronizar, fechar e reabrir;
  - as seções da `MultasDoDia`.
- **Paridade C#/TS** de `MultaEtapas`.
- **Shell (vitest):**
  - o passo a passo, que mostra só o passo atual e bloqueia sem os obrigatórios;
  - a mensagem do WhatsApp;
  - as visões da lista;
  - o "Abrir multa" e o bloqueio de conclusão no Planner.
- **Skill nova `verificar-multas`:**
  - no mock, uma multa do começo ao fim e o prazo vencido;
  - no DEV, a mesma multa, a tarefa no Planner sendo criada, atualizada e fechada, o e-mail com as seções e a trava em `observar` registrando uma gravação direta.
- **Prints de antes e depois** do drawer, da lista e da tarefa no Planner.
- **Skills a atualizar:** `verificar-termo-multa` e `verificar-app-termo-multa` passam a dizer que o termo fica escondido nesta fase.

## 11. Pontos a confirmar no plano

- **Dossiê:** qual tabela de serviços da programação liga veículo e data e hora.
- **Tarefa:** se o step da tarefa no Planner fica síncrono, com a falha só no trace, ou vai para um step assíncrono.
- **Flow antigo:** se o "Flow Notificação Email Multa não Indicada" está em alguma das soluções do DEV.
