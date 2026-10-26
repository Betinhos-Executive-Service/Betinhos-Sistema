---
name: verificar-compartilhamento-motorista
description: "Verifica o compartilhamento de registros com o motorista (ServiceDriverSharePlugin + DataverseAccessHelper): conceder/revogar acesso na reserva, passageiros, solicitante e trocas, inclusive quando o motorista é dono do registro (gestor que também dirige). Use após mudar plugins/DriverRecordSharing/DataverseAccessHelper.cs, DriverResolver.cs ou ServiceDriverSharePlugin.cs."
---
# Verificar compartilhamento com o motorista

## Cobre
- Código: `plugins/DriverRecordSharing/DataverseAccessHelper.cs`, `DriverResolver.cs`, `ServiceDriverSharePlugin.cs`.
- Testes: `plugins/DriverRecordSharing.Tests/DataverseAccessHelperTests.cs` (dono do registro x não dono, conceder e revogar) e `PassengerChangeTests.cs` (Update de passageiro só recalcula `cr40f_passageirosetelefonedecontato` das OS quando nome/telefone mudam de valor).
- Scripts: `scripts/validate-driver-record-sharing-plugin.ps1`, `scripts/verify-driver-record-sharing-plugin-e2e.ps1`, `scripts/register-driver-record-sharing-plugin-webapi.ps1`.

## Regra que não pode quebrar
- O Dataverse recusa revogar o próprio dono ("Only owner can revoke access to the owner", 0x80040223). Em plugin síncrono, capturar a exceção não salva a operação: a transação já foi marcada para rollback. Por isso o helper lê o `ownerid` do alvo e pula conceder/revogar quando o usuário é o dono. Toda chamada de acesso deve passar pelo `DataverseAccessHelper`.

## Preparar ambiente
- Copie `plugins/DriverRecordSharing/DriverRecordSharing.snk` (gitignored) do checkout principal para o worktree; não gere chave nova (mudaria a identidade do assembly).

## Regra do passageiro
- `ServicePassengerViewSynchronizer` é o dono único de `cr40f_passageirosetelefonedecontato` (o flow Tenaris não grava mais o campo) e ordena os vínculos por `cr40f_ordemdeselecao` e depois `createdon`.
- O flow Tenaris regrava nome e telefone de `cr40f_bancodedados` a cada sincronização com o mesmo valor. `HandlePassenger` compara com a pré-imagem `pre` (nome, telefone) e só chama `SyncServicesForPassenger` se o valor mudou (nulo = vazio). Sem pré-imagem, qualquer atributo presente conta como mudança.

## Roteiro
1. `cd plugins/DriverRecordSharing.Tests && dotnet test -v q --filter "DataverseAccessHelperTests|PassengerChangeTests"` → `Com falha: 0`, 8 testes.
   - Prova em produção do problema que `PassengerChangeTests` cobre: auditoria da OS 2149 (PROD) com `cr40f_passageirosetelefonedecontato` alternando entre `" / "` (flow) e `";\r\n"` (plugin) a cada sincronização. Depois do deploy, uma sincronização sem mudança de contato não gera auditoria nesse campo.
2. Prova do antes: troque temporariamente o helper por `git show origin/main:plugins/DriverRecordSharing/DataverseAccessHelper.cs` e rode o passo 1 → os testes `*_SkipsOwner*` falham; restaure o arquivo.
3. Suíte inteira: `dotnet test -v q` → `Com falha: 0`.
4. DEV (somente com autorização para publicar o plugin, a partir da `main` atualizada): registrar com `register-driver-record-sharing-plugin-webapi.ps1 ... -Apply` → `REGISTRO E VALIDACAO OK`. Depois, em uma reserva cujo `ownerid` é o usuário do motorista atual:
   - trocar o motorista para outro → salva; o novo motorista ganha acesso; o dono continua dono.
   - trocar outro motorista para o dono → salva sem criar compartilhamento para o dono.
   - cancelar a reserva → salva.
   - remover passageiro → salva.
   - troca entre dois motoristas comuns → o anterior perde o compartilhamento (`RetrieveSharedPrincipalsAndAccess`).
   No Rastreamento de Plug-in, as linhas `RevokeAccess skip owner` / `EnsureAccess skip owner` aparecem nos casos do dono.

## Evidência
- Saída do `dotnet test` (antes/depois) e, em DEV, o trace do plug-in de cada cenário.
