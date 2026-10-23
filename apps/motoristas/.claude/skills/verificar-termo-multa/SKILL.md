---
name: verificar-termo-multa
description: "Verifica o backend do termo de multa com assinatura eletrônica: plugin TermoMultaCommandPlugin (Custom APIs new_EnviarTermoMulta, new_AssinarTermoMulta, new_ContestarTermoMulta, new_CancelarTermoMulta, new_ExpirarTermoMulta, new_LembrarTermoMulta, new_BaixarPdfTermoMulta, new_ConsultarAditivoMotorista), PDF do termo e trava de imutabilidade de new_termomulta/new_parcelamultafolha. Use após mudar TermoMulta*.cs, MiniPdf.cs, o bloco do termo em scripts/provision-comunicados.ps1, scripts/provision-termo-multa-push-flow.ps1 ou as telas Multas (TermosMultaScreen, TermoMultaDetalheScreen, banner da Home)."
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
- Conferir: `customapis?$filter=contains(uniquename,'TermoMulta') or uniquename eq 'new_ConsultarAditivoMotorista'` (8 APIs; Lembrar com `prvCreatenew_TermoMulta`, BaixarPdf e ConsultarAditivo sem privilégio (o plugin confere dono/privilégio); Enviar/Cancelar com `prvCreatenew_TermoMulta`, Expirar com `prvWritenew_TermoMulta`, Assinar/Contestar sem privilégio). Enviar não tem plugintype: é implementada pelo step stage 40 "Termo de multa - enviar (Infleet)" com o token da Infleet em configuração segura (`allowedcustomprocessingsteptype = 2`; esse campo não muda depois de criado, então o script recria a API). Steps do plugintype: 4 de implementação + 1 stage 40 + 5 travas stage 20 (Update/Delete do termo, Create/Update/Delete da parcela).
- Nomes de privilégio usam o SchemaName da tabela (`new_TermoMulta`), não o nome lógico.

## 3. Fumaça no DEV (registros próprios, apagar no fim)
1. Funcionário de teste com `new_aditivoassinaturaem` e PDF em `new_aditivoassinatura` (PATCH binário com `x-ms-file-name`, **sem** `Prefer: return=representation`, que faz o Dataverse responder "Entity ... Does Not Exist"). Use como e-mail o de um usuário de aplicação sem funcionário (ex.: "Betinhos CI GitHub"), para não duplicar o vínculo de um motorista real.
2. Multa de teste com `cr40f_Motorista@odata.bind` para esse funcionário. `POST new_EnviarTermoMulta` → termo Pendente, `new_evidenciasjson` com `infleet.erro` quando não há token, `new_termovigente` apontando para o termo.
3. Termo Pendente: PATCH de `new_status` ou `new_hashpdf` pelo gestor → bloqueado; POST direto em `new_parcelamultafolhas` → "Parcela de multa só é criada pela assinatura do termo."; Cancelar limpa `new_termovigente`. Evidência: `infleet` sem `erro` de token (com placa real pode vir "não encontrado no InFleet").
4. Segundo envio → "Já existe um termo pendente para esta multa."; Cancelar → Cancelado; PATCH `new_status` → "Termo assinado não pode ser alterado nem excluído."; PATCH só `new_copiaenviadaem`/`new_copiacanal` → OK; DELETE → bloqueado.
5. Assinar como quem não é o motorista → "Este termo não é seu." A assinatura real só dá para testar com um usuário motorista; sem ele, fica coberta pelos testes unitários.
6. Limpeza: desligue o step "Termo de multa - bloquear exclusao fora de Pendente" (`statecode=1,statuscode=2`), apague os termos, religue (`statecode=0,statuscode=1`) num `finally`, depois apague multa e funcionário.

## 3b. Fumaça v2 no DEV (PDF, lembrete, aditivo)
Impersonação pelo cabeçalho `CallerObjectId` (objectid do AAD do usuário) com o token de admin.
1. `POST new_BaixarPdfTermoMulta {new_TermoId}` num termo Assinado: como dono ou gestor (`prvCreatenew_TermoMulta`) devolve `new_PdfBase64` começando por `%PDF-1.4` e `new_NomeArquivo`; como outro motorista sem o privilégio → "Este termo não é seu."; termo não assinado → "Este termo ainda não tem PDF assinado.".
2. `POST new_LembrarTermoMulta` num Pendente → grava `new_ultimolembreteem`; o segundo em 24 h → "Já foi enviado um lembrete nas últimas 24 horas."; em termo Assinado → "Só é possível lembrar termo pendente."; PATCH direto de `new_ultimolembreteem` → bloqueado pela trava.
3. O flow "Termo de multa | Push ao motorista" roda no Create Pendente e na mudança de `new_ultimolembreteem`. Para ver a mensagem renderizada use a API do Power Automate (escopo `https://service.flow.microsoft.com//.default`, mesmo client MSAL): `.../flows/<id>/runs/<run>/actions/Send_push` → `inputsLink` traz `payload/message` ("Lembrete: multa para assinar até dd/mm"). Destinatário que é usuário de aplicação (CI) falha com `InvalidPrincipalIdOrMail`: esperado.
4. `POST new_ConsultarAditivoMotorista {}` como motorista → `new_TemAditivo` true/false. Atenção a funcionários duplicados com o mesmo e-mail: o DriverResolver pode escolher o registro sem aditivo.

## 4. Tela Multas no app (mock local)
1. `npm run dev` e abra `http://127.0.0.1:<porta>/#/multas` (porta no log do dev server). Cabeçalho "Operação · Mock local".
2. Home: banner "Você tem 2 multas para assinar · prazo até 29/10" acima dos cards (some com `?mockTermos=vazio`). Lista: abas Pendentes (RTB4F21 R$ 195,23 e QPA2B11 R$ 130,16, badge "Assine até 29/10") e Concluídos (FHK7C30 "Contestado", detalhe com "Contestado — o gestor de frota vai falar com você" e o motivo). `?mockTermos=vazio` → "Nenhuma multa para assinar.".
3. Toque em RTB4F21 → detalhe com placa, infração, valor, viagem Infleet e acordo "Desconto em folha em 3x de R$ 65,08 — nov/26, dez/26, jan/27". QPA2B11 mostra Infleet indisponível.
4. Detalhe: "Assine ou conteste até dd/mm" no topo; ordem O que aconteceu → O que você está aceitando → Texto do termo (texto inteiro, sem caixa com rolagem própria). "Assinar" consulta o aditivo ("Verificando") e vai para "Passo 1 de 3 · Tire uma selfie"; o botão Atualizar some durante o fluxo. Quadro de assinatura com "Assine com o dedo aqui" e linha de base. Sucesso: "Voltar para multas" principal e "Baixar PDF" secundário; o termo passa para Concluídos. Sem câmera (navegador interno/headless) aparece a mensagem de câmera bloqueada com "Tentar de novo"; o fluxo de selfie, assinatura e GPS só se completa no celular.
5. Erros simulados: `?mockTermoErro=aditivo` ("Procure o escritório" logo após Assinar, sem selfie) e `?mockTermoErro=dono` (tela final "Este termo não pode ser assinado", sem "Tentar de novo"). Contestar → confirmação neutra (sem check verde).
   Roteiro automatizado (Playwright, 375 px, câmera e GPS falsos, `NOSHARE=1` remove `navigator.share`, que fica pendurado em headless): `node v2.cjs "#/inicio" ok|contestar|aditivo|dono|vazio` (cópia em `.superpowers/ux-termo-multa-v2/` do worktree do Sistema Betinhos). PDF: com `NOSHARE` o download sai como `TM-RTB4F21-20261022.pdf`; no Power Apps a ordem é `Xrm.Navigation.openFile` → compartilhar → download, com `reportAppError` em cada falha.
6. Console sem erros. Testes de domínio: `tests/termosMulta.test.ts` (`npm test`).

## Armadilhas
- No pre-operation de Update o Target traz `modifiedon`, `modifiedby`, `modifiedonbehalfby` e `timezoneruleversionnumber`; a trava ignora essas colunas (lista `PlatformColumns`). O trace `TermoMulta trava ...` lista as colunas recebidas (`plugintracelogs`).
- Sem token (arquivo `Skill Agendamento\infleet-mcp\.env` ausente no `-Apply`) o InFleet grava `{"erro":"Token da Infleet não configurado."}` e o envio segue.
- IDs de bloco do upload do PDF (`UploadBlock`) precisam ser base64 de tamanho fixo e sem `+`, `/` ou `=` (`TermoMultaCommandPlugin.BlockId`); base64 de GUID dá 400 `InvalidQueryParameterValue` no Azure Blob e a assinatura falha com "Falha ao processar termo de multa.".
