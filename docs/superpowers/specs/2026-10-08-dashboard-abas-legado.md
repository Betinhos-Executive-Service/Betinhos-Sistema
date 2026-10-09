# Dashboard.html: extração por aba para o port em TypeScript

Arquivo: `C:\Users\mendo\Desktop\vscode\Dashboard Betinhos\Dashboard.html`

Três coisas no código mudam o que precisa ser portado:
- **Templates nunca montados.** Os blocos `<template id="legacy-*-kpis">` (linhas 5935, 6218, 6428 e 6616) não são instanciados em lugar nenhum. Por isso os ids `sT/sCon/sCan/sTk/sSemVal/sFat`, `pQtd` e `vTot/vDisp/vBlin/vMan` recebem valor no JS, mas não aparecem na tela.
- **Layout de revisão nunca chamado.** `ensureReviewLayouts()` (linha 12476) não é chamado em nenhum ponto. Na prática, o card "Tempo de pagamento por cliente" (`#paymentInsight`) não existe no DOM.
- **Tabela de serviços vazia no carregamento.** `renderSrvTable` só roda dentro de `srt`/`srchReg`. A tabela `tbSrv` fica vazia até o usuário ordenar ou buscar; o `renderAll` só grava `tblCache.tbSrv = rv`.

---

## 0. Base comum

### Tabelas (`T`, linha 10002) e campos (`F`, linha 10025)
```js
const T = { reservas: "cr40f_reservadeveculoses", clientes: "cr40f_clientes1s", passageiros: "cr40f_bancodedadoses",
  servicosPassageiro: "cr40f_servicosporpassageiros", errosOperacionais: "cr40f_errooperacionals", precos: "cr40f_composicaodeprecoses",
  manutencoes: "cr40f_manutencoeses", multas: "cr40f_multases", trocas: "cr40f_trocasdecarros", pagantes: "cr40f_paganteses",
  veiculos: "cr40f_veiculoses", funcionarios: "cr40f_funcionarioses", marketing: "new_marketings", despesas: "cr40f_despesaoperacionals",
  categoriasDespesas: "cr40f_categoriadespesaoperacionals", formasPagamentoDespesas: "cr40f_formapagamentodespesas",
  anexosDespesas: "cr40f_anexodespesaoperacionals", infracoes: "cr40f_infracaodetransitos",
  telemetriaInfleet: "new_telemetriadiariainfleets", eventosInfleet: "new_eventoinfleets", viagensInfleet: "new_viageminfleets" };
const F = {
  res: { id: "cr40f_reservadeveculosid", data: "cr40f_dataehorriodesada", status: "cr40f_status", fatStatus: "cr40f_statusdefaturamento",
    tipo: "cr40f_tipodoservico", veiTipo: "cr40f_tipodeveiculo", veiculo: "_cr40f_veiculo_value", navMot: "cr40f_Motorista", navCli: "cr40f_Cliente",
    catItem: "new_categoriadoitem", solicitante: "_cr40f_solicitante_value", lookupPreco: "_new_composicaodepreco_value",
    lookupOP: "_cr40f_financeiro_value", finalizacao: "new_datadefinalizacao" },
  preco: { valorTotal: "new_valortotal", status: "new_status" },
  man: { data: "cr40f_datamanutencao", aprovacao: "cr40f_datadaaprovacao", valor: "cr40f_valor", status: "cr40f_status", tipo: "cr40f_tipodoreparo", veiculo: "cr40f_placa_carro" },
  mul: { data: "cr40f_dataehorario", mot: "cr40f_motorista", placa: "cr40f_placa", status: "cr40f_status", tipo: "cr40f_codigodainfracao" },
  erroOperacional: { data: "cr40f_dataocorrencia" },
  inf: { id: "cr40f_infracaodetransitoid", codigo: "cr40f_codigodainfracao", descricao: "cr40f_descricaodainfracao" },
  pag: { lookupOP: "_cr40f_financeiro_value", status: "cr40f_status", valor: "cr40f_valor", forma: "cr40f_formadepagamento", dataPrimeiroPagamento: "cr40f_datadoprimeiropagamento" },
  vei: { id: "cr40f_veiculosid", placa: "cr40f_placa", marca: "cr40f_marca", modelo: "cr40f_modelo", status: "cr40f_statusdoveiculo", blindado: "cr40f_blindado", ano: "cr40f_anodefabricacao", cat: "new_categoriadoveiculo" },
  fun: { nome: "cr40f_nomecompleto", status: "cr40f_status", funcao: "cr40f_funcao", cnh: "cr40f_validadedacnh", apelido: "new_apelido", empresa: "cr40f_nomedaempresa" },
  despesa: { id: "cr40f_despesaoperacionalid", nome: "cr40f_nome", data: "cr40f_datagasto", valor: "cr40f_valor", categoria: "_cr40f_categoria_value",
    formaPagamento: "_cr40f_formapagamento_value", motorista: "_cr40f_motorista_value", veiculo: "_cr40f_veiculo_value", reserva: "_cr40f_reserva_value",
    cidade: "_cr40f_cidade_value", manutencao: "_cr40f_manutencao_value", estabelecimento: "cr40f_estabelecimento", observacao: "cr40f_observacao",
    observacaoInterna: "cr40f_observacaointerna", statusFinanceiro: "cr40f_statusfinanceiro", statusOperacional: "cr40f_statusoperacional",
    statusAnexo: "cr40f_statusanexo", origem: "cr40f_origem", possivelDuplicidade: "cr40f_possivelduplicidade", protocolo: "cr40f_protocolo",
    km: "cr40f_kminformado", litros: "cr40f_litros", criadoEm: "createdon", alteradoEm: "modifiedon" },
  categoriaDespesa: { id: "cr40f_categoriadespesaoperacionalid", nome: "cr40f_nome", dre: "cr40f_grupodre", ordem: "cr40f_ordem", ativa: "cr40f_ativa" },
  formaDespesa: { id: "cr40f_formapagamentodespesaid", nome: "cr40f_nome", tipo: "cr40f_tipo", ordem: "cr40f_ordem", ativa: "cr40f_ativa" },
  anexoDespesa: { id: "cr40f_anexodespesaoperacionalid", despesa: "_cr40f_despesa_value", nomeArquivo: "cr40f_nomearquivo", url: "cr40f_urlsharepoint", shareLink: "cr40f_sharelink", status: "cr40f_status", tipo: "cr40f_tipo", criadoEm: "createdon" },
  infleetDiaria: { data: "new_data", veiculo: "_new_veiculo_value", placa: "new_placanormalizada", distancia: "new_distanciapercorridakm", velocidadeMedia: "new_velocidademedia",
    velocidadeMaxima: "new_velocidademaxima", excessos: "new_excessosdevelocidade", autonomia: "new_autonomiakml", odometroFinal: "new_odometrofinal",
    motorOciosoMin: "new_tempomotorociosomin", tempoAcimaVelocidadeMin: "new_tempoacimavelocidademin", sincronizadoEm: "new_sincronizadoem" },
  infleetEvento: { id: "new_infleeteventid", infleetDriverId: "new_infleetdriverid", reportadoEm: "new_reportadoem", veiculo: "_new_veiculo_value",
    motorista: "_new_motorista_value", placa: "new_placanormalizada", motoristaRecebido: "new_nomemotoristarecebido", tipo: "new_slug", descricao: "new_descricao",
    velocidade: "new_velocidaderegistrada", limite: "new_limitedevelocidade", endereco: "new_endereco", latitude: "new_latitude", longitude: "new_longitude",
    statusMotorista: "new_statusmapeamentomotorista" },
  infleetViagem: { id: "new_infleettripid", infleetDriverId: "new_infleetdriverid", iniciadoEm: "new_iniciadoem", finalizadoEm: "new_finalizadoem",
    veiculo: "_new_veiculo_value", motorista: "_new_motorista_value", placa: "new_placanormalizada", motoristaRecebido: "new_nomemotoristarecebido",
    distancia: "new_distanciakm", velocidadeMedia: "new_velocidademedia", velocidadeMaxima: "new_velocidademaxima", tempoAcimaVelocidadeMin: "new_tempoacimavelocidademin",
    combustivelLitros: "new_combustivelconsumidolitros", custoCombustivel: "new_custocombustivelconsumido", autonomia: "new_autonomiakml", statusMotorista: "new_statusmapeamentomotorista" },
};
```

### Constantes e códigos de status
```js
const DV_STATUS_FAT_PAGO = 202410010;              // 10206
const DV_STATUS_FAT_PAGANTE_EM_VIAGEM = 202410006;
const DV_STATUS_FAT_MENSAL = 202410008;
const EXPENSE_STATUS = { financeiro: {100000000:"Não reembolsável",100000001:"Aguardando pagamento",100000002:"Pago",100000003:"Cancelado"},
  operacional: {100000000:"Enviado",100000001:"Precisa corrigir",100000002:"Validado",100000003:"Recusado",100000004:"Cancelado"},
  anexo: {100000000:"Sem anexo",100000001:"Enviando",100000002:"Completo",100000003:"Falhou",100000004:"Parcial"} };   // 10209
const EXPENSE_FOOD_CATEGORIES = new Set(["alimentacao","almoco","cafe","jantar","lanche"]);   // 10231
const DV_STATUS_MUL_NOTIFICAR = 202410000;   // 10403
const DV_CAT_ITEM_SERVICO = 100000000;       // 10404
const isMultaPendente = (r) => Number(r?.[F.mul.status]) === DV_STATUS_MUL_NOTIFICAR;
// enrichReservas (11805): preco status 100000000 = pendente, 100000001 = concluida
// isReceivedPayment (10465): r[F.pag.status] === 202410002 || label "pago"/"paga"
// renderExecutiveSummary (14178): vei.cat raw "100000000" = Própria, "100000001" = Terceirizada
// renderAll (13668): statusSemMotorista = new Set([202410001, 202410005, 202410008])
// buildExpenseRows (14629): statusAnexo 100000002 = Completo
// renderInfleetTelemetry: statusMotorista "NAO_ENCONTRADO" | "SEM_MOTORISTA" (default quando vazio)
```

### Fetch (`makeHeaders` na linha 9766, `fetchAll` na linha 10946)
- Headers enviados: `Prefer: odata.include-annotations="*"`, exceto quando `wantAnnotations:false`, e `Prefer: odata.maxpagesize=5000`.
- A paginação segue `@odata.nextLink`.
- Timeout de 60 s, com 2 tentativas.
- Os status HTTP 408, 429, 500, 502, 503 e 504 disparam nova tentativa.
- **Cuidado com rótulos formatados:** `fv(r,f)` lê `f@OData.Community.Display.V1.FormattedValue`. Nos loaders com `wantAnnotations:false` (categorias, formas, telemetria, eventos, viagens e preços) não chega rótulo formatado, então `fv` devolve o valor bruto. Por exemplo, o `dre` da categoria vira o código do option set.

### Dados por aba (`tabDataDependencies`, linha 11367)
```js
servicos: ["reservas","precos","funcionarios","clientes","passageiros","servicosPassageiro"],
faturamento: ["reservas","precos"],
pagantes: ["reservas","precos","pagantes"],
despesas: ["despesas","categoriasDespesas","formasPagamentoDespesas","anexosDespesas","funcionarios","reservas","precos"],
frota: ["reservas","precos","manutencoes","veiculos","funcionarios","telemetriaInfleet","eventosInfleet","viagensInfleet"],
motoristas: ["reservas","precos","funcionarios"],
manutencoes: ["manutencoes"],
multas: ["multas","infracoes","funcionarios"],
```
Depois de carregar: `buildFuncMap(); buildInfracaoMap(); enrichReservas(); populateFilters(); applyF(true)` (linhas 11716–11721).

### Loaders de reservas e preços (base de Serviços, Faturamento, Pagamentos e Motoristas)
```js
// loadReservas 11474
const sel = [F.res.id, F.res.data, F.res.status, F.res.fatStatus, F.res.tipo, F.res.veiTipo, F.res.veiculo, F.res.catItem, F.res.solicitante,
  F.res.lookupPreco, F.res.lookupOP, F.res.finalizacao, "createdon"].filter(Boolean).join(",");
const exp = [`${F.res.navMot}($select=cr40f_funcionariosid,${F.fun.nome},${F.fun.apelido})`, `${F.res.navCli}($select=cr40f_nomedocliente)`].join(",");
`${API()}/${T.reservas}?$select=${sel}&$expand=${exp}&$orderby=${F.res.data} desc`
// loadPrecos 11518 (wantAnnotations:false)
`${API()}/${T.precos}?$select=cr40f_composicaodeprecosid,${F.preco.valorTotal},${F.preco.status}`
```

### Enriquecimento das reservas (`enrichReservas`, linha 11798)
```js
const pendente = status === 100000000; const concluida = status === 100000001;
DB.reservas = DB.reservas.filter((r) => { if (r._legacy2026) return false;
  const date = String(r[F.res.data] || "").slice(0, 10); return date < "2026-01-01" || date > "2026-03-31"; }).map((r) => { /* ... */
  return { ...r, _id, _motId: String(r[F.res.navMot]?.cr40f_funcionariosid||"").toLowerCase(), _motKey: motId || `nome:${motDisplay.toLowerCase()}`,
    _mot: funcMapGlobal.get(nomeMot.toLowerCase()) || nomeMot, _cli: r[F.res.navCli]?.cr40f_nomedocliente || "Sem cliente",
    _solicitante: String(fv(r, F.res.solicitante) || "N&atilde;o informado"), _stL: String(fv(r, F.res.status) || "Sem status"),
    _fatStL: String(fv(r, F.res.fatStatus) || "—"), _tipoL: String(fv(r, F.res.tipo) || "—"), _veiL: String(fv(r, F.res.veiTipo) || "—"),
    _veiId: String(r[F.res.veiculo] || "").toLowerCase(), _veiNome: String(fv(r, F.res.veiculo) || "—"), _valor: valor /* preco.valorTotal */,
    _cpPendente: cpPendente, _cpConcluida: entry?.concluida ?? false, _opId: (r[F.res.lookupOP] || "").toLowerCase(), _ts: ... };
});
DB.reservas = DB.reservas.concat(legacy2026Rows.map(buildLegacy2026Reservation));
```
- O período de jan a mar/2026 vem de um CSV embutido (`legacy2026Rows`). Nessas linhas, `_fatStL` é "Histórico CSV", `_cpConcluida` é false e `_opId` fica vazio.
- `buildFuncMap` (linha 11727) mapeia id e nome completo (em minúsculas) para o apelido.

### Filtro global (`applyF`, linha 12088) e base `rv` (`renderAll`, linha 13327)
```js
if (startDate) d = d.filter((r) => r[F.res.data] && new Date(r[F.res.data]) >= startDate);   // `${dS}T00:00:00-03:00`
if (endExclusive) d = d.filter((r) => r[F.res.data] && new Date(r[F.res.data]) < endExclusive);
if (msState.St.length > 0) d = d.filter((r) => msState.St.includes(r._stL));
if (msState.Cl.length > 0) d = d.filter((r) => msState.Cl.includes(r._cli));
if (msState.Mo.length > 0) d = d.filter((r) => msState.Mo.includes(r._motKey || r._mot));
if (msState.Tp.length > 0) d = d.filter((r) => msState.Tp.includes(r._veiL));
VW.reservas = d;
// renderAll
const rv = dvDisabled ? [] : VW.reservas.filter((r) => Number(r[F.res.catItem]) === DV_CAT_ITEM_SERVICO);
const fat = sumV(rv);   // sumV = a.reduce((s, r) => s + (r._valor || 0), 0)
VW.manutencoes = filterByDate(DB.manutencoes, F.man.data);
VW.multas = filterByDate(DB.multas, F.mul.data);
VW.despesas = filterByDate(DB.despesas, F.despesa.data);
```
- `filterByDate` (linha 13339) descarta registros sem data quando há filtro de data ativo.
- Datas no formato `YYYY-MM-DD` são comparadas como string. Os demais formatos são comparados como `Date` em `-03:00`, com fim exclusivo.

### Helpers compartilhados
```js
const isProducedReservation = (r) => { const k = normL(r?._stL); return k.includes("conclu") || k.includes("realiz") || k.includes("finaliz"); };  // 10457
const isTicketEligibleReservation = (r) => r?._cpConcluida === true && (parseFloat(r?._valor) || 0) > 0;
const getTicketStats = (rows) => { const eligible = rows.filter(isTicketEligibleReservation); const value = sumV(eligible);
  return { rows: eligible, value, count: eligible.length, ticket: eligible.length ? value / eligible.length : 0 }; };
const getRecebimentoStats = (rows) => { const recebido = rows.filter((r) => r[F.res.fatStatus] === DV_STATUS_FAT_PAGO && r._valor > 0).reduce(...);
  const base = rows.filter((r) => r[F.res.fatStatus] !== DV_STATUS_FAT_PAGANTE_EM_VIAGEM && r[F.res.fatStatus] !== DV_STATUS_FAT_MENSAL && r._valor > 0).reduce(...);
  return { recebido, base, percentual: base ? (recebido / base) * 100 : 0 }; };
function topByShare(rows, total, valueFn, max = 10) { const ranked = rows.slice(0, max);
  if (!total || ranked.length <= 3) return ranked;
  const eligible = ranked.filter((row) => (valueFn(row) / total) * 100 > 10);
  return eligible.length >= 3 ? eligible : ranked.slice(0, 3); }   // 10872
```
- **`renderDistributionTable(targetId, rows, total, {label,countLabel,valueLabel,badgeLabels,moneyValue,participationByValue,limit=10,labelMax=28})`** (linha 10553). Aplica `topByShare` às linhas. A participação é calculada por valor quando `participationByValue`; caso contrário, por quantidade. A coluna de contagem mostra `% de total` mais a quantidade.
- **`renderShareTable(targetId, rows, totalQtd, totalFat)`** (linha 10614). Colunas: "Destino", "% sob QT", "% sob R$" e "Participação". A ordenação padrão é `fatPct desc`, e as linhas passam por `topByShare(sortedRows, totalFat, r => r.fat)`.

---

## 1. Serviços (`#page-servicos`, linha 6217; código em `renderAll`, linhas 14095–14149)

**Loaders:** reservas, precos, funcionarios, clientes, passageiros e servicosPassageiro.
```js
`${API()}/${T.funcionarios}?$select=cr40f_funcionariosid,${F.fun.nome},${F.fun.status},${F.fun.funcao},${F.fun.cnh},${F.fun.apelido},${F.fun.empresa}`   // 11562
`${API()}/${T.clientes}?$select=${F.cliente.id},${F.cliente.nome}`
`${API()}/${T.passageiros}?$select=${F.passageiro.id},${F.passageiro.nome},${F.passageiro.nascimento},${F.passageiro.cliente}`
`${API()}/${T.servicosPassageiro}?$select=_cr40f_bancodedados_value,_cr40f_geral_value`
```

**Insumos calculados em `renderAll`** (linhas 13385–13414 e 13590):
```js
const conclServices = rv.filter(isConc);    // isConc = isProducedReservation
const getSemValorRows = (rows) => { const seen = new Set(); return rows.filter((r) => {
  const precoId = String(r[F.res.lookupPreco] || "").toLowerCase(); if (!precoId || seen.has(precoId)) return false;
  const match = r._cpPendente === true && isConc(r) && normL(r._fatStL).includes("pend") && normL(fv(r, F.res.catItem)).includes("servico");
  if (match) seen.add(precoId); return match; }); };
const semValor = getSemValorRows(rv);
const cancelados = rv.filter((r) => stL(r._stL).includes("cancel") || stL(r._stL).includes("recus"));
const ticketAtual = getTicketStats(rv); const curTk = ticketAtual.ticket;
const aReceber = rv.filter(r => r._cpConcluida === true && r._opId && r[F.res.fatStatus] !== DV_STATUS_FAT_PAGO && r._valor > 0).reduce((s, r) => s + r._valor, 0);
```
- `semValor` conta composições de preço distintas. Entram as que estão pendentes, com serviço produzido, status de faturamento contendo "pend" e item do tipo serviço.
- `aReceber` soma o `_valor` dos serviços com CP concluída, com OP, ainda não pagos e com valor maior que zero.

### KPI Operação (`sOpTotal` + `sOpMix`, linha 14102)
```js
set("sOpTotal", dvDisabled ? "—" : rv.length.toLocaleString("pt-BR"));
html("sOpMix", dvDisabled ? "" : renderMetricLines([
  ["Concluídos", conclServices.length.toLocaleString("pt-BR")],
  ["Cancelados", cancelados.length.toLocaleString("pt-BR")],
]));
```
- O valor principal é o total de serviços.
- Concluídos são os status com "conclu", "realiz" ou "finaliz".
- Cancelados são os status com "cancel" ou "recus".

### KPI Financeiro (`sFinTotal` + `sFinMix`, linha 14107)
```js
set("sFinTotal", dvDisabled ? "—" : brlS(fat));
html("sFinMix", dvDisabled ? "" : renderMetricLines([
  ["Ticket médio", brl(curTk)],
  ["CP pendente", semValor.length.toLocaleString("pt-BR")],
  ["A receber", brlS(aReceber)],
]));
```
- O valor principal é `fat`, a soma de `_valor` de `rv`.
- Ticket médio usa `getTicketStats`.
- "CP pendente" é `semValor.length`; "A receber" é `aReceber`.

### Tabela por tipo de serviço (`tblServicosTipo`, linha 14113)
```js
const byTipo = grp(rv, (r) => r._tipoL);
const tipoKeys = Object.keys(byTipo).filter((k) => k !== "__null__").sort((a, b) => byTipo[b].length - byTipo[a].length);
const tipoData = tipoKeys.map((k) => ({ nome: k, qtd: byTipo[k].length, fat: sumV(byTipo[k]) }));
renderShareTable("tblServicosTipo", tipoData, totalServicos, fat);
```
- Agrupa pelo rótulo do tipo de serviço e mostra % da quantidade e % do faturamento.
- Ordena por `fatPct` e corta com `topByShare`, mantendo itens acima de 10% ou, no mínimo, o top 3.

### Tabela por tipo de veículo (`tblTipoVei`, linha 14124)
```js
const byVei = grp(rv, (r) => r._veiL);
const vK = Object.keys(byVei).filter((k) => k !== "__null__").sort((a, b) => byVei[b].length - byVei[a].length);
renderShareTable("tblTipoVei", vK.map((k) => ({ nome: k, qtd: byVei[k].length, fat: sumV(byVei[k]) })), totalServicos, fat);
```
- Mesma regra da tabela anterior, agrupando pelo rótulo de `cr40f_tipodeveiculo`.

### Serviços emergenciais (`sEmergCount` + `tblServicosEmergenciais`, linha 14133)
```js
const servicosEmergenciais = rv.filter((r) => { const criadoEm = String(r.createdon || "").slice(0, 10);
  const saidaEm = String(r[F.res.data] || "").slice(0, 10); return criadoEm && saidaEm && criadoEm === saidaEm; }).sort((a, b) => b._ts - a._ts);
set("sEmergCount", dvDisabled ? "â€”" : servicosEmergenciais.length.toLocaleString("pt-BR"));
/* tabela: Solicitante (+ _cli) | Saída fmtDt | Status badge(_stL) */
```
- Entra o serviço cuja data de criação (UTC, `slice(0,10)`) é igual à data de saída.

### Tabela "Todos os serviços" (`tbSrv`, linha 16738)
```js
rows.slice(0, 500).map((r) => `<tr><td class="dim">${fmtDt(r[F.res.data])}</td><td class="em">${r._cli}</td><td>${r._mot}</td>
  <td class="dim">${r._tipoL}</td><td class="dim">${r._veiL}</td><td>${badge(r._stL)}</td><td>${badge(r._fatStL)}</td>
  <td class="r em">${r._valor ? brl(r._valor) : '<span class="dim">—</span>'}</td></tr>`)
```
- Mostra no máximo 500 linhas.
- A busca `srchReg` filtra `_cli`/`_mot` em `VW.reservas`. Atenção: essa busca não aplica o filtro `catItem`.
- A ordenação por coluna usa `{data:"_ts",cliente:"_cli",motorista:"_mot",tipo:"_tipoL",veiculo:"_veiL",status:"_stL",fatStatus:"_fatStL",valor:"_valor"}`.
- `metaSrv` recebe `` `${rv.length} registros` ``.
- O ranking de passageiros (`renderPassengerRanking(rv)`) também é chamado nesta aba.

---

## 2. Faturamento (`#page-faturamento`, linha 6343; `renderFaturamento`, linha 14286)

**Loaders:** reservas e precos (ver seção 0). O ciclo financeiro também lê `DB.pagantes`, mas `pagantes` não está nas dependências desta aba (só em `pagantes` e `resumo`).

### KPIs `fT` e `fTk` (linha 14299)
```js
const faturamentoMensal = getMonthlyDataFromDataverse(currentYear, fS, fE);
const faturamentoTotal = faturamentoMensal.reduce((total, value) => total + (value || 0), 0);
set("fT", dvDisabled ? "—" : brlS(faturamentoTotal));
set("fTk", dvDisabled ? "—" : brlS(curTk));
```
- `getMonthlyDataFromDataverse` (linha 12317) calcula, por mês do ano corrente, `getPeriodValueAndCount(rangeStart, rangeEnd).value || null`.
- `getPeriodValueAndCount` (linha 12343) parte de `DB.reservas` com `catItem` igual a serviço, dentro do período e de `passesActiveFilters`.
- Quando o valor dá 0 e não há filtro de segmento, cai nos históricos fixos `fat2023`/`fat2024`/`fat2025`, proporcionais aos dias.

### Maior serviço (`fMax`, linha 14310)
```js
const maxVal = rv.length ? Math.max(...rv.map((r) => r._valor)) : 0;
set("fMax", dvDisabled ? "—" : brlS(maxVal));
```
- É o maior `_valor` individual, ou seja, o `new_valortotal` da CP vinculada.

### Clientes ativos (`fCli`, linha 14312)
```js
const cliAtivos = new Set(rv.map((r) => r._cli).filter((x) => x !== "Sem cliente")).size;
set("fCli", dvDisabled ? "—" : cliAtivos);
```
- Conta clientes distintos em `rv`, excluindo "Sem cliente".

### Ciclo financeiro (`renderFaturamentoCycle`, linha 14243)
```js
const payments = dvDisabled ? [] : DB.pagantes || [];
const byOp = new Map(); payments.forEach((payment) => { const op = String(paymentOp(payment) || "").toLowerCase(); if (!op) return; /* push */ });
const billing = [];
rows.forEach((row) => { const finished = Date.parse(row[F.res.finalizacao] || "");
  const paymentsForOp = byOp.get(String(row._opId || "").toLowerCase()) || [];
  const notifiedAt = Math.min(...paymentsForOp.map((payment) => Date.parse(payment.createdon || "")).filter(Number.isFinite));
  const days = (notifiedAt - finished) / 86400000; if (Number.isFinite(days) && days >= 0) billing.push(days); });
const paymentDays = payments.filter(isReceivedPayment).map((payment) => { const start = Date.parse(payment.createdon || "");
  const end = Date.parse(payment[F.pag.dataPrimeiroPagamento] || ""); const days = (end - start) / 86400000;
  return Number.isFinite(days) && days >= 0 ? days : null; }).filter((days) => days !== null);
const paymentTimestampAvailable = DB.paymentTimestampAvailable !== false && payments.some((payment) => Number.isFinite(Date.parse(payment[F.pag.dataPrimeiroPagamento] || "")));
const billingAvg = avg(billing); const paymentAvg = paymentTimestampAvailable ? avg(paymentDays) : null;
const pending = payments.filter((payment) => !isReceivedPayment(payment) && Date.parse(payment.createdon || ""));
const oldest = pending.sort((a, b) => Date.parse(a.createdon) - Date.parse(b.createdon))[0];
const oldestDays = oldest ? Math.max(0, (Date.now() - Date.parse(oldest.createdon)) / 86400000) : null;
set("fatBillingDays", billingAvg === null ? "s/dado" : `${billingAvg.toFixed(1)} dias`);
set("fatPaymentDays", paymentAvg === null ? "s/dado" : `${paymentAvg.toFixed(1)} dias`);
set("fatCycleDays", billingAvg === null || paymentAvg === null ? "s/dado" : `${(billingAvg + paymentAvg).toFixed(1)} dias`);
set("fatOldestCp", oldestDays === null ? "—" : `${oldestDays.toFixed(0)} dias`);
set("fatRodoanel", "s/dado");
set("fatBillingMeta", `${billing.length} CPs: finalizacao ate cobranca`);
set("fatPaymentMeta", paymentTimestampAvailable ? `${paymentDays.length} pagamentos medidos` : "campo ainda nao publicado no ambiente");
set("fatCycleMeta", "soma das medias acima");
set("fatOldestCpMeta", oldest ? `${brl(paymentValue(oldest))} desde ${fmtD(oldest.createdon)}` : "nenhuma CP pendente");
set("fatRodoanelMeta", "sem vinculo confirmado de repasse");
```
- **Prazo para faturar:** média de dias entre `new_datadefinalizacao` da reserva e o `createdon` mais antigo dos pagantes da mesma OP.
- **Prazo para pagar:** média de dias entre `createdon` e `cr40f_datadoprimeiropagamento` dos pagantes recebidos.
- **Ciclo financeiro:** soma das duas médias.
- **CP pendente mais antiga:** dias desde o `createdon` do pagante não recebido mais antigo.
- **Rodoanel:** é fixo em "s/dado", sem cálculo.

### Gráfico "Faturamento mensal" (`cFM2`, linha 14339)
```js
mkChart("cFM2", { type: "bar", data: { labels: monthsLabelsAll /* jan..dez */, datasets: [{ label: "Faturamento", data: faturamentoMensal,
  backgroundColor: "rgba(33,89,210,.78)", borderRadius: 6, barPercentage: 0.72, categoryPercentage: 0.78 }] }, options: fmChartOptions });
```
- São 12 meses do ano corrente.
- O datalabel só aparece quando o valor é maior que 0.
- O eixo y tem `grace "12%"`.

### Status de faturamento (`tblFatStatus`, linha 14359)
```js
const fatStatusRows = rv.filter((r) => String(r[F.res.data] || "").slice(0, 10) >= "2026-04-01");
const byFatSt = grp(fatStatusRows, (r) => r._fatStL);
const fsK = Object.keys(byFatSt).filter((k) => k !== "__null__").sort((a, b) => byFatSt[b].length - byFatSt[a].length);
renderDistributionTable("tblFatStatus", fsK.map((k) => ({ label: k, qtd: byFatSt[k].length, value: sumV(byFatSt[k]) })),
  fatStatusRows.length, { label: "Status", countLabel: "Servicos", valueLabel: "Faturamento", badgeLabels: true, moneyValue: true });
```
- Considera só serviços com saída a partir de 01/04/2026, agrupados pelo rótulo de `cr40f_statusdefaturamento`.
- A participação é por quantidade, porque `participationByValue` é false.

### Faturamento por cliente (`tbFat`, linhas 14370 e 16751)
```js
const cliRows = Object.entries(byCli).map(([n, v]) => ({ nome: n, qtd: v.length, fat: sumV(v), ticket: getTicketStats(v).ticket })).sort((a, b) => b.fat - a.fat);
set("metaFat", dvDisabled ? "—" : `${cliRows.length} clientes`);
renderSumTable("tbFat", cliRows, fat);
// renderSumTable: # (rn r1/r2/r3) | nome | qtd + `${(qtd/totalQtd*100).toFixed(0)}%` | brl(fat) | brl(ticket) | progressCell(fat/totalFat)
```
- `byCli` é `grp(rv, r => r._cli)` e inclui "Sem cliente".
- A busca filtra por `nome`.
- O cabeçalho HTML tem 5 colunas, mas a linha renderiza 6, com a barra de participação no fim.

---

## 3. Pagamentos (`#page-pagantes`, linha 6427; `renderPagamentos`, linha 14382)

**Loader** (`loadPagantes`, linha 11546):
```js
const base = `cr40f_pagantesid,createdon,${F.pag.lookupOP},${F.pag.status},${F.pag.valor},${F.pag.forma}`;
try { DB.pagantes = await fetchAll(`${API()}/${T.pagantes}?$select=${base},${F.pag.dataPrimeiroPagamento}`); DB.paymentTimestampAvailable = true; }
catch (error) { DB.pagantes = await fetchAll(`${API()}/${T.pagantes}?$select=${base}`); DB.paymentTimestampAvailable = false; /* reportDashboardError */ }
```
- Não há `$filter`: carrega todos os pagantes, e o filtro de data global não se aplica a eles.

**Helpers:**
```js
const isReceivedPayment = (r) => { const label = normL(formatted || r[F.pag.status] || ""); return r[F.pag.status] === 202410002 || label === "pago" || label === "paga"; };
const isCardPayment = (r) => { const k = normL(fv(r, F.pag.forma)); return k.includes("cartao") || k.includes("credito") || k.includes("link") || k.includes("maquina"); };
const paymentOp = (r) => String(r?.[F.pag.lookupOP] || "").toLowerCase();
const paymentValue = (r) => parseFloat(r?.[F.pag.valor]) || 0;
```

### Total recebido (`pTot`, linha 14399)
```js
set("pTot", dvDisabled ? "—" : brlS(resumo.recebidoProduzido ?? pagReceb.reduce((s, r) => s + paymentValue(r), 0)));
```
- Vem de `recebidoProduzido = getRecebimentoStats(rv).recebido`, que é a soma de `_valor` das reservas com `fatStatus === 202410010` e valor maior que 0.
- A soma dos pagantes só entra como fallback.

### A receber (`pPend`)
```js
set("pPend", dvDisabled ? "—" : brlS(resumo.aReceber || 0));
```
- É o mesmo `aReceber` da aba Serviços.

### Cartão (`pCartao`, linha 14390)
```js
const cartaoRecebido = pagReceb.filter(isCardPayment).reduce((s, r) => s + paymentValue(r), 0);
set("pCartao", dvDisabled ? "—" : brlS(cartaoRecebido));
```
- Soma `cr40f_valor` dos pagantes recebidos cuja forma contém cartão, crédito, link ou máquina.
- `pagReceb` é `DB.pagantes.filter(isReceivedPayment)`.

### Atrasados há mais de 5 dias (`pPrazo`, linha 14393)
```js
const limiteAtraso = 5 * 24 * 60 * 60 * 1000; const agora = Date.now();
const atrasados = pags.filter((r) => { const criadoEm = new Date(r.createdon || "").getTime();
  return !isReceivedPayment(r) && Number.isFinite(criadoEm) && agora - criadoEm > limiteAtraso; });
set("pPrazo", dvDisabled ? "—" : atrasados.length);
```
- Conta pagantes não recebidos criados há mais de 5 dias.
- `pQtd` (`pags.length`) existe, mas está apenas no template não montado.

### Distribuição por forma (`tblFormaPag`, linha 14409)
```js
const byForma = grp(pags, (r) => String(pgFv(r, F.pag.forma) || "—"));
renderDistributionTable("tblFormaPag", fmK.map((k) => ({ label: k, qtd: byForma[k].length, value: byForma[k].reduce((s, r) => s + paymentValue(r), 0) })),
  pags.length, { label: "Forma", countLabel: "Registros", valueLabel: "Valor", moneyValue: true, participationByValue: true });
```
- Usa todos os pagantes, com participação por valor.

### Distribuição por status (`tblStatusPag`, linha 14410)
```js
const byPagSt = grp(pags, (r) => String(pgFv(r, F.pag.status) || "—"));
renderDistributionTable("tblStatusPag", psK.map(... value: soma paymentValue ...), pags.length,
  { label: "Status", countLabel: "Registros", valueLabel: "Valor", badgeLabels: true, moneyValue: true, participationByValue: true });
```

### Tempo de pagamento por cliente (`paymentInsight`, linha 14429)
Este card só existe dentro de `ensureReviewLayouts`, que nunca é chamado; portanto não aparece hoje.
```js
const clientePorOp = new Map((DB.reservas || []).filter((r) => r._opId).map((r) => [r._opId, r._cli || "Sem cliente"]));
const temposPagos = pagReceb.map((r) => { const dias = (pagoEm - criadoEm) / 86400000;   // dataPrimeiroPagamento - createdon
  return Number.isFinite(dias) && dias >= 0 ? { cliente: clienteDoPagamento(r), dias } : null; }).filter(Boolean);
/* por cliente: qtd, media, ateCinco = tempos.filter(d => d <= 5).length; sort media desc; slice(0,10) */
const formatPaymentDays = (days) => days < 1 ? `${Math.max(1, Math.round(days * 24))} h` : `${days.toFixed(1).replace(".", ",")} dias`;
set("paymentInsightMeta", `${temposPagos.length} de ${pagReceb.length} pagamentos com data confiável`);
```

### Concentração por cliente e atrasados por cliente (`tblPagCliente` e `tblPagAtrasados`, linha 14471)
```js
const porCliente = grp(pags, clienteDoPagamento);   // ordenado por soma de valor desc
renderDistributionTable("tblPagCliente", ..., pags.length, { label: "Cliente", countLabel: "Registros", valueLabel: "Valor", moneyValue: true, participationByValue: true });
const atrasadosPorCliente = grp(atrasados, clienteDoPagamento);
renderDistributionTable("tblPagAtrasados", ..., atrasados.length, { label: "Cliente", countLabel: "Atrasados", valueLabel: "Valor", moneyValue: true, participationByValue: true });
```
- O cliente do pagamento é resolvido pela OP: `_cr40f_financeiro_value` do pagante é casado com o `_opId` da reserva.

---

## 4. Despesas (`#page-despesas`, linha 6491; `renderDespesas`, linha 14937)

**Loaders** (linhas 11572–11628):
```js
// loadDespesas: $select = todos os campos de F.despesa (id,nome,data,valor,categoria,formaPagamento,motorista,veiculo,reserva,cidade,manutencao,
//   estabelecimento,observacao,observacaoInterna,statusFinanceiro,statusOperacional,statusAnexo,origem,possivelDuplicidade,protocolo,km,litros,createdon,modifiedon)
`${API()}/${T.despesas}?$select=${fields}&$filter=statecode eq 0&$orderby=${F.despesa.data} desc`
// loadCategoriasDespesas (wantAnnotations:false): $select = id,nome,dre,ordem,ativa
`${API()}/${T.categoriasDespesas}?$select=${fields}&$filter=statecode eq 0 and ${F.categoriaDespesa.ativa} eq true&$orderby=${F.categoriaDespesa.ordem} asc`
// loadFormasPagamentoDespesas (wantAnnotations:false): $select = id,nome,tipo,ordem,ativa
`${API()}/${T.formasPagamentoDespesas}?$select=${fields}&$filter=statecode eq 0 and ${F.formaDespesa.ativa} eq true&$orderby=${F.formaDespesa.ordem} asc`
// loadAnexosDespesas: $select = id,despesa,nomeArquivo,url,shareLink,status,tipo,createdon
`${API()}/${T.anexosDespesas}?$select=${fields}&$filter=statecode eq 0&$orderby=${F.anexoDespesa.criadoEm} desc`
```
- Esta aba também usa funcionarios e reservas.

### Montagem das linhas (`buildExpenseRows`, linha 14535)
```js
// categoryMap: id -> { name: nome, dre: fv(dre) || raw || "Sem grupo DRE" }; paymentMap: id -> nome
// employeeMap: funcionariosid -> { name: nome || apelido, company: expenseCompanyLabel(fv(empresa)) }
// reservationMap: res.id -> { client: _cli || navCli.nome, date }
const noReceipt = Number(source[F.despesa.statusAnexo]) !== 100000002 && attachments.length === 0;
row = { id, date, dateKey: date.slice(0,10), name, value: Number(valor||0), categoryId, category, dre, paymentId, payment, driverId, driver,
  driverKey: driverId || `nome:${normL(driver)}`, company: employee?.company || "Sem empresa", reservationId, client,
  link: reservationId ? `Reserva${client ? ` · ${client}` : ""}` : "Sem reserva",
  financialValue: String(statusFinanceiro ?? ""), financial, operationalValue, operational, attachmentValue, attachmentStatus, noReceipt, receiptUrl,
  possibleDuplicate: source[F.despesa.possivelDuplicidade] === true, searchText };
function expenseCompanyLabel(value) { const normalized = normL(label);
  if (normalized.includes("betinhos")) return "BETINHOS"; if (normalized.includes("depaula")) return "DEPAULA"; return label || "Sem empresa"; }
```
- Os ids passam por `expenseId`, que remove `{}` e converte para minúsculas.
- A URL do comprovante é `shareLink || url` do primeiro anexo cujo protocolo seja `http`/`https`.

### Filtros próprios (`populateExpenseFilters`, linha 14704; `expenseMatchesFilters`, linha 14752)
```js
let expenseFilters = { company: [], category: [], payment: [], financial: [], operational: [], attachment: [] };
// multiselects: expenseMsCompany (row.company), expenseMsCategory (categoria id), expenseMsPayment (forma id),
//   expenseMsFinancial / expenseMsOperational / expenseMsAttachment (chaves de EXPENSE_STATUS)
const selectedDriverKeys = (msState.Mo || []).map((value) => expenseId(value) || normL(value));
const driverMatches = !selectedDriverKeys.length || selectedDriverKeys.includes(row.driverKey) || selectedDriverKeys.includes(`nome:${normL(row.driver)}`);
if (expenseFilters.company.length && !expenseFilters.company.includes(row.company)) return false;
if (expenseFilters.category.length && !expenseFilters.category.includes(row.categoryId)) return false;
if (expenseFilters.payment.length && !expenseFilters.payment.includes(row.paymentId)) return false;
if (expenseFilters.financial.length && !expenseFilters.financial.includes(row.financialValue)) return false;
if (expenseFilters.operational.length && !expenseFilters.operational.includes(row.operationalValue)) return false;
if (expenseFilters.attachment.length && !expenseFilters.attachment.includes(row.attachmentValue)) return false;
/* data: (start||end) && !row.dateKey -> false; dateKey < start -> false; dateKey > end -> false */
```
- O filtro global de motorista (`msState.Mo`) também se aplica às despesas.
- "Limpar recorte" (`clearExpenseFilters`) zera os filtros e a busca.
- **Período anterior** (`getPreviousExpensePeriod`, linha 14778): janela imediatamente anterior, com o mesmo número de dias.

### Os 6 KPIs (linhas 14846 e 14959–15003, mais hospedagem nas linhas 15159–15170)
```js
function expenseSubsetMetrics(rows) { const total = rows.reduce((sum, row) => sum + row.value, 0);
  const foodRows = rows.filter((row) => EXPENSE_FOOD_CATEGORIES.has(normL(row.category)));
  const pendingRows = rows.filter((row) => row.financialValue === "100000001");
  return { total, food: sum(foodRows), pending: sum(pendingRows), ticket: rows.length ? total / rows.length : 0,
    noReceipt: rows.filter((row) => row.noReceipt).length, noReservation: rows.filter((row) => !row.reservationId).length }; }
set("expenseTotal", brlS(currentMetrics.total));        // 1 Despesa realizada
set("expenseFood", brlS(currentMetrics.food));          // 2 Alimentação
set("expensePending", brlS(currentMetrics.pending));    // 3 Aguardando pagamento
set("expenseTicket", brl(currentMetrics.ticket));       // 4 Ticket médio
set("expenseNoReceipt", currentMetrics.noReceipt);      // 5 Sem comprovante
// 6 Média hospedagem:
const lodgingRows = rows.filter((row) => normL(row.category).includes("hosped"));
const lodgingAverage = lodgingRows.length ? lodgingRows.reduce((sum, row) => sum + row.value, 0) / lodgingRows.length : null;
const lodgingStatus = lodgingAverage === null ? "Sem lancamentos" : lodgingAverage <= 150 ? "Dentro da meta" : lodgingAverage <= 200 ? "Atencao" : "Fora da politica";
html("expenseLodgingStatus", `<span style="color:${lodgingColor};font-weight:800">${lodgingStatus}</span><span class="metric-secondary">Alvo ${brl(150)} · teto ${brl(200)}</span>`);
```
1. **Despesa realizada:** soma de `valor`.
2. **Alimentação:** soma das despesas cuja categoria normalizada é exatamente alimentacao, almoco, cafe, jantar ou lanche.
3. **Aguardando pagamento:** soma onde `statusfinanceiro` é 100000001.
4. **Ticket médio:** total dividido pelo número de lançamentos.
5. **Sem comprovante:** contagem de despesas com `statusanexo` diferente de Completo e sem nenhum anexo.
6. **Média hospedagem:** média por lançamento das categorias que contêm "hosped". Faixas: até R$150 fica verde, até R$200 laranja, acima disso vermelho.

Detalhes dos KPIs:
- Os KPIs 1 a 5 mostram um chip `expenseDeltaMarkup(cur, prev, {currency})` contra o período anterior. O rótulo é "ANT."; o chip mostra "s/dado" sem período e "base zero" quando a base é 0. Nesses KPIs, subir é desfavorável (`higherIsWorse`).
- Sparklines: `spExpenseTotal`, `spExpenseFood`, `spExpensePending`, `spExpenseTicket` e `spExpenseNoReceipt` usam a série mensal; `spExpenseLodging` usa a média mensal de hospedagem.

### Média de hospedagem por mês (`cExpenseLodgingMonthly`, linha 15168)
```js
const lodgingMonthly = aggregateExpenses(lodgingRows, (row) => mK(row.date)).sort((a, b) => a.label.localeCompare(b.label));
datasets: [{ label: "Media de hospedagem", data: lodgingMonthly.map((item) => item.value / item.qtd),
  backgroundColor: item.value / item.qtd <= 150 ? "#168f57" : <= 200 ? "#b17a00" : "#c43b3b" },
  { type: "line", label: "Alvo R$ 150", data: lodgingMonthly.map(() => 150) }, { type: "line", label: "Teto R$ 200", data: lodgingMonthly.map(() => 200) }]
set("metaExpenseLodging", `${lodgingRows.length} lancamentos · alvo ${brl(150)} · teto ${brl(200)}`);
```

### Média mensal por motorista (`cExpenseDriverMonthly`, linha 15208)
```js
rows.filter((row) => row.driver && row.driver !== "Sem motorista" && row.dateKey).forEach((row) => { const key = row.driverKey || row.driver;
  /* current.total += value; byMonth[mK(date)] += {value, qtd:1} */ });
const selectedDriver = availableDrivers.find((item) => item.key === expenseDriverSelection) || availableDrivers[0] || null;
const driverMonths = [...new Set(rows.map((row) => mK(row.date)).filter(Boolean))].sort();
data: driverMonths.map((month) => { const item = selectedDriver.byMonth.get(month); return item ? item.value / item.qtd : null; })
set("metaExpenseDriverMonthly", selectedDriver ? `${selectedDriver.driver} · media por lancamento` : "Sem motorista no filtro");
```
- Um seletor de rádio escolhe o motorista (`expenseDriverSelect`); o padrão é o primeiro em ordem alfabética.
- O gráfico mostra a média por lançamento em cada mês.

### Despesas por mês (`cExpenseMonthly` + `tblExpenseMonthly`, linha 15005)
```js
const monthly = aggregateExpenses(rows, (row) => mK(row.date)).map((item) => { const metrics = expenseSubsetMetrics(rows.filter((row) => mK(row.date) === item.label));
  return { ...item, food: metrics.food, pending: metrics.pending, ticket: metrics.ticket, noReceipt: metrics.noReceipt }; });
monthly.sort((a, b) => a.label.localeCompare(b.label));
// line: "Despesa total" (item.value) + "Alimentação" (item.food); tabela: Mês | Lançamentos | Despesa | Alimentação
set("metaExpenseTrend", `${rows.length} lançamentos · ${brl(currentMetrics.total)}`);
```
- `mK` gera a chave `YYYY-MM` a partir da data no fuso de Brasília (BRT).

### Categorias (`cExpenseCategories` + `tblExpenseCategories`, linha 15064)
```js
const categories = aggregateExpenses(rows, (row) => row.category); const topCategories = categories.slice(0, 8);
// barra horizontal (hBar, xBrl) com top 8
renderDistributionTable("tblExpenseCategories", categories, rows.length, { label: "Categoria", countLabel: "Lançamentos", valueLabel: "Valor", moneyValue: true, participationByValue: true, limit: 8 });
```
- `aggregateExpenses` (linha 14817) agrupa por chave somando `qtd` e `value`. Ordena por valor desc, depois `qtd` desc, depois rótulo.

### Por empresa (`tblExpenseCompanies`) e grupos DRE (`tblExpenseDre`), linha 15109
```js
const companies = aggregateExpenses(rows, (row) => row.company);
const dreGroups = aggregateExpenses(rows, (row) => row.dre);
renderDistributionTable("tblExpenseCompanies", companies, rows.length, { label: "Empresa", countLabel: "Lançamentos", valueLabel: "Valor", moneyValue: true, participationByValue: true });
renderDistributionTable("tblExpenseDre", dreGroups, rows.length, { label: "Grupo DRE", ... mesmas opções });
```
- A empresa vem de `cr40f_nomedaempresa` do funcionário, normalizada para BETINHOS/DEPAULA.
- O grupo DRE vem de `cr40f_grupodre` da categoria (código bruto, ver seção 0).

### Alimentação por motorista (`tblExpenseFoodDrivers`, linha 14831)
```js
function aggregateFoodExpensesByDriver(rows) { for (const row of rows) { if (!row.driverId || !EXPENSE_FOOD_CATEGORIES.has(normL(row.category))) continue;
  /* qtd++, value += , days.add(dateKey) */ }
  return [...].map((item) => ({ ...item, dailyAverage: item.days.size ? item.value / item.days.size : 0 })).sort(value desc, qtd desc, label); }
// tabela: Motorista | Lançamentos | Total | Média/dia
set("metaExpenseFoodDrivers", topFoodDriver ? `${foodDrivers.length} motoristas · maior gasto: ${topFoodDriver.label}` : "Sem gastos de alimentação no período");
```
- A média por dia é o total dividido pelo número de dias distintos com gasto.

### Tabela de lançamentos (`renderExpenseTable`, linha 14864)
O elemento `tbDespesas`/`expenseMobileList` não está no HTML estático da página.
- Colunas: Data, Despesa (com detalhes), Empresa, Categoria/DRE, Motorista, Vínculo, Forma, Operacional, Financeiro, Comprovante, Valor e "Abrir registro".
- Limites: 500 linhas no desktop e 120 no mobile.
- `openExpenseRecord` abre `Xrm.Navigation.openForm({entityName:"cr40f_despesaoperacional"})` ou, sem Xrm, `main.aspx?pagetype=entityrecord&etn=cr40f_despesaoperacional&id=`.

---

## 5. Frota (`#page-frota`, linha 6554; `renderFrota`, linha 15801, `renderInfleetTelemetry`, linha 15337, `renderDriverSafetyScore`, linha 15691)

**Loaders:**
```js
`${API()}/${T.veiculos}?$select=${F.vei.id},${F.vei.placa},${F.vei.marca},${F.vei.modelo},${F.vei.status},${F.vei.blindado},${F.vei.ano},${F.vei.cat}`   // 11557
`${API()}/${T.manutencoes}?$select=createdon,${F.man.data},${F.man.aprovacao},${F.man.valor},${F.man.status},${F.man.tipo},_${F.man.veiculo}_value&$orderby=${F.man.data} desc`
// telemetria (wantAnnotations:false), $select = todos de F.infleetDiaria
`${API()}/${T.telemetriaInfleet}?$select=${fields}&$filter=${F.infleetDiaria.data} ge 2026-01-01&$orderby=${F.infleetDiaria.data} desc`
// eventos (wantAnnotations:false), $select = todos de F.infleetEvento
`${API()}/${T.eventosInfleet}?$select=${fields}&$filter=${F.infleetEvento.reportadoEm} ge 2026-01-01T00:00:00Z&$orderby=${F.infleetEvento.reportadoEm} desc`
// viagens (wantAnnotations:false), $select = todos de F.infleetViagem
`${API()}/${T.viagensInfleet}?$select=${fields}&$filter=${F.infleetViagem.iniciadoEm} ge 2026-01-01T00:00:00Z&$orderby=${F.infleetViagem.iniciadoEm} desc`
```
- Também usa funcionarios, reservas e precos.

### Escopo de veículos (linha 15802)
```js
const hasFleetFilters = Boolean(fS || fE || msState.St.length || msState.Cl.length || msState.Mo.length || msState.Tp.length);
const scopedVehicleIds = new Set((rv || []).map((r) => String(r._veiId || "").toLowerCase()).filter(Boolean));
const vehicleScopeIds = hasFleetFilters ? scopedVehicleIds : null;
```
- Com qualquer filtro ativo, a aba só considera veículos que tiveram serviço em `rv`.
- Telemetria, eventos e viagens também são filtrados por `inDateRange(campoData, fS || "2026-01-01", fE || `${ano}-12-31`)`.

### KPIs cadastrais (linha 15824; ficam no template não montado)
```js
const disp = vei.filter((r) => stL(String(vFv(r, F.vei.status) || "")).includes("dispon") || ...includes("ativo") || ...includes("livre"));
const blin = vei.filter((r) => r[F.vei.blindado] === true || r[F.vei.blindado] === "true" || r[F.vei.blindado] === 1);
const vManF = vei.filter((r) => stL(String(vFv(r, F.vei.status) || "")).includes("manut"));
set("vTot", vei.length); set("vDisp", disp.length); set("vBlin", blin.length); set("vMan", vManF.length);
```
- Total, disponíveis (status com dispon, ativo ou livre), blindados e em manutenção (status com manut).
- Na tela, esses números só aparecem pela tabela "Veículos" (`tbFrota`), com colunas Placa, Marca, Modelo, Ano, Blindado e Status, e por `metaFrota`.
- `tblFrotaStatus` e `tblFrotaMarca` são chamados pelo JS, mas não existem no HTML da aba.

### KPIs de telemetria Infleet (linha 15360)
```js
const totalKm = daily.reduce((sum, row) => sum + numberValue(row[F.infleetDiaria.distancia]), 0);
const weightedSpeed = daily.reduce((sum, row) => { const weight = Math.max(numberValue(row[F.infleetDiaria.distancia]), 1);
  return sum + numberValue(row[F.infleetDiaria.velocidadeMedia]) * weight; }, 0);
const speedWeight = daily.reduce((sum, row) => sum + Math.max(numberValue(row[F.infleetDiaria.distancia]), 1), 0);
const averageSpeed = speedWeight ? weightedSpeed / speedWeight : 0;
const maximumSpeed = daily.reduce((max, row) => Math.max(max, numberValue(row[F.infleetDiaria.velocidadeMaxima])), 0);
const speedingCount = daily.reduce((sum, row) => sum + numberValue(row[F.infleetDiaria.excessos]), 0);
const totalFuel = trips.reduce((sum, row) => sum + numberValue(row[F.infleetViagem.combustivelLitros]), 0);
const tripDistance = trips.reduce((sum, row) => sum + numberValue(row[F.infleetViagem.distancia]), 0);
const infleetAutonomy = (distance, fuel) => { if (distance <= 0 || fuel <= 0) return 0; const value = distance / fuel; return value >= 2 && value <= 30 ? value : 0; };
const realAutonomy = infleetAutonomy(tripDistance, totalFuel);
const idleMinutes = daily.reduce((sum, row) => sum + numberValue(row[F.infleetDiaria.motorOciosoMin]), 0);
set("infKm", `${totalKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);
set("infVelMedia", `${averageSpeed...} km/h`); set("infVelMax", `${maximumSpeed...} km/h`); set("infExcessos", speedingCount...);
set("infAutonomia", dvDisabled || !realAutonomy ? "—" : `${realAutonomy...2} km/l`); set("infOciosidade", `${idleMinutes...0} min`);
```
- **Km:** soma da distância diária.
- **Velocidade média:** média ponderada pela distância, com peso mínimo 1.
- **Velocidade máxima:** máximo do campo diário.
- **Excessos:** soma do campo diário.
- **Consumo real:** km das viagens dividido pelos litros das viagens. Fora da faixa de 2 a 30 km/l, vira "—".
- **Motor ocioso:** soma de minutos.
- **Nota condução média** (`infNotaConducaoMedia`) vem de `renderDriverSafetyScore` (ver seção 6).

### Quilometragem diária (`cInfleetKm`, linha 15453)
```js
daily.forEach((row) => { const day = String(row[F.infleetDiaria.data] || "").slice(0, 10); kmByDay.set(day, (kmByDay.get(day) || 0) + numberValue(row[F.infleetDiaria.distancia])); });
// bar: labels dd/MM, data km por dia; metaInfleetTrend = `${kmDailyLabels.length} dias no periodo`
```

### Motor ocioso por mês (`cInfleetIdle`, linha 15470)
```js
current.idle += motorOciosoMin; current.distance += distancia;   // por `data.slice(0,7)`
data: item.distance ? (item.idle / item.distance) * 100 : null   // "Minutos ociosos / 100 km"
```

### Uso mensal da frota própria (`tblFrotaUso` + `cFrotaUsoMensal`, linhas 15912 e 10683)
```js
const selectedUsageStart = fS || `${ano}-01-01`; const usageStart = selectedUsageStart > "2026-06-01" ? selectedUsageStart : "2026-06-01";
const usageEnd = fE || `${ano}-12-31`;
const usage = buildOwnFleetUsageRows(vei, VW.reservas, usageStart, usageEnd);
// buildOwnFleetUsageRows:
function isActiveVehicle(row) { const status = normL(fv(row, F.vei.status)).trim(); return status === "ativo" || status === "ativo(a)"; }
function isOwnVehicle(row) { return isActiveVehicle(row) && normL(fv(row, F.vei.cat)).includes("proprio"); }   // terceiro / aluguel idem
function isReservableService(row) { const k = normL(row?._stL); return !k.includes("cancel") && !k.includes("recus"); }
reservas.filter(isReservableService).forEach((r) => { /* por day = r[F.res.data].slice(0,10): sets own/third/rental de _veiId */ });
eachDateBetween(startStr, endStr).forEach((d) => { const type = [0, 6].includes(d.getDay()) ? "weekend" : "weekday";
  const used = totalOwn ? (dayRows?.own.size || 0) : 0; const free = Math.max(0, totalOwn - used);
  bucket.days += 1; bucket.withoutSum += free; bucket.thirdSum += third; bucket.rentalSum += rental;
  bucket.pctSum += totalOwn ? (used / totalOwn) * 100 : 0; });
// fmtBucket: pct = pctSum/days, withoutAvg, thirdAvg, rentalAvg
// célula: metricSplit(`${pct.toFixed(1)}%`, `${withoutAvg.toFixed(1)} ociosos / ${thirdAvg.toFixed(1)} terceiros / ${rentalAvg.toFixed(1)} aluguel`)
set("metaFrotaUso", `${usage.totalOwn} proprios ativos · ${usage.totalThird} terceiros ativos · ${usage.totalRental} aluguel ativos · ${hasFleetFilters ? "filtro aplicado" : "base completa"} · desde 01/06/2026 · media diaria por mes`);
// cFrotaUsoMensal: line "Dias úteis" (weekday.pct) e "Fim de semana" (weekend.pct), y max 100 com sufixo %
```
- Para cada dia a partir de 01/06/2026, mede a fração dos veículos próprios ativos com serviço não cancelado e não recusado.
- A média é feita por mês, separada em dias úteis (seg–sex) e fim de semana (sáb/dom).
- Também mostra a média diária de próprios ociosos, terceiros e alugados usados.
- `VW.reservas` aqui não passa pelo filtro `catItem`.

### Eventos por mês (`cFrotaEventosMensal`) e resumo de eventos (`tblFrotaEventosResumo`), linha 15622
```js
const eventCategories = [
  { key: "overspeed", label: "Excesso de velocidade", match: (type, text) => type.includes("overspeed") || text.includes("velocidade"), color: "#C12F45" },
  { key: "acceleration", label: "Aceleração brusca", match: (type, text) => type.includes("acceleration") || text.includes("acelera"), color: "#9A4E12" },
  { key: "braking", label: "Frenagem brusca", match: (type, text) => type.includes("braking") || text.includes("frenagem") || text.includes("freada"), color: "#B17A00" },
  { key: "cornering", label: "Curva brusca", match: (type, text) => type.includes("cornering") || text.includes("curva"), color: "#6B4B9B" } ];
// por mês (reportadoEm.slice(0,7)): eventsCount, monthKm (soma distância diária do mês), rate = eventsCount / monthKm * 1000
// tendência = regressão linear (mínimos quadrados) sobre monthlyRates, clamp >= 0
datasets: [{ label: "Eventos / 1.000 km", data: monthlyRates }, { label: "Tendência", data: rateTrend, borderDash: [7, 5] }]
```
- Eventos são classificados em 4 categorias por `new_slug` ou `new_descricao`.
- O gráfico mensal mostra eventos classificados por 1.000 km, com linha de tendência.

### Ranking de risco (`tblFrotaRisco`, linha 15682)
```js
const riskyTypes = new Set(["routeOverspeed","deviceOverspeed","hardAcceleration","hardBraking","hardCornering","deviceIdle"]);
const riskRows = driverRows.filter((row) => row.risk > 0).map((row) => ({ ...row, riskRate: row.distance ? (row.risk / row.distance) * 1000 : 0 }))
  .sort((a, b) => b.riskRate - a.riskRate || b.risk - a.risk).slice(0, 5);
```
- `driverRows` usa viagens (viagens, km, combustível) e eventos de risco agrupados por `_new_motorista_value`.
- Mostra os 5 motoristas com mais eventos de risco por 1.000 km.

### Outras tabelas da aba
**Telemetria por veículo** (`tblInfleetVeiculos`, linha 15550). A tabela é renderizada duas vezes; vale a segunda versão, com 9 colunas:
- Veículo, Km, % frota, vs média (+ odômetro), Média, Máxima, Excessos, Eventos/1.000 km e Km/l real.
- A ordenação é por km desc.

**Eventos por tipo** (`tblInfleetEventos`, linha 15557). Mapa de nomes de exibição:
```js
const INFLEET_EVENT_DISPLAY_NAMES = { routeOverspeed: "Excesso de velocidade — rota", deviceOverspeed: "Excesso de velocidade — dispositivo",
  hardAcceleration: "Aceleração brusca", hardBraking: "Frenagem brusca", hardCornering: "Curva brusca", deviceIdle: "Motor ocioso",
  geofenceEnter: "Entrada em área monitorada", geofenceExit: "Saída de área monitorada", driverChanged: "Troca de motorista" };
```
- Colunas: Qtde, % total, Por 1.000 km, Vel. média e Vel. máxima.

**Condução por motorista** (`tblInfleetMotoristas`): Viagens, Km, Km/l real e Eventos de risco.

**`tblInfleetHealth` e `tblInfleetMapping`** existem no JS, mas não no HTML desta aba.

### KPIs de manutenção categorizados
O cálculo fica em `renderFrota`, mas os cards estão em `#page-manutencoes` (ver seção 7).

---

## 6. Motoristas (`#page-motoristas`, linha 6686; `renderMotoristas`, linha 15969)

**Loaders:** reservas, precos e funcionarios (`$select` na seção 1). Ativo significa `isActiveFuncionario = (r) => stL(String(fv(r, F.fun.status) || "")) === "ativo"`.

### Total de motoristas, CNH e serviços
```js
const funcionariosAtivos = DB.funcionarios.filter(isActiveFuncionario);
set("mTot", funcionariosAtivos.length);
const cnhWarn = funcionariosAtivos.filter((r) => { const cnhDate = ...; if (!Number.isFinite(cnhDate)) return false; return (cnhDate - Date.now()) / 86400000 <= 90; });
set("mCnh", cnhWarn.length); set("mSrv", rv.length);
```
- Total de funcionários ativos (todas as funções, sem filtro por função de motorista).
- CNH: ativos com CNH vencida ou vencendo em até 90 dias.
- Serviços no período: `rv.length`.

### Ranking de motoristas (`tbMot`, linhas 15985 e 16779)
```js
const motRows = funcionariosAtivos.map((f) => { const funcId = String(f.cr40f_funcionariosid || "").toLowerCase();
  const nome = f[F.fun.apelido] || f[F.fun.nome] || "—";
  const srvs = rv.filter((r) => funcId ? r._motId === funcId : r._mot === nome);
  return { nome, fullName: f[F.fun.nome] || nome, funcao: fv(f, F.fun.funcao) || "—", qtd: srvs.length, fat: sumV(srvs),
    ticket: getTicketStats(srvs).ticket, cnh: f[F.fun.cnh], months: Math.max(1, mks.length) }; }).sort((a, b) => b.qtd - a.qtd);
// renderMotTable: # | nome | qtd + `${(qtd/months).toFixed(1)}/mês` | brl(fat) + brlS(fat/months) | brl(ticket) | CNH | horas trabalhadas | descanso
const cnhCls = !Number.isFinite(cnhDate) ? "dim" : cnhDiff < 0 ? "em cnh-expired" : cnhDiff <= 90 ? "em cnh-warning" : "dim";
const cnhTxt = Number.isFinite(cnhDate) ? fmtD(r.cnh) : "Não informado";
const jornada = markpointDriverMetrics.get(markpointNormalizeName(r.fullName || r.nome)) || { totalWorked: 0, totalRest: 0 };
```
- Lista os funcionários ativos com os serviços casados por id (`_motId`), ordenados por quantidade desc.
- `months` é o número de meses com dados em `rv` (`mks.length`), com mínimo 1.
- A CNH aparece vermelha se vencida e laranja se faltam até 90 dias.
- Horas e descanso vêm do relatório MarQPonto importado pelo usuário.
- `metaMot` recebe `` `${funcionariosAtivos.length} motoristas ativos` ``.

### Score por motorista e mês (`tblDriverSafetyScore`, linha 15706; exibido na aba Frota)
```js
// distance: soma viagens por (motorista, mês iniciadoEm); acceleration/braking: eventos new_slug "hardacceleration"/"hardbraking" (lowercase)
// idle: telemetria diária do veículo no mês, atribuída só se o veículo teve exatamente 1 motorista no mês (drivers.size === 1)
const componentScore = (rate, goodLimit, badLimit) => { if (rate <= goodLimit) return 100; if (rate >= badLimit) return 0; return 100 * (badLimit - rate) / (badLimit - goodLimit); };
const accelerationRate = row.distance ? (row.acceleration / row.distance) * 100 : null;   // por 100 km
const brakingRate = ...; const idleRate = row.distance && row.idleKnown ? (row.idle / row.distance) * 100 : null;
const sufficient = row.distance >= 100 && idleRate !== null && Array.isArray(DB.eventosInfleet) && Array.isArray(DB.telemetriaInfleet);
const score = sufficient ? Math.round(accelerationScore * .35 + brakingScore * .35 + idleScore * .30) : null;   // limites acel/fren .5–4; ocioso 5–25
// ordenação: month desc, score desc, distance desc. Colunas: Motorista | Mês | Nota ("Dados insuficientes") | Acel. | Fren. | Ocioso | Km
```
- Nota de 0 a 100 por motorista e mês.
- Pesos: 35% aceleração, 35% frenagem e 30% ocioso, cada um medido por 100 km.
- Só vale com pelo menos 100 km no mês e ociosidade atribuível.
- `infNotaConducaoMedia` é a média arredondada das notas válidas.

### Ranking mensal (`tblTopMotMonthly`, linha 15766)
```js
const monthlyScoreRanking = [...new Set(validRows.map((row) => row.month))].sort().map((month) => ({ month,
  ranking: validRows.filter((row) => row.month === month).sort((a, b) => b.score - a.score || b.distance - a.distance || nome.localeCompare)
    .slice(0, 5).map((row) => ({ name: driverMap.get(row.driverId) || "Motorista vinculado", score: row.score, distance: row.distance })) }));
// colunas: Mês | 1º..5º lugar ("Nota X · N km" / "Sem nota válida")
set("v_topMotMonthly", monthlyScoreRanking.length ? "Top 5" : "—"); set("sub_topMotMonthly", `${monthlyScoreRanking.length} meses · mínimo 100 km`);
```
- Top 5 notas válidas por mês, com desempate por km e depois por nome.
- O nome usa `driverMap`, que prioriza apelido e depois nome completo.

---

## 7. Manutenções (`#page-manutencoes`, linha 6756; `renderManutencoes`, linha 16013, mais o bloco em `renderFrota`, linhas 15843–15911)

**Loader:**
```js
`${API()}/${T.manutencoes}?$select=createdon,${F.man.data},${F.man.aprovacao},${F.man.valor},${F.man.status},${F.man.tipo},_${F.man.veiculo}_value&$orderby=${F.man.data} desc`
```
- `VW.manutencoes` é `filterByDate(DB.manutencoes, F.man.data)`.
- **Atenção:** os KPIs categorizados são calculados dentro de `renderFrota`, mas `#page-manutencoes` depende só de `["manutencoes"]`. Ou seja, `renderFrota` roda junto em `renderAll`.

### KPIs gerais (`custoTotal` vem de `renderAll`, linha 13566)
```js
const custoTotal = VW.manutencoes.reduce((s, r) => s + (parseFloat(r[F.man.valor]) || 0), 0);
const manAnd = mans.filter((r) => stL(String(manFv(r, F.man.status) || "")).includes("andamento") || ...includes("aberto") || ...includes("pend"));
set("manTot", mans.length); set("manCusto", brlS(custoTotal)); set("manAnd", manAnd.length);
set("manMed", brlS(mans.length ? custoTotal / mans.length : 0));
```
- **Total:** quantidade de registros no período.
- **Custo total:** soma de `cr40f_valor`.
- **Em andamento:** status contendo andamento, aberto ou pend.
- **Custo médio:** custo total dividido pelo total.

### Custo por mês (`cManMes`, linha 16031)
```js
const manByM = grp(VW.manutencoes, (r) => mK(r[F.man.data])); const manMks = mKeys(manByM);
const mmData = manMks.map((k) => manByM[k].reduce((s, r) => s + (parseFloat(r[F.man.valor]) || 0), 0));
mkChart("cManMes", { type: "bar", data: { labels: manMks.map(mL), datasets: [{ label: "Custo", data: mmData, backgroundColor: "#9a4e12" }] } });
```
- Barras com a soma de valor por mês de `cr40f_datamanutencao`.

### Por tipo de reparo (`tblManTipo`, linha 16056)
```js
const byManTp = grp(mans, (r) => String(manFv(r, F.man.tipo) || "—"));
renderDistributionTable("tblManTipo", mtK.map((k) => ({ label: k, qtd: byManTp[k].length, value: soma valor })), mans.length,
  { label: "Tipo", countLabel: "Registros", valueLabel: "Custo", moneyValue: true, participationByValue: true });
```
- Agrupa pelo rótulo de `cr40f_tipodoreparo`, com participação por custo.
- A tabela de registros `tbMan` está desativada no código (`if (false)`).

### Categorias por palavra-chave (`maintenanceCategory`, linha 10516)
```js
const maintenanceCategory = (value) => { const k = normL(value);
  if (k.includes("avaria") || k.includes("sinistro") || k.includes("colis")) return "Avaria";
  if (k.includes("crit") || k.includes("pane") || k.includes("emerg")) return "Corretiva critica";
  if (k.includes("conserv") || k.includes("confort") || k.includes("imagem") || k.includes("limpeza") || k.includes("funilar")) return "Conservacao";
  if (k.includes("condic") || k.includes("pneu") || k.includes("eletric") || k.includes("ar condicionado")) return "Preventiva condicao";
  if (k.includes("prevent") || k.includes("revis") || k.includes("oleo")) return "Preventiva programada";
  return "Corretiva nao critica"; };
```
- As regras são avaliadas na ordem acima, sobre o rótulo formatado do tipo de reparo.
- "Preventiva condicao" é calculada, mas não tem card.

### KPIs por categoria (linhas 15845–15906)
```js
const getMaintenanceKpiStats = (rows) => { const categorias = grp(rows, (r) => maintenanceCategory(manFvInFrota(r, F.man.tipo)));
  const prazos = rows.map((r) => daysBetweenValues(r.createdon, r[F.man.data])).filter((dias) => dias !== null && dias >= 0);
  const prazoMedio = prazos.length ? prazos.reduce((total, dias) => total + dias, 0) / prazos.length : null;
  const percentualAte10Dias = prazos.length ? (prazos.filter((dias) => dias <= 10).length / prazos.length) * 100 : null;
  return { categorias, prazoMedio, percentualAte10Dias }; };
// daysBetweenValues = Math.floor((end - start) / 86400000)
set("frPrevProg", preventiva); set("frCorrNaoCrit", corrNaoCrit); set("frCorrCrit", corrCrit); set("frConserv", conservacao); set("frAvaria", avaria);
set("frPrazoMedio", prazoMedio === null ? "s/dado" : `${prazoMedio.toFixed(1)} dias`);
set("frPrazoAte10", percentualAte10Dias === null ? "s/dado" : `${percentualAte10Dias.toFixed(1)}%`);
// chips LM/LY: maintenanceCountChip / maintenanceAverageChip contra samePeriodLastMonth / samePeriodLastYear de DB.manutencoes (inDateRange F.man.data);
// LM só aparece quando shouldShowLM (filtro dentro do mês corrente); período padrão = ano corrente
```
- Cinco cards de contagem: Preventiva programada, Corretiva não crítica, Corretiva crítica, Conservação e Avaria.
- **Tempo até manutenção:** média de dias entre `createdon` e `cr40f_datamanutencao`, com o percentual feito em até 10 dias.
- Os chips comparam com o mesmo período do mês anterior (LM) e do ano anterior (LY).

### Metas
- **Não existem no código de cálculo**; aparecem só no texto explicativo (linha 12968): "Preventiva programada mede aprovação até data em até 10 dias." e "Corretiva crítica tem meta zero; não crítica tem meta de até 5 no mês."
- O código mede `createdon` até a data da manutenção, não `cr40f_datadaaprovacao`.
- A direção dos KPIs vem de `addKpiGoalDirections` (linha 12553): rótulos com `corretiva|avaria|manuten|custo|em andamento` são marcados como "descer"; os demais, como "subir".

---

## 8. Multas (`#page-multas`, linha 6817; `renderMultas`, linha 16075)

**Loaders:**
```js
`${API()}/${T.multas}?$select=${F.mul.data},${F.mul.status},_${F.mul.tipo}_value,_${F.mul.mot}_value,_${F.mul.placa}_value&$expand=cr40f_Codigodainfracao($select=${F.inf.codigo},${F.inf.descricao})&$orderby=${F.mul.data} desc`   // 11531
`${API()}/${T.infracoes}?$select=${F.inf.id},${F.inf.codigo},${F.inf.descricao}`   // 11536
```
- Também usa funcionarios, via `funcMapGlobal`.
- `VW.multas` é `filterByDate(DB.multas, F.mul.data)`.

### KPIs (linha 16079)
```js
const mulPen = muls.filter(isMultaPendente);   // Number(status) === 202410000
const mulRes = muls.filter((r) => stL(String(mulFv(r, F.mul.status) || "")).includes("pago") || ...includes("resolvid") || ...includes("conclu"));
set("mulTot", muls.length); set("mulPen", mulPen.length); set("mulRes", mulRes.length);
```
- **Total:** multas no período.
- **Pendentes:** status 202410000 ("notificar").
- **Resolvidas:** rótulo do status contendo "pago", "resolvid" ou "conclu".

### Por status (`tblMulStatus`)
```js
const byMulSt = grp(muls, (r) => String(mulFv(r, F.mul.status) || "—"));
renderDistributionTable("tblMulStatus", msK.map((k) => ({ label: k, qtd: byMulSt[k].length })), muls.length, { label: "Status", countLabel: "Multas", badgeLabels: true });
```

### Por motorista (`tblMulMot`, linha 16098)
```js
const byMulMot = grp(muls, (r) => { const motId = r[`_${F.mul.mot}_value`];
  const motName = r[`_${F.mul.mot}_value@OData.Community.Display.V1.FormattedValue`] || "—";
  return funcMapGlobal.get(String(motId)?.toLowerCase()) || motName; });
const mmK = topByShare(mmKRanked, muls.length, (k) => byMulMot[k].length);
renderDistributionTable("tblMulMot", mmK.map((k) => ({ label: k, qtd: byMulMot[k].length })), muls.length, { label: "Motorista", countLabel: "Multas" });
```
- O nome do motorista é o apelido via id; sem correspondência, usa o rótulo do lookup.
- As linhas passam por `topByShare`.

### Por infração (`tblMulTipo`, linha 16090)
```js
const multaTipo = (r) => { const id = String(r[`_${F.mul.tipo}_value`] || "").toLowerCase();
  const expanded = r[F.mul.tipo] || r.cr40f_Codigodainfracao;
  const codigo = String(expanded?.[F.inf.codigo] || lookupValue(r, F.mul.tipo) || "").trim();
  const descricao = String(expanded?.[F.inf.descricao] || "").trim();
  return infracaoMapGlobal.get(id) || [codigo, descricao].filter(Boolean).join(" - ") || "Sem tipo"; };
const mtK = topByShare(mtKRanked, muls.length, (k) => byMulTipo[k].length);
set("mulTipoNote", mtK.length ? "Agrupado por codigo/descricao da infracao." : "Sem infracao no periodo filtrado.");
renderDistributionTable("tblMulTipo", mtK.map(...), muls.length, { label: "Tipo", countLabel: "Multas", labelMax: 80 });
```
- O rótulo segue esta prioridade: (1) `"código - descrição"` vindo da tabela de infrações; (2) o expand; (3) o lookup; (4) "Sem tipo".

### Registro de multas (`tbMul`, linha 16137)
```js
muls.slice(0, 300).map((r) => `<tr><td class="dim">${fmtDt(r[F.mul.data])}</td><td>${motDisplay}</td><td class="em">${r[`_${F.mul.placa}_value@OData.Community.Display.V1.FormattedValue`] || "—"}</td><td>${trunc(multaTipo(r), 80)}</td><td>${badge(String(mulFv(r, F.mul.status) || "—"))}</td></tr>`)
set("metaMul", `${muls.length} registros`);
```
- Mostra no máximo 300 linhas: Data/hora, motorista, placa (rótulo do lookup), tipo e status.