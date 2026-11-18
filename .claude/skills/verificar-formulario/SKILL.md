---
name: verificar-formulario
description: "Verifica o Formulário Geral (WebResource new_formulario_geral.html): testes de contrato, validação dos obrigatórios, seletor e cartão do passageiro e aviso de sucesso. Use após mudar apps/formulario-geral/**, packages/deploy/push-formulario-dev.ps1 ou quando pedirem para testar o Formulário Geral."
---
# Verificar Formulário Geral

## Cobre
- Código: `apps/formulario-geral/` (`app.js`, `index.html`, `styles.css`, `model_driven_formulario_geral_command.js`, `scripts/**`, `power-platform/**`); `webresource.html` é gerado no build e não é versionado. Comandos a partir da raiz do monorepo.
- Tela: Formulário de Agendamento (criação/edição de `cr40f_reservadeveculos`), aberto pelo Sistema Betinhos em `#/geral` → "Criar serviço" ou `#/geral?novo=1`.

## Preparar ambiente
- Mock local (sem Dataverse): `node apps/formulario-geral/scripts/dev_server.js --port 4317` (ou `pnpm --filter @betinhos/formulario-geral dev`, porta 36501) → `http://localhost:4317/`. Confirme `curl -s -o /dev/null -w "%{http_code}" http://localhost:4317/` = `200`.
- Navegador interno a 1440×900 (`resize_window`). O seletor de passageiro abre sozinho; o mock traz Carlos Mendes, Juliana Lima e Maria Souza.
- DEV autenticado (opcional): Claude in Chrome, `https://org23b93544.crm2.dynamics.com/WebResources/cr40f_SistemaBetinhos.html#/geral?novo=1`. Antes, force o cache: `await fetch('/WebResources/new_formulario_geral.html', {cache:'reload'})` no console da página.

## Roteiro
1. Testes de contrato: `pnpm --filter @betinhos/formulario-geral test` (gera o `webresource.html` sem bump e roda todos os `scripts/*.test.js|mjs`) → `19/19 testes ok` (09/11/2026; inclui `error_logger_integration` e `xlsx_import_parser`, este com fixture fictício gerado no teste).
2. Abrir `http://localhost:4317/` → o diálogo "Selecionar passageiro" abre com foco na busca; cada item mostra nome, `telefone • e-mail` e o cliente (`document.querySelectorAll('.passenger-picker-item')[0].innerText` contém `•`).
3. `Esc` → clicar "Agendar serviços" com tudo vazio → 9 campos com `.is-invalid` (Data e horário de saída, Cliente, Solicitante, Tipo do serviço, Tipo do veículo, Trajeto, Passageiros, Endereço de saída, Destino), foco em `#saidaData` e toast "Revise 9 campos: …".
4. Abrir o seletor pelo botão "+" (`#addPassenger`; o nome do cartão vazio fica `aria-disabled`) e escolher "Carlos Mendes" → Cliente, Solicitante, endereço e tipo de veículo são preenchidos e saem do vermelho; sobram 4 marcas (data, tipo do serviço, trajeto, destino).
5. Cartão do passageiro (`.passenger-row .row-title`) mostra o nome completo "Carlos Mendes" (`scrollWidth <= clientWidth`) e `title` "Abrir registro: Carlos Mendes"; nome longo corta com reticências (coluna limitada a 320 px).
6. Campo Trajeto (`#trajeto`) tem o placeholder "Ex.: Paulista → Congonhas".
6a. Observação operacional: 5 abas na ordem Mot, Interna, Faturamento, Final, Pref Pax, cada uma com ícone (`.seg-icon svg`), na ida (`[data-obs]`) e no retorno (`[data-ret-obs]`). Escrever um texto em cada aba, trocar de aba e voltar preserva o texto; salvar grava Mot em `cr40f_obsdeoperao`, Interna em `cr40f_observaointerna`, Faturamento em `new_observacaodefaturamento` e Final em `new_observacaofinal` (no mock: `JSON.parse(localStorage.formulario_geral_mock_db_v1).reservas.at(-1)`), inclusive o texto da aba ativa no momento do clique. Depois de salvar, a aba destacada volta a ser Mot (`syncObsTabs`). Reabrir com `?id=<id>` carrega Faturamento e Final. Trechos importados por XLSX têm as mesmas 5 abas.
7. Console sem erros (`read_console_messages` com `onlyErrors`).
7a. Logger de erros (mock): no console da página, `await BetinhosErrorLogger.logAppError(new Error('x'))` → `"skipped"`; `window.__BETINHOS_ERROR_LOGGER__` existe e nenhuma chave `betinhos-error-log-queue-v1:*` é criada no localStorage.
7b. Rodapé de versão: `document.querySelector('.code-version').innerText` = `v<versão> · dd/mm/aaaa HH:mm` (data/hora do build, America/Sao_Paulo; no mock, abra `/webresource.html`, pois o `index.html` não traz `builtAt` e mostra só `v<versão>`). Canto inferior direito, `pointer-events: none`.
8. DEV (opcional, cria registro): preencher com passageiro fictício "TESTE FICTICIO IA … NAO OPERAR" e trajeto "TESTE UX AUDIT" → aviso "Serviço OS-NNNN criado com sucesso" com o número real da OS; a OS aparece no topo do Geral.
9. DEV, logger (cria e apaga 1 linha de log): no iframe do formulário (`new_formulario_geral.html`), `setTimeout(() => { throw new Error('teste error-logger Formulario Geral') })`. Consulte `new_appmotoristaslogs?$filter=new_appname eq 'Tela Formulario Geral' and contains(new_message,'teste error-logger')` (token: `az account get-access-token --resource https://org23b93544.crm2.dynamics.com`) → `new_appversion` = `v<versão da tela>`, `new_builtat` = `dd/mm/aaaa HH:mm`, `new_screen` = aba atual, `new_useremail` preenchido. Apague a linha (`DELETE`) e confirme 404.

## Casos de borda
- Carro do serviço: o formulário não preenche mais o carro pela posse/carro atual do motorista. Só manda `cr40f_veiculo` e `new_origemveiculo`=100000001 (Manual) quando o operador escolhe o carro; sem escolha não manda carro nem origem e o plugin `DriverRecordSharing` decide (terceiro recebe pela posse; colaborador só na finalização pela Infleet). Em serviço novo, trocar motorista ou data limpa o carro não manual; em edição, mostra o carro gravado. DEV: novo serviço com motorista colaborador → salva sem carro; escolher um carro → salva com origem Manual.
- Comando model-driven (`openEdit`): só abre registro da própria tabela `cr40f_reservadeveculos`. Sem seleção, GUID solto no `primaryControl` não vale (mostra "Selecione um serviço para editar."); referência de outra tabela (`TypeName`) é ignorada, e seleção de outra tabela num subgrid não cai no registro do formulário. `node apps/formulario-geral/scripts/model_driven_command.test.js` cobre.
- Status "Troca de Veículos": tipo do serviço, veículo, trajeto, passageiros, endereço e destino deixam de ser obrigatórios.
- Retorno e serviços frequentes ativos acrescentam as próprias pendências na mesma lista.
- Logger: o pacote vem copiado em `vendor/betinhos-error-logger.iife.js` (design-system-betinhos, `packages/ui/dist/error-logger.iife.js`); o build o embute no `<head>` e grava `window.__FORMULARIO_BUILD__.builtAt`. Dedupe 60 s por ação+mensagem e 30 logs por sessão: repita o teste com outra mensagem.
- Importação XLSX sem as colunas "Cidade Origem/Destino" (relatório da Embraer desde 05/11/2026): a cidade sai do endereço, no trecho antes da UF (`, SP`, ` - SP` ou `/SP`), e o trajeto fica "Cidade / Cidade", nunca o endereço completo. Com as colunas, elas valem. `node apps/formulario-geral/scripts/xlsx_import_parser.test.js` cobre os dois formatos.
- Checkout no Windows traz CRLF (`core.autocrlf=true`): testes que comparam trechos com `\n` precisam normalizar as quebras de linha.

## Evidência obrigatória
- Saída do `pnpm --filter @betinhos/formulario-geral test` com todos `ok`; screenshot do passo 3 (campos marcados) e do passo 5 (cartão); console sem erros.

## Limites
- Mock não grava no Dataverse: o número da OS (passo 8) só aparece no DEV.
- PROD é somente leitura: não criar reservas lá.
- `pnpm --filter @betinhos/formulario-geral build` incrementa a versão (PATCH, a partir de 1.17.4); para gerar o WebResource sem bump use `wr`. A publicação no DEV é só pelo workflow Deploy (`packages/deploy/push-formulario-dev.ps1`); nunca rodar o script local. Não commitar `version.json` com bump fora de uma publicação.
- Sem planilha real no repositório (público): `.xlsx/.xls/.csv` em `apps/formulario-geral` são barrados por `scripts/dados-pessoais.mjs`; sem URL de gatilho (`sig=`) no código.

## Link de cadastro do passageiro
- Mock: com uma reserva salva, o botão "Link de cadastro" na barra de passageiros abre `#linkCadastroOverlay` com "Vale até dd/mm HH:mm", 2 passageiros (1 com foto) e o aviso "A solicitante poderá substituir os dados já cadastrados". Sem reserva salva, aparece o toast "Salve o serviço antes...". "Copiar link" mostra o toast; Esc, X e clique no overlay fecham o painel.
- Na edição do passageiro, "Gerar link deste passageiro" envia `new_PassageiroId` = id do `cr40f_bancodedados`.
- DEV: a Custom API `new_GerarLinkCadastro` devolve um link `https://cadastro-passageiro.betinhosexecutiveservice.workers.dev/#t=…` válido por 36 h. Gerar de novo revoga o link anterior do mesmo escopo.
- Foto do passageiro: URLs `/:i:/r/sites/BetinhosGestoInterna/...` são lidas pelo flow "Flow - Consultar Arquivos Sharepoint" (variável `new_URLFlowConsultarArquivosSharePoint`; o upload usa o flow "Salvar Foto BD" pela variável `new_URLFlowSalvarFotoPassageiro`, ambas obrigatórias no DEV/PROD, sem fallback no código, `caminhoSharePoint` = `/Documentos Compartilhados/...`) e exibidas como `data:`. No DEV, ao abrir um passageiro com foto, o log `[TFG foto pax]` deve mostrar `render:loaded`. `node apps/formulario-geral/scripts/passenger_photo_flow_path.test.js` cobre a extração do caminho.
- Cache da foto: a primeira abertura busca pelo flow em segundo plano (até 3 por vez) e guarda no IndexedDB a foto completa e uma miniatura de 160 px, com chave URL + `modifiedon`. Na segunda abertura, o log deve mostrar `cache:hit-idb` sem chamar o flow. Enquanto a foto carrega, o avatar mostra a inicial, nunca o texto "Foto de...". `node apps/formulario-geral/scripts/passenger_photo_cache.test.js` cobre a chave e a remoção (200 entradas / 30 MB).
