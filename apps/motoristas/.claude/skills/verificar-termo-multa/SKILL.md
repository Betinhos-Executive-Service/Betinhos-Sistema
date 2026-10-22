---
name: verificar-termo-multa
description: "Verifica o backend do termo de multa com assinatura eletrônica: plugin TermoMultaCommandPlugin (Custom APIs new_EnviarTermoMulta, new_AssinarTermoMulta, new_ContestarTermoMulta, new_CancelarTermoMulta, new_ExpirarTermoMulta), PDF do termo e trava de imutabilidade de new_termomulta/new_parcelamultafolha. Use após mudar TermoMulta*.cs, MiniPdf.cs ou o bloco do termo em scripts/provision-comunicados.ps1."
---
# Verificar termo de multa (backend)

## Cobre
- `plugins/DriverRecordSharing/TermoMultaCommandPlugin.cs`, `TermoMultaDocumento.cs`, `MiniPdf.cs`.
- `plugins/DriverRecordSharing.Tests/TermoMultaCommandPluginTests.cs`, `MiniPdfTests.cs`.
- Bloco "Termo de multa" de `scripts/provision-comunicados.ps1` (Custom APIs, saídas e 4 steps pre-operation, stage 20).

## 1. Testes locais (sem Dataverse)
```
dotnet test plugins/DriverRecordSharing.Tests --nologo -v q
```
Esperado: zero falhas. `TermoMultaCommandPluginTests` usa relógio injetado (`new TermoMultaCommandPlugin(() => relogio, () => fakeInfleet)`) e um fake de `IOrganizationService` que captura GrantAccess e o upload em blocos do PDF.

## 2. Registro no DEV (só DEV, nunca de worktree sem autorização)
- Assembly: `scripts/register-driver-record-sharing-plugin-webapi.ps1 -EnvironmentUrl https://org23b93544.crm2.dynamics.com/ -SolutionUniqueName AppBetinhos -Apply -AddExistingToSolution` (antes compile em Release). Confira que todos os `plugintypes` do assembly no DEV existem na DLL local.
- APIs e travas: `scripts/provision-comunicados.ps1 -Apply` (pula o termo se as tabelas não existirem).
- Conferir: `customapis?$filter=startswith(uniquename,'new_') and contains(uniquename,'TermoMulta')` (5 APIs; Enviar/Cancelar com `prvCreatenew_TermoMulta`, Expirar com `prvWritenew_TermoMulta`, Assinar/Contestar sem privilégio) e os steps do plugintype `Betinhos.DriverRecordSharing.TermoMultaCommandPlugin` (5 de implementação + 4 travas stage 20).
- Nomes de privilégio usam o SchemaName da tabela (`new_TermoMulta`), não o nome lógico.

## 3. Fumaça no DEV (registros próprios, apagar no fim)
1. Funcionário de teste com `new_aditivoassinaturaem` e PDF em `new_aditivoassinatura` (PATCH binário com `x-ms-file-name`, **sem** `Prefer: return=representation`, que faz o Dataverse responder "Entity ... Does Not Exist"). Use como e-mail o de um usuário de aplicação sem funcionário (ex.: "Betinhos CI GitHub"), para não duplicar o vínculo de um motorista real.
2. Multa de teste com `cr40f_Motorista@odata.bind` para esse funcionário. `POST new_EnviarTermoMulta` → termo Pendente, `new_evidenciasjson` com `infleet.erro` quando não há token, `new_termovigente` apontando para o termo.
3. Segundo envio → "Já existe um termo pendente para esta multa."; Cancelar → Cancelado; PATCH `new_status` → "Termo assinado não pode ser alterado nem excluído."; PATCH só `new_copiaenviadaem`/`new_copiacanal` → OK; DELETE → bloqueado.
4. Assinar como quem não é o motorista → "Este termo não é seu." A assinatura real só dá para testar com um usuário motorista; sem ele, fica coberta pelos testes unitários.
5. Limpeza: desligue o step "Termo de multa - bloquear exclusao fora de Pendente" (`statecode=1,statuscode=2`), apague os termos, religue (`statecode=0,statuscode=1`) num `finally`, depois apague multa e funcionário.

## Armadilhas
- No pre-operation de Update o Target traz `modifiedon`, `modifiedby`, `modifiedonbehalfby` e `timezoneruleversionnumber`; a trava ignora essas colunas (lista `PlatformColumns`). O trace `TermoMulta trava ...` lista as colunas recebidas (`plugintracelogs`).
- Custom API não recebe configuração segura: sem token o InFleet grava `{"erro":"Token da Infleet não configurado."}` e o envio segue.
