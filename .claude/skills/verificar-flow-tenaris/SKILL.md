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

## Roteiro (só DEV)
1. Simulação: `powershell -File packages/deploy/patch-flow-tenaris-contatos.ps1 -Ambiente DEV` → lista as mudanças e termina em `DRY RUN`, ou diz `nada a alterar` se já aplicado.
2. Aplicar: `... -Ambiente DEV -Apply` → backup em `packages/deploy/flows/backup/Flow-Tenaris-DEV-*.json` e `atualizado (statecode 0)`.
3. Validar a definição no Power Automate: PATCH `workflows(<id>)` com `statecode = 1` no DEV deve responder sem erro; volte para `statecode = 0` em seguida (o flow do DEV fica em rascunho).
4. Não rode o flow do DEV de ponta a ponta: o `Run_script` grava o status na planilha real `Query dos Sharepoint.xlsx`.
5. Reverter: `... -Ambiente DEV -Apply -Restaurar <backup>`.

## PROD (só com autorização explícita e depois do plugin DriverRecordSharing com `HasTextChange` publicado)
- `... -Ambiente PROD` (simulação) e `... -Ambiente PROD -Apply -ConfirmarProd`.
- Prova do depois: na auditoria de `cr40f_bancodedados` (objecttypecode 10802), nenhuma mudança de `cr40f_telefone` de número para vazio pelo noreply após a próxima execução do flow.

## Evidência
- Saída do dry run, linha do backup e resposta da ativação/desativação no DEV.
