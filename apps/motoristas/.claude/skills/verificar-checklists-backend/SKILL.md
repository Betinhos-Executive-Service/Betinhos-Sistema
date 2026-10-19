---
name: verificar-checklists-backend
description: "Verifica o backend do checklist de vistoria de veículo: plugin ChecklistCommandPlugin, validação de respostas, script de schema/Custom APIs, papel e smoke em DEV. Use após mudar plugins/DriverRecordSharing/Checklist*, scripts/*checklists* ou o trecho de checklists do push-dev.ps1."
---
# Verificar backend do checklist de vistoria

## Cobre
- Código: `plugins/DriverRecordSharing/ChecklistCommandPlugin.cs`, `plugins/DriverRecordSharing/ChecklistAnswers.cs`, testes em `plugins/DriverRecordSharing.Tests/ChecklistCommandPluginTests.cs`.
- Scripts: `scripts/provision-checklists.ps1`, `scripts/grant-checklists-role.ps1`, `scripts/smoke-checklists-dev.ps1`, bloco de checklists em `scripts/push-dev.ps1`, lista de tabelas em `scripts/schema-index.cjs`.
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
5. Somente com autorização para alterar o DEV: publicar o assembly (`register-driver-record-sharing-plugin-webapi.ps1 -Apply`), `provision-checklists.ps1 -Apply`, `grant-checklists-role.ps1 -Apply` e então `smoke-checklists-dev.ps1` → cada API responde "API com plugin ativo" e "Trava de edicao do checklist ativa no DEV".

## Casos de borda (cobertos pelos testes)
- Mais de um modelo padrão quinzenal → solicitação recusada.
- Rotina ignora veículo de terceiro, com checklist aberto ou concluído dentro do período.
- Dois motoristas com o mesmo veículo: vale o `new_veiculoatualdesde` mais recente; empate grava `new_erroatribuicao`.
- Sem motorista no veículo → erro visível e estado "Aguardando motorista".
- Reatribuição para o mesmo motorista não repete push; troca de motorista troca dono e marca push pendente.
- Conclusão: outro usuário recusado; foto obrigatória ausente, link sem https e número inválido recusados; repetição não duplica fotos.
- Checklist concluído não aceita edição nem exclusão; aberto aceita.

## Evidência obrigatória
- TRX dos testes do checklist e resumo da suíte completa.
- Saída do parse dos scripts.
- Saída do dry-run (ou do smoke, quando aplicado no DEV).

## Limites
- Não há UI nesta área; a tela do motorista e a gestão têm áreas próprias.
- PROD: somente leitura. Nunca rodar `-Apply` em PROD sem pedido explícito.
- A atribuição depende dos Flows Infleet existentes (`Infleet - Sincronizar carro atual dos motoristas`, `Infleet - Sincronizar hodômetro`); confira se estão ativos antes de diagnosticar atribuição.
