# Despesas com IA: descoberta no DEV (13/10/2026)

Origem: `packages/deploy/inspecionar-despesas-ia.ps1` (somente leitura, só GET, DEV `org23b93544`) mais leitura do `clientdata` dos flows. Nada foi alterado. Nenhum token, segredo ou URL de gatilho com `sig=` está nesta nota.

## Valores para as Tasks 5–7

| Item | Valor |
|---|---|
| `SITE_URL` | `https://betinhos.sharepoint.com/sites/BetinhosGestoInterna` (dataset do "Flow - Consultar Arquivos Sharepoint"; é o mesmo dos flows de salvar, listar e excluir do SharePoint) |
| `BIBLIOTECA` | `Documentos Compartilhados` (caminho nos flows: `Documentos Compartilhados/<caminhoCompleto>`). Id da biblioteca usado em `CreateNewFolder` no "Flow - Salvar arquivo no SharePoint": `0e524da8-15af-47ff-9b34-7116ac32763f` |
| Flow que o App Motoristas chama para comprovante de despesa | `Flow Comprovantes Despesas Assincrono \| App Motoristas` (ativo). Variável de ambiente: `new_FlowURLDespesaAsync`. Evidência: sufixo "App Motoristas", nome da variável, 13 execuções no DEV (última em 30/09/2026) contra 0 do "Flow Salvar Anexo Despesa". Não confirmado diretamente: o App Motoristas não está neste repositório e o id na URL da variável não bate com o id do flow (ver Divergências, item 3) |
| Atende outros uploads? | Não. É exclusivo de despesa: exige `attachmentId` de um anexo de despesa e chama a Custom API `new_ExpenseUploadTransition`, que devolve `expenseId` e `fileName`. Não há condição a filtrar. Os demais uploads usam outros flows ("Flow Salvar Arquivos Onedrive": fotos de motorista/CNH; "Flow - Salvar arquivo no SharePoint": Planner/Frota/Funcionários) |
| Ação do OneDrive que grava o arquivo | Ação `CreateFile`, `operationId` `CreateFile` (conector `shared_onedriveforbusiness`), dentro do escopo `Upload`. Pasta: `/Despesas/DEV/<expenseId>` (o `DEV` é fixo no flow do DEV); nome: `<attachmentId>-<fileName>`. Depois vem `ShareLink` (`CreateShareLinkV2`, tipo View, escopo Organization), que gera o `cr40f_sharelink` |
| Lookup de cliente na reserva | `cr40f_cliente` (OData: `_cr40f_cliente_value`) em `cr40f_reservadeveculos` |
| Tamanho máximo / médio das fotos no DEV | Não determinado. O campo `cr40f_tamanhobytes` **não existe** em `cr40f_anexodespesaoperacional` no DEV (nenhum campo de tamanho/bytes). Os 35 anexos do DEV são arquivos de teste (`text/plain` ou sem mimetype), sem fotos reais; as entradas e saídas das execuções do flow são ocultas (`secureData`). Medir em PROD exige pedido explícito (PROD é só leitura) |

## Contrato do flow de upload (Flow Comprovantes Despesas Assincrono)

Gatilho HTTP `manual` (autenticação `All`, entradas e saídas seguras):

```json
{ "type": "object", "additionalProperties": false,
  "required": ["attachmentId", "attemptId", "conteudoBase64"],
  "properties": {
    "attachmentId": { "type": "string", "format": "uuid" },
    "attemptId": { "type": "string", "format": "uuid" },
    "conteudoBase64": { "type": "string", "minLength": 1 } } }
```

Sequência: `ClaimCommand`/`Claim` (reivindica o envio via `new_ExpenseUploadTransition`, com repetição) -> responde HTTP -> `Process` (se `applied = true`): `Upload` (`CreateFile` + `ShareLink`) -> `Complete` (grava o resultado pela mesma Custom API); em falha, `PersistFailure`.

Respostas HTTP:
- `202` `{ "accepted": true, "attachmentId": "...", "attemptId": "..." }` (resposta antecipada; o upload segue em segundo plano).
- `400` `{ "accepted": false, "message": "Comprovante não aceito. Consulte o registro antes de tentar novamente." }` quando o claim falha.

O arquivo não é gravado antes da resposta `202`: o resultado final (link, `cr40f_driveitemid`, status do anexo) aparece depois no anexo (`cr40f_status`, `cr40f_urlsharepoint`, `cr40f_sharelink`, `cr40f_driveitemid`, `new_uploaderror`). Para a Task 5–7, o gancho da IA deve rodar quando o anexo ficar completo, não na resposta do flow.

## Outros fatos úteis

- Flow legado "Flow Salvar Anexo Despesa" (ativo, 0 execuções no DEV): gatilho `expenseId`, `fileName`, `base64` (obrigatórios) mais `externalId`, `mimeType`, `fileSize`, `driverName`, `cardLast4`, `date`, `amount`, `uploadedBy`; grava no OneDrive em `/Despesas/AAAA/MM/<expenseId>-<data>-<nome>`; responde 200 com `webUrl`, `driveItemId`, `fileName`, `size`, `previewDataUrl`.
- "Flow - Salvar arquivo no SharePoint": gatilho `caminhoCompleto`, `nomeArquivo`, `conteudoBase64`, `mimeType` (obrigatórios) e `metadados` opcional; cria a pasta (`CreateNewFolder`), grava (`CreateFile`) e responde 200 com `sucesso`, `itemId`, `identificador` etc.; 400 com `{ sucesso: false, erro }`. É o candidato natural para gravar comprovantes no SharePoint (spec).
- "Flow - Consultar Arquivos Sharepoint": gatilho `fileLocator` ou `caminhoSharePoint` (caminho relativo à biblioteca), `nomeArquivo`; `GetFileContent` / `GetFileContentByPath` no `SITE_URL`; responde `{ sucesso, nomeArquivo, mimeType, conteudoBase64 }`.
- "Flow - Consultar Arquivo OneDrive": lê só dentro de `/Despesas/` na conta `noreply` (`betinhos-my.sharepoint.com/personal/noreply_betinhos_onmicrosoft_com`); usa `GetFileMetadata`, `GetFileContent` e `HttpRequest` (SharePoint) para resolver links de compartilhamento.
- Anexo de despesa (`cr40f_anexodespesaoperacional`) tem: `cr40f_despesa`, `cr40f_tipo`, `cr40f_status`, `cr40f_ordem`, `cr40f_nomearquivo`, `cr40f_mimetype`, `cr40f_urlsharepoint`, `cr40f_sharelink`, `cr40f_driveitemid`, `cr40f_dataenvio`, `cr40f_enviadopor`, `new_uploadattemptid`, `new_uploadrunid`, `new_uploaderror`. Não tem tamanho.
- Despesa (`cr40f_despesaoperacional`) tem `cr40f_reserva` (lookup), `cr40f_hashdeduplicacao`, `cr40f_possivelduplicidade`, `cr40f_statusanexo`, `cr40f_statusoperacional`, `cr40f_payloadorigem`. As variáveis `cr40f_OperationsAIAllowedCallerIds` e `cr40f_OperationsAIPolicyVersion` já existem no DEV.

## Divergências em relação ao plano/spec

1. `cr40f_tamanhobytes` não existe no DEV. O critério de duplicidade "mesmo tamanho e mesmo tipo de arquivo" precisa de outro dado (por exemplo hash do conteúdo calculado no flow, ou criar o campo na Task de schema).
2. O flow de upload hoje grava no OneDrive do `noreply` (`/Despesas/DEV/<expenseId>`), não no SharePoint; a mudança para `Documentos Compartilhados/Despesas/AAAA/MM` fica a cargo das tasks seguintes. O prefixo `DEV` está fixo no flow.
3. Id da URL da variável `new_FlowURLDespesaAsync` (ex.: `b2402fe9…`) não coincide com o `workflowid`, `resourceid` nem `workflowidunique` do flow; a ligação variável -> flow é por nome e execuções, não por id.

## Gate (para o controlador)

Confirmar com o Renan antes da Task 5: site `BetinhosGestoInterna`, biblioteca `Documentos Compartilhados`, e que o flow de upload é o "Flow Comprovantes Despesas Assincrono | App Motoristas".
