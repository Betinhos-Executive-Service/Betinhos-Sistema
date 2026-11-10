---
name: verificar-flow-tenaris
description: "Verifica o patch do 'Flow Novo Sistema Tenaris -> Dataverse' que impede o telefone/e-mail/departamento do passageiro (cr40f_bancodedados) de ser apagado pela sincronização. Use após mudar packages/deploy/patch-flow-tenaris-contatos.ps1 ou antes de levar o patch ao PROD."
---
# Verificar flow Tenaris (contatos do passageiro)

## Cobre
- `packages/deploy/patch-flow-tenaris-contatos.ps1` sobre o flow `cbcd9564-1b1e-f111-88b1-7ced8da87540` (mesmo id no DEV, em rascunho, e no PROD, ativo).

## Problema que o patch resolve
- O lote junta Responsável e Passageiros 1-4; o Responsável vem sempre com `telefone: ""`. Quando a mesma pessoa era Responsável e passageiro, o `Update_BD_Existente` gravava o vazio por cima do número (26 apagamentos em 16 passageiros de ago a out/2026 no PROD, todos pelo noreply no horário de uma execução do flow).
- `cr40f_passageirosetelefonedecontato` tem dono único, o plugin DriverRecordSharing (monta a partir de `cr40f_servicosporpassageiro` + `cr40f_bancodedados`). O patch tira esse campo do `Upsert_Geral`; antes flow (" / ") e plugin (";\r\n") se alternavam a cada sincronização. O texto da planilha segue no `new_snapshotsharepoint`.
- Depois do patch: `Filter_Ocorrencias` junta as ocorrências da pessoa no lote, `Compose_Telefone/Email/Departamento` pegam o primeiro valor preenchido, e o update mantém o valor do Dataverse quando o lote vem vazio.
- Issue #350 (falhas sem detalhe): `Compose_PaxDoServico` deixa o `json(concat(...))` (quebrava com aspas, barra ou quebra de linha no nome) e vira array de 4 objetos `guid`/`nome`/`ordem`; o `Scope_1_1` ganha `Filter_Falhas` + `Select_Falhas` (`result()` da condição e dos loops, status `Failed`) e o e-mail de erro traz o link da execução e as ações que falharam com a mensagem.
- Identificação (duplicados de 18/08/2026 e homônimo de outro cliente): `List_rows_BancodeDados_Completo` filtra `_cr40f_cliente_value` pela Tenaris (sem paginação: a licença do dono do flow limita a 5.000, e a Tenaris tem ~700); `Filter_BDLocal`, `Condition_unico` (barra nome já visto, além do GUID), `varNomesVistos` e `Filter_FindGUID*` comparam `toLower(trim(nome))`; `Filter_FindGUID` aceita GUID ou nome.
- Solicitante e e-mail (11/2026): `Filter_array_Solicitante_First` procura no `varGUIDMap` o Responsável da linha (`guidTenaris` = `Responsável - GUID` ou `guidNome` = `Responsável - Nome`, sem maiúsculas/espaços); linha sem Responsável continua com o passageiro 1. `Filter_BDLocal` acha o cadastro pelo nome ou pelo e-mail (`Compose_Email`); `Update_BD_Existente` mantém o `cr40f_nomedopassageiro` do cadastro e `Append_to_array_variable_varGUIDMap_2` guarda o nome do lote em `guidNome`. Os 44 e-mails já duplicados não são unidos.
- Desempenho (11/2026): `Update_BD_Existente` fica dentro de `Condition_BD_Mudou` e só roda quando telefone, e-mail ou departamento do lote (preenchidos) diferem do cadastro, a classificação não é 202410000 ou o nome está vazio; `Append_to_array_variable_varGUIDMap_2` roda depois da condição com `guidNativo` do `Filter_BDLocal`. `List_rows_Cliente` lê só a Tenaris (`$filter contains(cr40f_nomedocliente,'Tenaris')`, `$select` do id e do nome). O Power Query da planilha (fora do repositório) busca só os itens alterados nos últimos 15 dias.

## Roteiro (só DEV)
0. Teste local, sem Dataverse: `... -Ambiente DEV -Arquivo <backup.json> -Saida <resultado.json>` transforma o arquivo e grava o resultado; confira `Compose_PaxDoServico` (array), o `$filter` da Tenaris sem `runtimeConfiguration` de paginação (acima de 5.000 o salvamento falha com `InvalidPaginationPolicy`), `Select_Falhas`, o `runAfter` do e-mail (`Select_Falhas` com todos os estados), `Filter_array_Solicitante_First` com `Responsável - Nome` e `Filter_BDLocal` com `cr40f_email`, `Condition_BD_Mudou` no else de `Condition_nome_nao_existe_ainda` e `List_rows_Cliente` com `$filter`; rodar de novo sobre o resultado deve dizer `já está no formato final`. `-Arquivo` com `-Apply` deve recusar.
1. Simulação: `powershell -File packages/deploy/patch-flow-tenaris-contatos.ps1 -Ambiente DEV` → lista as mudanças e termina em `DRY RUN`, ou diz `já está no formato final ... nada a alterar` se já aplicado.
2. Aplicar: `... -Ambiente DEV -Apply` → backup em `packages/deploy/flows/backup/Flow-Tenaris-DEV-*.json` e `atualizado (statecode 0)`.
3. Validar a definição no Power Automate: PATCH `workflows(<id>)` com `statecode = 1` no DEV deve responder sem erro; volte para `statecode = 0` em seguida (o flow do DEV fica em rascunho).
4. Não rode o flow do DEV de ponta a ponta: o `Run_script` grava o status na planilha real `Query dos Sharepoint.xlsx`.
5. Reverter: `... -Ambiente DEV -Apply -Restaurar <backup>`.

## PROD (só com autorização explícita e depois do plugin DriverRecordSharing com `HasTextChange` publicado)
- `... -Ambiente PROD` (simulação) e `... -Ambiente PROD -Apply -ConfirmarProd`.
- Prova do #350: na próxima falha, o e-mail de erro chega com o link da execução e a lista `acao`/`codigo`/`mensagem`.
- Prova do depois: na auditoria de `cr40f_bancodedados` (objecttypecode 10802), nenhuma mudança de `cr40f_telefone` de número para vazio pelo noreply após a próxima execução do flow.

## Evidência
- Saída do dry run, linha do backup e resposta da ativação/desativação no DEV.
