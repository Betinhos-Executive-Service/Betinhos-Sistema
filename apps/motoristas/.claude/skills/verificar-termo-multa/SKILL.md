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
- Conferir: `customapis?$filter=startswith(uniquename,'new_') and contains(uniquename,'TermoMulta')` (5 APIs; Enviar/Cancelar com `prvCreatenew_TermoMulta`, Expirar com `prvWritenew_TermoMulta`, Assinar/Contestar sem privilégio). Enviar não tem plugintype: é implementada pelo step stage 40 "Termo de multa - enviar (Infleet)" com o token da Infleet em configuração segura (`allowedcustomprocessingsteptype = 2`; esse campo não muda depois de criado, então o script recria a API). Steps do plugintype: 4 de implementação + 1 stage 40 + 5 travas stage 20 (Update/Delete do termo, Create/Update/Delete da parcela).
- Nomes de privilégio usam o SchemaName da tabela (`new_TermoMulta`), não o nome lógico.

## 3. Fumaça no DEV (registros próprios, apagar no fim)
1. Funcionário de teste com `new_aditivoassinaturaem` e PDF em `new_aditivoassinatura` (PATCH binário com `x-ms-file-name`, **sem** `Prefer: return=representation`, que faz o Dataverse responder "Entity ... Does Not Exist"). Use como e-mail o de um usuário de aplicação sem funcionário (ex.: "Betinhos CI GitHub"), para não duplicar o vínculo de um motorista real.
2. Multa de teste com `cr40f_Motorista@odata.bind` para esse funcionário. `POST new_EnviarTermoMulta` → termo Pendente, `new_evidenciasjson` com `infleet.erro` quando não há token, `new_termovigente` apontando para o termo.
3. Termo Pendente: PATCH de `new_status` ou `new_hashpdf` pelo gestor → bloqueado; POST direto em `new_parcelamultafolhas` → "Parcela de multa só é criada pela assinatura do termo."; Cancelar limpa `new_termovigente`. Evidência: `infleet` sem `erro` de token (com placa real pode vir "não encontrado no InFleet").
4. Segundo envio → "Já existe um termo pendente para esta multa."; Cancelar → Cancelado; PATCH `new_status` → "Termo assinado não pode ser alterado nem excluído."; PATCH só `new_copiaenviadaem`/`new_copiacanal` → OK; DELETE → bloqueado.
5. Assinar como quem não é o motorista → "Este termo não é seu." A assinatura real só dá para testar com um usuário motorista; sem ele, fica coberta pelos testes unitários.
6. Limpeza: desligue o step "Termo de multa - bloquear exclusao fora de Pendente" (`statecode=1,statuscode=2`), apague os termos, religue (`statecode=0,statuscode=1`) num `finally`, depois apague multa e funcionário.

## 4. Tela Multas no app (mock local)
1. `npm run dev` e abra `http://127.0.0.1:<porta>/#/multas` (porta no log do dev server). Cabeçalho "Operação · Mock local".
2. Lista: RTB4F21 (R$ 195,23) e QPA2B11 (R$ 130,16), ambos "Aguardando sua assinatura", data no formato `dd/mm/aaaa HH:mm` em America/Sao_Paulo. `?mockTermos=vazio` → "Nenhum termo pendente.".
3. Toque em RTB4F21 → detalhe com placa, infração, valor, viagem Infleet e acordo "Desconto em folha em 3x de R$ 65,08 — nov/26, dez/26, jan/27". QPA2B11 mostra Infleet indisponível.
4. "Assinar" → "Passo 1 de 3 · Tire uma selfie". Sem câmera (navegador interno/headless) aparece a mensagem de câmera bloqueada com "Tentar de novo"; o fluxo de selfie, assinatura e GPS só se completa no celular.
5. Erros simulados: `?mockTermoErro=aditivo` (tela sem aditivo) e `?mockTermoErro=dono` ("Este termo não é seu.").
6. Console sem erros. Testes de domínio: `tests/termosMulta.test.ts` (`npm test`).

## Armadilhas
- No pre-operation de Update o Target traz `modifiedon`, `modifiedby`, `modifiedonbehalfby` e `timezoneruleversionnumber`; a trava ignora essas colunas (lista `PlatformColumns`). O trace `TermoMulta trava ...` lista as colunas recebidas (`plugintracelogs`).
- Sem token (arquivo `Skill Agendamento\infleet-mcp\.env` ausente no `-Apply`) o InFleet grava `{"erro":"Token da Infleet não configurado."}` e o envio segue.
- IDs de bloco do upload do PDF (`UploadBlock`) precisam ser base64 de tamanho fixo e sem `+`, `/` ou `=` (`TermoMultaCommandPlugin.BlockId`); base64 de GUID dá 400 `InvalidQueryParameterValue` no Azure Blob e a assinatura falha com "Falha ao processar termo de multa.".
