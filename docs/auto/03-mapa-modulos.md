# 03 - Mapa de módulos do shell (`apps/shell`)

Documento gerado a partir do código em `apps/shell/src` e `packages/dataverse/src` (branch `docs/auto-sistema-betinhos`). Onde faltou evidência no código, a afirmação está marcada como "não confirmado".

## 1. Como o shell funciona

- **Ponto de entrada**: `apps/shell/src/main.tsx` instala o log de erros (`instalarLogDeErros`), converte `?data=<rota>` em hash (`applyRouteFromSearch`, usado pelo sitemap do model-driven), liga a medição de desempenho e monta `<App />` em `StrictMode`.
- **`App.tsx`**: cria o `host` (`createHost`), lê a rota (`useHashRoute`) e a query do hash (`useHashQuery`), resolve o item do menu (`findItem`), troca rotas antigas por novas (`rotaAtualizada`, via `history.replaceState`), define o título do documento (`<rótulo> · Sistema Betinhos`), busca os rótulos das tabelas na metadata (`host.metadata.entities(ENTITY_NAMES)`) e renderiza `AppShell` > `RouteLayout`. Mostra o `BuildBadge` com `__APP_VERSION__` e `__BUILD_DATE__`. Também liga `iniciarCapturaDeErros` (grava em `cr40f_errodosistema`, comentário em `App.tsx`) e o selo de documentos urgentes (`useDocumentosBadge`).
- **Rotas por hash** (`apps/shell/src/nav/useHashRoute.ts`): WebResource não aceita rota por path, então a rota é `#/<id-do-item>?chave=valor`. `parseHash` separa id e query; `hrefFor(id, params)` monta o link; `useHashRoute` e `useHashQuery` usam `useSyncExternalStore` sobre `hashchange` e o evento `bt:hashquery`. A rota padrão é o primeiro item do menu (`DEFAULT_ITEM` = `inicio`).
- **Menu** (`apps/shell/src/nav/menu.ts`): `MENU` é um espelho do sitemap do app model-driven "App Betinhos Interno" (lido do DEV em 02/10/2026, segundo o comentário do arquivo). Cada item tem `kind`:

| `kind` | Significado | Como `RouteLayout` abre (`apps/shell/src/app/RouteLayout.tsx`) |
|---|---|---|
| `page` | Tela React do próprio shell (`page` = chave em `PAGE_LOADERS`; `agente` e `aba` opcionais) | `LazyPage` dentro de `RouteErrorBoundary` + `Suspense` (um chunk por tela, `apps/shell/src/app/routes.tsx`) |
| `webresource` | Tela legada, WebResource HTML | `Frame` (iframe) em `<clientUrl>/WebResources/<resource>?host=shell` (ou `&host=shell`) |
| `entity` | Tabela atendida pela lista nativa do model-driven (rótulo vem da metadata) | `EntityFrame`: iframe em `<clientUrl>/main.aspx?pagetype=entitylist&etn=<tabela>&navbar=off[&appid=...]` |
| `external` | Link externo (só o Infleet) | Não passa pelo `RouteLayout`: a `AppShell` usa `item.url` como `href` do menu, marcado `external` (`apps/shell/src/app/AppShell.tsx` linhas 112-113) |
| `unavailable` | Item sem tela, mostra `EmptyState` com o `reason` | `PageLayout` + `EmptyState` (nenhum item do menu atual usa este tipo) |

- **`host=shell`**: a query `host=shell` avisa ao WebResource legado que ele está dentro do shell, para recolher a própria barra lateral e o rodapé de versão (comentário em `RouteLayout.tsx`).
- **Host** (`apps/shell/src/host.ts`): `createHost()` devolve `{ mode: 'mock' }` quando `isLocalHost()` (localhost/127.0.0.1) ou `{ mode: 'dataverse', clientUrl, client, metadata, insideModelDriven, appId }`. A URL do cliente vem de `Xrm.Utility.getGlobalContext().getClientUrl()` do host ou de `location.origin`. O app model-driven consultado é `cr40f_ModelDrivenBetinhos` (`appmodules?$filter=uniquename eq ...`). Todas as chamadas passam por `reportingFetch(logFalhaDataverse)`.
- **Autenticação e Xrm**:
  - Dataverse: não há MSAL no shell geral. O cliente usa `credentials: 'same-origin'` (cookie da sessão do Dataverse) em `packages/dataverse/src/client.ts`.
  - `window.Xrm`: se não existir, o shell define `hostXrm ?? createXrmShim(client, clientUrl)`. O shim (`packages/dataverse/src/xrm.ts`) oferece `Xrm.WebApi.retrieveMultipleRecords/retrieveRecord/createRecord/updateRecord/deleteRecord`, `online.execute` e `online.executeMultiple` (fora do model-driven, só aceita `Update`), mais `Utility.getGlobalContext`. Serve às telas legadas em iframe (`parent.Xrm`) e a algumas telas React que ainda chamam `Xrm.WebApi.online.execute` (ex.: checklists em `frota/checklists/domain/checklists.ts`).
  - MSAL (Microsoft Graph) só existe no Planner: `apps/shell/src/pages/planner/data/msal.ts`, escopos `User.Read`, `Tasks.Read`, `User.ReadBasic.All` (Planner) e `User.Read`, `Mail.ReadWrite` (e-mail), cache em `sessionStorage`, variáveis `VITE_MSAL_CLIENT_ID`, `VITE_MSAL_TENANT_ID`, `VITE_MSAL_REDIRECT_URI`, `VITE_MSAL_WEBRESOURCE_REDIRECT_NAME`.
- **Rotas antigas redirecionadas** (`rotaAtualizada` em `menu.ts`): `cr40f_homebetinhos` para `inicio`; `cr40f_clientes1` para `clientes`; `new_telafuncoesoperacionais` e `custom-page-funcoes-operacionais` para `funcoes-operacionais`; `new_gestao_erros_operacionais` para `qualidade`; `cr40f_telapagamentofornecedores` para `pagamento-fornecedores`; `new_gestaochecklistsveiculos` para `frota-checklists`; `infracoes` para `frota-multas?sub=infracoes`; `frota?aba=<x>` para `frota-<x>` (`aba=ocorrencias` vira `frota-colisoes` se `tipo=colisao`, senão `frota-multas`).
- **Prefetch** (`routes.tsx`): `usePrefetchOnIntent` baixa o chunk ao parar o mouse 100 ms sobre link `#/...`, ao focar ou tocar; desligado com `saveData`/`prefers-reduced-data`. Chunk ausente após publicação nova recarrega a página uma vez por build (`reloadOncePerBuild`).
- **Mock**: em `host.mode === 'mock'` as telas React usam dados de exemplo e os itens `webresource`/`entity` mostram "Esta tela abre dentro do Dataverse".

## 2. Diagrama

```mermaid
flowchart TD
  main[main.tsx<br/>applyRouteFromSearch + render] --> App[App.tsx]
  App --> host[createHost - host.ts]
  host -->|localhost| mock[mode: mock]
  host -->|Dataverse| dv[mode: dataverse<br/>client + metadata + Xrm shim]
  App --> route[useHashRoute / useHashQuery<br/>#/id?query]
  route --> find[findItem + rotaAtualizada - menu.ts]
  find --> AS[AppShell - menu lateral]
  find --> RL[RouteLayout]
  RL -->|kind=page| LP[LazyPage<br/>PAGE_LOADERS - 1 chunk por tela]
  RL -->|kind=webresource| FR1[Frame: /WebResources/x.html?host=shell]
  RL -->|kind=entity| FR2[Frame: main.aspx?pagetype=entitylist]
  RL -->|kind=unavailable| UN[EmptyState]
  LP --> pages[pages/* : data + domain + components]
  pages --> pkg[@betinhos/dataverse<br/>createClient / metadata / xrm]
  dv --> pkg
  pkg --> api[/api/data/v9.2 - Web API/]
  pages -.->|Planner| msal[MSAL + Graph]
  pages -.->|Flows HTTP via variaveis de ambiente| flows[Power Automate]
```

## 3. Tabela de rotas e telas

Rotas = `id` do item no menu (`#/<id>`). Onde há mais de um item para a mesma pasta, está indicado. Tabelas citadas são as achadas no código de `apps/shell/src/pages/<pasta>`; não é lista exaustiva dos campos (ver doc 04).

### Telas React (`kind: 'page'`)

| Rota (`#/...`) | Pasta | Função | Tabelas Dataverse principais | Observações |
|---|---|---|---|---|
| `inicio` | `pages/inicio` | Página Inicial (comunicados, tarefas, indicadores do mês, notícias, agenda) | `cr40f_comunicadohome`, `cr40f_plannertarefa`, `cr40f_reservadeveculos`, `cr40f_composicaodeprecos`, `cr40f_noticiaexterna`, `cr40f_fluxocaixalancamento`, `cr40f_funcionarios` | Substitui o WebResource `cr40f_HomeBetinhos` (`inicio/data/dataverse.ts`) |
| `geral` | `pages/geral` | Tabela Geral dos serviços (reservas): visões, edição, links, portal, cópia | `cr40f_reservadeveculos`, `cr40f_validacaoservico`, `cr40f_composicaodeprecos`, `cr40f_clientes1`, `userqueries` | Menu inicia recolhido nesta rota. Abre WebResources `new_formulario_geral.html`, `cr40f_VoucherConfirmacao.html`, `cr40f_EscalaFDS.html`, `new_gestao_erros_operacionais.html` |
| `dashboard` | `pages/dashboard` | KPIs (serviços, financeiro, frota, despesas, telemetria) | muitas: reservas, composição, manutenções, multas, `cr40f_errooperacional`, telemetria/eventos/viagens Infleet, pagantes, despesas | `dashboard/data/historico2026.ts` é série estática de 2026. Legado em `new_dashboard` (modo TV) |
| `operacional` | `pages/operacional` | Resumo Operacional (escala de motoristas, serviços, passageiros) | `cr40f_reservadeveculos`, `cr40f_funcionarios`, `cr40f_servicosporpassageiro`, `cr40f_veiculos` | Custom API `new_GerarLinkAcompanhamento` |
| `assistente-logistica`, `assistente-financeiro`, `assistente-pessoas`, `assistente-frota` | `pages/agentes` | Assistentes de IA por departamento (`agente` = logistica, financeiro, pessoas, frota): execução, propostas, aprovar/descartar | `cr40f_agenteexecucao`, `cr40f_agenteproposta`, alvos: `cr40f_reservadeveculos`, `cr40f_plannertarefa`, `cr40f_comunicadohome` | 4 itens, mesma tela (`page: 'agentes'`) |
| `funcoes-operacionais` | `pages/funcoes-operacionais` | Trocar motorista, Duplicar pedido, Trocar carro | `cr40f_reservadeveculos`, `cr40f_trocasdecarro`, `new_possedeveiculo`, `new_localdebase`, `cr40f_servicosporpassageiro` | Custom APIs `new_*TrocaDeCarro`; substitui `new_telafuncoesoperacionais` |
| `comunicados` | `pages/comunicados` | Comunicados a motoristas (rascunho, disparo, ciência) | `new_comunicadomotorista`, `new_comunicadodestinatario`, `cr40f_funcionarios` | Custom APIs `new_DispararComunicadoMotorista`, `new_ReenviarPushComunicado` |
| `qualidade` | `pages/qualidade` | Gestão de Qualidade (erros operacionais e ações) | `cr40f_errooperacional`, `cr40f_acaooperacional`, `cr40f_errooperacionalarquivo`, `annotation` | JS (`App.jsx`, `dataverse.js`) embutido; arquivos via Flow `new_FlowURLFlowSalvarArquivosOnedrive` |
| `planner` | `pages/planner` | Planner de tarefas e cotações (V3) | `cr40f_plannertarefa` (+ eventos, relações, equipes, notificações, disparos, tags), `cr40f_pedidodecotacao`, `cr40f_cotacaoopcao`, `cr40f_cotacaoopcaoitem`, `cr40f_cotacaopropostaversao`, `cr40f_boasideias` | MSAL/Graph; `?view=quotes` abre cotações. Migrado de repo antigo |
| `ops` | `pages/ops` | Ordens de Pagamento (OP) | `cr40f_financeiro`, `cr40f_reservadeveculos`, `cr40f_composicaodeprecos` | Cancelar = `cr40f_status` cancelada |
| `pagantes` | `pages/pagantes` | Pagantes: status, link, e-mail, recibo | `cr40f_pagantes`, `cr40f_bancodedados`, `cr40f_reservadeveculos`, `cr40f_composicaodeprecos` | Recibo carrega o script WebResource `cr40f_GerarRecibo` |
| `pendencias` | `pages/pendencias` | Pendências financeiras, sincronizar OP, fechar mês | `cr40f_reservadeveculos`, `cr40f_pagantes`, `cr40f_financeiro`, `cr40f_composicaodeprecos` | Custom APIs `cr40f_SincronizarFinanceiro`, `cr40f_FecharMesCliente` |
| `validacao-cliente` | `pages/validacao-cliente` | Acompanhamento da validação dos serviços pelo cliente (portal) | `cr40f_validacaoservico`, `cr40f_mensagemvalidacao`, `cr40f_validadorcliente`, `cr40f_reservadeveculos`, `cr40f_clientes1`, `cr40f_composicaodeprecos` | Aviso por e-mail via Flow (`cr40f_URLFlowPortalClienteEmails`) |
| `pagamento-fornecedores` | `pages/pagamento-fornecedores` | Lotes de pagamento a terceiros/fornecedores | `cr40f_pagamentoaterceiro`, `cr40f_itempagamentoaterceiro`, `cr40f_eventopagamentoaterceiro`, `cr40f_terceirofavorecido`, `cr40f_vinculomotoristafavorecido` | JS (`lib/dataverse.js`); Flows `new_FlowURLEnviarDocumentoLoteFornecedor` e `new_FlowURLFlowSalvarArquivosOnedrive` |
| `despesas-operacionais` | `pages/despesas` | Despesas do App Motoristas, análise de IA, anexos | `cr40f_despesaoperacional`, `cr40f_anexodespesaoperacional` | Item de menu `despesas-operacionais` usa `page: 'despesas'`; arquivo via Flow `new_URLFlowConsultarArquivoOneDrive` |
| `frota` (Pendências), `frota-veiculos`, `frota-manutencoes`, `frota-multas`, `frota-colisoes`, `frota-indicadores`, `frota-plano`, `frota-checklists` | `pages/frota` | Gestão de Frota por abas (`aba`): pendências, veículos, manutenções, multas (+ infrações, termo), colisões, indicadores, plano preventivo, checklists | `cr40f_veiculos`, `cr40f_manutencoes`, `cr40f_multas`, `cr40f_infracaodetransito`, `cr40f_colisao_v2`, `new_possedeveiculo`, `cr40f_itemplanopreventivo`, `cr40f_baselinepreventiva`, `new_termomulta`, `new_checklistmodelo`, `new_checklistmodeloitem`, `new_checklistveiculo` | Troca de item não remonta a tela (`RouteLayout` usa `key=page` quando há `aba`). `#/frota?ficha=...` continua válido |
| (sem item no menu) `infracoes` | `pages/infracoes` | Catálogo de infrações de trânsito | `cr40f_infracaodetransito`, `cr40f_multas` | Existe em `PAGE_LOADERS`, mas `rotaAtualizada` redireciona `#/infracoes` para `frota-multas?sub=infracoes` |
| `pessoas` | `pages/pessoas` | Cadastro de passageiros/solicitantes | `cr40f_bancodedados`, `cr40f_clientes1`, `cr40f_reservadeveculos`, `cr40f_servicosporpassageiro`, `cr40f_pagantes` | Histórico de serviços do passageiro |
| `clientes` | `pages/clientes` | Cadastro de clientes | `cr40f_clientes1` | Substitui a lista nativa `cr40f_clientes1` |
| `funcionarios` | `pages/funcionarios` | Ficha de funcionários/motoristas, documentos, posse de veículo, acesso ao App Motoristas | `cr40f_funcionarios`, `cr40f_veiculos`, `new_possedeveiculo`, `cr40f_multas`, `systemuser` | Custom APIs `cr40f_*AcessoMotorista`; arquivos via Flows SharePoint |
| `documentos` | `pages/documentos` | Documentos de pessoas e frota, validades, destinatários de aviso | `cr40f_documento`, `cr40f_tipodocumento`, `cr40f_avisodestinatario`, `cr40f_funcionarios`, `cr40f_veiculos` | Selo de urgentes no menu (`useDocumentosBadge`) |
| `curriculos` | `pages/curriculos` | Currículos (quadro por status) | `new_curriculo` | Arrastar muda `new_statuscurriculo` |
| `equipamentos` | `pages/equipamentos` | Equipamentos, tipos, responsável, fotos | `cr40f_equipamento`, `cr40f_tipoequipamento`, `cr40f_fotoequipamento`, `cr40f_funcionarios` | Fotos no SharePoint |
| `treinamentos` | `pages/treinamentos` | Treinamentos com quiz, anexos e participação | `cr40f_treinamento`, `cr40f_treinamentoparticipacao`, `cr40f_funcionarios` | Custom API `cr40f_LembrarTreinamento` |
| `logs-apps` | `pages/logs` | Logs dos apps (erros dos apps) | `new_appmotoristaslog` | Também referência a `cr40f_SistemaBetinhos` em `logs/prompt.ts` |

### WebResources, tabelas nativas e externos (ainda não migrados)

| Rota (`#/...`) | Tipo | Alvo | Grupo |
|---|---|---|---|
| `new_telacomposicaopreco` | webresource | `new_TelaComposicaoPreco.html` | Financeiro |
| `cr40f_recibos_v2` | entity | `cr40f_recibos_v2` | Financeiro |
| `cr40f_servicosporpassageiro`, `cr40f_trocasdecarro`, `new_possedeveiculo`, `new_fotomanutencao`, `cr40f_anexodespesaoperacional`, `cr40f_categoriadespesaoperacional`, `cr40f_formapagamentodespesa`, `cr40f_anexocolisao_v2`, `cr40f_anexorecebimento_v2`, `cr40f_pedidodecotacao`, `cr40f_composicaodeprecos`, `new_marketing` | entity | mesma tabela | Back-End |
| `new_dashboard` | webresource | Dashboard antigo (TV) | Back-End |
| `new_teladespesasoperacionais` | webresource | Despesas Operacionais | Back-End |
| `cr40f_gerenciarcomunicados` | webresource | `cr40f_GerenciarComunicados.html` (Comunicados antigo) | Back-End |
| `cr40f_telafluxodecaixa` | webresource | `cr40f_TelaFluxoDeCaixa.html` | Back-End |
| `infleet` | external | `https://app.infleet.com.br/monitoring` | Operacional |

Nota: o `id` do item webresource é `resource.replace(/\.html$/i, '').toLowerCase()` (função `wr` em `menu.ts`), portanto a rota é `#/new_telacomposicaopreco`. A rota da tabela é o nome lógico da entidade (função `table`).

Itens por grupo de menu (`MENU`): Início (`inicio`), Operacional (geral, dashboard, operacional, assistente-logistica, funcoes-operacionais, comunicados, qualidade, infleet, planner), Financeiro (composição de preço, ops, pagantes, pendencias, validacao-cliente, assistente-financeiro, recibos v2, pagamento-fornecedores, despesas-operacionais), Frota (8 visões + assistente-frota), Cadastros (pessoas, clientes, funcionarios, documentos, assistente-pessoas, curriculos, equipamentos, treinamentos), Back-End (tabelas e WebResources acima + `logs-apps`).

## 4. `packages/dataverse` (`@betinhos/dataverse`)

API exportada em `packages/dataverse/src/index.ts`:

| Export | Arquivo | O que faz |
|---|---|---|
| `createClient(clientUrl, fetchImpl?)` | `client.ts` | Cliente Web API v9.2 (`/api/data/v9.2`), `credentials: 'same-origin'`, cabeçalhos OData 4.0, `Prefer: odata.include-annotations` com FormattedValue, paging cookie, morerecords e totalrecordcount; `maxPageSize` opcional |
| `DataverseClient` | `client.ts` | `apiUrl`, `request<T>(path, init)` (204 vira `undefined`, multipart devolve texto), `getAll(path)` (segue `@odata.nextLink`), `create(entitySet, data)` (devolve o id lido de `OData-EntityId`), `update(entitySet, id, data)` (PATCH com `If-Match: *`, não vira upsert), `remove(entitySet, id)` |
| `reportingFetch(report, fetchImpl?)`, `FetchFailure` | `client.ts` | Envolve o fetch e reporta falhas (usado com `logFalhaDataverse`) |
| `DataverseError`, `cleanId`, `Row` | `client.ts` | Erro com status HTTP, remoção de `{}` do GUID, tipo de linha |
| `createMetadata(client)` | `metadata.ts` | `entity(logicalName)` e `entities(names[])` (EntitySetName, rótulo plural, PrimaryNameAttribute, ObjectTypeCode, com cache; lotes de 15), `choices(entity, attribute, 'Picklist'|'State'|'Status')` (opções reais), atributos (`AttributeMeta`, `ChoiceOption`, `EntityInfo`). A lista completa de métodos de `createMetadata` além de `entity`, `entities` e `choices` não foi lida em detalhe (não confirmado) |
| `formatted(row, field)`, `chunk(items, size)`, `odataString(value)` | `format.ts` | Valor formatado, partição de listas, escape de aspas em OData |
| `createXrmShim`, `getHostXrm`, `isLocalHost`, `XrmHost`, `XrmWebApi` | `xrm.ts` | Xrm mínimo sobre a Web API; `getHostXrm` procura `window.parent.Xrm` e depois `window.Xrm`; `isLocalHost` é `localhost`/`127.0.0.1` |

Testes: `packages/dataverse/src/dataverse.test.ts`.

## 5. Lacunas

- Páginas JS (`qualidade`, `pagamento-fornecedores`) e o Planner são grandes; as tabelas listadas vêm das constantes de tabela e de buscas por `cr40f_`/`new_`, não de leitura integral.
