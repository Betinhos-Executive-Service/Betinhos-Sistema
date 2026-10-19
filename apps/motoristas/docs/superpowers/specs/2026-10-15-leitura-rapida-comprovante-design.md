# Leitura rápida do comprovante de despesa — design

Data: 15/10/2026 · Aprovado por: Renan · Ambiente: somente DEV nesta entrega
Repos: App Motoristas (branch `feat/leitura-rapida-comprovante`, base `develop`) e Sistema Betinhos (pacote `packages/despesas-ia` + script de provisionamento).

## Objetivo

Reduzir digitação do motorista: o fluxo de despesa começa pela foto do comprovante, uma leitura rápida (3–5 s) pré-preenche o formulário e o motorista só revisa e registra. O envio, o upload assíncrono e a análise antifraude continuam como hoje.

## Fluxo do motorista

1. Início → "Gastos": se não há despesa em andamento (`expensePhotos` vazio, `expenseSubmission` nulo e rascunho vazio), o app abre direto a câmera (`fotoGasto`). Com rascunho existente, abre `gastos` como hoje.
2. Ao confirmar a **primeira foto** (imagem, não vídeo) em `confirmExpensePhoto`, o app volta para `gastos` e dispara a leitura rápida. A tela mostra o aviso "Lendo comprovante…" (`role="status"`). O formulário continua editável; nada é bloqueado.
3. Legível → preenche **somente campos vazios** do `ExpenseDraft`: `valor`, `dataGasto`, `estabelecimento`, `litros` (só se a categoria exige litros), `categoriaId` (categoria sugerida, casada por nome com `referenceData.categories`) e `formaPagamentoId` (sugestão casada por nome). Campo que o motorista já digitou nunca é sobrescrito. Aviso: "Confira os dados lidos do comprovante."
4. Ilegível → aviso "Não consegui ler o comprovante. Tire outra foto mais perto, com luz e sem cortar." com o botão "Tirar outra foto" (substitui a foto lida). Na **3ª** foto ilegível o aviso passa a oferecer "Preencher manualmente" e a leitura não é mais tentada nesta despesa.
5. Offline, erro da API/flow, resposta inválida ou timeout de 10 s → modo manual silencioso (aviso discreto "Preencha os dados do comprovante."), sem retentativa automática.
6. Envio: inalterado. Mesmo `submitExpense`/`resumeExpenseSubmission`, mesmo payload (`expenses.payload.ts`) e mesmo "Flow Comprovantes Despesas Assincrono | App Motoristas". A análise "Flow Despesas | Análise IA" roda depois, invisível ao motorista. A leitura rápida não grava nada no Dataverse.

## Contrato do flow "Flow Despesas | Leitura rápida" (DEV)

Gatilho HTTP (POST, síncrono, resposta em até ~8 s).

Requisição:
```json
{ "imagemBase64": "<jpeg base64 sem prefixo data:>", "mime": "image/jpeg",
  "categorias": ["Abastecimento", "Almoço", "..."], "formasPagamento": ["Cartão de crédito", "..."] }
```
Resposta 200 (sempre JSON; erro do modelo vira `ok:false`):
```json
{ "ok": true, "leitura": { "legivel": true, "valor": 85.4, "data": "2026-10-12", "hora": "14:32",
  "estabelecimento": "Posto X", "cnpj": "12.345.678/0001-90", "litros": 32.5,
  "categoria_sugerida": "Abastecimento", "forma_pagamento_sugerida": "Cartão de crédito", "motivo_ilegivel": null } }
```
Campos anuláveis: todos exceto `legivel`. `categoria_sugerida` e `forma_pagamento_sugerida` devem ser um item das listas enviadas ou `null` (o flow monta o `enum` do schema com as listas recebidas; o app ainda valida por nome).

Chamada ao Claude: `POST https://api.anthropic.com/v1/messages`, modelo `claude-haiku-5-5`, `max_tokens` 1024, saída estruturada (`output_config.format` `json_schema`), cabeçalho `x-api-key` = parâmetro da variável de ambiente `new_AnthropicApiKey` (já existente no DEV; nunca no app). Timeout da ação HTTP: `PT8S`, sem retry policy.

## Decisões

- **Autenticação app → flow:** igual aos flows atuais do app. URL do gatilho HTTP (SAS `sig`) guardada na nova variável de ambiente Dataverse `new_FlowURLDespesaLeituraRapida`, lida por `resolveFlowUrl` em `src/lib/dataverse.ts` (chave `VITE_FLOW_LEITURA_RAPIDA_URL`, fallback `window.__APP_FLOW_ENV`). A chave Anthropic fica só no flow.
- **Mitigação de abuso da URL SAS** (a URL é legível no cliente): condição de gatilho rejeita corpo sem `imagemBase64` ou com mais de ~2,8 MB de base64; `max_tokens` 1024; modelo Haiku; nenhum dado devolvido além da leitura da própria imagem.
- **Imagem:** o app reduz para no máximo 1600 px no maior lado, JPEG qualidade 0,8, antes de enviar (latência e custo). O upload do comprovante continua com a imagem original.
- **Onde vive o código:** prompt, schema, montagem da requisição e validação da resposta em `Sistema Betinhos/packages/despesas-ia/src/leitura-rapida/` (testado com vitest, exportado por `constantesDaLeituraRapida()`); provisionamento em `Sistema Betinhos/packages/deploy/provision-flow-despesas-leitura-rapida.ps1`, copiando os padrões de `provision-flow-despesas-ia.ps1` (Dv UTF-8, backup, `AssertSemMojibake`, checagem da variável sem ler o valor). O app ganha `src/lib/receiptQuickRead.ts` (lógica pura testada) e a integração em `dataverse.ts`, `App.tsx` e `ExpenseScreen.tsx`.
- **Contagem de tentativas:** por despesa, em memória (`expenseQuickRead.tentativas`), zerada ao limpar a despesa. Não persiste no `mediaDraftStore`; ao reabrir o app com rascunho, não relê.
- **Design System:** reaproveita `form-error-summary` e o `<p role="status">` já usado em `uploadMessage`; nenhum valor visual novo.

## Fora de escopo

PROD, mudanças no payload de envio, no flow assíncrono ou no flow de análise, leitura de vídeo/PDF, leitura de fotos adicionais além da primeira, persistência da leitura no Dataverse.

## Riscos

- Latência do Haiku acima de 5 s em rede móvel → coberto pelo timeout de 10 s e preenchimento manual.
- Sugestão errada de categoria/forma de pagamento → motorista revisa; análise antifraude continua.
- CORS do gatilho HTTP: o flow precisa responder com `Access-Control-Allow-Origin` igual aos flows atuais (validar no DEV).
