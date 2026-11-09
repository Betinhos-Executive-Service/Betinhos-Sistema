---
name: verificar-formulario
description: "Verifica o Formulário Geral (WebResource new_formulario_geral.html): testes de contrato, validação dos obrigatórios, seletor e cartão do passageiro e aviso de sucesso. Use após mudar apps/formulario-geral/** (app.js, index.html, styles.css, webresource.html, scripts/**, power-platform/**) ou packages/deploy/push-formulario-dev.ps1, ou quando pedirem para testar o Formulário Geral."
---
# Verificar Formulário Geral

## Cobre
- Código (tudo em `apps/formulario-geral/`, vanilla JS, sem React): `app.js`, `index.html`, `styles.css`, `webresource.html` (gerado por `pnpm --filter @betinhos/formulario-geral wr`), `model_driven_formulario_geral_command.js`, `scripts/**`, `power-platform/**`; publicação em `packages/deploy/push-formulario-dev.ps1` (workflow Deploy).
- Tela: Formulário de Agendamento (criação/edição de `cr40f_reservadeveculos`), aberto pelo Sistema Betinhos em `#/geral` → "Criar serviço" ou `#/geral?novo=1`.

## Preparar ambiente
- Mock local (sem Dataverse), a partir de `apps/formulario-geral`: `node scripts/dev_server.js --port 4317` (ou `pnpm --filter @betinhos/formulario-geral dev`, porta 36501) → `http://localhost:4317/`. Confirme `curl -s -o /dev/null -w "%{http_code}" http://localhost:4317/` = `200`.
- Navegador interno a 1440×900 (`resize_window`). O seletor de passageiro abre sozinho; o mock traz Carlos Mendes, Juliana Lima e Maria Souza.
- DEV autenticado (opcional): Claude in Chrome, `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/geral?novo=1`. Antes, force o cache: `await fetch('/WebResources/new_formulario_geral.html', {cache:'reload'})` no console da página.

## Roteiro
1. Testes de contrato: `pnpm --filter @betinhos/formulario-geral test` → 18 passam, 12 `.test.js` e 6 `.test.mjs` (ou, a partir de `apps/formulario-geral`, `for t in scripts/*.test.js; do node "$t" >/dev/null 2>&1 && echo "ok $t" || echo "FALHA $t"; done` → todos `ok` (12 scripts em 09/11/2026, inclui `error_logger_integration.test.js` e `xlsx_import_parser.test.js`).
2. Abrir `http://localhost:4317/` → o diálogo "Selecionar passageiro" abre com foco na busca; cada item mostra nome, `telefone • e-mail` e o cliente (`document.querySelectorAll('.passenger-picker-item')[0].innerText` contém `•`).
3. `Esc` → clicar "Agendar serviços" com tudo vazio → 9 campos com `.is-invalid` (Data e horário de saída, Cliente, Solicitante, Tipo do serviço, Tipo do veículo, Trajeto, Passageiros, Endereço de saída, Destino), foco em `#saidaData` e toast "Revise 9 campos: …".
4. Abrir o seletor (`button` "Selecionar Passageiro") e escolher "Carlos Mendes" → Cliente, Solicitante, endereço e tipo de veículo são preenchidos e saem do vermelho; sobram 4 marcas (data, tipo do serviço, trajeto, destino).
5. Cartão do passageiro (`.passenger-row .row-title`) mostra o nome completo "Carlos Mendes" (`scrollWidth <= clientWidth`) e `title` "Abrir registro: Carlos Mendes"; nome longo corta com reticências (coluna limitada a 320 px).
6. Campo Trajeto (`#trajeto`) tem o placeholder "Ex.: Paulista → Congonhas".
7. Console sem erros (`read_console_messages` com `onlyErrors`).
7a. Logger de erros (mock): no console da página, `await BetinhosErrorLogger.logAppError(new Error('x'))` → `"skipped"`; `window.__BETINHOS_ERROR_LOGGER__` existe e nenhuma chave `betinhos-error-log-queue-v1:*` é criada no localStorage.
8. DEV (opcional, cria registro): preencher com passageiro fictício "TESTE FICTICIO IA … NAO OPERAR" e trajeto "TESTE UX AUDIT" → aviso "Serviço OS-NNNN criado com sucesso" com o número real da OS; a OS aparece no topo do Geral.
9. DEV, logger (cria e apaga 1 linha de log): no iframe do formulário (`new_formulario_geral.html`), `setTimeout(() => { throw new Error('teste error-logger Formulario Geral') })`. Consulte `new_appmotoristaslogs?$filter=new_appname eq 'Tela Formulario Geral' and contains(new_message,'teste error-logger')` (token: `az account get-access-token --resource https://org23b93544.crm2.dynamics.com`) → `new_appversion` = `v<versão da tela>`, `new_builtat` = `dd/mm/aaaa HH:mm`, `new_screen` = aba atual, `new_useremail` preenchido. Apague a linha (`DELETE`) e confirme 404.

## Casos de borda
- Carro do serviço: o formulário não preenche mais o carro pela posse/carro atual do motorista. Só manda `cr40f_veiculo` e `new_origemveiculo`=100000001 (Manual) quando o operador escolhe o carro; sem escolha não manda carro nem origem e o plugin `DriverRecordSharing` decide (terceiro recebe pela posse; colaborador só na finalização pela Infleet). Em serviço novo, trocar motorista ou data limpa o carro não manual; em edição, mostra o carro gravado. DEV: novo serviço com motorista colaborador → salva sem carro; escolher um carro → salva com origem Manual.
- Status "Troca de Veículos": tipo do serviço, veículo, trajeto, passageiros, endereço e destino deixam de ser obrigatórios.
- Retorno e serviços frequentes ativos acrescentam as próprias pendências na mesma lista.
- Logger: o pacote vem copiado em `vendor/betinhos-error-logger.iife.js` (design-system-betinhos, `packages/ui/dist/error-logger.iife.js`); o build o embute no `<head>` e grava `window.__FORMULARIO_BUILD__.builtAt`. Dedupe 60 s por ação+mensagem e 30 logs por sessão: repita o teste com outra mensagem.
- Importação XLSX sem as colunas "Cidade Origem/Destino" (relatório da Embraer desde 05/11/2026): a cidade sai do endereço, no trecho antes da UF (`, SP`, ` - SP` ou `/SP`), e o trajeto fica "Cidade / Cidade", nunca o endereço completo. Com as colunas, elas valem. `node scripts/xlsx_import_parser.test.js` cobre os dois formatos.
- Checkout no Windows traz CRLF (`core.autocrlf=true`): testes que comparam trechos com `\n` precisam normalizar as quebras de linha.

## Evidência obrigatória
- Saída dos 12 scripts com `ok`; screenshot do passo 3 (campos marcados) e do passo 5 (cartão); console sem erros.

## Limites
- Mock não grava no Dataverse: o número da OS (passo 8) só aparece no DEV.
- PROD é somente leitura: não criar reservas lá.
- `pnpm --filter @betinhos/formulario-geral build` incrementa o PATCH em `version.json` e `package.json` (base = maior entre a do repo e `PUBLISHED_VERSION`); para gerar o WebResource sem bump use `wr`. Não commite o bump: quem versiona é o Deploy. O diff do `webresource.html` regenerado contra o commitado só pode mudar versão e data/hora do build.
- Os testes `design_system_alignment` e `xlsx_import_parser` leem `DESIGN_SYSTEM.html` e `Relatorio - 2026-05-15T144227.698.xlsx` na pasta do app.

## Link de cadastro do passageiro
- Mock: com uma reserva salva, o botão "Link de cadastro" na barra de passageiros abre `#linkCadastroOverlay` com "Vale até dd/mm HH:mm", 2 passageiros (1 com foto) e o aviso "A solicitante poderá substituir os dados já cadastrados". Sem reserva salva, aparece o toast "Salve o serviço antes...". "Copiar link" mostra o toast; Esc, X e clique no overlay fecham o painel.
- Na edição do passageiro, "Gerar link deste passageiro" envia `new_PassageiroId` = id do `cr40f_bancodedados`.
- DEV: a Custom API `new_GerarLinkCadastro` devolve um link `https://cadastro-passageiro.betinhosexecutiveservice.workers.dev/#t=…` válido por 36 h. Gerar de novo revoga o link anterior do mesmo escopo.
- Foto do passageiro: URLs `/:i:/r/sites/BetinhosGestoInterna/...` são lidas pelo flow "Flow - Consultar Arquivos Sharepoint" (variável `new_URLFlowConsultarArquivosSharePoint`, `caminhoSharePoint` = `/Documentos Compartilhados/...`) e exibidas como `data:`. No DEV, ao abrir o passageiro "Renan de Almeida", o log `[TFG foto pax]` deve mostrar `render:loaded`. `node scripts/passenger_photo_flow_path.test.js` cobre a extração do caminho.
- Cache da foto: a primeira abertura busca pelo flow em segundo plano (até 3 por vez) e guarda no IndexedDB a foto completa e uma miniatura de 160 px, com chave URL + `modifiedon`. Na segunda abertura, o log deve mostrar `cache:hit-idb` sem chamar o flow. Enquanto a foto carrega, o avatar mostra a inicial, nunca o texto "Foto de...". `node scripts/passenger_photo_cache.test.js` cobre a chave e a remoção (200 entradas / 30 MB).
