---
name: verificar-checklists-backend
description: "Verifica o backend do checklist de vistoria de veículo: plugin ChecklistCommandPlugin, validação de respostas, script de schema/Custom APIs, papel e smoke em DEV. Use após mudar plugins/DriverRecordSharing/Checklist*, scripts/*checklists* ou o trecho de checklists do push-dev.ps1."
---
# Verificar backend do checklist de vistoria

## Cobre
- Código: `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs`, `plugins/DriverRecordSharing/ChecklistAnswers.cs`, testes em `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs`.
- Scripts: `scripts/provision-checklists.ps1`, `scripts/provision-checklist-flows.ps1`, `scripts/grant-checklists-role.ps1`, `scripts/smoke-checklists-dev.ps1`, bloco de checklists em `scripts/push-dev.ps1`, lista de tabelas em `scripts/schema-index.cjs`.
- Custom APIs: `new_SolicitarChecklistVeiculo`, `new_ProcessarChecklistsVeiculos`, `new_ReatribuirChecklistVeiculo`, `new_ConcluirChecklistVeiculo`, `new_CancelarChecklistVeiculo`, `new_ReenviarPushChecklist`.
- Plano: `docs/superpowers/plans/2026-10-19-checklist-vistoria-veiculo.md`.

## Preparar ambiente
- Chave de assinatura do plugin: o build exige `plugins/DriverRecordSharing/DriverRecordSharing.snk` (gitignored). Em worktree, copie do checkout principal: `cp "<checkout principal>/plugins/DriverRecordSharing/DriverRecordSharing.snk" plugins/DriverRecordSharing/`.
- Dataverse DEV: `https://org23b93544.crm2.dynamics.com`, token MSAL.PS em cache (ClientId do projeto, `-Silent`). Sem cache, os scripts pedem login interativo; use `-DeviceCode` no provisionamento.
- Memória: com pouca RAM livre o PowerShell/MSAL falha com `OutOfMemoryException` ou "Falha ao inicializar o thread" e o testhost do dotnet aborta. Confira a memória livre e repita.

## Roteiro
1. Testes do checklist:
   `cd plugins/DriverRecordSharing.Tests && dotnet test --filter "FullyQualifiedName~ChecklistCommandPluginTests" --logger "trx;LogFileName=checklist.trx" --results-directory <pasta de evidência>`
   → `Com falha: 0`; o TRX tem todos os `outcome="Passed"`.
2. Suíte inteira do plugin (protege comunicados/trocas): `dotnet test -v q` → `Com falha: 0`.
3. Sintaxe dos scripts: `[System.Management.Automation.Language.Parser]::ParseFile` em cada `.ps1` acima → 0 erros; `node --check scripts/schema-index.cjs` → sem saída.
4. Dry-run em DEV (somente leitura): `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-checklists.ps1` → termina em `[checklists] DRY RUN concluido.`. Antes de aplicar: 4 tabelas, 5 relacionamentos e 1 chave aparecem como "criaria". Depois de aplicar: nenhuma linha "criaria".
5. Somente com autorização para alterar o DEV:
   - Antes de publicar o assembly, a branch precisa conter todo o plugin já publicado: sincronize com `origin/main` e confira que cada `plugintype` do assembly `Betinhos.DriverRecordSharing` no DEV existe em `plugins/DriverRecordSharing/*.cs`. Publicar de uma branch atrasada apaga do DEV o código das outras.
   - `dotnet build plugins/DriverRecordSharing.Tests/DriverRecordSharing.Tests.csproj -c Release`, depois `register-driver-record-sharing-plugin-webapi.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/ -SolutionUniqueName AppBetinhos -Apply -AddExistingToSolution` → termina em `REGISTRO E VALIDACAO OK`.
   - `provision-checklists.ps1 -Apply` → `schema e APIs publicados`; repetir sem `-Apply` → nenhuma linha "criaria".
   - `grant-checklists-role.ps1 -Apply` → as duas leituras Basic "concedido e verificado" (ou "ja tem").
   - `smoke-checklists-dev.ps1` → "API com plugin ativo" para as 5 APIs com identificador e "Trava de edicao do checklist ativa no DEV".
   - Schema do OK / Não OK no DEV (confira antes do seed): `new_checklistmodeloitem.new_tipo` tem a opção `100000003` (OK / Não OK) e existem `new_checklistmodeloitem.new_opcoesproblema` e, no `new_checklistveiculo`, `new_temproblema` e `new_qtdproblemas`. Sem isso o seed aborta antes de mexer no padrão.
   - Seed do modelo "Vistoria rápida" (14 itens: 4 fotos, 9 OK / Não OK, 1 texto): `seed-checklist-modelo-teste.ps1 -SubstituirPadrao` (dry run) → "desmarcaria o padrao atual '<nome>'" e "criaria 'Vistoria rápida' com 14 itens"; sem o switch e com padrão ativo, falha com "Ja existe modelo padrao ativo". Com `-Apply`: desmarca o padrão antigo (continua ativo), cria o novo como padrão e confere 14 itens; repetir → "ja existe (14 itens)".
   - Smoke com Não OK: `smoke-checklists-dev.ps1 -ChecklistId <id>` conclui um checklist pendente do próprio usuário autenticado (o plugin só aceita o motorista dono): primeiro item okNok = `nok` + primeiro problema da lista + foto de teste, demais okNok = `ok`; confere `new_temproblema = true` e `new_qtdproblemas = 1`. Modelo sem okNok conclui sem exigir as colunas novas. Sem `-ChecklistId` o smoke segue somente leitura. Grava dado real no DEV: só com autorização.
   - `new_ProcessarChecklistsVeiculos` (sem parâmetros): só chame enquanto não houver modelo em `new_checklistmodelos`; deve recusar com a mensagem de "modelo ativo como padrão quinzenal". Com modelo cadastrado, chamar cria checklists reais.

6. Flows (DEV): `provision-checklist-flows.ps1` (dry-run) → "criaria/atualizaria" para `Flow Checklists | Rotina diaria` e `Flow Push Checklist | Motoristas`; com `-Apply` → "Flow ativo no DEV e na solucao" para os dois e "Contrato verificado: rotina diaria 06:30 e push do checklist ativos.". Conferir em `workflows` (category 5) que cada nome tem 1 registro com `statecode = 1`.
   - O push dispara quando o plugin grava `new_pushstatus = 100000000` com `new_estado = 100000001`; o toque abre o registro e o redirect (área `verificar-push-redirect`) leva ao App com `checklistId`.
   - A rotina roda todo dia 06:30 (America/Sao_Paulo). Sem modelo padrão ela falha de propósito (o plugin recusa); com modelo, cria checklists reais e manda push.

## Casos de borda (cobertos pelos testes)
- Mais de um modelo padrão quinzenal → solicitação recusada.
- Rotina ignora veículo de terceiro, com checklist aberto ou concluído dentro do período.
- Dois motoristas com o mesmo veículo: vale o `new_veiculoatualdesde` mais recente; empate grava `new_erroatribuicao`.
- Sem motorista no veículo → erro visível e estado "Aguardando motorista".
- Reatribuição para o mesmo motorista não repete push; troca de motorista troca dono e marca push pendente.
- Conclusão: outro usuário recusado; foto obrigatória ausente, link sem https e número inválido recusados; repetição não duplica fotos.
- Checklist concluído não aceita edição nem exclusão; aberto aceita.
- Item OK / Não OK (choice 100000003, código `okNok`): vazio obrigatório recusado ("Escolha OK ou Não OK"); Não OK exige foto, ao menos um problema e problema da lista do item (`new_opcoesproblema`, padrão Arranhado...Outro); OK descarta fotos, problemas e observação enviados; `new_temproblema` e `new_qtdproblemas` gravados na conclusão.

## Evidência obrigatória
- TRX dos testes do checklist e resumo da suíte completa.
- Saída do parse dos scripts.
- Saída do dry-run (ou do smoke, quando aplicado no DEV).

## Limites
- Não há UI nesta área; a tela do motorista e a gestão têm áreas próprias.
- PROD: somente leitura. Nunca rodar `-Apply` em PROD sem pedido explícito.
- A atribuição depende dos Flows Infleet existentes (`Infleet - Sincronizar carro atual dos motoristas`, `Infleet - Sincronizar hodômetro`); confira se estão ativos antes de diagnosticar atribuição.
