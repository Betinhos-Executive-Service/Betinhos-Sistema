# Inventário funcional — WebResource "Funções Operacionais" (`o WebResource publicado`)

Checklist de paridade para a migração para React. Fonte única: `legacy/funcoes-operacionais/o WebResource publicado` (754 KB, versão `1.0.173`, build `20/10/2026 09:03`).

## 0. Anatomia do arquivo

| Faixa (caracteres) | Conteúdo |
|---|---|
| 0 – 303.694 | `<head>` + CSS inline (tokens `--bt-*`, fontes woff2/ttf em base64, 65 `@media`). Única regra funcional: `.is-embedded .bt-build-badge { display:none }`. |
| 303.694 – 523.000 | Bundle Vite: scheduler + React 19.3.0 + ReactDOM 19.3.0 (terceiros, não inventariado). |
| 523.000 – 550.700 | Design system interno (`bt-field`, `bt-select`, `bt-button`, `bt-drawer`, `bt-dialog`, `bt-tabs`, `bt-segmented`, `bt-choice`/switch, `bt-alert`, `bt-badge`, `bt-empty`, `bt-skeleton`, bottom nav, ícones SVG). |
| 550.700 – 552.900 | Utilitários de data/texto (seção 5.1). |
| 552.900 – 555.500 | Componente "timeline picker" (agenda do motorista, seção 3.3.4). |
| 555.500 – 626.600 | GSAP 3 (terceiros; só usado no pull-to-refresh). |
| 626.600 – 750.662 | Código da aplicação (config, mock, camada Dataverse, logger, App). |

- `<title>Funções Operacionais</title>`, `<meta name="app-version" content="1.0.173">`, `lang="pt-BR"`.
- Tela de boot estática em `#app.app-shell--booting`: marca "B", "Betinhos Executive Service", "Funções Operacionais", "Carregando painel operacional...". O React remove a classe, adiciona `app-shell`, limpa o HTML e monta `<App/>`. Se `#app` não existir: `Error("Elemento #app não encontrado.")`, registrado no log com severidade `critical`.
- Não há no arquivo: exportação Excel, `Xrm.Navigation` (nem `openForm` ou `navigateTo`), Flow HTTP, FetchXML ou links de mapa gerados. O único link externo é o "Abrir mapa" do local da base (seção 4).

### 0.1 Constantes de configuração (`K`)

```
appName: "Funções Operacionais"; brandName: "Betinhos Executive Service"
version: "1.0.173"; buildDate: "20/10/2026 09:03"
orgUrl: "https://appbetinhosdev.crm2.dynamics.com/"
environmentId: "25a2ab78-cf07-ee41-a124-457aa2c29aea"
modelDrivenAppId: "7c7c8fda-53d0-f011-8543-6045bd3a51ea"
customPageName: "custompage:cr40f_funesoperacionais_d5e5a"
storageKeys.mockDb: "betinhos_funcoes_operacionais_mock_v3"
ranges: servicesStartOffsetDays -7, servicesEndOffsetDays 7, driverStartOffsetDays 0, driverEndOffsetDays 2 (estes dois últimos não são usados)
views: driver "Trocar Motorista", clone "Clonar Pedido", vehicle "Trocar Carro"
```

- O `orgUrl` fixo só serve de fallback. A URL real vem de `Xrm.Utility.getGlobalContext().getClientUrl()` ou de `window.location.origin`.
- O selo `bt-build-badge` no rodapé mostra `v1.0.173 · 20/10/2026 09:03` e fica oculto quando a página roda com `host=shell`.

---

## 1. Estrutura da tela

### 1.1 Cabeçalho e navegação

- Cabeçalho (`app-header app-header--{view}`):
  - Eyebrow: "Operação".
  - Título por aba: "Trocar Motorista", "Duplicar pedido", e na aba Carro "Trocar carro" (novo) ou "Editar troca de carro" (edição).
  - Botão **Atualizar** (ícone refresh). Enquanto atualiza, o texto vira "Atualizando" e o aria-label alterna entre "Atualizar dados" e "Atualizando dados".
- Abas (`bt-tabs`, aria-label "Funções operacionais"): **Motorista** (ícone users, `driver`), **Pedido** (ícone copy, `clone`) e **Carro** (ícone swap, `vehicle`).
- Bottom nav mobile com os mesmos 3 itens e `href` de hash (`#/trocar-motorista`, `#/duplicar-pedido`, `#/trocas-de-carro`).
- A troca de aba define a animação `tab-forward`/`tab-back` (classe `content--motion-*`), conforme a ordem driver → clone → vehicle. Ao entrar em driver ou clone vindo de outra aba, a paginação volta a 16.
- **Pull-to-refresh** no `#app`:
  - Só funciona com a lista no topo (`.content.scrollTop<=0`). Ignora toques em input, textarea, select, button, `.bt-control` e dialog.
  - Rótulos: "Puxe para sincronizar", "Solte para sincronizar", "Sincronizando", "Atualizado".
  - Fica desabilitado durante loading ou refresh. Não mostra toast.
- Overlay de carregamento (`loading-overlay`) com a mensagem de `loadingMessage`. Só aparece depois do primeiro load; antes disso a lista mostra skeleton com 4 cards ("Carregando serviços").
- Região de toasts (`aria-live=assertive`):
  - Tons info, success, warning e danger.
  - Toasts que não são danger somem em 3,6 s, ou em 6 s quando têm ação. Toast danger fica até ser fechado.
  - Botão "Fechar aviso" e botão de ação opcional ("Desfazer", "Abrir pedido").
- Erros globais (`window.error` e `unhandledrejection`) geram o toast danger "Erro inesperado", com a mensagem do erro ou, sem mensagem, "Ocorreu um erro inesperado." (error) ou "Uma operação falhou sem resposta do sistema." (rejection).
- No `resize`, a página atualiza a variável CSS `--app-viewport-height` com `window.innerHeight` (também roda no mount).

### 1.2 Aba "Motorista" (Trocar Motorista) — `view=driver`

- Toolbar "Filtros de serviços":
  - Busca `driverSearch` com placeholder "ID, PAX, trajeto ou motorista" e aria "Buscar serviço". Ao digitar, a paginação volta a 16.
  - Botão de data com ícone calendar e chevron. Rótulo: "A partir de hoje", ou "A partir de dd/mm/aaaa" quando a data é outra. Ele abre e fecha o painel `driverFilterPanel`.
  - No painel, o campo "A partir de" (`input type=date`, `driverStartDate`, default hoje) traz o contador como hint.
  - Chip **"Sem motorista N"** (ícone alert), filtro liga/desliga com `aria-pressed`. Só aparece depois do primeiro load e quando N>0 ou o filtro está ativo. N conta os serviços sem motorista no conjunto filtrado por data e busca, antes do filtro do chip. Ativo, o chip usa a variante primary.
- Contador (`list-count`): "N serviço(s)", com o sufixo " sem motorista" quando o chip está ativo.
- Cabeçalho da lista (desktop): Saída | Pedido | Trajeto e cliente | Motorista | (ação).
- Conjunto exibido (`Xa`):
  1. Serviços carregados (janela de −7 a +7 dias, seção 2.1) com `dataSaida >= 00:00 da data "A partir de"`.
  2. Filtro da busca (5.2).
  3. Ordenação por `dataSaida` crescente.
  4. Filtro opcional "sem motorista".
  - Não há filtro por status: serviços cancelados também aparecem.
- Agrupamento por dia com divisor `h3.day-divider`: "Hoje · dd/mm", "Amanhã · dd/mm" ou "<Dia da semana capitalizado> · dd/mm".
- Paginação incremental: 16 itens por vez. Um sentinel com IntersectionObserver (`rootMargin 700px`, fallback scroll/resize) mostra "Carregando mais serviços...".
- Lista vazia (após o load): ícone search, título "Nada para ajustar", texto "Nenhum serviço encontrado a partir do filtro selecionado. Ajuste a data ou a busca."
- O card de serviço está descrito em 1.5. A ação do card é **"Trocar motorista"** (com motorista) ou **"Definir motorista"** (sem motorista), e abre o drawer da seção 3.1.

### 1.3 Aba "Pedido" (Duplicar pedido) — `view=clone`

- Toolbar "Filtros de pedidos" com a busca `cloneSearch` (placeholder "ID, PAX, cliente ou trajeto", aria "Buscar pedido"). Não há filtro de data.
- Contador "N serviço(s)". Conjunto: todos os serviços carregados (−7 a +7 dias), filtrados pela busca e ordenados por `dataSaida` crescente.
- Usa o mesmo agrupamento por dia, o mesmo cabeçalho de lista e a mesma paginação de 16 ("Carregando mais pedidos...").
- Lista vazia: título "Sem resultados", texto "A busca não retornou nenhum pedido dentro da janela carregada."
- Ação do card: **"Duplicar este pedido"** (ícone copy), que abre o drawer da seção 3.2.
- Por 2,2 s após duplicar, o card criado recebe a classe `service-card--clone-highlight`.

### 1.4 Aba "Carro" (Trocas de carro) — `view=vehicle`

- Painel de formulário (`vehicle-panel`, seção 3.3) e painel **Resumo** (`vehicle-summary`).
- Título do Resumo: "Nova troca" ou "Troca selecionada". Linhas (valor vazio mostra "A definir"):
  - **Tipo**.
  - **Motorista 1** (tipos Troca e Repasse) ou **Responsável** (demais tipos).
  - **Motorista 2** (só Troca e Repasse).
  - **Local da base** (Devolução e Retirada).
  - **Veículo da base** (só Retirada), no formato `modelo • placa`.
  - **Quando**: "dd/mm/aaaa · entre serviços" no modo entre serviços, ou "dd/mm/aaaa HH:MM → HH:MM" no horário fixo.
  - **Registro**: "Agendar", "Foi agora" ou "Foi antes".
  - Com um local selecionado que tem endereço, aparece a nota com o endereço e, se houver `mapUrl`, o link **"Abrir mapa"** (`target=_blank`, `rel=noopener noreferrer`).
- O contador do cabeçalho mostra "Novo agendamento" ou "Edição".
- Não existe lista de trocas nesta tela. A edição só é acessível por URL (seção 7).

### 1.5 Card de serviço (`service-card`)

- O card inteiro é clicável (aria "Abrir detalhes do serviço {readableId}") e abre o drawer de detalhe (3.4).
- Conteúdo:
  - Hora (HH:MM) em destaque e data (dd/mm/aaaa).
  - `#readableId`.
  - Badge de status com o rótulo formatado. O tom vem do rótulo normalizado: contém "cancel" → danger, "confirm" → success, "program" → info, outros → neutral.
  - Etiqueta com o tipo de veículo (ou, sem ele, o tipo de serviço).
  - Trajeto (ou "-").
  - PAX: "N PAX" quando há vínculos `cr40f_servicosporpassageiro` com rótulo. Sem eles, mostra `cr40f_passageirosetelefonedecontato` com os telefones removidos (regex 5.3) ou "—".
  - Cliente (ou "Sem cliente").
  - Rodapé com o motorista (ou "Sem motorista" com ícone alert).
- Classes visuais:
  - Período pela hora de saída: `morning` (<12h), `afternoon` (<18h), `night`.
  - Tom: `alert` (sem motorista), `done` (status Concluído 202410008) ou o período.
  - `is-driver-busy`, `service-card--driver-updated` (feedback de 1,5 s após salvar) e `--clone-highlight`.
- Durante o feedback, o rodapé mostra "Salvando motorista..." ou "Motorista atualizado" com ícone check.

---

## 2. Entidades Dataverse

Acesso padrão por `Xrm.WebApi` (`window.Xrm` ou `window.parent.Xrm`). Se `Xrm.WebApi` não existir, ou se a URL tiver `?mock=1`, a tela entra em **modo mock** (seção 7.3).

Paginação (`qo`):
- `retrieveMultipleRecords` segue o `nextLink`, reaproveitando a query string depois do `?`.
- Limite de 100 páginas. Passado o limite, lança `Error("[PAGINATION_LIMIT] Consulta excedeu 100 páginas em {entidade}.")`.

Rótulos de option set e lookup são lidos da anotação `{campo}@OData.Community.Display.V1.FormattedValue`. Sem a anotação, a tela usa os dicionários de `K.choices`.

Carga inicial (`loadDashboardData`): `Promise.all` de funcionários, veículos, reservas, trocas, posses e locais. Depois disso, carrega os vínculos de passageiros das reservas obtidas. O `mode` fica `"live"` e o `orgUrl` vem de `getClientUrl()`.

### 2.1 `cr40f_reservadeveculos` (Geral / serviços) — entity set `cr40f_reservadeveculoses`

**Leitura** (`retrieveMultipleRecords("cr40f_reservadeveculos", …)`):
```
?$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_horrioprevistoderetorno,cr40f_status,cr40f_statusdefaturamento,cr40f_tipodoservico,cr40f_tipodeveiculo,cr40f_destino,cr40f_endereodesada,cr40f_obsdeoperao,cr40f_observaointerna,cr40f_passageirosetelefonedecontato,cr40f_trajeto,cr40f_perfildopassageiro,cr40f_email,cr40f_receber,cr40f_formadepagamento,cr40f_cotao,cr40f_cr,new_categoriadoitem,_cr40f_cliente_value,_cr40f_solicitante_value,_cr40f_motorista_value,_cr40f_veiculo_value
&$filter=cr40f_dataehorriodesada ge {hoje 00:00 local −7 dias, ISO} and cr40f_dataehorriodesada lt {hoje 00:00 local +8 dias, ISO}
&$orderby=cr40f_dataehorriodesada asc
```
- Sem filtro de status nem de statecode, e sem `$expand`. Os campos `new_datadefinalizacao` e `_cr40f_ot_value` existem no mapa mas não são lidos.
- Mapeamento: `cr40f_id`→readableId, `cr40f_dataehorriodesada`→dataSaida, `cr40f_horrioprevistoderetorno`→previsaoRetorno, `cr40f_status`→statusValue/Label, `cr40f_statusdefaturamento`, `cr40f_tipodoservico`, `cr40f_tipodeveiculo`, `cr40f_formadepagamento`, `cr40f_receber` (booleano tolerante: 1/true/yes/sim e 0/false/no/nao/não), `cr40f_cotao` (número), `new_categoriadoitem`, lookups cliente, solicitante, motorista e veículo (id e rótulo).
- Após a carga, o `motoristaLabel` é sobrescrito pelo apelido ou nome do funcionário carregado (`nickname || name`).

**Gravação: trocar ou definir motorista** (`Xrm.WebApi.updateRecord("cr40f_reservadeveculos", id, …)`):
```json
{ "cr40f_Motorista@odata.bind": "/cr40f_funcionarioses({driverId})" }
```
Para retirar o motorista:
```json
{ "cr40f_Motorista": null }
```

**Gravação: duplicar pedido** (`Xrm.WebApi.createRecord("cr40f_reservadeveculos", payload)`, um POST por data escolhida):
```json
{
  "cr40f_dataehorriodesada": "<data escolhida + horário, ISO>",
  "cr40f_obsdeoperao": "<draft.obsOperacao>",
  "cr40f_observaointerna": "<draft.obsInterna>",
  "cr40f_status": 202410001,
  "cr40f_tipodoservico": <original>,
  "cr40f_tipodeveiculo": <original>,
  "cr40f_destino": "<original>",
  "cr40f_endereodesada": "<original>",
  "cr40f_passageirosetelefonedecontato": "<original>",
  "cr40f_trajeto": "<original>",
  "cr40f_perfildopassageiro": "<original>",
  "cr40f_email": "<original>",
  "cr40f_formadepagamento": <original>,
  "cr40f_cotao": <original>,
  "cr40f_cr": "<original>",
  "cr40f_receber": <original — só se não for null>,
  "cr40f_Cliente@odata.bind": "/cr40f_clientes1s({clienteId})",          // só se houver
  "cr40f_Solicitante@odata.bind": "/cr40f_bancodedadoses({solicitanteId})", // só se houver
  "cr40f_Motorista@odata.bind": "/cr40f_funcionarioses({driverId})"         // só se escolhido
}
```
- O status 202410001 corresponde a "Confirmado".
- **Não são copiados**: veículo, status de faturamento, categoria do item, previsão de retorno, OT e data de finalização. O motorista copiado é o escolhido no drawer, que vem pré-preenchido com o original.

### 2.2 `cr40f_servicosporpassageiro` — entity set `cr40f_servicosporpassageiros`

**Leitura**, em lotes de 10 ids de reserva:
```
?$select=cr40f_servicosporpassageiroid,cr40f_ordemdeselecao,new_enderecodesaidacolunaservicosporpassageiro,_cr40f_geral_value,_cr40f_bancodedados_value
&$filter=_cr40f_geral_value eq {id1} or _cr40f_geral_value eq {id2} ...
```
O resultado é ordenado por `cr40f_ordemdeselecao`. O rótulo do passageiro vem do FormattedValue de `_cr40f_bancodedados_value`.

**Gravação na duplicação**: para cada vínculo do original, um `createRecord("cr40f_servicosporpassageiro", …)`, em sequência:
```json
{
  "cr40f_ordemdeselecao": <order>,
  "cr40f_Geral@odata.bind": "/cr40f_reservadeveculoses({novoId})",
  "cr40f_BancodeDados@odata.bind": "/cr40f_bancodedadoses({passengerId})"   // só se houver passengerId
}
```
O endereço por passageiro (`new_enderecodesaida…`) **não** é copiado.

### 2.3 `cr40f_funcionarios` — entity set `cr40f_funcionarioses`

**Leitura**:
```
?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_emailmicrosoft,cr40f_tipodevinculo,statecode&$filter=statecode eq 0
```
- Não há filtro por cargo: qualquer funcionário ativo aparece como "motorista" nos seletores.
- Ordenação por nome (`localeCompare pt-BR`). O rótulo exibido em toda a tela é `new_apelido || cr40f_nomecompleto`.
- `tipoVinculo`: o rótulo vem do FormattedValue. Sem ele, 1 = "Terceiro" e 0 = "Colaborador".
- Enriquecimento `hasActiveSystemUser`: consulta `systemuser` em lotes de 12 e-mails:
  ```
  ?$select=internalemailaddress&$filter=isdisabled eq false and (internalemailaddress eq '{email}' or ...)
  ```
  O e-mail é comparado em minúsculas, com `'` escapado como `''`. **O campo não é usado na UI** (só é calculado).

### 2.4 `cr40f_veiculos` — entity set `cr40f_veiculoses`

```
?$select=cr40f_veiculosid,cr40f_modelo,cr40f_cor,cr40f_placa,new_propriedade,new_blindado,new_fornecedorlocacao,new_fimlocacao,statecode&$filter=statecode eq 0
```
- Rótulo: `"{modelo||'Veículo'} • {placa||'—'}"`, com ordenação pelo rótulo.
- `new_propriedade`: 100000000 Próprio, 100000001 Alugado.
- `new_blindado` é lido como booleano tolerante.
- `statuscode` está no mapa mas não é lido. Nada é gravado nesta entidade.

### 2.5 `new_localdebase` — entity set `new_localdebases`

**Leitura**:
```
?$select=new_localdebaseid,new_name,new_endereco,new_linkmapa&$filter=statecode eq 0&$orderby=new_name asc
```

**Gravação, cadastro rápido** (`Xrm.WebApi.createRecord("new_localdebase", …)`):
```json
{ "new_name": "<nome trim>", "new_endereco": "<trim, só se preenchido>", "new_linkmapa": "<trim, só se preenchido>" }
```
O id retornado é normalizado para minúsculas, sem chaves.

### 2.6 `new_possedeveiculo` — entity set `new_possedeveiculos`

**Leitura** (somente leitura nesta tela; a posse é alterada pelas Custom APIs):
```
?$select=new_possedeveiculoid,new_iniciodaposse,new_fimdaposse,_new_motorista_value,_new_veiculo_value,_new_localdebase_value
&$filter=statecode eq 0 and (new_fimdaposse eq null or new_fimdaposse ge {agora − 365 dias, ISO})
&$orderby=new_iniciodaposse asc
```
- Uma posse com motorista nulo, veículo e local representa um veículo parado na base.
- A navegação `new_TrocadeCarroRelacionada` está no mapa mas não é usada.

### 2.7 `cr40f_trocasdecarro` — entity set `cr40f_trocasdecarros`

Colunas lidas (em lista e em registro único):
```
cr40f_trocasdecarroid,cr40f_iniciodajaneladetroca,cr40f_fimdajaneladetroca,cr40f_statusdatroca,new_tipodetroca,cr40f_observacao,_cr40f_motorista1_value,_cr40f_motorista2_value,_cr40f_veiculo1antesdatroca_value,_cr40f_veiculo2antesdatroca_value,_new_localdebase_value,new_mododajanela,new_localdatroca,new_alertajanela,_new_m1depoisde_value,_new_m1antesde_value,_new_m2depoisde_value,_new_m2antesde_value
```

**Lista** (`retrieveMultipleRecords`):
```
?$select=<colunas acima>&$filter=(statecode eq 0) and (cr40f_statusdatroca eq 202410000 or cr40f_statusdatroca eq 100000001)
```
Ou seja, só trocas Programadas e Confirmadas.

**Registro único** (para edição e antes de cancelar ou reverter): `retrieveRecord("cr40f_trocasdecarro", id, "?$select=<colunas acima>")`. O `@odata.etag` vira `rowVersion`, com `W/"` e `"` removidos.

**Nenhum POST/PATCH/DELETE direto.** Toda gravação passa pelas Custom APIs da seção 4.2.

### 2.8 Outras

- `cr40f_clientes1s` e `cr40f_bancodedadoses` são usados só em `@odata.bind` (cliente, solicitante e passageiro).
- `systemuser`: 2.3 e o logger.
- `new_appmotoristaslog`: seção 6.

### 2.9 Option sets (valores exatos de `K.choices`)

- **Status da operação** (`cr40f_status`):
  - 202410002 Cancelado
  - 100000001 Requer Análise
  - 202410010 Cancelado com Ressalvas
  - 202410000 Pré-reserva
  - 202410004 Solicitado
  - 202410001 Confirmado
  - 202410005 Programado
  - 202410006 Em Execução
  - 202410008 Concluído
- **Status de faturamento** (`cr40f_statusdefaturamento`):
  - 202410011 Não Faturável
  - 202410005 Pendente
  - 100000001 Composição Realizada
  - 202410000 Cancelado Sem Taxa
  - 202410002 Cancelado Com Taxa
  - 202410003 Cortesia
  - 202410004 Permuta
  - 202410006 Pagante em Viagem
  - 202410007 Pagamento Pendente
  - 202410012 Pagamento Em Atraso
  - 202410008 Faturamento Mensal
  - 202410010 Pago
- **Tipo de serviço** (`cr40f_tipodoservico`):
  - 202410000 Guarulhos
  - 202410001 São Paulo
  - 202410002 Outras Cidades
  - 202410003 Vale do Paraíba
  - 202410004 Rio de Janeiro
  - 202410005 Pindamonhangaba
  - 202410006 São José dos Campos
  - 202410007 Congonhas
  - 202410008 Campinas
  - 202410009 Dentro de São Paulo
  - 202410010 Litoral
  - 202410011 Região dos Lagos
  - 202410012 Extrema
  - 202410013 Nova Odessa
  - 202410014 Baixada Santista
  - 202410015 Minas Gerais
  - 202410016 GPX
- **Tipo de veículo** (`cr40f_tipodeveiculo`):
  - 202410000 Básico
  - 202410001 Executivo
  - 202410002 Blindado
  - 202410003 Van
  - 202410004 Van Blindado
  - 202410005 Spin
  - 202410006 Somente Motorista
- **Forma de pagamento**: 202410000 Cartão de crédito, 202410001 Pedido de compra, 202410002 Pix.
- **Categoria do item** (`new_categoriadoitem`): 100000000 Serviço, 100000001 Manutenção, 100000002 Troca de Veículos.
- **Tipo de troca** (`new_tipodetroca`): 100000000 Troca, 100000001 Devolução à base, 100000002 Retirada da base, 100000003 Repasse.
- **Status da troca** (`cr40f_statusdatroca`): 202410000 Programada, 100000001 Confirmada, 202410001 Concluída, 202410002 Cancelada.
- **Modo da janela** (`new_mododajanela`): 100000000 horário marcado (`fixed`), 100000001 entre serviços (`between`).
- **Propriedade do veículo**: 100000000 Próprio, 100000001 Alugado.

---

## 3. Formulários

### 3.1 Drawer "Trocar motorista" / "Definir motorista" (aba Motorista)

- Eyebrow: `Pedido #{readableId} · dd/mm/aaaa às HH:MM`. O corpo mostra o trajeto (ou "Sem trajeto").
- Busca "Buscar motorista": compara nome e apelido sem acento e sem diferenciar maiúsculas.
- Lista (`listbox` "Motoristas"):
  - Todos os funcionários ativos, com o motorista atual primeiro (badge **"Atual"**) e os demais em ordem alfabética.
  - Avatar com as iniciais (2 primeiras palavras).
  - Quando o serviço tem motorista e a busca está vazia, aparece no topo a opção **"Deixar sem motorista"**.
  - Busca sem resultado: `Nenhum motorista encontrado para “{busca}”.`
- Valor inicial: o motorista atual.
- O botão salvar fica habilitado só se a seleção for diferente da atual. Rótulos:
  - **"Salvar motorista"**.
  - **"Salvar sem motorista"** quando a seleção é vazia e havia motorista.
  - "Salvando..." enquanto salva.
  - Ao lado, o botão **"Cancelar"**.
- Hint: o texto de erro, ou "Salvando motorista...", ou "O serviço ficará sem motorista. Você poderá desfazer logo depois.", ou "A troca é aplicada ao salvar." (seleção alterada), ou "Toque em um motorista diferente do atual."
- Fechar com alteração pendente abre o diálogo **"Descartar alterações?"** (3.5).
- **Fluxo de gravação (otimista)**:
  1. Atualiza a lista localmente e fecha o drawer.
  2. Mostra o feedback no card por 1,5 s.
  3. Chama `changeDriver` (2.1).
- Mensagens de sucesso:
  - Toast "Motorista atualizado": `#{id}: {anterior||'sem motorista'} → {novo}.`, com ação **Desfazer**.
  - Toast "Motorista retirado": `#{id} ficou sem motorista.`, com ação **Desfazer**.
  - Desfazer regrava o motorista anterior e mostra "Alteração desfeita": `#{id} voltou para {nome||'sem motorista'}.`
- Em caso de erro:
  - A lista volta ao valor anterior e o drawer reabre com a mensagem de erro (fallback "Não foi possível alterar o motorista.").
  - Toast danger "Falha".
  - Log com `source App.submitDriverChange`.
- Se o motorista escolhido não existir: erro "Motorista não encontrado." no card.

### 3.2 Drawer "Duplicar pedido" (largo)

- Eyebrow `Pedido #{id}`, título "Duplicar pedido".
- Bloco recolhível com `#id · cliente`, trajeto, data e hora, e o botão "O que será copiado". Ao abrir, mostra Cliente, Trajeto, PAX, Tipo do veículo e Solicitante.

| Campo | Tipo | Obrigatório | Default | Regras |
|---|---|---|---|---|
| Datas do novo pedido (`cloneDates`) | mini-calendário de seleção múltipla | sim (≥1) | nenhuma | 35 dias (5 semanas) a partir do domingo da semana atual; navegação ±35 dias ("Semanas anteriores" desabilitado na semana corrente, "Próximas semanas"); cabeçalho com o mês ("outubro 2026" ou "outubro – novembro 2026"); dias anteriores a hoje desabilitados; marca `is-today`, `is-original` (data do pedido original) e `is-month-start`; aria `"{dia da semana, dia de mês}[, data do pedido original]"` |
| Horário (`cloneTime`) | `time`, step 300 s | sim | hora e minuto do original | — |
| Motorista (`cloneDriver`) | select pesquisável com todos os funcionários | não | motorista do original | — |
| Obs de operação | textarea, 2 linhas | não | `cr40f_obsdeoperao` original | — |
| Observação interna | textarea, 2 linhas | não | `cr40f_observaointerna` original | — |

- Hint das datas: `"{n} data(s): dd/mm, dd/mm"`, ou, sem datas, "Toque nos dias para escolher uma ou mais datas. O ponto marca a data do pedido original."
- Validações, mostradas em toast "Validação" e com foco no campo:
  - "Informe o horário de saída."
  - "Escolha pelo menos uma data."
  - `"{dd/mm} às {HH}:{MM} já passou."`: data e hora no passado.
- Sem serviço selecionado: "Nenhum serviço selecionado."
- Botão: **"Criar pedido"**, ou **"Criar N pedidos"** com mais de uma data. Ao lado, **"Cancelar"**. Fechar com alteração pendente (draft diferente do inicial) pede confirmação.
- **Execução**:
  - Cria uma data por vez. Mensagem de loading: "Duplicando pedido..." ou "Criando pedido i de N...".
  - Depois de criar, fecha o drawer e recarrega com "Atualizando lista...".
- Sucesso, com ação **"Abrir pedido"** (abre o detalhe do primeiro criado):
  - Uma data: "Pedido duplicado" / `Cópia de #{id} para dd/mm/aaaa às HH:MM.`
  - Várias datas: "N pedidos criados" / `Cópias de #{id} para dd/mm, dd/mm.`
- **Falha parcial**:
  - As datas já criadas saem da seleção.
  - Toast danger "Duplicação parcial": `{k} de {N} pedidos criados. {erro} As datas restantes continuam selecionadas.`
  - Recarga silenciosa.
- Falha total: toast "Falha" com o erro (fallback "Não foi possível duplicar o pedido.").
- Log com `source App.submitClone` e payload `{driverId, created, dates}`.

### 3.3 Formulário de troca de carro (aba Carro) — novo e edição

#### 3.3.1 Defaults (novo)

- `typeValue`: "100000000" (Troca).
- `executionMode`: "schedule".
- `programAutomatically`: true.
- `windowMode`: "between".
- `actualDate`: hoje, com a hora e o minuto atuais.
- `startDate/Hour/Minute`: agora arredondado para cima ao múltiplo de 5 minutos. `end` = início + 10 minutos.
- Demais campos vazios.

#### 3.3.2 Campos

| Campo (id) | Tipo | Visível quando | Obrigatório / validação |
|---|---|---|---|
| Tipo de troca (`vehicleType`) | select sem limpar; opções Troca, Devolução à base, Retirada da base, Repasse | sempre | "Selecione o tipo de troca." |
| Motorista 1 / **Responsável** (`vehicleDriver1`) | select pesquisável (`availableDriver1`) | sempre (rótulo "Responsável" em Devolução e Retirada) | "Selecione o motorista 1." / "Selecione o responsável."; "O motorista 1 não está disponível para este tipo de troca."; hint com o veículo previsto ("Sem veículo previsto" ou "modelo • placa · Alugado · Blindado") |
| Motorista 2 / **Recebe o veículo** (`vehicleDriver2`) | select (`availableDriver2`) | Troca e Repasse (rótulo "Recebe o veículo" no Repasse) | "Selecione o motorista 2."; "O motorista 2 não está disponível para este tipo de troca."; hint: Repasse "Somente quem está sem veículo", Troca o veículo previsto |
| Local da base (`vehicleBaseLocation`) | select pesquisável com **criação** ("Adicionar “texto”" abre o diálogo 3.3.6); subtítulo com o endereço | Devolução e Retirada | "Selecione o local da base."; hint: endereço do local, ou "Onde o veículo vai ficar" (Devolução) / "Onde o veículo será retirado" (Retirada), ou "Digite o nome para adicionar um local" quando não há locais |
| Veículo da base (`vehicleBase`) | select (`baseVehicles`); rótulo `modelo • placa`, subtítulo "Alugado · fornecedor · Blindado · nome do local" ou "Local não informado" | Retirada | "Selecione o veículo da base."; "O veículo da base não está mais disponível."; hint "Veículos livres neste local" (com local) ou "Somente veículos sem posse prevista" |
| Quando trocar? (`windowMode`) | segmentado "Entre serviços" / "Horário marcado" | só tipo Troca com Registro=Agendar | hints: "Os motoristas trocam assim que estiverem livres, na posição escolhida da agenda de cada um." / "O horário é obrigatório. Use só quando a troca precisa acontecer exatamente nessa janela." |
| Dia da troca (`vehicleWindowDay`) | date | modo entre serviços | "Informe o dia da troca." |
| Agenda M1 e M2 | timeline picker (3.3.4) | modo entre serviços | erros de `mo` (5.5) em `vehicleDriver1After` (alerta danger); erro de janela também como alerta warning |
| Início / Fim (`vehicleStartDateTime`, `vehicleEndDateTime`) | `datetime-local`, step 300 | horário marcado ou demais tipos | "Preencha início e fim da janela."; "A data de fim deve ser posterior ao início." |
| O que aconteceu? (`executionMode`) | segmentado "Agendar" / "Foi agora" / "Foi antes" | sempre (desabilitado em edição) | hints: "Cria a Troca e a Geral. Não altera a posse." / "Finaliza a Geral, a Troca e a posse agora." / "Registra a troca com o horário real informado." |
| Horário real da troca (`vehicleActualDateTime`) | `datetime-local`, step 60 | "Foi antes" | "Preencha quando a troca aconteceu."; "O horário real não pode estar no futuro." |
| Programar automático (`vehicleProgramAutomatically`) | switch | "Agendar" | descrição: ligado "Aparece no app 3 dias antes do início.", desligado "Fica Confirmada e oculta do motorista." |
| Local da troca (opcional) (`vehicleLocation`) | texto, máximo 200 | sempre | placeholder "Ex.: Base Betinhos, Aeroporto de Guarulhos" |
| Observação operacional (opcional) (`vehicleObs`) | textarea, 3 linhas | sempre | placeholder "Ex.: encontro na base, motivo da troca, ponto de apoio..." |

Validações extras, que dependem da previsão de posse (seção 5.4):
- Troca: "Motorista 1 precisa ter veículo previsto para uma troca." e "Motorista 2 não tem veículo. Use o tipo Repasse."
- Repasse: "Motorista 1 precisa ter veículo previsto para repassar."
- Devolução: "Responsável precisa ter veículo previsto para devolver à base."
- Retirada: "Selecione um veículo livre na base."

Ao falhar, a primeira mensagem aparece no toast "Validação", o campo recebe foco (`scrollIntoView` centralizado) e cada campo mostra o próprio erro.

#### 3.3.3 Regras de cascata ao alterar campos (`ht`)

- Qualquer alteração limpa os erros.
- `typeValue`:
  - Limpa motorista 2 e veículo da base.
  - Limpa o local se o novo tipo não for Devolução nem Retirada.
  - Limpa as âncoras do M1 e do M2.
- `baseVehicleId`: se nenhum local estiver escolhido, preenche com o local previsto do veículo.
- `startDate` ou `driver1Id`: limpa as âncoras do M1. `startDate`, `driver1Id` ou `driver2Id`: limpa as âncoras do M2.
- `driver1Id` igual ao motorista 2: limpa o motorista 2.
- Mudança de data ou hora de início que coincide com o início de outra troca ativa sobreposta: toast danger "Não permitido" / "Não é possível agendar duas trocas com o mesmo horário de início."
- Depois de cada alteração, `$e` remove em loop o motorista 1, o motorista 2 ou o veículo da base que deixaram de estar disponíveis.

#### 3.3.4 Timeline picker (agenda do dia por motorista)

- Fonte: serviços carregados do motorista no dia da troca, sem os Cancelados (202410002), ordenados por saída.
- Cabeçalho: nome do motorista e "N serviço(s) no dia" ou "Sem serviços no dia".
- Placeholder quando não há motorista: "Escolha o motorista 1/2 para ver a agenda do dia."
- Intervalos (gaps), de N+1 posições: "Antes das HH:MM", "Entre HH:MM e HH:MM", "Depois das HH:MM" ou "A qualquer hora do dia".
- Gaps cujo serviço seguinte já saiu ficam ocultos. Serviços passados recebem a classe `is-done`.
- Botão por gap "Trocar aqui". O gap selecionado vira a pílula "Troca · {rótulo}", que pode ser arrastada (pointer capture, "Soltar aqui"). Também há navegação por setas (pula os gaps passados).
- Rodapé: "Troca {rótulo em minúscula}." ou "Toque em “Trocar aqui” no intervalo livre."
- A seleção grava `driverXAfterId` (serviço anterior) e `driverXBeforeId` (serviço seguinte).
- Texto de apoio: "Escolha em que intervalo da agenda cada motorista faz a troca. Dá para arrastar o marcador **Troca**."

#### 3.3.5 Modo edição (`#/trocas-de-carro/{guid}` ou `?mode=edit&id=`)

- Loading "Carregando troca..." e `retrieveRecord`. A troca é anexada à lista local se ainda não estiver lá.
- O formulário é preenchido com o tipo, o início e o fim, os motoristas, o veículo da base (vehicle2 da Retirada), o local, a observação, `programAutomatically = (status == Programada)`, o modo da janela (`new_mododajanela == 100000001`), as âncoras e o local da troca.
- Banner: "Registro selecionado" + GUID, com o badge "Editável" ou "Somente leitura".
- **Somente leitura** quando o status é Concluída (202410001) ou Cancelada (202410002):
  - Alerta "Esta troca já foi encerrada. Use o fluxo de reversão para corrigir o histórico."
  - Todos os campos ficam desabilitados.
  - O salvar mostra o toast "Somente leitura" / "Troca concluída ou cancelada não pode ser editada."
- Em qualquer edição ficam desabilitados tipo, motoristas, local da base, veículo da base, "O que aconteceu?", "Programar automático" e "Horário real". Continuam editáveis as datas, a janela, as âncoras, o local da troca e a observação.
- Alerta de janela (`ho`, seção 5.6) exibido como warning.
- Botões:
  - **"Salvar alterações"**.
  - **"Cancelar troca"** (danger), quando a troca está em edição e não está encerrada.
  - **"Reverter troca"**, quando o status é Concluída.
- Após salvar: toast "Salvo" / "Troca atualizada.", recarga silenciosa, saída da edição (formulário zerado, hash `#/trocas-de-carro` e parâmetros `mode`/`id` removidos).
- Erro de carga: "Não foi possível carregar a troca." Erro ao salvar: "Não foi possível salvar a troca."

#### 3.3.6 Diálogo "Cadastrar local da base"

- Drawer com eyebrow "Troca de carro".
- Campos:
  - **Nome** (obrigatório, máximo 100, placeholder "Ex.: Garagem Moema"), pré-preenchido com o texto digitado no select.
  - **Endereço (opcional)** (máximo 250, "Rua, número, bairro, cidade").
  - **Link do mapa (opcional)** (`type=url`, máximo 500, "https://maps.google.com/...").
- Botões "Voltar" e "Cadastrar local" ("Salvando..." enquanto grava).
- Nome vazio: "Informe o nome do local."
- Erro: "Não foi possível cadastrar o local. Confira os dados e tente de novo."
- Sucesso: o local entra na lista (ordenada), fica selecionado e aparece o toast "Sucesso" / `Local "{nome}" cadastrado e selecionado.`
- Fechar com dados preenchidos pede confirmação de descarte.

#### 3.3.7 Diálogo de auditoria (Cancelar / Reverter)

- Eyebrow "Auditoria obrigatória", título "Cancelar troca" ou "Reverter troca".
- Campos:
  - **Motivo** (obrigatório, textarea com 4 linhas e máximo 2000, placeholder "Descreva a razão operacional e a evidência disponível.").
  - Na reversão, também **Data e hora efetivas** (`datetime-local`, step 60, default agora).
- Botões "Voltar" e "Confirmar cancelamento" (danger) ou "Confirmar reversão". Ficam desabilitados sem motivo.
- Validações: "Motivo obrigatório" / `Informe por que precisa {cancelar|reverter} esta troca.`; "Data inválida" / "Informe a data e a hora efetivas da reversão."
- Loading "Cancelando troca..." ou "Revertendo troca...".
- Sucesso: "Concluído" / "Troca cancelada." ou "Troca revertida.", seguido de recarga e saída da edição.
- Erro: `Não foi possível {cancelar|reverter} a troca.`

### 3.4 Drawer de detalhe do serviço

- Eyebrow `Pedido #{id}`, título com o trajeto (ou "Sem trajeto").
- Mostra "Saída prevista" (hora e data), Cliente, Motorista, PAX, Carro (`_cr40f_veiculo_value`), Tipo do veículo, Perfil, Solicitante, e "Obs operação" e "Obs interna" quando preenchidas.
- Rodapé:
  - Na aba Motorista: "Trocar motorista" ou "Definir motorista", que abre o drawer 3.1.
  - Na aba Pedido: "Duplicar pedido", que abre o drawer 3.2.

### 3.5 Diálogo "Descartar alterações?"

- Texto: "As mudanças deste formulário ainda não foram salvas e serão perdidas."
- Botões "Continuar editando" e "Descartar" (danger).
- Usado pelos drawers de motorista, duplicação, local e auditoria. Fica bloqueado enquanto `loading`.

---

## 4. Ações e integrações

### 4.1 Botões e ações

| Ação | O que faz |
|---|---|
| Atualizar (cabeçalho) | Recarrega tudo de forma silenciosa (sem overlay). Toast "Atualizado" / "Lista sincronizada com o Dataverse." |
| Pull-to-refresh | Mesma recarga, sem toast. |
| Card | Abre o detalhe (3.4). |
| Trocar/Definir motorista | Drawer 3.1, depois `updateRecord` na reserva. |
| Duplicar este pedido | Drawer 3.2, depois N × `createRecord` reserva + vínculos. |
| Agendar troca / Registrar ocorrência | Fluxo 4.3. O rótulo é "Agendar troca" com Registro=Agendar e "Registrar ocorrência" com "Foi agora" ou "Foi antes". |
| Salvar alterações | Custom API `new_AtualizarTrocaDeCarro`. |
| Cancelar troca | Custom API `new_CancelarTrocaDeCarro`. |
| Reverter troca | Custom API `new_ReverterTrocaDeCarro`. |
| Adicionar local (select) | Diálogo 3.3.6, depois `createRecord new_localdebase`. |
| Abrir mapa | `<a href={new_linkmapa} target=_blank>` no resumo. |
| Desfazer (toast) | Regrava o motorista anterior. |
| Abrir pedido (toast) | Abre o detalhe do pedido duplicado. |

### 4.2 Custom APIs (todas por `fetch` POST, não por `Xrm.WebApi.execute`)

Requisição:
```
POST {clientUrl}/api/data/v9.2/{caminho}
credentials: same-origin
Headers: Accept: application/json; Content-Type: application/json; charset=utf-8; OData-MaxVersion: 4.0; OData-Version: 4.0
```

Tratamento da resposta:
- A resposta é lida como texto e interpretada como JSON (texto inválido vira `{message}`).
- Se `!ok`, lança `Error(error.message || message || "HTTP {status}")` com `_responseText`, `status` e `correlationId` (`x-ms-correlation-request-id` ou `REQ_ID`).

Erros do registro são envoltos em "Falha ao registrar a troca no Dataverse: {mensagem extraída}". A mensagem é procurada recursivamente em `message`, `detail`, `title`, `reason` e `description`, depois em `error`, `cause`, `innerError` e `_responseText`.

Lookups das Custom APIs vão como objeto de entidade com `@odata.type`, não como `@odata.bind`:
```json
{ "@odata.type": "Microsoft.Dynamics.CRM.cr40f_funcionarios", "cr40f_funcionariosid": "<guid sem chaves>" }
```

#### a) `new_RegistrarTrocaDeCarro` (unbound) — `POST /api/data/v9.2/new_RegistrarTrocaDeCarro`

```json
{
  "new_Motivo": "<obs.trim() || 'Registro operacional da troca.'>",
  "new_Inicio": "<início ISO>",
  "new_Fim": "<fim ISO>",
  "new_Tipo": <100000000|100000001|100000002|100000003>,
  "new_Motorista1": {"@odata.type":"Microsoft.Dynamics.CRM.cr40f_funcionarios","cr40f_funcionariosid":"<m1>"},
  "new_Motorista2": {"@odata.type":"Microsoft.Dynamics.CRM.cr40f_funcionarios","cr40f_funcionariosid":"<m2>"},   // se houver
  "new_Veiculo1": {"@odata.type":"Microsoft.Dynamics.CRM.cr40f_veiculos","cr40f_veiculosid":"<v1>"},             // se houver
  "new_Veiculo2": {"@odata.type":"Microsoft.Dynamics.CRM.cr40f_veiculos","cr40f_veiculosid":"<v2>"},             // se houver
  "new_LocalDeBase": {"@odata.type":"Microsoft.Dynamics.CRM.new_localdebase","new_localdebaseid":"<loc>"},       // se houver
  "new_Observacao": "<obs>",
  "new_ConcluirImediatamente": <true se "Foi agora"/"Foi antes">,
  "new_ProgramarAutomaticamente": <switch>,
  "new_DataEfetiva": "<ISO>",          // só em "Foi agora" (new Date()) ou "Foi antes" (horário real)
  "new_IdempotencyKey": "exchange-<fnv1a hex>-<início em ms, base36>",
  "new_ModoJanela": <100000001 entre serviços | 100000000 fixo>,
  "new_M1DepoisDe": {"@odata.type":"Microsoft.Dynamics.CRM.cr40f_reservadeveculos","cr40f_reservadeveculosid":"<id>"}, // só entre serviços e se definido
  "new_M1AntesDe": {...}, "new_M2DepoisDe": {...}, "new_M2AntesDe": {...},
  "new_Local": "<local da troca trim>"   // só se preenchido
}
```
- A resposta devolve `new_TrocaId`; sem ela, a tela usa a chave de idempotência.
- O objeto tem um `getMetadata()` (declara os tipos Edm e `mscrm.*` de cada parâmetro) que `JSON.stringify` descarta. É resquício de `Xrm.WebApi.execute`.
- Chave de idempotência: FNV-1a 32 bits (semente 2166136261, primo 16777619) sobre `inicio|fim|tipo|m1|m2|v1|v2|obs|local|windowMode|m1After|m1Before|m2After|m2Before|localTexto`.
- Veículos enviados:
  - `new_Veiculo1` = veículo previsto do M1, exceto em Retirada (nulo).
  - `new_Veiculo2` = veículo previsto do M2 em Troca, ou o veículo da base em Retirada.
  - `new_LocalDeBase` só em Devolução e Retirada.

#### b) `new_AtualizarTrocaDeCarro` (bound) — `POST /api/data/v9.2/cr40f_trocasdecarros({id})/Microsoft.Dynamics.CRM.new_AtualizarTrocaDeCarro`

```json
{
  "new_Motivo": "<obs.trim() || 'Atualização operacional da troca.'>",
  "new_VersaoEsperada": "<rowVersion do etag>",
  "new_Inicio": "<ISO>", "new_Fim": "<ISO>",
  "new_Observacao": "<obs>",
  "new_ModoJanela": <100000001|100000000>,
  "new_M1DepoisDe"/"new_M1AntesDe"/"new_M2DepoisDe"/"new_M2AntesDe": {... reserva ...},  // só entre serviços e se definidos
  "new_Local": "<trim>"   // em edição é sempre enviado: "" limpa o campo
}
```
- O `rowVersion` vem da troca na lista local, que é carregada por `retrieveRecord` ao abrir a edição.
- Controle de concorrência otimista no servidor via `new_VersaoEsperada`.

#### c) `new_CancelarTrocaDeCarro` e d) `new_ReverterTrocaDeCarro` (bound) — `POST /api/data/v9.2/cr40f_trocasdecarros({id})/Microsoft.Dynamics.CRM.{acao}`

Antes de cada chamada, a tela faz `retrieveRecord` para obter o etag atual. Payload:
```json
{ "new_Motivo": "<motivo>", "new_VersaoEsperada": "<rowVersion>", "new_DataEfetiva": "<ISO — só na reversão>" }
```
Motivos padrão das funções (não usados pela UI, que exige motivo): "Cancelamento operacional da troca." e "Reversão operacional da troca."

### 4.3 Fluxo "Agendar troca / Registrar ocorrência" (nova troca)

1. Se a troca estiver em somente leitura, para com o toast "Somente leitura".
2. Recarrega os dados de forma silenciosa ("Atualizando posse e agenda..."). Se a recarga falhar, aborta.
3. Validação por campo (3.3.2). Se falhar, toast "Validação" e foco no campo.
4. Em edição, segue para `new_AtualizarTrocaDeCarro`.
5. Validação global `xo` (5.5). Se houver erro, toast "Validação" com o primeiro.
6. Se houver sobreposição, toast danger "Conflito" / "Existe outra troca ativa para esse motorista ou veículo no período." e bloqueia (o `forceOverlap` existe mas nunca é usado).
7. Chama `new_RegistrarTrocaDeCarro`. Loading "Finalizando troca e posse..." (com data efetiva) ou "Agendando troca...".
8. Sucesso: zera o formulário e mostra o toast "Sucesso":
   - "Troca finalizada e posse atualizada." (Foi agora / Foi antes).
   - "Troca programada e disponível para o motorista." (Agendar + automático).
   - "Troca confirmada e oculta do motorista." (Agendar sem automático).
   Em seguida, recarga silenciosa.
9. Erro: toast "Falha" (fallback "Não foi possível agendar a troca.") e log `App.submitVehicleSchedule`.

Status resultante:
- Programada (202410000) se `programAutomatically`, senão Confirmada (100000001).
- Com data efetiva, Concluída. No mock isso também fecha e abre as posses e cria uma Geral (ver 7.3). No live, quem faz é a Custom API: a tela só afirma "Cria a Troca e a Geral".

---

## 5. Regras de negócio e cálculos

### 5.1 Utilitários

- `ke` → "aaaa-mm-dd" local.
- `Pe` → "dd/mm/aaaa"; `Fe` → "HH:MM"; `Ie` → "dd/mm/aaaa HH:MM", todos em pt-BR.
- `Ee(data,h,m)` → Date local.
- `Me` → ISO.
- `Ne` → passado (`< Date.now()`).
- `Oe` arredonda para o próximo múltiplo de 5 minutos.
- `xe` (rótulo de pessoa) = apelido ou nome.
- `be` normaliza: remove acentos (NFD), converte para minúsculas e aplica trim.
- `Se` divide em lotes.
- `ye(prefixo)` gera ids locais.

### 5.2 Busca nos serviços (`qa` / `Ja`)

- Texto normalizado que junta readableId, PAX (`paxView`), cliente, endereço de saída, destino, motorista, obs de operação, solicitante, trajeto, veículo, tipo de veículo e data/hora formatada.
- A busca é `includes` do termo normalizado.

### 5.3 Exibição de PAX

- Os nomes vêm dos vínculos, ordenados.
- Telefones são removidos com a regex `(?:\b(?:tel|telefone|cel|celular|whats|whatsapp|fone)\.?:?\s*)?(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s.]?\d{4}\b` (gi), além da limpeza de separadores nas pontas e dos espaços duplos.
- No card aparece a contagem "N PAX". No detalhe, os nomes unidos por ", ".

### 5.4 Previsão de posse e disponibilidade (`vo`)

- **Data de previsão**: o início do formulário (data, hora e minuto) ou agora.
- **Troca ativa** (`io`): status Programada (202410000) ou Confirmada (100000001) e `fim >= agora`.
- **Trocas relevantes**: as ativas, sem a troca em edição, com `início <= data de previsão`, ordenadas por início, depois fim, depois id.
- **Estado inicial**: posses abertas (sem fim).
  - Com motorista: vincula motorista ↔ veículo.
  - Sem motorista e com local: marca o veículo como estando na base, naquele local.
- **Aplicação das trocas relevantes, em ordem** (`co`):
  - **Devolução**: solta o M1 e o V1, e o V1 passa ao local da troca (ou fica sem local).
  - **Retirada**: solta o M1 e o V2, vincula M1 ↔ V2 e tira o V2 da base.
  - **Troca e Repasse**: solta M1, M2, V1 e V2 e vincula M1 ↔ V2 e M2 ↔ V1.
- **Veículos inconsistentes**: mais de uma posse aberta, posse com início maior que o fim, ou só posses fechadas. Eles não entram na base.
- **Motoristas inconsistentes**: mais de uma posse aberta. São calculados, mas não aparecem na UI.
- **`availableDriver1`**:
  - Em Retirada, os motoristas **sem** veículo previsto; nos demais tipos, os **com** veículo.
  - Exclui quem tem outra troca ativa sobreposta à janela pretendida (`_o`: `início < fimOutro && fim > inícioOutro`, comparando M1 e M2 da outra troca).
  - Ordenação por rótulo.
- **`availableDriver2`**:
  - Exclui o M1.
  - Em Repasse, só quem está sem veículo; em Troca, só quem tem veículo.
  - Mesma exclusão por sobreposição.
- **`baseVehicles`**: veículos sem motorista previsto e não inconsistentes. Com local escolhido, só os veículos daquele local ou sem local previsto.
- O conjunto `repairableBaseVehicleIds` nunca é preenchido. Por isso a regra "O último encerramento do veículo é posterior ao horário efetivo informado." é código morto.

### 5.5 Janela "entre serviços" (`mo`) e validação global (`xo`)

**Quando vale o modo entre serviços** (`fo`): `windowMode == 'between'`, tipo Troca e Registro = Agendar. Em todos os outros casos, a janela é fixa.

**Cálculo da janela** (`mo`):
1. Sem dia: "Informe o dia da troca."
2. Para cada motorista, cada âncora (depois de / antes de) passa por três checagens:
   - Cancelada: `"{id} foi cancelado."`
   - De outro motorista: `"{id} não é deste motorista."`
   - De outro dia: `"{id} não é do dia da troca."`
3. Âncora "depois" que sai depois da âncora "antes": `O serviço "depois de" deve sair antes do serviço "antes de".`
4. Âncora "antes" que já saiu: `"{id} já saiu."`
5. Se o maior "depois" for maior ou igual ao menor "antes": "Posições incompatíveis: os motoristas não ficam livres ao mesmo tempo."
6. Janela calculada:
   - Início = **menor** saída entre as âncoras "depois" (ou 00:00 do dia).
   - Fim = **maior** saída entre as âncoras "antes" (ou 23:59:59 do dia).

**Validação global** (`xo`), mensagens na ordem:
1. "Selecione o tipo de troca."
2. "Selecione o motorista 1."
3. "Selecione o motorista 2." (Troca e Repasse)
4. "Selecione o veículo da base." (Retirada)
5. "Selecione o local da base." (Devolução e Retirada)
6. "O local selecionado não está mais ativo."
7. Disponibilidade do M1, do M2 e do veículo da base: "O veículo selecionado não está livre na base."
8. Erro da janela, ou "Preencha início e fim da janela."
9. "A data de fim deve ser posterior ao início."
10. "Preencha a data e hora em que a troca realmente aconteceu."
11. "O horário real da troca não pode estar no futuro."
12. As regras de veículo previsto (3.3.2) e "Motorista 2 já tem veículo. Use o tipo Troca." (Repasse).

**Prévia** (`preview`):
- Resumo: `"{Tipo}: {início} até {fim} | {M1||'Base'} {↔ ou → (Repasse)} {M2} | Veic1: {v1||'—'} | Veic2: {v2} | Local: {local}"`.
- Sobreposições (`bo`): outras trocas ativas que se sobrepõem no tempo e compartilham motorista ou veículo.
- Se alguma sobreposta tem o **mesmo início**, entra no topo da lista o erro "Não é possível agendar duas trocas com o mesmo horário de início."
- Sem erros mas com sobreposição, o painel mostra o alerta "Existem trocas sobrepostas no histórico antes do horário escolhido. Revise o planejamento antes de agendar." O submit é bloqueado por "Conflito".

### 5.6 Alerta de janela (`ho`, só na edição)

- Se `new_mododajanela != 100000001`, mostra `new_alertajanela`, que vem do servidor.
- No modo entre serviços, checa cada âncora:
  - Cancelada: `"{id} foi cancelado. Revise a posição da troca."`
  - Motorista mudou: `"{id} mudou de motorista. Revise a posição da troca."`
  - Ordem invertida: "A ordem dos serviços mudou. Revise a posição da troca."
  - Âncora "antes" já saiu, com a troca Programada ou Confirmada: `"Atrasada: {id} já saiu."`
- Se nenhuma checagem disparar, mostra `new_alertajanela`.

### 5.7 Outras regras

- Duplicar: o pedido novo nasce Confirmado. Datas passadas são bloqueadas no calendário e, para o dia de hoje, também pelo horário.
- Trocar motorista: o "sem motorista" é permitido. Não há checagem de conflito de agenda.
- A janela de serviços carregada é fixa: de hoje −7 dias até o fim de hoje +7 dias. A data "A partir de" pode ir além dela, mas a lista fica vazia.
- Posses: só as ativas, com fim nulo ou nos últimos 365 dias.

---

## 6. Log de erros (`new_appmotoristaslog`, entity set `new_appmotoristaslogs`)

### Instalação (`jc`, no boot)

- `appName` "Funções Operacionais", `appVersion` "v1.0.173", `builtAt` "20/10/2026 09:03".
- `getScreen`: a view atual, lida do hash.
- Expõe `window.__APP_REPORT_ERROR__`. Usa a guarda `window.__APP_ERROR_LOGGER_INSTALLED__` e o singleton `window.__BETINHOS_ERROR_LOGGER__`.

### Captura automática

- `window` `error` (fase de captura):
  - Falha de recurso (img, script, link): `"Falha ao carregar recurso {tag}: {url sanitizada}"`, com `source window.resourceerror`, `action "resource {tag}"`, `phase load`.
  - Erro JS: severidade `critical`, `source window.error`, payload com filename, linha e coluna.
  - Ignora "ResizeObserver loop...".
- `unhandledrejection`: severidade `critical`.
- `console.error` é envolvido. Ignora mensagens que contêm `[FuncoesOperacionais:Log]`. `source console.error`.
- Wrapper de `Xrm.WebApi` (rejeições):
  - `createRecord` (exceto `new_appmotoristaslog`), `updateRecord`, `retrieveRecord` e `retrieveMultipleRecords`.
  - `source xrm.webapi.{método}`, `detailType dataverse`, payload com entityName, id, data e options.
  - Reinstala no evento `online`.

### Chamadas explícitas

| source | action |
|---|---|
| `App.refreshData` | `loadDashboardData` |
| `App.submitDriverChange` | `changeDriver` |
| `App.submitClone` | `cloneService` |
| `App.openVehicleEdit` | `loadSwap` |
| `App.submitVehicleEdit` | `updateSwap` |
| `App.runVehicleLifecycle` | `cancelSwap` / `revertSwap` |
| `App.submitVehicleSchedule` | `scheduleSwap` (payload: modo, effectiveAt, tipo, ids, início e fim) |
| `App.submitLocation` | `createLocation` |
| `main.bootstrap` | `mount` (`critical`) |

### Limites e entrega

- Máximo de 30 envios por sessão de página.
- Deduplicação por `action|mensagem` em 60 s.
- Fila em `localStorage` `betinhos-error-log-queue-v1:Funções Operacionais` (últimos 50).
- Flush imediato, a cada 30 s e no evento `online`.
- Envio por `Xrm.WebApi.createRecord("new_appmotoristaslog", …)`. Sem Xrm, `fetch POST {clientUrl}/api/data/v9.2/new_appmotoristaslogs`, com `credentials: include` e `keepalive` quando o corpo tem menos de 60 KB.
- Sem contexto Dataverse (sem `getClientUrl`), o log é ignorado: nada é gravado no mock.

### Usuário

- `globalContext.userSettings` (`userId`, `userName`).
- Fallback `GET /api/data/v9.2/WhoAmI`.
- Depois `GET /api/data/v9.2/systemusers({id})?$select=internalemailaddress,fullname,domainname`.

### Campos gravados (com limite de caracteres)

| Campo | Conteúdo | Limite |
|---|---|---|
| `new_name` | `"{app} \| {severidade} \| {action} \| {msg}"` | 160 |
| `new_occurredat` | data e hora ISO | — |
| `new_severity` | severidade (default error) | 30 |
| `new_source` | origem (default app) | 120 |
| `new_action` | ação (default runtime-error) | 180 |
| `new_phase` | fase (default runtime) | 120 |
| `new_component` | componente (default appName) | 180 |
| `new_screen` | tela | 120 |
| `new_detailid` | id do registro | 120 |
| `new_detailtype` | tipo do registro | 80 |
| `new_message` | mensagem | 20000 |
| `new_stack` | stack | 100000 |
| `new_errorname` | nome do erro | 220 |
| `new_errorcode` | código do erro | 120 |
| `new_appname` | nome do app | 120 |
| `new_appversion` | versão | 60 |
| `new_builtat` | data do build | 80 |
| `new_sessionid` | `crypto.randomUUID` | 120 |
| `new_userid` | id do usuário | 120 |
| `new_username` | nome do usuário | 300 |
| `new_useremail` | e-mail do usuário | 300 |
| `new_userdomainname` | domínio do usuário | 300 |
| `new_clienturl` | URL do ambiente | 500 |
| `new_url` | URL da página | 4000 |
| `new_referrer` | referrer | 4000 |
| `new_useragent` | user agent | 4000 |
| `new_language` | idioma do navegador | 80 |
| `new_platform` | plataforma | 160 |
| `new_timezone` | fuso horário | 120 |
| `new_viewport` | `"LxA@dpr"` | 80 |
| `new_visibilitystate` | estado de visibilidade | 40 |
| `new_connectiontype` | tipo de conexão | 80 |
| `new_isoffline` | "true" ou "false" | 20 |
| `new_payloadjson` | payload | 100000 |
| `new_rawjson` | `{error, details, occurredAt, delivery:{pending,lastError}}` | 100000 |

### Sanitização

- Chaves que batem com base64, conteudo, content, signature, assinatura, photo, foto, image, imagem, token, secret, senha, password, authorization, sharelink ou cookie viram `[redacted]`.
- `data:...;base64` e blocos base64 de 160+ caracteres são removidos.
- `Bearer` e pares `token=`/`password=` são mascarados.
- URLs ficam só com origem e caminho. Query e hash viram `[redacted-query]`/`[redacted-hash]`. Hosts SharePoint, OneDrive, Power Automate, Logic Apps e Blob viram `/[redacted-url]`.
- Profundidade máxima 8, arrays com até 200 itens.
- Camada adicional de PII antes do envio:
  - Chaves com telefone, phone, email, mail ou link viram `[redacted]`.
  - E-mails no texto viram `[redacted-email]` e telefones `[redacted-phone]`.

---

## 7. Parâmetros de URL, usuário logado e ambiente

### 7.1 URL

- **Hash (rota)**:
  - `#/trocar-motorista` (driver), `#/duplicar-pedido` (clone), `#/trocas-de-carro` e `#/trocas-de-carro/{guid}` (edição).
  - Aliases aceitos no 1º segmento: `motorista`, `driver`, `pedido`, `clone`, `trocar-carro`, `carro`, `vehicle`.
  - O GUID só é aceito se casar com a regex de GUID, com ou sem chaves.
  - A rota é atualizada com `history.replaceState`, sem criar entrada de histórico. Um listener de `hashchange` troca de aba ou abre a edição.
- **Query** (`location.search`, mesclada com o conteúdo de `?data=`, que é uma query URL-encoded, padrão de custom page e WebResource do Dataverse; os parâmetros diretos têm prioridade):
  - `mode=edit&id={guid}`: abre a edição da troca, quando não há rota no hash. Esses dois parâmetros são removidos ao sair da edição.
  - `view=driver|clone|vehicle` (ou aliases): aba inicial.
  - `mock=1`: força o modo mock.
  - `host=shell`: adiciona `html.is-embedded`, que oculta o selo de versão. Usado quando a tela está embutida no shell React.
- **Boot**: aplica a view da URL, carrega os dados e então abre a edição se houver `editId`. Sem `editId`, normaliza o hash da view.

### 7.2 Usuário e contexto

- `Xrm` vem de `window.Xrm` ou `window.parent.Xrm`. O logger também tenta `GetGlobalContext()`.
- A URL do ambiente vem de `getClientUrl()`, depois de `location.origin`, depois do `orgUrl` fixo do DEV.
- A tela não filtra nem personaliza nada pelo usuário logado. O usuário só aparece no log de erros.
- Não usa variáveis de ambiente do Dataverse. `environmentId`, `modelDrivenAppId` e `customPageName` estão na configuração, mas não são usados no código.

### 7.3 Modo mock (sem Xrm ou com `?mock=1`)

- Banco em `localStorage["betinhos_funcoes_operacionais_mock_v3"]`, com seed:
  - 5 motoristas, 6 veículos (um Alugado e Blindado da "Locadora Blindados SP"), 2 locais ("Escritório", "Casa do Betinho").
  - Serviços de exemplo, vínculos de passageiros, 1 troca Confirmada e 6 posses (uma na base "Escritório").
- Duplicar no mock gera readableId `12000+n` e status Confirmado.
- Agendar troca no mock:
  - Cria a troca e, com data efetiva, ajusta as posses (`Ds`, com os erros "…: era esperada exatamente uma posse aberta." e "… já possui veículo.").
  - Cria uma "Geral" com readableId `13000+n`, categoria Troca de Veículos (100000002), status Programado ou Concluído, faturamento Não Faturável e tipo "Dentro de São Paulo". É o indício do que a Custom API faz no servidor.
- Reverter no mock cria uma troca inversa concluída. Em Troca, inverte V1 e V2; em Repasse, inverte M1 e M2.
- A função `resetMock` existe, mas não há botão para ela.
