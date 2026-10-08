# Legado — aba Resumo (Dashboard.html)

Arquivo-fonte: `C:\Users\mendo\Desktop\vscode\Dashboard Betinhos\Dashboard.html`. Os números de linha referem-se a esse arquivo.

---

## 1. Enriquecimento das reservas (`enrichReservas`)

**Mapa de CPs (composição de preço), L11798–11809**
```js
function enrichReservas() {
  const precoMap = new Map();
  for (const p of DB.precos) {
    const id = p["cr40f_composicaodeprecosid"]?.toLowerCase();
    if (id) {
      const valor = parseFloat(p[F.preco.valorTotal]) || 0;   // new_valortotal
      const status = p[F.preco.status];                        // new_status
      const pendente = status === 100000000;
      const concluida = status === 100000001;
      precoMap.set(id, { valor, pendente, concluida });
    }
  }
```
As CPs ficam indexadas pelo id em minúsculas. `new_status` igual a 100000000 indica CP pendente; 100000001 indica CP concluída.

**Corte de jan–mar/2026 e montagem dos campos, L11816–11851**
```js
DB.reservas = DB.reservas.filter((r) => {
  if (r._legacy2026) return false;
  const date = String(r[F.res.data] || "").slice(0, 10);
  return date < "2026-01-01" || date > "2026-03-31";
}).map((r) => {
  const entry =
    precoMap.get((r[F.res.lookupPreco] || "").toLowerCase());   // _new_composicaodepreco_value
  const valor = entry?.valor || 0;
  const cpPendente = entry?.pendente ?? false;
  const nomeMot = r[F.res.navMot]?.[F.fun.nome] || "Sem motorista";
  const motId = String(r[F.res.navMot]?.cr40f_funcionariosid || "").toLowerCase();
  const motDisplay =
    funcMapGlobal.get(nomeMot.toLowerCase()) || nomeMot;
  const motKey = motId || `nome:${motDisplay.toLowerCase()}`;
  return {
    ...r,
    _id: (r[F.res.id] || "").toLowerCase(),
    _motId: motId,
    _motKey: motKey,
    _mot: motDisplay,
    _cli: r[F.res.navCli]?.cr40f_nomedocliente || "Sem cliente",
    _solicitante: String(fv(r, F.res.solicitante) || "N&atilde;o informado"),
    _stL: String(fv(r, F.res.status) || "Sem status"),
    _fatStL: String(fv(r, F.res.fatStatus) || "—"),
    _tipoL: String(fv(r, F.res.tipo) || "—"),
    _veiL: String(fv(r, F.res.veiTipo) || "—"),      // tipo de veículo (formatted value de cr40f_tipodeveiculo)
    _veiId: String(r[F.res.veiculo] || "").toLowerCase(),   // _cr40f_veiculo_value
    _veiNome: String(fv(r, F.res.veiculo) || "—"),
    _valor: valor,
    _cpPendente: cpPendente,
    _cpConcluida: entry?.concluida ?? false,
    _opId: F.res.lookupOP ? (r[F.res.lookupOP] || "").toLowerCase() : "",   // _cr40f_financeiro_value
    _ts: r[F.res.data] ? new Date(r[F.res.data]).getTime() : 0,
  };
});
DB.reservas = DB.reservas.concat(legacy2026Rows.map(buildLegacy2026Reservation));
```
- `_valor` vem de `new_valortotal` da CP associada pelo lookup `_new_composicaodepreco_value`. Sem CP, `_valor` fica 0.
- `_mot` usa o apelido (`funcMapGlobal`, montado de `new_apelido` com fallback para o nome) e cai em "Sem motorista" quando não há motorista.
- `_motKey` é o GUID do funcionário. Sem GUID, vira `nome:<apelido minúsculo>`.
- As reservas do Dataverse entre 2026-01-01 e 2026-03-31 são **descartadas**. No lugar delas entram cerca de 1.978 linhas legadas embutidas em `legacy2026Rows` (L7205–9184).
- `enrichReservas` **não** filtra por `new_categoriadoitem`. Esse filtro só acontece em `renderAll` (item 2).

**Formatted value e mapa de apelidos, L10350 e L11727–11736**
```js
const fv = (r, f) =>
  r[`${f}@OData.Community.Display.V1.FormattedValue`] ?? r[f];

function buildFuncMap() {
  funcMapGlobal.clear();
  for (const f of DB.funcionarios) {
    const nome = f[F.fun.nome] || "";
    const apelido = f[F.fun.apelido] || nome;
    const id = f["cr40f_funcionariosid"];
    if (id) funcMapGlobal.set(id.toLowerCase(), apelido);
    funcMapGlobal.set(nome.toLowerCase(), apelido);
  }
}
```

**Linhas legadas de 2026, L11749–11796**
```js
function buildLegacy2026Reservation(row, index) {
  const [data, status, motorista, carro, sourceId, cliente, tipo, veiculoTipo, valor] = row;
  const normalizedStatus = normL(status);
  const statusDisplay = normalizedStatus === "concluido"
    ? "Concluído"
    : normalizedStatus.indexOf("cancelado") === 0 ? "Cancelado" : status;
  const motDisplay = motorista && motorista !== "-" ? motorista : "Sem motorista";
  const cliDisplay = cliente && cliente !== "-" ? cliente : "Sem cliente";
  const vehicleDisplay = carro && carro !== "." && carro !== "-" ? carro : "—";
  const vehicleKey = vehicleDisplay === "—" ? "" : `legacy:${normL(vehicleDisplay)}`;
  const id = `legacy-2026-${String(index + 1).padStart(4, "0")}`;
  return {
    [F.res.id]: id, [F.res.data]: data, /* ... formatted values ... */
    [F.res.fatStatus]: "Histórico CSV",
    [F.res.catItem]: DV_CAT_ITEM_SERVICO,
    _id: id, _legacy2026: true, _legacySourceId: sourceId, _legacySourceStatus: status,
    _motId: "", _motKey: `nome:${normL(motDisplay)}`, _mot: motDisplay, _cli: cliDisplay,
    _stL: statusDisplay || "Sem status", _fatStL: "Histórico CSV",
    _tipoL: tipo || "—", _veiL: veiculoTipo || "—",
    _veiId: vehicleKey, _veiNome: vehicleDisplay,
    _valor: valor, _cpPendente: false, _cpConcluida: false, _opId: "",
    _ts: new Date(data).getTime(),
  };
}
```
As linhas legadas sempre têm categoria "serviço" e `_valor` vindo do CSV. Como `_cpConcluida` é false e `_opId` é vazio, elas entram no faturamento mas não no ticket médio nem no "a receber".

**Tipo de veículo próprio × terceirizado, L14175–14180** (só em `renderExecutiveSummary`)
```js
const vehicleKind = new Map((DB.veiculos || []).map((vehicle) => {
  const raw = String(vehicle[F.vei.cat] || "");
  const label = normL(fv(vehicle, F.vei.cat) || "");
  const kind = raw === "100000000" || label.includes("proprio") ? "Propria" : raw === "100000001" || label.includes("terceiro") ? "Terceirizada" : "";
  return [String(vehicle[F.vei.id] || "").toLowerCase(), kind];
}));
```
`new_categoriadoveiculo` igual a 100000000 ou rótulo com "proprio" vira Própria. 100000001 ou rótulo com "terceiro" vira Terceirizada.

---

## 2. Filtro de `rv` (`applyF`, `quickFilter`)

**`applyF`, L12088–12119**
```js
function applyF(keepMultiselectOpen) {
  if (!keepMultiselectOpen) closeMultiselects();
  const dS = document.getElementById("fS").value;
  const dE = document.getElementById("fE").value;
  let d = [...DB.reservas];
  const startDate = dS ? new Date(`${dS}T00:00:00-03:00`) : null;
  const endExclusive = dE ? periodEndExclusive(dE) : null;
  if (startDate)
    d = d.filter((r) => r[F.res.data] && new Date(r[F.res.data]) >= startDate);
  if (endExclusive)
    d = d.filter((r) => r[F.res.data] && new Date(r[F.res.data]) < endExclusive);
  if (msState.St.length > 0) d = d.filter((r) => msState.St.includes(r._stL));
  if (msState.Cl.length > 0) d = d.filter((r) => msState.Cl.includes(r._cli));
  if (msState.Mo.length > 0) d = d.filter((r) => msState.Mo.includes(r._motKey || r._mot));
  if (msState.Tp.length > 0) d = d.filter((r) => msState.Tp.includes(r._veiL));
  VW.reservas = d;
  tblCache = {};
  renderAll();
  updateFilterSummary();
}
```
**L10414–10415**
```js
const periodEndExclusive = (dateStr) =>
  new Date(new Date(`${dateStr}T00:00:00-03:00`).getTime() + 86400000);
```
O período é medido em horário de Brasília (-03:00). O início é inclusivo a partir de 00:00. O fim também é inclusivo, implementado como `< (fim 00:00 -03:00 + 24h)`. Os multiselects de status, cliente, motorista e tipo combinam com AND. Dentro de um mesmo multiselect os valores combinam com OR, e um multiselect vazio não filtra nada. Motorista compara por `_motKey`; tipo de veículo compara por `_veiL`.

**`rv` em `renderAll`, L13327–13334** (filtro por categoria do item)
```js
const rv = dvDisabled
  ? []
  : VW.reservas.filter((r) => Number(r[F.res.catItem]) === DV_CAT_ITEM_SERVICO);
const fat = sumV(rv);
const byM = grp(rv, (r) => mK(r[F.res.data]));
const mks = mKeys(byM);
const mls = mks.map(mL);
const byCli = grp(rv, (r) => r._cli);
```
`rv` contém só itens com `new_categoriadoitem === 100000000` (Serviço). `isDataverseDisabled()` sempre retorna false (L10882).

**Mês em horário de Brasília e comparação por dia, L10323–10335 e L10442–10446**
```js
function businessDateKey(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "";
}
function mK(v) { const day = businessDateKey(v); return day ? day.slice(0, 7) : null; }
const inDateRange = (dateValue, startStr, endStr) => {
  if (!dateValue || !startStr || !endStr) return false;
  const day = businessDateKey(dateValue);
  return day >= startStr && day <= endStr;
};
```
O agrupamento mensal e as comparações de período usam o dia em UTC-3, com início e fim inclusivos.

**Funções auxiliares de filtro e período, L12336–12341 e L10397–10441**
```js
function passesActiveFilters(r) {
  return (msState.St.length === 0 || msState.St.includes(r._stL)) &&
         (msState.Cl.length === 0 || msState.Cl.includes(r._cli)) &&
         (msState.Mo.length === 0 || msState.Mo.includes(r._motKey || r._mot)) &&
         (msState.Tp.length === 0 || msState.Tp.includes(r._veiL));
}
const normL = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const parseBRDate = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const clampDate = (year, month, day) => new Date(year, month, Math.min(day, daysInMonth(year, month)));
```

**`quickFilter`, L12150–12201**
```js
function quickFilter(period, btnEl) {
  /* ... toggle .btn-qf active ... */
  const now = new Date();
  const nowBR = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = nowBR.getUTCFullYear(), m = nowBR.getUTCMonth();
  let sDate = "", eDate = nowBR.toISOString().split("T")[0];
  switch (period) {
    case "hoje":    sDate = eDate; break;
    case "ult7":    { const d = new Date(nowBR); d.setUTCDate(d.getUTCDate() - 6);  sDate = d.toISOString().split("T")[0]; } break;
    case "ult30":   { const d = new Date(nowBR); d.setUTCDate(d.getUTCDate() - 29); sDate = d.toISOString().split("T")[0]; } break;
    case "esteMes": sDate = `${y}-${String(m + 1).padStart(2, "0")}-01`; break;
    case "mesAnt":  { const s = new Date(Date.UTC(y, m - 1, 1)), e = new Date(Date.UTC(y, m, 0));
                      sDate = s.toISOString().split("T")[0]; eDate = e.toISOString().split("T")[0]; } break;
    case "esteAno": sDate = `${y}-01-01`; break;
    case "anoAnt":  sDate = `${y - 1}-01-01`; eDate = `${y - 1}-12-31`; break;
  }
  document.getElementById("fS").value = sDate;
  document.getElementById("fE").value = eDate;
  applyF();
}
```
Por padrão o fim é "hoje" em UTC-3. Os intervalos são:
- Últ. 7 dias e Últ. 30 dias: hoje −6 e hoje −29, ambos até hoje.
- Este mês: dia 1 até hoje.
- Este ano: 1º de janeiro até hoje.
- Mês anterior e Ano anterior: períodos fechados.

O rótulo de cada botão aparece em L5790–5813: Hoje, Últ. 7 dias, Últ. 30 dias, Este mês, Mês anterior, Este ano, Ano anterior.

---

## 3. LM/LY, `getTicketStatsForPeriod`, `fmtKpiChip`

**Períodos comparativos, L10419–10456**
```js
const samePeriodLastMonth = (startStr, endStr) => {
  const s = parseBRDate(startStr); const e = parseBRDate(endStr);
  if (!s || !e) return null;
  if (s.getDate() === 1 && e.getDate() === daysInMonth(e.getFullYear(), e.getMonth())) {
    const ps = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    const pe = new Date(e.getFullYear(), e.getMonth(), 0);
    return { start: ymd(ps), end: ymd(pe) };
  }
  return {
    start: ymd(clampDate(s.getFullYear(), s.getMonth() - 1, s.getDate())),
    end: ymd(clampDate(e.getFullYear(), e.getMonth() - 1, e.getDate())),
  };
};
const samePeriodLastYear = (startStr, endStr) => {
  const s = parseBRDate(startStr); const e = parseBRDate(endStr);
  if (!s || !e) return null;
  return {
    start: ymd(clampDate(s.getFullYear() - 1, s.getMonth(), s.getDate())),
    end: ymd(clampDate(e.getFullYear() - 1, e.getMonth(), e.getDate())),
  };
};
const shouldShowLM = (startStr, endStr) => {
  const s = parseBRDate(startStr); const e = parseBRDate(endStr); const today = new Date();
  return !!s && !!e &&
    s.getFullYear() === today.getFullYear() && e.getFullYear() === today.getFullYear() &&
    s.getMonth() === today.getMonth() && e.getMonth() === today.getMonth();
};
```
Se o período cobre meses inteiros, LM pega o(s) mês(es) cheio(s) anterior(es). Caso contrário, LM desloca as datas um mês para trás e LY um ano para trás, limitando o dia ao fim do mês. LM só aparece quando o filtro inteiro está dentro do mês corrente.

**Uso em `renderAll`, L13440–13450 e L13507–13511**
```js
const activeStart = start || `${currentYear}-01-01`;
const activeEnd = end || `${currentYear}-12-31`;
const showLM = shouldShowLM(start, end);
const lmPeriod = samePeriodLastMonth(activeStart, activeEnd);
const lyPeriod = samePeriodLastYear(activeStart, activeEnd);
const showLY = Boolean(lyPeriod);
const lmData = lmPeriod ? getPeriodValueAndCount(lmPeriod.start, lmPeriod.end) : { value: 0, count: null, hasData: false };
const lmValue = lmData.hasData ? lmData.value : 0;
const lmSrvCount = lmData.count !== null ? lmData.count : 0;
const producedPeriodData = getPeriodValueAndCount(activeStart, activeEnd);
const producedPeriodValue = producedPeriodData.value;
/* ... */
const lyData = lyPeriod ? getPeriodValueAndCount(lyPeriod.start, lyPeriod.end) : { value: 0, count: null, hasData: false };
const lyValue = lyData.hasData ? lyData.value : 0;
const lySrvCount = lyData.count;
```
Sem filtro de data, o período ativo é o ano corrente inteiro. Por isso LY sempre aparece e LM só aparece quando o filtro está dentro do mês atual.

**`getPeriodValueAndCount`, L12343–12364**
```js
function getPeriodValueAndCount(startStr, endStr) {
  if (!startStr || !endStr) return { value: 0, count: null, hasData: false };
  const reservas = DB.reservas.filter((r) =>
    Number(r[F.res.catItem]) === DV_CAT_ITEM_SERVICO &&
    inDateRange(r[F.res.data], startStr, endStr) && passesActiveFilters(r)
  );
  const value = sumV(reservas);
  const hasSegmentFilter = msState.St.length || msState.Cl.length || msState.Mo.length || msState.Tp.length;
  if (value === 0 && !hasSegmentFilter) {
    const yearDataMap = {
      2023: typeof fat2023 !== "undefined" ? fat2023 : [],
      2024: typeof fat2024 !== "undefined" ? fat2024 : [],
      2025: typeof fat2025 !== "undefined" ? fat2025 : [],
    };
    const hardcodedValue = Object.entries(yearDataMap).reduce(
      (total, [year, values]) => total + getTotalForPeriod(values, Number(year), startStr, endStr), 0);
    if (hardcodedValue > 0) {
      return { value: hardcodedValue, count: null, hasData: hardcodedValue > 0 };
    }
  }
  return { value, count: reservas.length, hasData: value > 0 || reservas.length > 0 };
}
```
A função soma os serviços de `DB.reservas` (e não de `VW`) que caem no intervalo e passam nos multiselects. Se o resultado é 0 e não há filtro de segmento, usa os arrays fixos com rateio por dia. Nesse caso `count` volta `null`, e o chip de serviços mostra "s/dado".

**`getTicketStatsForPeriod`, L12366–12373**
```js
function getTicketStatsForPeriod(startStr, endStr) {
  if (!startStr || !endStr) return getTicketStats([]);
  return getTicketStats(
    DB.reservas.filter((r) =>
      inDateRange(r[F.res.data], startStr, endStr) && passesActiveFilters(r),
    ),
  );
}
```
Não filtra por categoria do item. Na prática o ticket só considera linhas com CP concluída e `_valor > 0`.

**Chips, L13514–13529**
```js
const fmtKpiChip = (cur, prev, label, cls) => {
  if (!prev) return "";
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  return `<span class="badge-kpi ${cls}"><span class="bk-label">${label}</span><span class="bk-val">${brlS(prev)}</span><span class="bk-pct ${up ? "du" : "dd"}">${up ? "▲" : "▼"}${Math.abs(pct).toFixed(1)}%</span></span>`;
};
const fmtCntChip = (cur, prev, label, cls) => { /* igual, com bk-val = prev.toLocaleString("pt-BR") */ };
const ndChip = (label, cls) =>
  `<span class="badge-kpi ${cls}" style="opacity:.45;"><span class="bk-label">${label}</span><span class="bk-val">—</span><span class="bk-pct" style="letter-spacing:.5px;">s/dado</span></span>`;
```
O chip mostra o valor anterior e a variação percentual `(cur − prev)/prev` com ▲ ou ▼. Se `prev` é 0, o chip não aparece.

**Uso nos KPIs, L13543–13564**
```js
set("kSrv", dvDisabled ? "—" : rv.length.toLocaleString("pt-BR"));
html("kSrvD", dvDisabled ? "" :
  (showLM ? (lmSrvCount ? fmtCntChip(rv.length, lmSrvCount, "LM", "badge-lm") : ndChip("LM", "badge-lm")) : "") +
  (showLY ? (lySrvCount ? fmtCntChip(rv.length, lySrvCount, "LY", "badge-ly") : ndChip("LY", "badge-ly")) : ""));
set("kFat", dvDisabled ? "—" : brlS(faturamentoProduzido));
html("kFatD", dvDisabled ? "" :
  (showLM ? fmtKpiChip(faturamentoProduzido, lmValue, "LM", "badge-lm") : "") +
  (showLY ? fmtKpiChip(faturamentoProduzido, lyValue, "LY", "badge-ly") : ""));
/* ... */
set("kTk", dvDisabled ? "—" : brl(curTk));
html("kTkD", dvDisabled ? "" :
  (showLM ? (lmTkVal ? fmtKpiChip(curTk, lmTkVal, "LM", "badge-lm") : ndChip("LM", "badge-lm")) : "") +
  (showLY ? (lyTkVal ? fmtKpiChip(curTk, lyTkVal, "LY", "badge-ly") : ndChip("LY", "badge-ly")) : ""));
```

**Formatação, L10295–10307**
```js
const brl = (v) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlS = (v) => {
  if (v == null) return "—";
  if (v >= 1e6) return "R$\u00a0" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return "R$\u00a0" + (v / 1e3).toFixed(1) + "k";
  return brl(v);
};
```

---

## 4. `faturamentoProduzido`, `fat`, arrays fixos e `yearDataMap`

**Arrays fixos, L7184–7201** (índice 0 = janeiro)
```js
const fat2023 = [
  148127.05, 218779.86, 344114.51, 280122.75, 363727.08, 298182.52,
  282676.23, 434144.06, 314675.09, 365644.26, 366559.39, 281865.47,
];
const fat2024 = [
  213816.57, 301775.6, 431967.33, 375306.13, 368946.6, 351496.37,
  296388.78, 476702.85, 401841.79, 553994.72, 413078.59, 330595.71,
];
const fat2025 = [
  336469.65, 454025.84, 519102.26, 490267.63, 627708.67, 458813.7,
  450734.61, 426814.08, 419071.97, 434559.4, 421781.78, 438377.83,
];
// Fonte: "Serviços prestados 2026(DASHBOARD).csv". O arquivo contém
// totais mensais consolidados, sem as linhas individuais dos serviços.
const fat2026 = [
  276277.52, 444129.04, 500666.92, 0, 0, 0,
  0, 0, 0, 0, 0, 0,
];
```
`fat2026` só é usado pela meta (`getHistoricalFat`). Ele **não** entra no `yearDataMap`.

**`fat`, `yearDataMap` e `faturamentoProduzido`, L13330, L13433–13462**
```js
const fat = sumV(rv);
/* ... */
const yearDataMap = {
  2023: typeof fat2023 !== "undefined" ? fat2023 : [],
  2024: typeof fat2024 !== "undefined" ? fat2024 : [],
  2025: typeof fat2025 !== "undefined" ? fat2025 : [],
};
/* ... */
const hardcodedFaturamentoTotal = Object.keys(yearDataMap).reduce(
  (total, year) => total + (yearDataMap[year] || []).reduce((sum, value) => sum + (value || 0), 0), 0);
const faturamentoProduzido = start || end
  ? producedPeriodValue
  : fat + hardcodedFaturamentoTotal;
```
`sumV` soma os `_valor` (L10354: `const sumV = (a) => a.reduce((s, r) => s + (r._valor || 0), 0);`).
- Com filtro de data, `faturamentoProduzido` vem de `getPeriodValueAndCount(activeStart, activeEnd)`: soma do Dataverse, com fallback para os arrays fixos quando dá zero.
- Sem filtro, é a soma de todo o `rv` mais todo o histórico fixo de 2023 a 2025.

**Rateio diário dos arrays fixos, L12295–12314**
```js
function getTotalForPeriod(yearArray, year, startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return yearArray.reduce((sum, val) => sum + (val || 0), 0);
  const start = parseBRDate(startDateStr); const end = parseBRDate(endDateStr);
  if (!start || !end || start > end) return 0;
  let total = 0;
  for (let month = 0; month < 12; month++) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const rangeStart = start > monthStart ? start : monthStart;
    const rangeEnd = end < monthEnd ? end : monthEnd;
    const usedDays = Math.max(0, Math.floor((rangeEnd - rangeStart) / 86400000) + 1);
    if (usedDays > 0) total += ((yearArray[month] || 0) / daysInMonth(year, month)) * usedDays;
  }
  return total;
}
```
Cada mês fixo é proporcional aos dias do período que caem nele.

---

## 5. Previsão (forecast), L13425–13505 e L13551–13560

```js
const now = new Date();
const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
const currentYear = brNow.getUTCFullYear();
const currentMonth = brNow.getUTCMonth();
/* ... */
const forecastMonthStart = new Date(currentYear, currentMonth, 1);
const forecastMonthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
const forecastYearStart = new Date(currentYear, 0, 1);
const forecastYearEnd = new Date(currentYear, 11, 31, 23, 59, 59);
const todayStart = new Date(currentYear, currentMonth, brNow.getUTCDate());
const todayEnd = new Date(currentYear, currentMonth, brNow.getUTCDate(), 23, 59, 59, 999);
const selectedStart = start ? new Date(`${start}T00:00:00-03:00`) : forecastMonthStart;
const selectedEnd = end ? new Date(`${end}T23:59:59-03:00`) : forecastMonthEnd;
const forecastAnnual = selectedStart.getTime() === forecastYearStart.getTime() && selectedEnd >= todayEnd;
const forecastState = selectedStart > todayEnd
  ? "future"
  : selectedEnd < todayStart
    ? "closed"
    : "open";
const forecastRows = forecastState === "open"
  ? rv.filter((r) => {
      const serviceDate = r[F.res.data] ? new Date(r[F.res.data]) : null;
      return serviceDate && serviceDate >= selectedStart && serviceDate <= todayEnd && serviceDate <= selectedEnd && passesActiveFilters(r);
    })
  : [];
const forecastRunStart = forecastAnnual
  ? forecastYearStart
  : selectedStart > forecastMonthStart ? selectedStart : forecastMonthStart;
const forecastRunRows = forecastState === "open"
  ? rv.filter((r) => {
      const serviceDate = r[F.res.data] ? new Date(r[F.res.data]) : null;
      return serviceDate && serviceDate >= forecastRunStart && serviceDate <= todayEnd && serviceDate <= selectedEnd && passesActiveFilters(r);
    })
  : [];
const forecastActual = sumV(forecastRows);
const forecastRunValue = sumV(forecastRunRows);
const forecastElapsedDays = Math.max(1, Math.floor((todayStart - new Date(forecastRunStart.getFullYear(), forecastRunStart.getMonth(), forecastRunStart.getDate())) / 86400000) + 1);
const forecastTargetDays = forecastAnnual
  ? Math.round((forecastYearEnd - forecastYearStart) / 86400000) + 1
  : daysInMonth(currentYear, currentMonth);
const forecastRemainingDays = forecastAnnual
  ? Math.max(0, forecastTargetDays - forecastElapsedDays)
  : Math.max(0, forecastTargetDays - brNow.getUTCDate());
const forecastValue = forecastRunValue > 0
  ? forecastActual + (forecastRunValue / forecastElapsedDays) * forecastRemainingDays
  : 0;
/* KPI */
set("kForecastLabel", forecastAnnual ? "Previsão anual:" : "Previsão até fim do mês:");
set("kForecast", dvDisabled ? "—"
  : forecastState === "closed" ? "período encerrado"
  : forecastState === "future" ? "sem base futura"
  : !forecastRunValue ? "sem base realizada"
  : brlS(forecastValue));
```
A previsão soma o realizado do período até hoje (`forecastActual`) com a média diária da janela de corrida vezes os dias restantes. A janela de corrida começa no mês atual ou no início do filtro; no modo anual (filtro começando em 1º de janeiro e terminando hoje ou depois), começa em 1º de janeiro. O estado é:
- "future": o período começa depois de hoje.
- "closed": o período termina antes de hoje.
- "open": nos demais casos.

---

## 6. Ticket, recebimento, CP pendente, serviços futuros e a receber

**`getTicketStats`, L10470–10481**
```js
const isTicketEligibleReservation = (r) =>
  r?._cpConcluida === true && (parseFloat(r?._valor) || 0) > 0;
const getTicketStats = (rows) => {
  const eligible = rows.filter(isTicketEligibleReservation);
  const value = sumV(eligible);
  return { rows: eligible, value, count: eligible.length, ticket: eligible.length ? value / eligible.length : 0 };
};
```
Ticket médio = soma de `_valor` dividida pela quantidade, considerando só reservas com CP concluída e valor positivo. Em `renderAll`, `curTk = getTicketStats(rv).ticket` (L13531–13532).

**`getRecebimentoStats`, L10488–10501**
```js
const getRecebimentoStats = (rows) => {
  const recebido = rows
    .filter((r) => r[F.res.fatStatus] === DV_STATUS_FAT_PAGO && r._valor > 0)
    .reduce((s, r) => s + r._valor, 0);
  const base = rows
    .filter((r) =>
      r[F.res.fatStatus] !== DV_STATUS_FAT_PAGANTE_EM_VIAGEM &&
      r[F.res.fatStatus] !== DV_STATUS_FAT_MENSAL &&
      r._valor > 0)
    .reduce((s, r) => s + r._valor, 0);
  return { recebido, base, percentual: base ? (recebido / base) * 100 : 0 };
};
```
- `recebido` soma os valores com `cr40f_statusdefaturamento` igual a Pago (202410010).
- `base` soma todos os valores positivos, exceto "Pagante em viagem" (202410006) e "Mensal" (202410008).
- O KPI mostra `kRecebPct` como `percentual.toFixed(0)%` e o subtítulo "<recebido> recebido de <base>" (L13583–13603).

**`getSemValorRows` (CP pendente), L13385–13402**
```js
const isConc = isProducedReservation;
const conclServices = rv.filter(isConc);
const emViagemRows = rv.filter(isTravelReservation);
const getSemValorRows = (rows) => {
  const seen = new Set();
  return rows.filter((r) => {
    const precoId = String(r[F.res.lookupPreco] || "").toLowerCase();
    if (!precoId || seen.has(precoId)) return false;
    const match =
      r._cpPendente === true &&
      isConc(r) &&
      normL(r._fatStL).includes("pend") &&
      normL(fv(r, F.res.catItem)).includes("servico");
    if (match) seen.add(precoId);
    return match;
  });
};
const semValor = getSemValorRows(rv);
```
**L10457–10464**
```js
const isProducedReservation = (r) => {
  const k = normL(r?._stL);
  return k.includes("conclu") || k.includes("realiz") || k.includes("finaliz");
};
const isTravelReservation = (r) => {
  const k = normL(r?._stL);
  return k.includes("viagem") || k.includes("transit") || k.includes("execu");
};
```
Uma reserva conta como CP pendente quando:
- tem CP associada com status pendente;
- o serviço já foi produzido (status com "conclu", "realiz" ou "finaliz");
- o status de faturamento formatado contém "pend";
- a categoria formatada contém "servico".

Cada id de CP é contado uma vez (deduplicação por `_new_composicaodepreco_value`).

**`futureServices`, L13403–13410 e `isReservableService`, L10667–10670**
```js
const futureServices = rv.filter((r) => {
  const serviceDate = r[F.res.data] ? new Date(r[F.res.data]).getTime() : NaN;
  return Number.isFinite(serviceDate) &&
    serviceDate > Date.now() &&
    normL(fv(r, F.res.catItem)).includes("servico") &&
    isReservableService(r) &&
    !isProducedReservation(r);
});
function isReservableService(row) {
  const k = normL(row?._stL);
  return !k.includes("cancel") && !k.includes("recus");
}
```

**Chips do KPI CP pendente, L13580–13589**
```js
set("kSemVal", dvDisabled ? "—" : semValor.length);
const projecao = dvDisabled ? 0 : curTk * semValor.length;
const futuroValor = dvDisabled ? 0 : futureServices.length * curTk;
/* ... */
html("kSemValD", dvDisabled ? "" :
  `<span class="badge-kpi badge-meta${semValor.length > 0 ? " below" : ""}"><span class="bk-label">PROJ</span><span class="bk-val">${brlS(projecao)}</span></span>` +
  `<span class="badge-kpi badge-meta"><span class="bk-label">FUTURO</span><span class="bk-val">${futureServices.length}</span><span class="bk-pct">${brlS(futuroValor)}</span></span>`);
```
PROJ é o ticket atual vezes a quantidade de CPs pendentes. FUTURO é a quantidade de serviços futuros vezes o ticket atual.

**`aReceber`, L13590–13597**
```js
const aReceber = dvDisabled ? 0 :
  rv
    .filter(r => r._cpConcluida === true && r._opId && r[F.res.fatStatus] !== DV_STATUS_FAT_PAGO && r._valor > 0)
    .reduce((s, r) => s + r._valor, 0);
set("kPPend", dvDisabled ? "—" : brlS(aReceber));
const aReceberPct = fat > 0 ? (aReceber / fat * 100).toFixed(0) : 0;
html("kPPendD", dvDisabled ? "" :
  `<span class="badge-kpi badge-ly"><span class="bk-label">%FAT</span><span class="bk-val">${aReceberPct}%</span><span class="bk-pct">pendente</span></span>`);
```
A receber soma `_valor` das reservas com CP concluída, ordem de pagamento vinculada (`_cr40f_financeiro_value`), status de faturamento diferente de Pago e valor positivo. O chip mostra esse total como percentual de `fat`.

---

## 7. Sparklines, L13626–13656

```js
const trendKeys = mks.length > 0
  ? mks.slice(-8)
  : monthsLabelsAll.map((_, i) => `${currentYear}-${String(i + 1).padStart(2, "0")}`).slice(-8);
const trendLabels = trendKeys.map((k) => {
  const parts = k.split("-");
  return monthsLabelsAll[(parseInt(parts[1], 10) || 1) - 1] || k;
});
const trendFat = trendKeys.map((k) => byM[k] ? sumV(byM[k]) : (yearDataMap[currentYear]?.[parseInt(k.split("-")[1], 10) - 1] || 0));
const trendSrv = trendKeys.map((k) => (byM[k] || []).length);
const trendTk = trendKeys.map((k) => getTicketStats(byM[k] || []).ticket);
const trendReceber = trendKeys.map((k) => {
  const rows = (byM[k] || []).filter(r => r._cpConcluida === true && r._opId);
  return rows.filter((r) => r[F.res.fatStatus] !== DV_STATUS_FAT_PAGO && r._valor > 0).reduce((s, r) => s + r._valor, 0);
});
const trendRecebPct = trendKeys.map((k) => getRecebimentoStats(byM[k] || []).percentual);
const trendSemValor = trendKeys.map((k) => getSemValorRows(byM[k] || []).length);
mkSpark("spFat", trendLabels, trendFat, "#2159d2");
mkSpark("spSrv", trendLabels, trendSrv, "#2159d2");
mkSpark("spTk", trendLabels, trendTk, "#6b4b9b");
mkSpark("spReceber", trendLabels, trendReceber, "#168f57");
mkSpark("spSemValor", trendLabels, trendSemValor, "#9a4e12");
mkSpark("spRecebPct", trendLabels, trendRecebPct, "#168f57");
```
As sparklines usam os **últimos 8 meses** de `rv` que têm dados (`mks` em ordem crescente, chave `YYYY-MM` em UTC-3). Sem dados, usam mai–dez do ano corrente. O rótulo é só o mês abreviado (jan…dez, de `getDashboardMonthLabels`, L12403). O fallback do faturamento por `yearDataMap[currentYear]` nunca dispara para 2026, porque 2026 não está no mapa.

---

## 8. Manutenções, multas, ocorrências, CNH e frota ativa

**Filtro por data, L13337–13356**
```js
const start = document.getElementById("fS").value;
const end = document.getElementById("fE").value;
const filterByDate = (records, dateField) => {
  if (!start && !end) return records;
  const startDate = start ? new Date(`${start}T00:00:00-03:00`) : null;
  const endExclusive = end ? periodEndExclusive(end) : null;
  return records.filter(r => {
    const rDate = r[dateField];
    if (!rDate) return false; // Com filtro de data, registro sem data fica fora
    if (/^\d{4}-\d{2}-\d{2}$/.test(rDate)) {
      return (!start || rDate >= start) && (!end || rDate <= end);
    }
    const date = new Date(rDate);
    return (!startDate || date >= startDate) && (!endExclusive || date < endExclusive);
  });
};
VW.manutencoes = filterByDate(DB.manutencoes, F.man.data);   // cr40f_datamanutencao
VW.multas = filterByDate(DB.multas, F.mul.data);             // cr40f_dataehorario
VW.trocas = filterByDate(DB.trocas, F.trc.data);
VW.despesas = filterByDate(DB.despesas, F.despesa.data);
```
Manutenções, multas e trocas só são filtradas por período, nunca por cliente, motorista, status ou tipo. Datas no formato `YYYY-MM-DD` são comparadas como string; datetimes, em UTC-3 com fim inclusivo.

**Ocorrências, L13415–13423**
```js
const ocorrenciasOperacionais = dvDisabled ? [] : filterByDate(DB.errosOperacionais, F.erroOperacional.data);  // cr40f_dataocorrencia
const ocorrenciasPct = rv.length ? (ocorrenciasOperacionais.length / rv.length * 100) : 0;
const ocorrenciasFrequencia = ocorrenciasOperacionais.length && rv.length
  ? Math.round(rv.length / ocorrenciasOperacionais.length)
  : null;
```

**`isMultaPendente`, L10403–10406**
```js
const DV_STATUS_MUL_NOTIFICAR = 202410000;
const DV_CAT_ITEM_SERVICO = 100000000;
const isMultaPendente = (r) =>
  Number(r?.[F.mul.status]) === DV_STATUS_MUL_NOTIFICAR;
```
**L13565–13579**
```js
set("kMan", dvDisabled ? "—" : VW.manutencoes.length);
const custoTotal = dvDisabled ? 0 : VW.manutencoes.reduce((s, r) => s + (parseFloat(r[F.man.valor]) || 0), 0);
const cfPctRec = fat > 0 ? (custoTotal / fat * 100).toFixed(1) : 0;
/* kManD chip CUSTO ... */
set("kMul", dvDisabled ? "—" : VW.multas.length);
const mulPen2 = VW.multas.filter(isMultaPendente);
const mulPenPct = VW.multas.length ? (mulPen2.length / VW.multas.length * 100).toFixed(0) : 0;
```
Uma multa é pendente quando `cr40f_status` é 202410000 ("notificar"). `kMan`, `kMul`, `kCnhW` e `kFrotaAtiva` estão dentro de `<template id="legacy-resumo-kpis">` (L5935–6066), então não aparecem na tela. Os valores calculados aqui alimentam os alertas e o card de custo de frota.

**`cnhWarn`, L13604–13614**
```js
const cnhWarn = DB.funcionarios.filter((r) => isActiveFuncionario(r) && (() => {
  const cnhDate = r[F.fun.cnh] ? new Date(r[F.fun.cnh]).getTime() : NaN;
  if (!Number.isFinite(cnhDate)) return false;
  return (cnhDate - Date.now()) / (1000 * 60 * 60 * 24) <= 90;
})());
set("kCnhW", dvDisabled ? "—" : cnhWarn.length);
html("kCnhWD", dvDisabled ? "" : cnhWarn.length ? `<span class="dd">${cnhWarn.length} atenção</span>` : `<span class="du">OK</span>`);
// L10352
const isActiveFuncionario = (r) => stL(String(fv(r, F.fun.status) || "")) === "ativo";
```
O alerta conta funcionários ativos com CNH vencida ou vencendo em até 90 dias. Não depende do filtro de período.

**Frota ativa, L13615–13623**
```js
const veiAtivos = DB.veiculos.filter(
  (r) =>
    stL(String(fv(r, F.vei.status) || "")).includes("dispon") ||
    stL(String(fv(r, F.vei.status) || "")).includes("ativo"),
).length;
set("kFrotaAtiva", dvDisabled ? "—" : veiAtivos);
html("kFrotaAtivaD", dvDisabled ? "" : `Total: ${DB.veiculos.length}`);
```
Frota ativa conta veículos cujo status formatado contém "dispon" ou "ativo". O texto secundário é "Total: N", com o total de veículos.

---

## 9. Alertas (`setExecAlert`, `dq*`, ocorrências)

**`setExecAlert`, L12536–12541**
```js
function setExecAlert(id, value, label, status, tone) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `exec-alert ${tone || ""}`.trim();
  el.innerHTML = `<div><strong>${value}</strong><span>${label}</span></div><b>${status}</b>`;
}
```
Os tons usados são `ok`, `warn` e `danger`.

**Alertas de operação, L13658–13660**
```js
setExecAlert("alertCnh", cnhWarn.length, "CNH", cnhWarn.length ? "Atencao" : "OK", cnhWarn.length ? "danger" : "ok");
setExecAlert("alertMultas", mulPen2.length, "Multas", `${mulPenPct}% pend./indic.`, mulPen2.length ? "danger" : "ok");
setExecAlert("alertOcorrencias", dvDisabled ? "—" : ocorrenciasOperacionais.length, "Ocorrências", rv.length && ocorrenciasOperacionais.length ? `${ocorrenciasPct.toFixed(1)}% dos serviços · 1 a cada ${ocorrenciasFrequencia}` : "s/dado", ocorrenciasOperacionais.length ? "danger" : "ok");
```
O alerta `alertDriverScore` é preenchido em `renderDriverSafetyScore`, L15763:
```js
setExecAlert("alertDriverScore", dvDisabled || averageScore === null ? "—" : averageScore, "Score motoristas", dvDisabled ? "—" : `${validRows.length} notas válidas`, averageScore === null ? "warn" : averageScore >= 80 ? "ok" : averageScore >= 60 ? "warn" : "danger");
```
`alertSemValor` existe só no layout injetado (L12451). Nenhum `setExecAlert` o atualiza, e no HTML atual da página ele não aparece.

**Qualidade dos dados, L13661–13687**
```js
const afterOperationalStart = (r) => String(r[F.res.data] || "").slice(0, 10) >= "2026-04-01";
const inicioSemVeiculo = new Date("2026-06-01T00:00:00-03:00").getTime();
const dqSemVeiculo = rv.filter((r) => {
  const saida = r[F.res.data] ? new Date(r[F.res.data]).getTime() : NaN;
  return !stL(r._stL).includes("cancel") && Boolean(r._motId) && !r[F.res.veiculo] && Number.isFinite(saida) && saida >= inicioSemVeiculo && saida <= Date.now();
}).length;
const dqSemTipoVeiculo = rv.filter((r) => !r[F.res.veiTipo]).length;
const statusSemMotorista = new Set([202410001, 202410005, 202410008]);
const inicioSemMotorista = new Date("2026-04-10T00:00:00-03:00").getTime();
const agoraSemMotorista = Date.now();
const dqSemMotorista = rv.filter((r) => {
  const saida = r[F.res.data] ? new Date(r[F.res.data]).getTime() : NaN;
  return (
    !r._motId &&
    Number.isFinite(saida) &&
    saida >= inicioSemMotorista &&
    saida <= agoraSemMotorista &&
    statusSemMotorista.has(Number(r[F.res.status])) &&
    Number(r[F.res.catItem]) === DV_CAT_ITEM_SERVICO
  );
}).length;
const dqSemCliente = rv.filter((r) => afterOperationalStart(r) && r._cli === "Sem cliente").length;
const qualityShare = (count) => rv.length ? `${(count / rv.length * 100).toFixed(1)}% dos serviços` : "s/dado";
setExecAlert("dqSemVeiculo", dqSemVeiculo, "Sem veículo", qualityShare(dqSemVeiculo), dqSemVeiculo ? "warn" : "ok");
setExecAlert("dqSemTipoVeiculo", dqSemTipoVeiculo, "Sem tipo de veículo", qualityShare(dqSemTipoVeiculo), dqSemTipoVeiculo ? "warn" : "ok");
setExecAlert("dqSemMotorista", dqSemMotorista, "Sem motorista", qualityShare(dqSemMotorista), dqSemMotorista ? "warn" : "ok");
setExecAlert("dqSemCliente", dqSemCliente, "Sem cliente", qualityShare(dqSemCliente), dqSemCliente ? "warn" : "ok");
```
- **Sem veículo:** reserva não cancelada, com motorista, sem `_cr40f_veiculo_value` e com saída entre 01/06/2026 e agora.
- **Sem tipo de veículo:** `cr40f_tipodeveiculo` vazio, sem restrição de data.
- **Sem motorista:** sem motorista, saída entre 10/04/2026 e agora, `cr40f_status` em {202410001, 202410005, 202410008} e categoria Serviço.
- **Sem cliente:** saída a partir de 2026-04-01 (string, sem fuso) e `_cli` igual a "Sem cliente".
- Em todos, o texto secundário é a porcentagem sobre `rv.length`.

---

## 10. `renderExecutiveSummary` completo, L14174–14241

```js
function renderExecutiveSummary(dvDisabled, rows) {
  const vehicleKind = new Map((DB.veiculos || []).map((vehicle) => {
    const raw = String(vehicle[F.vei.cat] || "");
    const label = normL(fv(vehicle, F.vei.cat) || "");
    const kind = raw === "100000000" || label.includes("proprio") ? "Propria" : raw === "100000001" || label.includes("terceiro") ? "Terceirizada" : "";
    return [String(vehicle[F.vei.id] || "").toLowerCase(), kind];
  }));
  const classified = rows.map((row) => ({ row, kind: vehicleKind.get(String(row._veiId || "").toLowerCase()) || "" })).filter((item) => item.kind);
  const byKind = ["Propria", "Terceirizada"].map((kind) => {
    const items = classified.filter((item) => item.kind === kind).map((item) => item.row);
    return { kind, qtd: items.length, fat: sumV(items) };
  });
  set("metaMakeBuy", dvDisabled ? "—" : `${classified.length} servicos com veiculo classificado`);
  const makeBuyMonths = [...new Set(classified.map(({ row }) => String(row[F.res.data] || "").slice(0, 7)).filter(Boolean))].sort();
  const makeBuyMonthData = (kind) => makeBuyMonths.map((month) => classified.filter(({ row, kind: rowKind }) => rowKind === kind && String(row[F.res.data] || "").slice(0, 7) === month).length);
  mkChart("cMakeBuy", {
    type: "line",
    data: {
      labels: makeBuyMonths.map(monthTableLabel),
      datasets: [
        { label: "Própria", data: dvDisabled ? [] : makeBuyMonthData("Propria"), borderColor: "#2159d2", backgroundColor: "rgba(33, 89, 210, .12)", tension: .25, fill: true, pointRadius: 3 },
        { label: "Terceirizada", data: dvDisabled ? [] : makeBuyMonthData("Terceirizada"), borderColor: "#9a4e12", backgroundColor: "rgba(154, 78, 18, .10)", tension: .25, fill: true, pointRadius: 3 },
      ],
    },
    options: opts0({ datalabels: false }),
  });
  const ranking = (kind, target) => {
    const grouped = new Map();
    classified.filter((item) => item.kind === kind && item.row._mot && item.row._mot !== "Sem motorista").forEach((item) => {
      const key = item.row._motKey || item.row._mot;
      const current = grouped.get(key) || { nome: item.row._mot, qtd: 0, fat: 0 };
      current.qtd += 1;
      current.fat += item.row._valor || 0;
      grouped.set(key, current);
    });
    const rowsTop = [...grouped.values()].sort((a, b) => b.fat - a.fat || b.qtd - a.qtd).slice(0, 5);
    html(target, `<table><thead><tr><th>Motorista</th><th class="r">Servicos</th><th class="r">Faturamento</th></tr></thead><tbody>${dvDisabled ? emptyRow(3) : rowsTop.map((item) => `<tr><td class="em">${escapeDashboardText(item.nome)}</td><td class="r">${item.qtd.toLocaleString("pt-BR")}</td><td class="r">${brl(item.fat)}</td></tr>`).join("") || emptyRow(3)}</tbody></table>`);
  };
  ranking("Propria", "tblTopOwnDrivers");
  ranking("Terceirizada", "tblTopThirdDrivers");
  const emergency = rows.filter((row) => String(row.createdon || "").slice(0, 10) === String(row[F.res.data] || "").slice(0, 10));
  const byMonth = grp(emergency, (row) => String(row[F.res.data] || "").slice(0, 7));
  const emergencyMonthKeys = Object.keys(byMonth).sort();
  const emergencyByClient = grp(emergency, (row) => row._cli || "Sem cliente");
  const emergencyTopClients = Object.keys(emergencyByClient)
    .map((client) => ({ client, qtd: emergencyByClient[client].length }))
    .sort((a, b) => b.qtd - a.qtd || a.client.localeCompare(b.client, "pt-BR"))
    .slice(0, 3);
  html("emergencyTopCards", dvDisabled ? "" : emergencyTopClients.map((item, index) => `<div class="emergency-top-card"><div class="rank">${index + 1}º</div><div class="name" title="${escapeDashboardText(item.client)}">${escapeDashboardText(item.client)}</div><div class="stats">${emergency.length ? (item.qtd / emergency.length * 100).toFixed(1) : "0,0"}% · ${item.qtd.toLocaleString("pt-BR")}</div></div>`).join(""));
  const emergencyRankedMonths = emergencyMonthKeys.map((month) => {
    const byClient = grp(byMonth[month], (row) => row._cli || "Sem cliente");
    const ranking = Object.keys(byClient)
      .map((client) => ({ client, qtd: byClient[client].length }))
      .sort((a, b) => b.qtd - a.qtd || a.client.localeCompare(b.client, "pt-BR"))
      .slice(0, 5);
    return { month, ranking };
  });
  const emergencyRankHeaders = Array.from({ length: 5 }, (_, index) => `${index + 1}º cliente`);
  set("metaEmergencyExecutive", dvDisabled ? "—" : `${emergency.length} de ${rows.length} servicos · ${rows.length ? ((emergency.length / rows.length) * 100).toFixed(1) : "0,0"}%`);
  const emergencyRankBody = emergencyRankedMonths.map((item) => {
    const cells = Array.from({ length: 5 }, (_, index) => {
      const ranked = item.ranking[index];
      return ranked ? `<td class="em">${escapeDashboardText(ranked.client)}</td><td class="r">${ranked.qtd.toLocaleString("pt-BR")}</td>` : `<td class="dim">—</td><td class="r dim">—</td>`;
    }).join("");
    return `<tr><td>${monthTableLabel(item.month)}</td>${cells}</tr>`;
  }).join("");
  html("tblEmergencyExecutive", `<table><thead><tr><th>Mês</th>${emergencyRankHeaders.map((header) => `<th>${header}</th><th class="r">Qtd.</th>`).join("")}</tr></thead><tbody>${dvDisabled ? emptyRow(11) : emergencyRankBody || emptyRow(11)}</tbody></table>`);
}
```
A função recebe `rows = rv` (chamada em L14152).
- **Produção própria × terceirizada:** cada reserva é classificada pelo veículo (`_veiId` → categoria do veículo). O gráfico de linha conta quantidades por mês; o mês vem de `slice(0,7)` sobre a string bruta UTC, sem ajuste de fuso.
- **Rankings Top 5 por tipo de veículo:** agrupam por `_motKey`, excluem "Sem motorista" e ordenam por faturamento e depois por quantidade.
- **Emergencial:** é o serviço cujo `createdon` cai no mesmo dia (`slice(0,10)` UTC) que a saída. Os cards mostram o top 3 de clientes no período; a tabela mostra o top 5 de clientes por mês.
- `byKind` é calculado mas não é usado.

`monthTableLabel` (L10344) gera rótulos no formato "jan/26".

---

## 11. Análises do Resumo

**Total produzido: chips e gráfico `cTotalProd`, L13689–13811**
```js
const year1 = currentYear;      // Ano atual
const year2 = currentYear - 1;  // Último ano completo
const year3 = currentYear - 2;  // Ano anterior ao último
const dataYear1 = year1 >= 2026 && dvDisabled === false
  ? getMonthlyDataFromDataverse(year1, start, end)
  : getFilteredMonthlyData(yearDataMap[year1] || [], year1, start, end);
const dataYear2 = year2 >= 2026 && dvDisabled === false
  ? getMonthlyDataFromDataverse(year2, start, end)
  : getFilteredMonthlyData(yearDataMap[year2] || [], year2, start, end);
const dataYear3 = /* idem com year3 */;
const validIndices = [];
for (let i = 0; i < 12; i++)
  if (dataYear3[i] !== null || dataYear2[i] !== null || dataYear1[i] !== null) validIndices.push(i);
const displayLabels = validIndices.length > 0 ? validIndices.map((i) => monthsLabels[i]) : monthsLabels;  // "Jan".."Dez"
/* seriesYearN = validIndices.map(i => dataYearN[i]) */
mkChart("cTotalProd", { type: "line", data: { labels: displayLabels, datasets: [
  { label: String(year3), data: seriesYear3, borderColor: "#b17a00", /* dash [4,3] */ },
  { label: String(year2), data: seriesYear2, borderColor: "#2159d2" },
  { label: String(year1), data: seriesYear1, borderColor: "#168f57" },
]}, options: { ...opts0({ noLegend: false, yBrl: true, datalabels: false }), maintainAspectRatio: false } });

const meta = getMetaParaPeriodoProporcional(start, end);
const accumulated = dvDisabled ? 0 : faturamentoProduzido;
const metaProgress = meta ? (accumulated / meta) * 100 : 0;
const lyDelta = lyValue ? ((accumulated - lyValue) / lyValue) * 100 : 0;
const lmDelta = lmValue ? ((accumulated - lmValue) / lmValue) * 100 : 0;
const mkChip = (label, value, delta, cls) => { if (!value) return ""; /* badge brlS(value) ▲/▼ delta */ };
const metaAchieved = metaProgress >= 100;
const metaChip = meta > 0 ? `<span class="badge-kpi badge-meta${metaAchieved ? "" : " below"}"><span class="bk-label">META</span><span class="bk-val">${brlS(meta)}</span><span class="bk-pct" style="font-weight:800;">${metaProgress.toFixed(0)}%${metaAchieved ? " ✓" : ""}</span></span>` : "";
document.getElementById("v_totalProd").textContent = dvDisabled ? "—" : brlS(accumulated);
document.getElementById("indicatorsLM_LY_META").innerHTML =
  (showLM ? mkChip("LM", lmValue, lmDelta, "badge-lm") : "") +
  (showLY ? mkChip("LY", lyValue, lyDelta, "badge-ly") : "") + metaChip;
document.getElementById("metaProgressWrap").innerHTML = "";
```
- O gráfico mostra o ano atual e os dois anteriores; em 2026, são 2024, 2025 e 2026.
- Anos a partir de 2026 vêm do Dataverse; anos anteriores vêm dos arrays fixos, rateados pelo período.
- `v_totalProd` é igual a `faturamentoProduzido`.
- A meta é proporcional aos dias do filtro. Sem filtro, a meta é 0 e o chip não aparece.
- `metaProgressWrap` fica sempre vazio.

**Série mensal dos anos, L12276–12331**
```js
function getFilteredMonthlyData(yearArray, year, startDateStr, endDateStr) {
  const result = [];
  const hasSegmentFilter = msState.St.length || msState.Cl.length || msState.Mo.length || msState.Tp.length;
  for (let month = 0; month < 12; month++) {
    const monthStart = `${year}-${pad2(month + 1)}-01`;
    const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
    const rangeStart = startDateStr && startDateStr > monthStart ? startDateStr : monthStart;
    const rangeEnd = endDateStr && endDateStr < monthEnd ? endDateStr : monthEnd;
    result.push(!hasSegmentFilter && rangeStart <= rangeEnd ? getTotalForPeriod(yearArray, year, rangeStart, rangeEnd) : null);
  }
  return result;
}
function getMonthlyDataFromDataverse(year, startDateStr, endDateStr) {
  const result = [];
  for (let month = 0; month < 12; month++) {
    /* mesmo recorte rangeStart/rangeEnd */
    if (rangeStart > rangeEnd) { result.push(null); continue; }
    result.push(getPeriodValueAndCount(rangeStart, rangeEnd).value || null);
  }
  return result;
}
```

**Meta, L12206–12220 e L12254–12274**
```js
function getHistoricalFat(ano, mes) {
  if (ano === 2023 && typeof fat2023 !== "undefined") return fat2023[mes] || 0;
  if (ano === 2024 && typeof fat2024 !== "undefined") return fat2024[mes] || 0;
  if (ano === 2025 && typeof fat2025 !== "undefined") return fat2025[mes] || 0;
  if (ano === 2026 && typeof fat2026 !== "undefined") return fat2026[mes] || 0;
  return 0;
}
function calcularMetaMensal(ano, mes) {
  // Meta = 50% ano anterior + 40% 2 anos atrás + 10% 3 anos atrás, +13%
  const v1 = getHistoricalFat(ano - 1, mes);
  const v2 = getHistoricalFat(ano - 2, mes);
  const v3 = getHistoricalFat(ano - 3, mes);
  const base = v1 * 0.5 + v2 * 0.4 + v3 * 0.1;
  return Math.round(base * 1.13);
}
function getMetaParaPeriodoProporcional(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = parseBRDate(startStr); const end = parseBRDate(endStr);
  if (!start || !end || start > end) return 0;
  let meta = 0;
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonthRef = new Date(end.getFullYear(), end.getMonth(), 1);
  while (current <= endMonthRef) {
    const year = current.getFullYear(); const month = current.getMonth();
    const monthStart = new Date(year, month, 1); const monthEnd = new Date(year, month + 1, 0);
    const rangeStart = start > monthStart ? start : monthStart;
    const rangeEnd = end < monthEnd ? end : monthEnd;
    const usedDays = Math.max(0, Math.floor((rangeEnd - rangeStart) / 86400000) + 1);
    meta += (calcularMetaMensal(year, month) / daysInMonth(year, month)) * usedDays;
    current.setMonth(current.getMonth() + 1);
  }
  return Math.round(meta);
}
```
Meta mensal = (50% de N−1 + 40% de N−2 + 10% de N−3) × 1,13, usando os históricos fixos 2023–2026.

**Meta × realizado (`v_totalMvr`, `mvrSummary`), L13850–13878**
```js
const allMks = mks.length > 0 ? mks : monthsLabelsAll.map((_, i) => `${currentYear}-${String(i + 1).padStart(2, "0")}`);
const mvrLabels = allMks.map(monthTableLabel);
const mvrReal = allMks.map(k => mks.length > 0 ? sumV(byM[k] || []) : (yearDataMap[currentYear]?.[parseInt(k.split("-")[1]) - 1] || 0));
const mvrMeta = allMks.map(k => { const [y, m] = k.split("-"); return calcularMetaMensal(parseInt(y), parseInt(m) - 1); });
const totalMvrMeta = mvrMeta.reduce((a, b) => a + b, 0);
const totalMvrReal = mvrReal.reduce((a, b) => a + b, 0);
const pctGlobal = totalMvrMeta > 0 ? (totalMvrReal / totalMvrMeta * 100) : 0;
const mvrAchieved = pctGlobal >= 100;
set("sub_mvr", `${allMks.length} meses · ${pctGlobal.toFixed(1)}% da meta`);
set("v_totalMvr", dvDisabled ? "—" : brlS(totalMvrReal));
const mvrRows = mvrLabels.map((label, i) => {
  const pct = mvrMeta[i] > 0 ? (mvrReal[i] / mvrMeta[i] * 100) : 0;
  const color = pct >= 100 ? "var(--green)" : pct >= 75 ? "var(--blue)" : "var(--orange)";
  return /* <tr> Mês | Meta brl | Realizado brl | barra pct.toFixed(1)% */;
}).join("");
html("mvrSummary", `<table><thead><tr><th>Mês</th><th class="r">Meta</th><th class="r">Realizado</th><th>Atingimento</th></tr></thead><tbody>${mvrRows}</tbody></table>`);
document.getElementById("ind_mvr").innerHTML =
  (totalMvrMeta > 0 ? /* chip META brlS(totalMvrMeta) pctGlobal% ✓ */ : "") +
  (showLY ? fmtKpiChip(totalMvrReal, lyValue, "LY", "badge-ly") : "");
```
A tabela tem uma linha por mês de `rv`, com a meta mensal cheia (não proporcional). As cores da barra são:
- verde: 100% ou mais;
- azul: 75% ou mais;
- laranja: abaixo de 75%.

**Faturamento por cliente (`tblFatCliResumo`), L13881–13922**
```js
const allMks2 = mks.length > 0 ? mks : monthsLabelsAll.map((_, i) => `${currentYear}-${String(i + 1).padStart(2, "0")}`);
const fcLabels = allMks2.map(monthTableLabel);
const cliEntries = Object.entries(byCli)
  .filter(([k]) => k !== "__null__" && k !== "Sem cliente")
  .sort((a, b) => sumV(b[1]) - sumV(a[1]))
  .slice(0, 6);
if (cliEntries.length > 0) {
  const top1Fat = sumV(cliEntries[0][1]);
  const top1Pct = fat > 0 ? (top1Fat / fat * 100).toFixed(1) : 0;
  set("v_fatCliTop", brlS(top1Fat));
  set("sub_fatcli", trunc(cliEntries[0][0], 26));
  /* ind_fatcli: chips 1° e 2° com brlS e % de fat */
}
const fatCliDelta = (current, previous) => {
  if (previous === null || previous === 0) {
    return `<span class="metric-secondary" style="color:${previous === 0 && current > 0 ? "var(--green)" : "var(--yellow)"}">${previous === 0 && current > 0 ? "Novo" : "—"}</span>`;
  }
  const pct = ((current - previous) / previous) * 100;
  const color = pct > 0 ? "var(--green)" : pct < 0 ? "var(--red)" : "var(--yellow)";
  return `<span class="metric-secondary" style="color:${color}">${pct > 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
};
const fatCliBody = cliEntries.map(([cliName, recs], i) => {
  const byMCli = grp(recs, r => mK(r[F.res.data]));
  const clientTotal = sumV(recs);
  const clientPct = fat > 0 ? (clientTotal / fat) * 100 : 0;
  const monthCells = allMks2.map((monthKey, monthIndex) => {
    const current = sumV(byMCli[monthKey] || []);
    const previousKey = allMks2[monthIndex - 1];
    const previous = previousKey ? sumV(byMCli[previousKey] || []) : null;
    return `<td class="r">${metricSplit(brlS(current), fatCliDelta(current, previous), "r")}</td>`;
  }).join("");
  return `<tr><td class="em">${trunc(cliName, 28)}</td>${monthCells}<td class="r em">${brlS(clientTotal)}</td><td>${progressCell(clientPct, brlS(clientTotal), PAL[i % PAL.length])}</td></tr>`;
}).join("") || emptyRow(fatCliCols);
// colunas: Cliente | <cada mês> | Total | Participação
```
A tabela mostra os 6 maiores clientes por faturamento, excluindo "Sem cliente". Cada célula mensal traz o valor e a variação contra o mês anterior ("Novo" quando o mês anterior foi 0). Essa seção não tem gráfico.

**Ticket médio mensal (`cTicketMedio`), L13817–13847**
```js
const tmLabels = mks.length > 0 ? mks.map(mL).map(label => label.split(" ")[0]) : monthsLabelsAll;
const ticketMedioMensal = (mks.length > 0 ? mks : monthsLabelsAll).map((k) => mks.length > 0 ? getTicketStats(byM[k]).ticket : null);
mkChart("cTicketMedio", { type: "bar", data: { labels: tmLabels, datasets: [{ label: "Ticket Médio", data: ticketMedioMensal, backgroundColor: "#6b4b9b", borderRadius: 5 }] }, options: opts0({ noLegend: true, yBrl: true }) });
set("sub_tm", `${mks.length} meses`);
set("v_tm", brl(curTk));
document.getElementById("ind_tm").innerHTML =
  (showLM ? (lmTkVal ? fmtKpiChip(curTk, lmTkVal, "LM", "badge-lm") : ndChip("LM", "badge-lm")) : "") +
  (showLY ? ndChip("LY", "badge-ly") : "");
```
O gráfico de barras mostra o ticket de cada mês de `rv`. No card, o chip LY é sempre "s/dado".

**Status (`tblStatusResumo`), L13925–13943**
```js
const bySt = grp(rv, (r) => r._stL);
const stKeys = Object.keys(bySt).filter((k) => k !== "__null__").sort((a, b) => bySt[b].length - bySt[a].length);
const cancelados = rv.filter((r) => stL(r._stL).includes("cancel") || stL(r._stL).includes("recus"));   // L13411
const concluPct = rv.length ? (conclServices.length / rv.length * 100).toFixed(1) : 0;
set("v_stTotal", rv.length.toLocaleString("pt-BR"));
set("sub_st", `${conclServices.length} concluídos · ${cancelados.length} cancelados`);
/* ind_st: chip CONC (below se <75%) + chip CAN se houver */
const stRows = topByShare(stKeys, rv.length, (k) => bySt[k].length).map((k) => ({ status: k, qtd: bySt[k].length }));
// tabela: Status (badge) | Participação (progressCell(p, "<qtd> serv."))
```
**`topByShare`, L10872–10877**
```js
function topByShare(rows, total, valueFn, max = 10) {
  const ranked = rows.slice(0, max);
  if (!total || ranked.length <= 3) return ranked;
  const eligible = ranked.filter((row) => (valueFn(row) / total) * 100 > 10);
  return eligible.length >= 3 ? eligible : ranked.slice(0, 3);
}
```
Dos 10 primeiros, ficam os que passam de 10% de participação. Se menos de 3 passarem, ficam os 3 primeiros.

**Custo de frota (`v_cf`, `cCF`), L13946–13979**
```js
const manByM = grp(dvDisabled ? [] : VW.manutencoes, (r) => mK(r[F.man.data]));
const manMks = mKeys(manByM);
const cfLabels = manMks.length > 0 ? manMks.map(mL).map(l => l.split(" ")[0]) : monthsLabelsAll;
const cfData = manMks.length > 0 ? manMks.map((k) => manByM[k].reduce((s, r) => s + (parseFloat(r[F.man.valor]) || 0), 0)) : [];
set("v_cf", brlS(custoTotal));
set("sub_cf", `${VW.manutencoes.length} manutenções · ${cfPctRec}% da receita`);
/* ind_cf: chip "% REC" cfPctRec% com "OK" se <=10 senão "Alto"; chip MAN <qtd> serviços */
mkChart("cCF", { type: "bar", data: { labels: cfLabels, datasets: [{ label: "Custo R$", data: cfData, backgroundColor: "#9a4e12", borderRadius: 5 }] }, options: opts0({ noLegend: true, yBrl: true }) });
```
O custo é a soma de `cr40f_valor` de `VW.manutencoes`, filtradas só por período. O percentual de custo é calculado sobre `fat`.

**Top volume (`tblTopVolResumo`), L13982–13998**
```js
const top10vRanked = Object.entries(byCli).sort((a, b) => b[1].length - a[1].length)
const top10v = topByShare(top10vRanked, rv.length, ([, rows]) => rows.length);
/* v_topVol = top10v[0][1].length; sub_topVol = trunc(nome,26); ind_topVol chips 1°/2° com % de rv.length */
renderDistributionTable("tblTopVolResumo", top10v.map(([label, rows]) => ({ label, qtd: rows.length })), rv.length, { label: "Cliente", countLabel: "Servi\u00e7os" });
```
Esse ranking inclui "Sem cliente".

**Top faturamento (`tblTopFatResumo`), L13999–14018**
```js
const top10fRanked = Object.entries(byCli).sort((a, b) => sumV(b[1]) - sumV(a[1]));
const top10f = topByShare(top10fRanked, fat, ([, rows]) => sumV(rows));
/* v_topFat = brlS(sumV(top10f[0][1])); sub_topFat; ind_topFat chips 1°/2° */
html("tblTopFatResumo", `<table><thead><tr><th>Cliente</th><th class="r">Faturamento</th><th class="r">Ticket medio</th><th>Participacao</th></tr></thead>
  <tbody>${topFatRows.map(([nome, rows], i) => {
    const val = sumV(rows);
    const p = fat ? (val / fat) * 100 : 0;
    return `<tr><td class="em">${trunc(nome, 26)}</td><td class="r em">${brl(val)}</td><td class="r dim">${brl(getTicketStats(rows).ticket)}</td><td>${progressCell(p, brlS(val), PAL[i % PAL.length])}</td></tr>`;
  }).join("") || emptyRow(4)}</tbody></table>`);
```

**Serviços por motorista (`tblMotResumo`), L14021–14093**
```js
const motMap = new Map();
rv.forEach((r) => { if (r._mot !== "Sem motorista") motMap.set(r._motKey || r._mot, r._mot); });
const mots = [...motMap.entries()].map(([key, label]) => ({ key, label }));
const motCount = mots.length > 0 ? mots.length : 0;
set("v_topMot", motCount.toLocaleString("pt-BR"));
set("sub_mm", `${motCount > 0 ? motCount : "—"} motoristas ativos`);
/* ind_mot: chips 1°/2° motorista por total de serviços, % de rv.length */
/* mkChart("cMM", ...) – canvas cMM não existe na página Resumo */
const motMonthKeys = mks.length > 0 ? mks : monthsLabelsAll.map((_, i) => `${currentYear}-${String(i + 1).padStart(2, "0")}`);
const motMonthLabels = motMonthKeys.map(monthTableLabel);
const motMonthTotals = motMonthKeys.map((monthKey) => (byM[monthKey] || []).length);
const motRows = mots.map((m) => {
  const monthly = motMonthKeys.map((monthKey, monthIndex) => {
    const qtd = (byM[monthKey] || []).filter((r) => (r._motKey || r._mot) === m.key).length;
    const pct = motMonthTotals[monthIndex] ? `${(qtd / motMonthTotals[monthIndex] * 100).toFixed(1)}%` : "—";
    return { qtd, pct };
  });
  return { ...m, monthly, total: monthly.reduce((sum, month) => sum + month.qtd, 0) };
}).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
const motTableHead = `<tr><th>Motorista</th>${motMonthLabels.map((label) => `<th>${label}</th>`).join("")}<th>Total</th><th>Participa&ccedil;&atilde;o</th></tr>`;
const motTableBody = motRows.map((row, i) => {
  const monthlyCells = row.monthly.map((month) => `<td>${metricSplit(month.qtd.toLocaleString("pt-BR"), month.pct, "r")}</td>`).join("");
  const totalPct = rv.length ? (row.total / rv.length * 100).toFixed(1) : "0.0";
  return `<tr><td class="em">${trunc(row.label, 28)}</td>${monthlyCells}<td>${metricSplit(row.total.toLocaleString("pt-BR"), `${totalPct}%`, "r")}</td><td>${progressCell(Number(totalPct), `${row.total.toLocaleString("pt-BR")} servi&ccedil;os`, PAL[i % PAL.length])}</td></tr>`;
}).join("") || emptyRow(motMonthKeys.length + 3);
html("tblMotResumo", `<table><thead>${motTableHead}</thead><tbody>${motTableBody}</tbody></table>`);
```
As colunas são: Motorista, uma por mês (quantidade e % do total do mês), Total (quantidade e % de `rv`) e Participação (barra). Todos os motoristas aparecem, sem limite, exceto "Sem motorista".

**Paleta, L12391–12402**
```js
const PAL = ["#2159d2","#2159d2","#6b4b9b","#9a4e12","#168f57","#b17a00","#c12f45","#0b2d5a","#168f57","#6b4b9b"];
```

---

## 12. `$select`/`$expand` dos loaders

Todos usam `fetchAll`, que por padrão envia `Prefer: odata.include-annotations="*"` (L9772) e `odata.maxpagesize=5000`.

**Reservas, L11474–11497**
```js
const sel = [F.res.id, F.res.data, F.res.status, F.res.fatStatus, F.res.tipo, F.res.veiTipo, F.res.veiculo,
  F.res.catItem, F.res.solicitante, F.res.lookupPreco, F.res.lookupOP, F.res.finalizacao, "createdon"].filter(Boolean).join(",");
const exp = [
  `${F.res.navMot}($select=cr40f_funcionariosid,${F.fun.nome},${F.fun.apelido})`,
  `${F.res.navCli}($select=cr40f_nomedocliente)`,
].join(",");
DB.reservas = await fetchAll(`${API()}/${T.reservas}?$select=${sel}&$expand=${exp}&$orderby=${F.res.data} desc`);
```
Valores resolvidos:
- Entidade: `cr40f_reservadeveculoses`.
- `$select`: `cr40f_reservadeveculosid, cr40f_dataehorriodesada, cr40f_status, cr40f_statusdefaturamento, cr40f_tipodoservico, cr40f_tipodeveiculo, _cr40f_veiculo_value, new_categoriadoitem, _cr40f_solicitante_value, _new_composicaodepreco_value, _cr40f_financeiro_value, new_datadefinalizacao, createdon`.
- `$expand`: `cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)`.
- `$orderby`: `cr40f_dataehorriodesada desc`.

**Preços, L11518–11525** (sem annotations)
```js
const sel = [`cr40f_composicaodeprecosid`, F.preco.valorTotal, F.preco.status].join(",");
DB.precos = await fetchAll(`${API()}/${T.precos}?$select=${sel}`, { wantAnnotations: false });
```
Entidade `cr40f_composicaodeprecoses`; `$select` = `cr40f_composicaodeprecosid, new_valortotal, new_status`.

**Manutenções, L11526–11530**
```js
`${API()}/${T.manutencoes}?$select=createdon,${F.man.data},${F.man.aprovacao},${F.man.valor},${F.man.status},${F.man.tipo},_${F.man.veiculo}_value&$orderby=${F.man.data} desc`
```
Entidade `cr40f_manutencoeses`; `$select` = `createdon, cr40f_datamanutencao, cr40f_datadaaprovacao, cr40f_valor, cr40f_status, cr40f_tipodoreparo, _cr40f_placa_carro_value`; ordenação por `cr40f_datamanutencao desc`.

**Multas, L11531–11535**
```js
`${API()}/${T.multas}?$select=${F.mul.data},${F.mul.status},_${F.mul.tipo}_value,_${F.mul.mot}_value,_${F.mul.placa}_value&$expand=cr40f_Codigodainfracao($select=${F.inf.codigo},${F.inf.descricao})&$orderby=${F.mul.data} desc`
```
Entidade `cr40f_multases`.
- `$select`: `cr40f_dataehorario, cr40f_status, _cr40f_codigodainfracao_value, _cr40f_motorista_value, _cr40f_placa_value`.
- `$expand`: `cr40f_Codigodainfracao($select=cr40f_codigodainfracao,cr40f_descricaodainfracao)`.
- Ordenação por `cr40f_dataehorario desc`.

**Erros operacionais, L11513–11517**
```js
`${API()}/${T.errosOperacionais}?$select=${F.erroOperacional.data}&$orderby=${F.erroOperacional.data} desc`
```
Entidade `cr40f_errooperacionals`; `$select` = `cr40f_dataocorrencia`.

**Funcionários, L11562–11566**
```js
`${API()}/${T.funcionarios}?$select=cr40f_funcionariosid,${F.fun.nome},${F.fun.status},${F.fun.funcao},${F.fun.cnh},${F.fun.apelido},${F.fun.empresa}`
```
Entidade `cr40f_funcionarioses`; `$select` = `cr40f_funcionariosid, cr40f_nomecompleto, cr40f_status, cr40f_funcao, cr40f_validadedacnh, new_apelido, cr40f_nomedaempresa`.

**Veículos, L11557–11561**
```js
`${API()}/${T.veiculos}?$select=${F.vei.id},${F.vei.placa},${F.vei.marca},${F.vei.modelo},${F.vei.status},${F.vei.blindado},${F.vei.ano},${F.vei.cat}`
```
Entidade `cr40f_veiculoses`; `$select` = `cr40f_veiculosid, cr40f_placa, cr40f_marca, cr40f_modelo, cr40f_statusdoveiculo, cr40f_blindado, cr40f_anodefabricacao, new_categoriadoveiculo`.

**Dependências da aba Resumo, L11367–11368**
```js
resumo: ["reservas", "precos", "clientes", "funcionarios", "veiculos", "passageiros", "servicosPassageiro", "manutencoes", "pagantes", "multas", "infracoes", "trocas", "errosOperacionais", "marketing"],
```
Depois de carregar, a ordem é: `buildFuncMap()` → `buildInfracaoMap()` → `enrichReservas()` → `populateFilters()` → `applyF(true)` (L11717–11721).

---

## 13. Constantes de status e códigos

**L10206–10208, L10403–10404**
```js
const DV_STATUS_FAT_PAGO = 202410010;
const DV_STATUS_FAT_PAGANTE_EM_VIAGEM = 202410006;
const DV_STATUS_FAT_MENSAL = 202410008;
const DV_STATUS_MUL_NOTIFICAR = 202410000;
const DV_CAT_ITEM_SERVICO = 100000000;
```
Outros códigos literais usados nesses cálculos:
- CP (`new_status` da composição): `100000000` pendente, `100000001` concluída (L11805–11806).
- Categoria do veículo (`new_categoriadoveiculo`): `"100000000"` Própria, `"100000001"` Terceirizada (L14178).
- `cr40f_status` da reserva no alerta "sem motorista": `new Set([202410001, 202410005, 202410008])` (L13668).
- Pagante recebido (`cr40f_status` do pagante): `202410002`, ou rótulo "pago"/"paga" (L10465–10469, usado em `pagReceb`).
- Datas de corte fixas:
  - `"2026-04-01"`: sem cliente.
  - `"2026-04-10T00:00:00-03:00"`: sem motorista.
  - `"2026-06-01T00:00:00-03:00"`: sem veículo.
  - Reservas do Dataverse de 2026-01-01 a 2026-03-31 são substituídas pelo CSV legado.