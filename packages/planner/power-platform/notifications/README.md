# Notificações e cobrança automática

## Componentes Dataverse (DEV)

As tabelas abaixo pertencem à solução `AppBetinhos`:

- `cr40f_plannernotificacao` (`cr40f_plannernotificacaos`): tarefa, destinatário, tipo, título, mensagem, ocorrido em, lido em, evento de origem, data de referência e `cr40f_chavededupe`.
- `cr40f_plannerdisparo` (`cr40f_plannerdisparos`): destinatário, canal, categoria, `cr40f_chaveidempotente`, status, tentativa, enviado em, erro e identificador externo.

Antes de ativar os fluxos, crie chaves alternativas para `cr40f_chavededupe` e `cr40f_chaveidempotente`. Conceda ao usuário somente leitura/gravação das próprias notificações; a conta de conexão dos fluxos deve criar notificações e disparos.

## Flow `Planner | Notificação por e-mail - Teste`

Provisionamento versionado: `powershell -ExecutionPolicy Bypass -File scripts/create-planner-email-flow.ps1` (o script atualiza pelo nome, sem duplicar).

Esta primeira versão é deliberadamente restrita ao receptor `noreply@betinhos.onmicrosoft.com`. Ela escuta `notification:test` no fluxo de teste. O fluxo automático operacional escuta somente `notification:overdue_manual`, evitando e-mail para atribuição, menção, status, prazo, aguardando e cobrança diária. Ambos evitam reenvio pela chave `<evento>|<receptor>|<tipo>|Email`, enviam pelo conector Office 365 Outlook e registram o resultado em `cr40f_plannerdisparo` com canal `Email`.

Separação de endereços: `cr40f_emailmicrosoft` identifica o login/conta Microsoft e não deve ser usado como destinatário operacional. O endereço que recebe o e-mail real é `cr40f_emailbetinhos`. O Flow automático usa somente esse campo; não existe fallback para o login. Quando ele estiver vazio, o disparo é registrado como `Sem endereço de e-mail` e nenhum e-mail é enviado.

O Flow de teste continua usando o receptor fixo `noreply@betinhos.onmicrosoft.com`, procurando o funcionário de teste pelo campo `cr40f_emailbetinhos` apenas para manter o lookup de auditoria.

O teste usa a conexão de solução `new_sharedoffice365_f87d5`, confirmada no DEV. Não há resolução para destinatários reais nesta etapa.

No Planner, `Configurações` exibe o **Módulo de teste de notificações** somente como envio real quando o Dataverse está conectado. O usuário escolhe uma tarefa, o tipo e a mensagem; o clique grava o evento controlado `notification:test`. O push usa o funcionário vinculado ao usuário Microsoft atual; o Flow de e-mail de teste continua isolado no receptor `noreply@betinhos.onmicrosoft.com`. No modo local, o botão permanece desabilitado.

## Flow `Planner | Push Power Apps Mobile`

Provisionamento versionado: `powershell -ExecutionPolicy Bypass -File scripts/create-planner-immediate-flow.ps1 -PowerAppsNotificationConnectionReferenceLogicalName <logical-name> -PowerAppsAppUniqueName cr40f_ModelDrivenBetinhos` (o script valida o app no ambiente atual e envia ao conector o `uniquename` com tipo `AppModule`, sem GUID fixo).

1. Gatilho Dataverse: linha adicionada em `cr40f_plannertarefaevento`, escopo Organização.
2. Eventos com push: `notification:test`, `notification:assignment`, `notification:mention`, `notification:waiting`, `notification:overdue_manual`, adição de responsável em `notification:assignees` e cobranças diárias `notification:deadline` com `collectionType` `due_today` ou `overdue`.
3. Interpretar `cr40f_valornovo` como JSON. O produtor grava `actorEmployeeId`, `creatorEmployeeId`, `previousAssigneeIds`, `assigneeIds` e, para menção, `mentionedEmployeeIds`.
4. Destinatários: responsáveis novos para `notification:assignment` e `notification:assignees`; menções usam `mentionedEmployeeIds`; cobrança manual usa `notificationRecipientIds`; cobrança diária usa o responsável principal. `notification:test` usa o funcionário vinculado ao usuário Microsoft atual. O autor é removido e os IDs são deduplicados.
5. Para cada destinatário, montar chave `<evento>|<destinatario>|<tipo>|PowerAppsPush` e consultar `cr40f_plannernotificacao` por `cr40f_chavededupe`. Criar somente quando ausente.
6. Resolver `cr40f_funcionarios.cr40f_usuariodataverse` e `systemuser.internalemailaddress` ativo.
7. Com identidade, executar **Send push notification V2** para o app model-driven `AppBetinhos`, com `openApp=true` e `payload/dynamicParams/entityLogicalName=cr40f_plannertarefa`. O conector exige a tabela para salvar o Flow. Sem `recordId`, o push não tenta abrir o formulário da tarefa, que havia mostrado uma tela vazia no Power Apps Mobile. A navegação após o toque ainda exige validação no dispositivo; a tarefa segue acessível pelo Planner e pela caixa de notificações.
8. Registrar `PowerAppsPush` em `cr40f_plannerdisparo` com status Enviado (`100000001`), Falha (`100000002`) ou Sem identidade (`100000003`). Teams, e-mail e `SendAppNotification` permanecem canais separados.

O destinatário precisa abrir o AppBetinhos no Power Apps Mobile uma vez, autenticar e permitir notificações no Android/iOS. Push é entregue na lista de notificações do celular; `SendAppNotification` é central/toast in-app e depende do app em execução/sincronização.

## Flow `Planner | Cobrança diária`

Provisionamento versionado: `powershell -ExecutionPolicy Bypass -File scripts/create-planner-daily-flow.ps1` (o script atualiza pelo nome, sem duplicar).

1. Recorrência semanal: segunda a sexta, 08:00, fuso `America/Sao_Paulo`.
2. Buscar tarefas não concluídas/canceladas e o lookup de responsável principal em `cr40f_cr40f_funcionarioresponsavel_value`.
3. Classificar usando a data local:
   - `due_today`: prazo igual a hoje;
   - `overdue`: prazo menor que hoje;
   - cobrança começa no vencimento e repete em cada dia útil enquanto a tarefa estiver aberta;
   - no primeiro dia útil após o vencimento, incluir também o criador.
4. Criar uma notificação interna por tarefa/destinatário/tipo/data. Chave: `<destinatario>|<tarefa>|<tipo>|<yyyy-MM-dd>`. O mesmo ciclo cria um evento `notification:deadline` para acionar push e Toast/central Model-driven sem duplicar a linha da caixa.
5. Enviar e-mail somente na segunda-feira, como resumo semanal. Não enviar e-mail diário para `due_today` ou `overdue`.
6. A cobrança diária é materializada somente para o responsável principal; o resumo semanal de segunda também é enviado somente a ele. Consultores continuam recebendo os eventos imediatos previstos na matriz. Sem tarefas, nenhum resumo é enviado.
7. Link de cada tarefa: `new_TelaPlanner.html?data=taskId=<guid>`; o CTA geral abre o Planner.
8. Registrar o disparo semanal por funcionário com chave `<funcionário>|<yyyy-MM-dd>|ResumoSemanal|Email` e os mesmos estados do fluxo imediato.

## Connection references

Os flows devem usar referências de conexão da solução para Dataverse, Power Apps Notification V2, Teams e Office 365 Outlook. Não gravar URL de ambiente, token ou credencial nas definições.

## Validação DEV obrigatória

- Reprocessar o mesmo evento e a mesma recorrência sem duplicar linhas.
- Confirmar push Power Apps Mobile com o app fechado e dois usuários reais.
- Confirmar toque no push abrindo o AppBetinhos com navegação funcional no dispositivo; conferir a tarefa pela caixa de notificações do Planner.
- Confirmar `Sem identidade` com funcionário sem `cr40f_usuariodataverse`.
- Confirmar isolamento de notificações entre criador, responsável e terceiro.
- Confirmar retry e erro final em `cr40f_plannerdisparo`.
- Confirmar que uma cobrança manual da mesma tarefa não é aceita duas vezes no mesmo dia.
- Gerar `notification:test` e conferir `PowerAppsPush/Enviado` em `cr40f_plannerdisparo`.
- Reprocessar o mesmo evento e confirmar que a chave idempotente impede um segundo push.
