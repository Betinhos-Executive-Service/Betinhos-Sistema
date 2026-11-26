---
name: verificar-flow-tenaris
description: "Verifica os patches do 'Flow Novo Sistema Tenaris -> Dataverse': contatos do passageiro sem apagar (patch-flow-tenaris-contatos.ps1) e lote com pessoas do script, falha por serviço, vínculos por diferença e status por envio (patch-flow-tenaris-lote.mjs, par SyncTenaris v3.9 + MarcarStatusSync v5.6) e Cancelado que passa pela proteção do status (patch-flow-tenaris-cancelado.mjs), mais o aviso 'Cancelado pela Tenaris' da gestão no flow Requer Análise (patch-flow-requer-analise-tenaris.mjs). Use após mudar um deles, os scripts do Excel, ou antes de levar ao PROD."
---
# Verificar flow Tenaris (contatos do passageiro e lote)

## Cobre
- `packages/deploy/patch-flow-tenaris-contatos.ps1` e, por cima dele, `packages/deploy/patch-flow-tenaris-lote.mjs` (teste `patch-flow-tenaris-lote.test.mjs`, fixture `patch-flow-tenaris-lote.fixture.json`) sobre o flow `cbcd9564-1b1e-f111-88b1-7ced8da87540` (mesmo id no DEV, em rascunho, e no PROD, ativo).
- Scripts do Excel `Query dos Sharepoint.xlsx` (fora do repo, instalados à mão): `SyncTenaris_v3.9` (botão) e `MarcarStatusSync_v5.6` (chamado pelo `Run_script`).

## Problema que o patch resolve
- O lote junta Responsável e Passageiros 1-4; o Responsável vem sempre com `telefone: ""`. Quando a mesma pessoa era Responsável e passageiro, o `Update_BD_Existente` gravava o vazio por cima do número (26 apagamentos em 16 passageiros de ago a out/2026 no PROD, todos pelo noreply no horário de uma execução do flow).
- `cr40f_passageirosetelefonedecontato` tem dono único, o plugin DriverRecordSharing (monta a partir de `cr40f_servicosporpassageiro` + `cr40f_bancodedados`). O patch tira esse campo do `Upsert_Geral`; antes flow (" / ") e plugin (";\r\n") se alternavam a cada sincronização. O texto da planilha segue no `new_snapshotsharepoint`.
- Depois do patch: `Filter_Ocorrencias` junta as ocorrências da pessoa no lote, `Compose_Telefone/Email/Departamento` pegam o primeiro valor preenchido, e o update mantém o valor do Dataverse quando o lote vem vazio.
- Issue #350 (falhas sem detalhe): `Compose_PaxDoServico` deixa o `json(concat(...))` (quebrava com aspas, barra ou quebra de linha no nome) e vira array de 4 objetos `guid`/`nome`/`ordem`; o `Scope_1_1` ganha `Filter_Falhas` + `Select_Falhas` (`result()` da condição e dos loops, status `Failed`) e o e-mail de erro traz o link da execução e as ações que falharam com a mensagem.

## Roteiro (só DEV)
0. Teste local, sem Dataverse: `... -Ambiente DEV -Arquivo <backup.json> -Saida <resultado.json>` transforma o arquivo e grava o resultado; confira `Compose_PaxDoServico` (array), `Select_Falhas` e o `runAfter` do e-mail (`Select_Falhas` com todos os estados). `-Arquivo` com `-Apply` deve recusar.
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

## Patch do lote (`patch-flow-tenaris-lote.mjs`)
- Exige o patch de contatos aplicado (`Filter_Ocorr_*`, `Select_Falhas`); senão recusa ("formato esperado"). Patch pela metade também recusa.
- O que muda no flow:
  - Pessoas: sai `Select_Responsável`, `Select_Pax_1..4`, `Compose_TodasPessoas`, `Filter_SemVazios`, `Loop_Dedup`, `Filter_Ocorr*`, `Compose_Telefone/Email/Departamento` e as variáveis `varGUIDsVistos`/`varNomesVistos`/`varPessoasUnicas`. `Loop_UpsertBD` percorre `triggerBody()?['pessoas']`, montado pelo SyncTenaris v3.9 com a mesma regra.
  - Payload sem `pessoas` (SyncTenaris antigo): `Condition_PayloadAntigo` grava "Erro" no painel e termina com "SyncTenaris antigo: instale v3.9 e MarcarStatusSync v5.6".
  - Falha por serviço: o corpo do `Loop_Servicos` fica num `Scope_Servico`; erro vai para `varFalhas` (`Filter_ErroServico` + `Append_to_array_variable_varFalhas`) sem derrubar o lote. Status do painel: "Concluído" se a condição do lote passou, senão "Erro". Há falhas: e-mail de aviso `Send_an_email_Falhas_Servico`, sem `Terminate`.
  - Vínculos: sai `Condition_PaxMudou`; `Select_PaxNativos` + `Filter_VinculosRemover` + `Loop_Delete_Pax` apagam só o passageiro que saiu e `Loop_Create_Pax` cria o que falta. Se algum passageiro do serviço não estiver no `varGUIDMap` (`pessoas` incompleto), o serviço não apaga nada.
  - `Run_script` recebe `executadoEm` e `falhas`; `Scope_1_1` espera o `Run_script`.
- Gatilho sem `runtimeConfiguration` de concorrência e, desde o SyncTenaris v3.8, sem trava no script: dois envios seguidos (clique duplo) rodam juntos no flow.
- Office Scripts transforma o código antes de compilar: o erro `Erro de transpilation: module.ts(L,C)` do `Run_script` aponta linhas do código transformado (coluna +4), não do arquivo. Não aceita tipo entre parênteses no genérico (`new Map<string, (string | number)[]>()` dá TS1005 `'=>' expected`); use `Array<...>`. Toda alteração nos scripts gera versão nova no nome do arquivo e no cabeçalho, e o `Run_script` roda o script do OneDrive do dono da conexão Excel (noreply), não a cópia de quem edita.
- Folga do SyncTenaris v3.9, com corte = F6 (que continua o início da execução):
  - Modified >= corte − 1 h (`FOLGA_SEMPRE_HORAS: 1`): vai sempre. Entre corte − 24 h (`FOLGA_HORAS: 24`) e corte − 1 h: só se o hash da linha diferir do `hashConfirmado` do mesmo ID.
  - Hash: campos do payload menos `Modified` e `DataAtualizacaoPQ` (`FORA_DO_HASH`; o PQ grava `DateTime.LocalNow()` nesta), em ordem de nome, texto aparado.
  - Vão sempre: pendentes de `_pendentes_sync`, linha sem ID e tudo desde "Reenviar desde" (B11), que prevalece se for mais antigo que corte − 24 h.
  - Aba oculta `_hash_sync` (ID, hashConfirmado, confirmadoEm, hashPendente, execucaoPendente), toda em texto e gravada em blocos de 2.000 linhas. O SyncTenaris grava o pendente de cada linha enviada antes do POST. O MarcarStatusSync v5.6 promove a confirmado só com "Concluído", o mesmo `executadoEm` e `falhas` legível, fora os IDs em `falhas`; na mesma gravação tira IDs com a última data além de 15 dias.
  - Log do SyncTenaris: "Início efetivo do filtro" e "pulados por hash". Diagnóstico do MarcarStatusSync: `hash: N confirmado(s), M removido(s)`.
  - Logo depois de instalar, a aba está vazia: a primeira execução reenvia a folga inteira de 24 h uma vez.
  - Testes dos scripts (fora do repo, porque os scripts têm `URL_FLOW` com `sig=`): pasta `testes-tenaris` em Downloads do desktop `renan-H410M-H` (fora do repo), `node extrair.mjs && node --experimental-strip-types --no-warnings --test scripts.test.ts`.

## Roteiro do lote (só DEV)
0. Testes (da raiz do repo): `node --test packages/deploy/patch-flow-tenaris-lote.test.mjs`. Teste local sobre uma cópia do flow: `node packages/deploy/patch-flow-tenaris-lote.mjs --arquivo <clientdata.json> --saida <resultado.json>` (rodar de novo sobre o resultado diz que já está no formato final).
1. Simulação: `node packages/deploy/patch-flow-tenaris-lote.mjs --ambiente DEV` → lista as mudanças, sem gravar.
2. Pré-requisito: `MarcarStatusSync_v5.6` instalado na planilha. O `Run_script` do DEV e do PROD aponta para o mesmo script da `Query dos Sharepoint.xlsx`, e o conector recusa salvar o flow com parâmetro que o script não declara (`WorkflowOperationParametersExtraParameter` para `ScriptParameters/executadoEm`; visto no DEV em 18/11/2026). Aplicar: `... --ambiente DEV --apply` → backup em `packages/deploy/flows/backup/Flow-Tenaris-DEV-*.json` e conferência do formato final relendo o flow.
3. Validar a definição: PATCH `workflows(<id>)` com `statecode = 1, statuscode = 2` no DEV deve responder sem erro; volte para `statecode = 0, statuscode = 1`.
4. Não rode o flow do DEV de ponta a ponta (o `Run_script` grava na planilha real).
5. Reverter: `... --ambiente DEV --apply --restaurar <backup>`.

## Ordem de instalação no PROD (tudo no mesmo dia, nesta ordem, sem sync no meio)
- Atenção: o flow está na `BetinhosAutomacao` (e na `AppBetinhos`) do DEV (conferido em 18/11/2026 por `solutioncomponents`), então o patch aplicado no DEV vai ao PROD no próximo "Publicar soluções" (que também retira a camada Active), independente desta ordem. Só deixe um develop → main pelo caminho das soluções seguir com os passos 1 e 2 já feitos no Excel.
1. `MarcarStatusSync_v5.6` no Excel: parâmetros novos são opcionais, então o flow atual continua funcionando (fecha a última "Aguardando", como o v5.4).
2. `SyncTenaris_v3.9` no Excel, mantendo o `URL_FLOW` do v3.6: o flow atual ignora `pessoas`/`versao` (gatilho sem validação de schema) e segue montando as pessoas.
3. Patch do flow: `node packages/deploy/patch-flow-tenaris-lote.mjs --ambiente PROD --apply --confirmar-prod` (só com autorização explícita). Daqui em diante um v3.6 que sobrar recebe "SyncTenaris antigo" no painel e nada é gravado.
- Prova: no próximo sync, linha do `_historico_sync` fechada pelo `executadoEm` (diag do `Run_script` começa com `v5.6`), `pessoas` no corpo do gatilho, nenhum `Delete_a_row` em serviço sem troca de passageiro. Com falha num serviço: e-mail de aviso, painel "Concluído" com a contagem e o ID na aba oculta `_pendentes_sync`; o próximo sync o reenvia ("só por pendência" no log).

## Cancelado passa pela proteção (`patch-flow-tenaris-cancelado.mjs`, 26/11/2026)
- O que faz: troca só `item/cr40f_status` do `Upsert_Geral`. Com `cr40f_status` em `new_camposprotegidos`, o Cancelado (202410002) e o Requer Análise (100000001) vão mesmo assim; os outros status regravam o atual. A Tenaris marca o cancelamento como **Requer Análise** (nas execuções do PROD desde 21/10/2026 nunca veio "Cancelado"). Quem decide é o `Cr40f.Protecao.Plugin`, protegido ou não: se o snapshot anterior não tinha Cancelado nem Requer Análise (cancelamento novo), aberto vira Requer Análise com a marca e fechado (Concluído, Requer Análise, Cancelado, Cancelado com ressalvas) não muda; se já tinha, nada muda (não desfaz a reabertura da equipe). Spec: `docs/features/tenaris-cancelado-requer-analise/spec.md`.
- Formatos: `original` → `so-cancelado` (primeira versão, só 202410002, aplicada no DEV em 26/11/2026 15:02) → `final`. O script leva os dois primeiros ao final.
- Testes: `node --test packages/deploy/patch-flow-tenaris-cancelado.test.mjs` (usa a fixture do lote com a expressão real injetada; formatos antigo, pós-lote e `so-cancelado`).
- Simulação: `node packages/deploy/patch-flow-tenaris-cancelado.mjs --ambiente DEV` → `status do Upsert_Geral: original|so-cancelado` e `DRY RUN`, ou `Já aplicado`. Expressão fora do formato → recusa sem gravar (o flow mudou à mão: compare antes de forçar).
- Aplicar: `--apply` (backup em `packages/deploy/flows/backup/`, mantém o statecode); voltar: `--apply --restaurar <backup.json>`. O PROD recebe pelas soluções (BetinhosAutomacao), sem rodar o script lá.
- Prova ponta a ponta sem rodar o flow (o `Run_script` grava na planilha real): numa OS de teste Programada com `new_camposprotegidos` contendo `cr40f_status` e um motorista, cujo `new_snapshotsharepoint` atual tenha `"cr40f_status":"202410005"` (ou outro não cancelado), PATCH com `cr40f_status = 100000001` e `new_snapshotsharepoint` com `"cr40f_status":"100000001"` → status Requer Análise, `cr40f_cancelamentocliente = Programado`, aviso Cancelado ao motorista (`verificar-push-motorista`, item 6e) e o "Flow Notificação Novo 'Requer Análise' | Interno" acionado. Volte a OS para Programado pela tela e repita o mesmo PATCH (snapshot anterior já RA) → status e marca não mudam. Repita com 202410002, numa OS sem proteção e numa Concluída.

## Aviso "Cancelado pela Tenaris" da gestão (`patch-flow-requer-analise-tenaris.mjs`, 26/11/2026)
- O que faz: no "Flow Notificação Novo \"Requer Análise\" | Interno" (`3b12fce1-...`), o gatilho passa a `cr40f_status,cr40f_cancelamentocliente` / `cr40f_status eq 100000001 or (cr40f_status eq 202410008 and cr40f_cancelamentocliente ne null)`; a condição roda com motorista **ou** com a coluna; o GetItem do motorista vira `Listar_Motorista` (ListRecords com GUID zerado quando falta motorista); push e notificação usam `Compose_Mensagem_Padrao` (texto antigo) ou `Compose_Mensagem_Tenaris` pela coluna, e o título vira "Cancelado pela Tenaris". A coluna é gravada pelo `Cr40f.Protecao.Plugin` (rótulo do status anterior; "Concluído" uma vez) e limpa quando a equipe muda o status.
- Testes: `node --test packages/deploy/patch-flow-requer-analise-tenaris.test.mjs` (fixture do DEV com e-mails trocados).
- Simulação: `node packages/deploy/patch-flow-requer-analise-tenaris.mjs --ambiente DEV` → `formato atual: original|final`. Volta: `--apply --restaurar <backup>` (backup `Flow-RequerAnalise-*` em `packages/deploy/flows/backup/`).
- Prova: depois do Deploy (a coluna precisa existir), ligue o flow no DEV e repita a prova acima; confira a `appnotification` com título "Cancelado pela Tenaris", "Estava: Programado · Agora: Requer Análise" e o motorista com "(avisado no App)"; numa OS sem motorista, "Motorista: sem motorista"; numa OS Concluída protegida, "Agora: Concluído (status mantido)" e, na segunda sincronização, nenhuma notificação nova. Desligue o flow de novo no fim (no DEV ele fica em rascunho).
