# Dashboard (base + aba Resumo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rota `#/dashboard` no shell React com filtros globais, carga do Dataverse por janela de datas com atualização real e a aba Resumo com os mesmos números do legado `new_dashboard`.

**Architecture:** Domínio puro em `apps/shell/src/pages/dashboard/domain/` (porta literal das fórmulas do `Dashboard.html`), `data/` com Source Dataverse/mock, histórico fixo e CSV de jan–mar/2026, hook `useDashboard` com refresh de 60 s e componentes do Design System + Recharts. Mesmo molde de `pages/pagantes`.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 3 + Testing Library, `@betinhos/ui`, `@betinhos/dataverse`, `recharts` 3, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-10-08-dashboard-resumo-design.md` e a referência literal `docs/superpowers/specs/2026-10-08-dashboard-resumo-legado.md` (trechos do legado com linha). Em dúvida sobre uma fórmula, a referência literal vence.

## Global Constraints

- Paridade: mesmas fórmulas e mesmos números do legado; classificação por texto onde o legado usa texto (`normL` sem acento + minúsculo, `stL` só minúsculo), exatamente como na referência.
- Nenhuma escrita no Dataverse. Consultas a PROD proibidas; metadata só em DEV e só leitura.
- Período sempre definido (`inicio`/`fim` em `AAAA-MM-DD`, horário de Brasília UTC-3, fim inclusivo).
- Janela de carga das reservas: de 1º/jan de `min(ano(inicio) − 1, anoAtualBR − 2)` até `fim` inclusivo.
- Reservas do Dataverse com `saidaRaw.slice(0,10)` entre `2026-01-01` e `2026-03-31` são trocadas pelas linhas do CSV legado.
- Conjuntos secundários (manutenções, multas, ocorrências, funcionários, veículos) carregam inteiros, como no legado, e o período filtra no cliente; falha de um deles vira `s/dado` só nos cards dele.
- Atualização automática a cada 60 000 ms refaz a consulta, só com `document.visibilityState === 'visible'`.
- CSS só com tokens `--bt-*`; sem gradiente; light-only; `#FCFCFB` (`--bt-color-surface-neutral`) em tabelas e cabeçalhos neutros; sem rolagem horizontal em 320 px; ícones Lucide; textos em pt-BR com acentos.
- Microcopy: datas `dd/MM/yyyy`, moeda `R$ 1.234,56`; decimais com vírgula.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Só commit local; push e `pnpm push` só com ok do Renan.
- Comandos de teste a partir da raiz da worktree: `pnpm --filter @betinhos/shell test -- <arquivo>` e `pnpm --filter @betinhos/shell typecheck`.

## File Structure

```
apps/shell/src/pages/dashboard/
  domain/
    codes.ts          códigos de option set, datas de corte, rótulos fixos
    format.ts         normL, stL, dec, brl, brlS, int
    types.ts          Reserva, Dados, Filtros, Kpi, AlertaItem…
    periodo.ts        dayKey, hojeBR, atalhos, LM/LY, janela de carga, rótulos de mês
    meta.ts           histórico fixo rateado por dia, meta mensal e proporcional
    base.ts           CSV 2026, filtros, soma, agrupamento, opções de filtro
    kpis.ts           ticket, recebimento, CP pendente, futuros, a receber, valor do período, chips, KPIs executivos
    previsao.ts       previsão até fim do mês / anual
    alertas.ts        alertas de operação, qualidade e cards de frota e pessoas
    destaques.ts      produção própria × terceirizada, emergenciais
    analises.ts       total produzido, meta × realizado, clientes, ticket mensal, status, custo, tops, motoristas
    resumo.ts         calcularResumo: compõe tudo
    test-utils.ts     fábrica de Reserva para testes
    *.test.ts
  data/
    historico.ts      FAT_FIXO 2023–2026 (copiado do legado)
    historico2026.ts  CSV_2026 gerado do legado (não editar à mão)
    csv2026.ts        reservasCsv2026(): Reserva[]
    queries.ts        caminhos OData e mapeamento de linhas
    mock.ts           dados de exemplo determinísticos
    source.ts         Source Dataverse/mock
    data.test.ts
  charts/
    tokens.ts         cores lidas dos tokens CSS
    Charts.tsx        Sparkline, LinhaChart, BarraChart (Recharts)
  components/
    DashboardToolbar.tsx, KpiGrid.tsx, KpiChip.tsx, AlertList.tsx, FrotaPessoas.tsx,
    ProducaoPropriaTerceira.tsx, Emergenciais.tsx, AnaliseCard.tsx, Analises.tsx
  useDashboard.ts, useDashboard.test.ts
  DashboardPage.tsx, DashboardPage.test.tsx, dashboard.css
Modificados: apps/shell/package.json (recharts), apps/shell/src/nav/menu.ts (+ menu.test.ts),
apps/shell/src/app/RouteLayout.tsx, apps/shell/src/app/AppShell.tsx (ícone).
```

---

### Task 0: Conferir metadata em DEV e adicionar Recharts

**Files:**
- Modify: `docs/superpowers/specs/2026-10-08-dashboard-resumo-design.md` (nova seção 9)
- Modify: `apps/shell/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: confirmação escrita dos nomes lógicos usados nas Tarefas 6 e seguintes; dependência `recharts` disponível em `apps/shell`.

- [ ] **Step 1: Conferir metadata (somente leitura, DEV)**

Use o MCP `Dataverse_DEV` (`describe`/`read_query`; nunca `Dataverse_PROD`, nunca escrita). Confirme e anote:
- `cr40f_reservadeveculos`: entity set; colunas `cr40f_reservadeveculosid, cr40f_dataehorriodesada, createdon, cr40f_status, cr40f_statusdefaturamento, cr40f_tipodoservico, cr40f_tipodeveiculo, _cr40f_veiculo_value, new_categoriadoitem, _new_composicaodepreco_value, _cr40f_financeiro_value`; navigation properties `cr40f_Motorista` (→ `cr40f_funcionarios`, com `cr40f_funcionariosid, cr40f_nomecompleto, new_apelido`) e `cr40f_Cliente` (→ `cr40f_clientes1`, com `cr40f_nomedocliente`).
- Option sets: `cr40f_statusdefaturamento` contém 202410010 (Pago), 202410006 (Pagante em viagem), 202410008 (Mensal); `cr40f_status` da reserva contém 202410001, 202410005, 202410008; `new_categoriadoitem` contém 100000000 (Serviço); `new_status` da composição contém 100000000/100000001; `cr40f_multas.cr40f_status` contém 202410000; `cr40f_veiculos.new_categoriadoveiculo` contém 100000000/100000001.
- Entity sets e colunas: `cr40f_composicaodeprecos (cr40f_composicaodeprecosid, new_valortotal, new_status)`, `cr40f_manutencoes (cr40f_datamanutencao, cr40f_valor)`, `cr40f_multas (cr40f_dataehorario, cr40f_status)`, `cr40f_errooperacional (cr40f_dataocorrencia)`, `cr40f_funcionarios (cr40f_funcionariosid, cr40f_nomecompleto, cr40f_status, cr40f_validadedacnh)`, `cr40f_veiculos (cr40f_veiculosid, cr40f_statusdoveiculo, new_categoriadoveiculo)`.

Se qualquer item não existir, PARE e reporte (não improvise nome).

- [ ] **Step 2: Registrar na spec**

Acrescente ao fim da spec:

```markdown
## 9. Conferência de metadata (DEV, <data>)

| Item | Resultado |
|---|---|
| ... uma linha por item do Step 1, com entity set e "ok" ou a diferença ... |
```

- [ ] **Step 3: Adicionar Recharts**

Run: `pnpm --filter @betinhos/shell add recharts@^3.2.0`
Expected: `apps/shell/package.json` ganha `"recharts": "^3.x"`; lockfile atualizado só com recharts e dependências dele. Confira `git diff --stat` (só `apps/shell/package.json`, `pnpm-lock.yaml` e a spec).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @betinhos/shell typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-10-08-dashboard-resumo-design.md apps/shell/package.json pnpm-lock.yaml
git commit -m "Dashboard: metadata conferida em DEV e Recharts no shell

Registra na spec os nomes lógicos, navigations e códigos de option set
usados pela aba Resumo, conferidos em DEV só leitura, e adiciona recharts
como dependência do apps/shell para os gráficos do Dashboard.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Códigos, formatação, tipos e período

**Files:**
- Create: `apps/shell/src/pages/dashboard/domain/codes.ts`
- Create: `apps/shell/src/pages/dashboard/domain/format.ts`
- Create: `apps/shell/src/pages/dashboard/domain/types.ts`
- Create: `apps/shell/src/pages/dashboard/domain/periodo.ts`
- Create: `apps/shell/src/pages/dashboard/domain/test-utils.ts`
- Test: `apps/shell/src/pages/dashboard/domain/periodo.test.ts`

**Interfaces:**
- Produces: tudo que está exportado nos arquivos abaixo (nomes e tipos usados por todas as tarefas seguintes).

- [ ] **Step 1: Criar `codes.ts`**

```ts
/** Códigos de option set e datas de corte usados pelo legado (Dashboard.html L10206, L10403, L13661–13687). */
export const CAT_ITEM_SERVICO = 100000000
export const CP_PENDENTE = 100000000
export const CP_CONCLUIDA = 100000001
export const FAT_PAGO = 202410010
export const FAT_PAGANTE_EM_VIAGEM = 202410006
export const FAT_MENSAL = 202410008
export const MULTA_NOTIFICAR = 202410000
/** Confirmado, Programado e Concluído: o alerta "Sem motorista" só olha estes. */
export const STATUS_SEM_MOTORISTA: ReadonlySet<number> = new Set([202410001, 202410005, 202410008])
export const VEICULO_PROPRIO = '100000000'
export const VEICULO_TERCEIRO = '100000001'
/** Datas de corte dos alertas de qualidade, fixadas pela operação no legado. */
export const CORTE_SEM_CLIENTE = '2026-04-01'
export const CORTE_SEM_MOTORISTA = Date.parse('2026-04-10T00:00:00-03:00')
export const CORTE_SEM_VEICULO = Date.parse('2026-06-01T00:00:00-03:00')
/** Trimestre em que o CSV legado substitui o Dataverse. */
export const CSV_2026_INICIO = '2026-01-01'
export const CSV_2026_FIM = '2026-03-31'
export const SEM_MOTORISTA = 'Sem motorista'
export const SEM_CLIENTE = 'Sem cliente'
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const
export const MESES_TITULO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const
```

- [ ] **Step 2: Criar `format.ts`**

```ts
/** Igual ao `normL` do legado: sem acento e minúsculo. */
export const normL = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Igual ao `stL` do legado: só minúsculo (mantém acento). */
export const stL = (s: unknown) => String(s ?? '').toLowerCase()
/** Número com casas fixas e vírgula decimal. */
export const dec = (v: number, casas: number) => v.toFixed(casas).replace('.', ',')
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (v: number | null | undefined) => (v == null ? '—' : BRL.format(v))
/** Moeda curta do legado (`brlS`): R$ 1,23M, R$ 4,5k ou o valor cheio. */
export function brlS(v: number | null | undefined) {
  if (v == null) return '—'
  if (v >= 1e6) return `R$\u00a0${dec(v / 1e6, 2)}M`
  if (v >= 1e3) return `R$\u00a0${dec(v / 1e3, 1)}k`
  return brl(v)
}
export const int = (v: number) => v.toLocaleString('pt-BR')
```

- [ ] **Step 3: Criar `types.ts`**

```ts
/** Reserva já enriquecida (equivale aos campos `_*` do `enrichReservas` do legado). */
export type Reserva = {
  id: string
  /** Valor bruto de `cr40f_dataehorriodesada` ('' sem data). Usado onde o legado faz `slice` sem fuso. */
  saidaRaw: string
  /** Instante da saída em ms; NaN sem data. */
  saidaMs: number
  /** Dia da saída em Brasília, AAAA-MM-DD ('' sem data). */
  dia: string
  /** Mês da saída em Brasília, AAAA-MM ('' sem data). */
  mes: string
  /** Valor bruto de `createdon` ('' no CSV). */
  criadoRaw: string
  status: number | null
  statusLabel: string
  fatStatus: number | null
  fatStatusLabel: string
  categoriaItem: number | null
  categoriaItemLabel: string
  /** Valor cru do tipo de veículo; vazio = alerta "Sem tipo de veículo". */
  tipoVeiculoRaw: string
  /** Rótulo do tipo de veículo ('—' vazio); é o valor do filtro "Tipo de veículo". */
  tipoVeiculo: string
  veiculoId: string
  motoristaId: string
  motoristaKey: string
  motorista: string
  cliente: string
  cpId: string
  valor: number
  cpPendente: boolean
  cpConcluida: boolean
  opId: string
}
export type Manutencao = { dia: string; valor: number }
export type Multa = { dia: string; status: number | null }
export type Ocorrencia = { dia: string }
export type Funcionario = { statusLabel: string; cnhMs: number }
export type CategoriaVeiculo = 'Propria' | 'Terceirizada' | ''
export type Veiculo = { id: string; statusLabel: string; categoria: CategoriaVeiculo }
export type Conjunto = 'manutencoes' | 'multas' | 'ocorrencias' | 'funcionarios' | 'veiculos'
export type Dados = {
  reservas: Reserva[]
  manutencoes: Manutencao[]
  multas: Multa[]
  ocorrencias: Ocorrencia[]
  funcionarios: Funcionario[]
  veiculos: Veiculo[]
  /** Conjuntos secundários que falharam: os cards deles mostram s/dado. */
  indisponiveis: Conjunto[]
}
export type Atalho = 'hoje' | 'ult7' | 'ult30' | 'esteMes' | 'mesAnt' | 'esteAno' | 'anoAnt' | 'personalizado'
export type Filtros = {
  atalho: Atalho
  inicio: string
  fim: string
  status: string[]
  clientes: string[]
  /** Valores são `motoristaKey`. */
  motoristas: string[]
  tipos: string[]
}
export type Chip = { rotulo: string; tipo: 'valor'; anterior: string; variacao: number } | { rotulo: string; tipo: 'sem-dado' }
export type Apoio = { rotulo: string; texto: string; atencao?: boolean }
export type PontoSerie = { mes: string; rotulo: string; valor: number }
export type KpiId = 'faturamento' | 'servicos' | 'ticket' | 'aReceber' | 'cpPendente' | 'recebimento'
export type Kpi = { id: KpiId; rotulo: string; valor: string; chips: Chip[]; apoio: Apoio[]; serie: PontoSerie[] }
export type Tom = 'ok' | 'warn' | 'danger'
export type AlertaItem = { id: string; valor: string; rotulo: string; status: string; tom: Tom }
export type CardSecundario = { id: string; rotulo: string; valor: string; apoio: string; atencao: boolean }
```

- [ ] **Step 4: Criar `test-utils.ts`**

```ts
import { dayKey } from './periodo'
import type { Reserva } from './types'

/** Reserva de teste: serviço concluído de R$ 0 sem motorista, cliente nem veículo; sobrescreva o que importa. */
export function reserva(p: Partial<Reserva> & { saidaRaw?: string } = {}): Reserva {
  const saidaRaw = p.saidaRaw ?? '2026-10-05T15:00:00Z'
  const dia = dayKey(saidaRaw)
  return {
    id: Math.random().toString(36).slice(2), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: '2026-09-01T12:00:00Z', status: 202410008, statusLabel: 'Concluído', fatStatus: null, fatStatusLabel: '—',
    categoriaItem: 100000000, categoriaItemLabel: 'Serviço', tipoVeiculoRaw: '1', tipoVeiculo: 'Executivo', veiculoId: '',
    motoristaId: '', motoristaKey: 'nome:sem motorista', motorista: 'Sem motorista', cliente: 'Sem cliente', cpId: '',
    valor: 0, cpPendente: false, cpConcluida: false, opId: '',
    ...p,
  }
}
```

- [ ] **Step 5: Escrever o teste de `periodo.ts` (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { atalho, cargaDesde, dayKey, diasNoMes, entre, hojeBR, mesRotulo, periodoAnoAnterior, periodoMesAnterior, mostrarLM } from './periodo'

const NOW = new Date('2026-10-15T15:00:00Z') // 12:00 em Brasília

describe('período', () => {
  it('dia e mês em Brasília (UTC-3), data pura passa direto', () => {
    expect(dayKey('2026-10-01T02:00:00Z')).toBe('2026-09-30')
    expect(dayKey('2026-10-01T03:00:00Z')).toBe('2026-10-01')
    expect(dayKey('2026-07-04')).toBe('2026-07-04')
    expect(dayKey('')).toBe('')
    expect(dayKey('lixo')).toBe('')
    expect(hojeBR(new Date('2026-10-16T02:30:00Z'))).toBe('2026-10-15')
  })

  it('entre é inclusivo nas duas pontas e recusa dia vazio', () => {
    expect(entre('2026-10-01', '2026-10-01', '2026-10-31')).toBe(true)
    expect(entre('2026-10-31', '2026-10-01', '2026-10-31')).toBe(true)
    expect(entre('2026-11-01', '2026-10-01', '2026-10-31')).toBe(false)
    expect(entre('', '2026-10-01', '2026-10-31')).toBe(false)
  })

  it('atalhos iguais ao quickFilter do legado', () => {
    expect(atalho('hoje', NOW)).toEqual({ inicio: '2026-10-15', fim: '2026-10-15' })
    expect(atalho('ult7', NOW)).toEqual({ inicio: '2026-10-09', fim: '2026-10-15' })
    expect(atalho('ult30', NOW)).toEqual({ inicio: '2026-09-16', fim: '2026-10-15' })
    expect(atalho('esteMes', NOW)).toEqual({ inicio: '2026-10-01', fim: '2026-10-15' })
    expect(atalho('mesAnt', NOW)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(atalho('esteAno', NOW)).toEqual({ inicio: '2026-01-01', fim: '2026-10-15' })
    expect(atalho('anoAnt', NOW)).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' })
    expect(atalho('mesAnt', new Date('2026-01-10T15:00:00Z'))).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' })
  })

  it('LM: meses cheios voltam um mês cheio; parcial desloca e limita ao fim do mês', () => {
    expect(periodoMesAnterior('2026-10-01', '2026-10-31')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
    expect(periodoMesAnterior('2026-03-01', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(periodoMesAnterior('2026-03-01', '2026-03-30')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(periodoMesAnterior('2026-01-10', '2026-01-15')).toEqual({ inicio: '2025-12-10', fim: '2025-12-15' })
  })

  it('LY desloca um ano e limita 29/02', () => {
    expect(periodoAnoAnterior('2026-01-01', '2026-10-15')).toEqual({ inicio: '2025-01-01', fim: '2025-10-15' })
    expect(periodoAnoAnterior('2028-02-29', '2028-02-29')).toEqual({ inicio: '2027-02-28', fim: '2027-02-28' })
  })

  it('LM só aparece com o filtro inteiro dentro do mês corrente', () => {
    expect(mostrarLM('2026-10-01', '2026-10-15', NOW)).toBe(true)
    expect(mostrarLM('2026-09-30', '2026-10-15', NOW)).toBe(false)
    expect(mostrarLM('2026-01-01', '2026-10-15', NOW)).toBe(false)
  })

  it('janela de carga cobre LY e os três anos do gráfico', () => {
    expect(cargaDesde('2026-01-01', NOW)).toBe('2024-01-01')
    expect(cargaDesde('2023-05-01', NOW)).toBe('2022-01-01')
  })

  it('rótulos e dias no mês', () => {
    expect(mesRotulo('2026-03')).toBe('mar/26')
    expect(diasNoMes(2028, 1)).toBe(29)
    expect(diasNoMes(2026, 1)).toBe(28)
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/periodo.test.ts`
Expected: FAIL (`./periodo` não existe).

- [ ] **Step 7: Implementar `periodo.ts`**

```ts
import { MESES_CURTOS } from './codes'
import type { Atalho } from './types'

export const DIA_MS = 86_400_000
const BRT_MS = 3 * 3_600_000

/** `businessDateKey` do legado: dia em Brasília; data pura passa direto. */
export function dayKey(raw: string | null | undefined): string {
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? new Date(ms - BRT_MS).toISOString().slice(0, 10) : ''
}
export const hojeBR = (now: Date) => new Date(now.getTime() - BRT_MS).toISOString().slice(0, 10)
export const entre = (dia: string, inicio: string, fim: string) => dia !== '' && dia >= inicio && dia <= fim
/** 00:00 do dia em Brasília. */
export const inicioMs = (dia: string) => Date.parse(`${dia}T00:00:00-03:00`)

export type Ymd = { y: number; m: number; d: number }
/** Mês 0-based, como `Date`. */
export function parseDia(s: string): Ymd {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m: m - 1, d }
}
export const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** Monta AAAA-MM-DD normalizando estouro de mês/dia (dia 0 = último do mês anterior). */
export const fmtDia = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
/** `clampDate` do legado: normaliza o mês e limita o dia ao fim dele. */
function clamp(y: number, m: number, d: number) {
  const ref = new Date(Date.UTC(y, m, 1))
  const yy = ref.getUTCFullYear()
  const mm = ref.getUTCMonth()
  return fmtDia(yy, mm, Math.min(d, diasNoMes(yy, mm)))
}

export type Periodo = { inicio: string; fim: string }

/** `quickFilter` do legado; o fim padrão é hoje em Brasília. */
export function atalho(kind: Exclude<Atalho, 'personalizado'>, now: Date): Periodo {
  const hoje = hojeBR(now)
  const { y, m, d } = parseDia(hoje)
  switch (kind) {
    case 'hoje': return { inicio: hoje, fim: hoje }
    case 'ult7': return { inicio: fmtDia(y, m, d - 6), fim: hoje }
    case 'ult30': return { inicio: fmtDia(y, m, d - 29), fim: hoje }
    case 'esteMes': return { inicio: fmtDia(y, m, 1), fim: hoje }
    case 'mesAnt': return { inicio: fmtDia(y, m - 1, 1), fim: fmtDia(y, m, 0) }
    case 'esteAno': return { inicio: `${y}-01-01`, fim: hoje }
    case 'anoAnt': return { inicio: `${y - 1}-01-01`, fim: `${y - 1}-12-31` }
  }
}

/** `samePeriodLastMonth` do legado. */
export function periodoMesAnterior(inicio: string, fim: string): Periodo {
  const s = parseDia(inicio)
  const e = parseDia(fim)
  if (s.d === 1 && e.d === diasNoMes(e.y, e.m)) return { inicio: fmtDia(s.y, s.m - 1, 1), fim: fmtDia(e.y, e.m, 0) }
  return { inicio: clamp(s.y, s.m - 1, s.d), fim: clamp(e.y, e.m - 1, e.d) }
}

/** `samePeriodLastYear` do legado. */
export function periodoAnoAnterior(inicio: string, fim: string): Periodo {
  const s = parseDia(inicio)
  const e = parseDia(fim)
  return { inicio: clamp(s.y - 1, s.m, s.d), fim: clamp(e.y - 1, e.m, e.d) }
}

/** `shouldShowLM` do legado: o filtro inteiro dentro do mês corrente. */
export function mostrarLM(inicio: string, fim: string, now: Date) {
  const h = parseDia(hojeBR(now))
  const s = parseDia(inicio)
  const e = parseDia(fim)
  return s.y === h.y && e.y === h.y && s.m === h.m && e.m === h.m
}

/** Primeiro dia carregado: cobre LY do filtro e os três anos do gráfico de total produzido. */
export function cargaDesde(inicio: string, now: Date) {
  return `${Math.min(parseDia(inicio).y - 1, parseDia(hojeBR(now)).y - 2)}-01-01`
}

/** `monthTableLabel` do legado: "mar/26". */
export function mesRotulo(mes: string) {
  const [y, m] = mes.split('-')
  return `${MESES_CURTOS[Number(m) - 1] ?? m}/${y.slice(2)}`
}

/** Os 12 meses (AAAA-MM) de um ano. */
export const mesesDoAno = (ano: number) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/periodo.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 9: Commit**

```bash
git add apps/shell/src/pages/dashboard/domain
git commit -m "Dashboard: códigos, formatação, tipos e regras de período do legado

Porta para funções puras os códigos de option set, as datas de corte, a
moeda curta (brlS), o dia/mês em Brasília (businessDateKey), os atalhos de
período (quickFilter), os comparativos LM/LY e a janela de carga das
reservas, com testes dos casos-limite (virada de ano, fevereiro, 29/02).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Histórico fixo, CSV de 2026 e meta

**Files:**
- Create: `apps/shell/src/pages/dashboard/data/historico.ts`
- Create (gerado): `apps/shell/src/pages/dashboard/data/historico2026.ts`
- Create: `apps/shell/src/pages/dashboard/data/csv2026.ts`
- Create: `apps/shell/src/pages/dashboard/domain/meta.ts`
- Test: `apps/shell/src/pages/dashboard/domain/meta.test.ts`

**Interfaces:**
- Consumes: `parseDia`, `diasNoMes`, `dayKey`, `DIA_MS` (Task 1); `normL`, códigos (Task 1).
- Produces:
  - `FAT_FIXO: Readonly<Record<number, readonly number[]>>` (2023–2026), `ANOS_MAPA: readonly number[]` (= [2023, 2024, 2025])
  - `CSV_2026: readonly Csv2026Row[]`, `reservasCsv2026(): Reserva[]`
  - `totalFixoNoPeriodo(valores: readonly number[], ano: number, inicio: string, fim: string): number`
  - `fixoNoPeriodo(inicio: string, fim: string): number` (soma 2023–2025)
  - `historicoFat(ano: number, mes: number): number`
  - `metaMensal(ano: number, mes: number): number`
  - `metaProporcional(inicio: string, fim: string): number`

- [ ] **Step 1: Criar `data/historico.ts`** (valores copiados do legado, L7184–7201)

```ts
/** Faturamento mensal consolidado (jan = índice 0), copiado do Dashboard.html legado (L7184–7201). */
export const FAT_FIXO: Readonly<Record<number, readonly number[]>> = {
  2023: [148127.05, 218779.86, 344114.51, 280122.75, 363727.08, 298182.52, 282676.23, 434144.06, 314675.09, 365644.26, 366559.39, 281865.47],
  2024: [213816.57, 301775.6, 431967.33, 375306.13, 368946.6, 351496.37, 296388.78, 476702.85, 401841.79, 553994.72, 413078.59, 330595.71],
  2025: [336469.65, 454025.84, 519102.26, 490267.63, 627708.67, 458813.7, 450734.61, 426814.08, 419071.97, 434559.4, 421781.78, 438377.83],
  // Totais do CSV "Serviços prestados 2026"; só a meta usa este ano.
  2026: [276277.52, 444129.04, 500666.92, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
/** Anos do `yearDataMap` do legado: fallback de faturamento e gráfico de total produzido. 2026 fica de fora. */
export const ANOS_MAPA: readonly number[] = [2023, 2024, 2025]
```

- [ ] **Step 2: Gerar `data/historico2026.ts` a partir do legado**

Run (raiz da worktree, Git Bash):

```bash
node -e "
const fs=require('fs');
const src=fs.readFileSync(process.argv[1],'utf8');
const m=src.match(/const legacy2026Rows = (\[[\s\S]*?\n\s*\]);/);
if(!m) throw new Error('legacy2026Rows não encontrado');
const rows=Function('return '+m[1])();
for(const r of rows){ if(r.length!==9||typeof r[8]!=='number') throw new Error('linha inválida: '+JSON.stringify(r)); }
const out=['// Gerado de Dashboard Betinhos/Dashboard.html (legacy2026Rows), espelho do CSV \"Serviços prestados 2026\". Não editar à mão.','// Campos: data, status, motorista, carro, id original, cliente, tipo de serviço, tipo de veículo, valor.','export type Csv2026Row = readonly [string, string, string, string, string, string, string, string, number]','','export const CSV_2026: readonly Csv2026Row[] = ['];
for(const r of rows) out.push('  '+JSON.stringify(r)+',');
out.push(']','');
fs.writeFileSync(process.argv[2], out.join('\n'));
console.log(rows.length+' linhas');
" "C:/Users/mendo/Desktop/vscode/Dashboard Betinhos/Dashboard.html" apps/shell/src/pages/dashboard/data/historico2026.ts
```

Expected: imprime cerca de `1978 linhas`; o arquivo começa com o comentário e termina com `]`.

- [ ] **Step 3: Criar `data/csv2026.ts`** (porta de `buildLegacy2026Reservation`, L11749–11796)

```ts
import { CAT_ITEM_SERVICO, SEM_CLIENTE, SEM_MOTORISTA } from '../domain/codes'
import { normL } from '../domain/format'
import { dayKey } from '../domain/periodo'
import type { Reserva } from '../domain/types'
import { CSV_2026, type Csv2026Row } from './historico2026'

export function mapCsv2026(row: Csv2026Row, index: number): Reserva {
  const [data, status, motorista, carro, , cliente, , veiculoTipo, valor] = row
  const ns = normL(status)
  const statusLabel = (ns === 'concluido' ? 'Concluído' : ns.indexOf('cancelado') === 0 ? 'Cancelado' : status) || 'Sem status'
  const mot = motorista && motorista !== '-' ? motorista : SEM_MOTORISTA
  const cli = cliente && cliente !== '-' ? cliente : SEM_CLIENTE
  const veiNome = carro && carro !== '.' && carro !== '-' ? carro : '—'
  const dia = dayKey(data)
  return {
    id: `legacy-2026-${String(index + 1).padStart(4, '0')}`,
    saidaRaw: data, saidaMs: Date.parse(data), dia, mes: dia.slice(0, 7), criadoRaw: '',
    status: null, statusLabel, fatStatus: null, fatStatusLabel: 'Histórico CSV',
    categoriaItem: CAT_ITEM_SERVICO, categoriaItemLabel: String(CAT_ITEM_SERVICO),
    tipoVeiculoRaw: veiculoTipo, tipoVeiculo: veiculoTipo || '—',
    veiculoId: veiNome === '—' ? '' : `legacy:${normL(veiNome)}`,
    motoristaId: '', motoristaKey: `nome:${normL(mot)}`, motorista: mot, cliente: cli,
    cpId: '', valor, cpPendente: false, cpConcluida: false, opId: '',
  }
}

let cache: Reserva[] | null = null
/** As linhas do CSV como reservas; o mesmo array é reaproveitado entre cargas. */
export function reservasCsv2026(): Reserva[] {
  return (cache ??= CSV_2026.map(mapCsv2026))
}
```

- [ ] **Step 4: Escrever o teste de `meta.ts` e do CSV (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { fixoNoPeriodo, historicoFat, metaMensal, metaProporcional, totalFixoNoPeriodo } from './meta'
import { FAT_FIXO } from '../data/historico'
import { CSV_2026 } from '../data/historico2026'
import { mapCsv2026 } from '../data/csv2026'

describe('histórico e meta', () => {
  it('rateia o mês fixo pelos dias do período', () => {
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-02-01', '2025-02-14')).toBeCloseTo(454025.84 / 28 * 14, 6)
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-01-01', '2025-12-31')).toBeCloseTo(FAT_FIXO[2025].reduce((a, b) => a + b, 0), 4)
    expect(totalFixoNoPeriodo(FAT_FIXO[2025], 2025, '2025-03-10', '2025-03-01')).toBe(0)
  })

  it('fixoNoPeriodo só usa 2023–2025', () => {
    expect(fixoNoPeriodo('2026-01-01', '2026-03-31')).toBe(0)
    expect(fixoNoPeriodo('2024-12-01', '2025-01-31')).toBeCloseTo(330595.71 + 336469.65, 4)
  })

  it('meta = (50% N−1 + 40% N−2 + 10% N−3) × 1,13 arredondada', () => {
    expect(historicoFat(2026, 0)).toBe(276277.52)
    expect(historicoFat(2022, 0)).toBe(0)
    expect(metaMensal(2026, 0)).toBe(303489)
  })

  it('meta proporcional aos dias, arredondada no fim', () => {
    expect(metaProporcional('2026-01-01', '2026-01-31')).toBe(303489)
    expect(metaProporcional('2026-01-01', '2026-01-15')).toBe(146850)
    expect(metaProporcional('2026-02-01', '2026-01-01')).toBe(0)
  })

  it('CSV de 2026 vira reservas de serviço sem CP nem OP', () => {
    expect(CSV_2026.length).toBeGreaterThan(1900)
    const r = mapCsv2026(['2026-01-02T13:00:00-03:00', 'Concluido', 'Oliveira', '.', '8559', 'Particular', 'Guarulhos', 'Spin', 790], 1)
    expect(r).toMatchObject({ id: 'legacy-2026-0002', dia: '2026-01-02', mes: '2026-01', statusLabel: 'Concluído', fatStatusLabel: 'Histórico CSV', motorista: 'Oliveira', motoristaKey: 'nome:oliveira', cliente: 'Particular', veiculoId: '', tipoVeiculo: 'Spin', valor: 790, cpConcluida: false, opId: '' })
    expect(mapCsv2026(['2026-01-03T07:00:00-03:00', 'Cancelado', '-', '', '', '-', '', '', 0], 0)).toMatchObject({ statusLabel: 'Cancelado', motorista: 'Sem motorista', cliente: 'Sem cliente', tipoVeiculoRaw: '', tipoVeiculo: '—' })
  })
})
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/meta.test.ts`
Expected: FAIL (`./meta` não existe).

- [ ] **Step 6: Implementar `domain/meta.ts`** (L12206–12274 e L12295–12314)

```ts
import { ANOS_MAPA, FAT_FIXO } from '../data/historico'
import { DIA_MS, diasNoMes, parseDia } from './periodo'

const utc = (s: string) => { const { y, m, d } = parseDia(s); return Date.UTC(y, m, d) }

/** `getTotalForPeriod` do legado: cada mês fixo proporcional aos dias do período que caem nele. */
export function totalFixoNoPeriodo(valores: readonly number[], ano: number, inicio: string, fim: string) {
  const s = utc(inicio)
  const e = utc(fim)
  if (s > e) return 0
  let total = 0
  for (let mes = 0; mes < 12; mes++) {
    const a = Math.max(s, Date.UTC(ano, mes, 1))
    const b = Math.min(e, Date.UTC(ano, mes, diasNoMes(ano, mes)))
    const usados = Math.max(0, Math.floor((b - a) / DIA_MS) + 1)
    if (usados > 0) total += ((valores[mes] || 0) / diasNoMes(ano, mes)) * usados
  }
  return total
}

/** Fallback de `getPeriodValueAndCount`: soma rateada de 2023–2025. */
export const fixoNoPeriodo = (inicio: string, fim: string) =>
  ANOS_MAPA.reduce((total, ano) => total + totalFixoNoPeriodo(FAT_FIXO[ano] ?? [], ano, inicio, fim), 0)

/** `getHistoricalFat` do legado (inclui 2026). */
export const historicoFat = (ano: number, mes: number) => FAT_FIXO[ano]?.[mes] || 0

/** `calcularMetaMensal`: (50% N−1 + 40% N−2 + 10% N−3) × 1,13. */
export function metaMensal(ano: number, mes: number) {
  const base = historicoFat(ano - 1, mes) * 0.5 + historicoFat(ano - 2, mes) * 0.4 + historicoFat(ano - 3, mes) * 0.1
  return Math.round(base * 1.13)
}

/** `getMetaParaPeriodoProporcional`: meta mensal rateada pelos dias do período. */
export function metaProporcional(inicio: string, fim: string) {
  const s = utc(inicio)
  const e = utc(fim)
  if (s > e) return 0
  const ini = parseDia(inicio)
  const end = parseDia(fim)
  let meta = 0
  for (let y = ini.y, m = ini.m; y < end.y || (y === end.y && m <= end.m); m === 11 ? (y++, (m = 0)) : m++) {
    const a = Math.max(s, Date.UTC(y, m, 1))
    const b = Math.min(e, Date.UTC(y, m, diasNoMes(y, m)))
    const usados = Math.max(0, Math.floor((b - a) / DIA_MS) + 1)
    meta += (metaMensal(y, m) / diasNoMes(y, m)) * usados
  }
  return Math.round(meta)
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/meta.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/shell/src/pages/dashboard/data apps/shell/src/pages/dashboard/domain/meta.ts apps/shell/src/pages/dashboard/domain/meta.test.ts
git commit -m "Dashboard: histórico fixo, CSV de jan–mar/2026 e meta do legado

Copia os totais mensais fixos de 2023–2026, gera o CSV de 2026
(legacy2026Rows) como dados tipados e porta o rateio por dias, a meta
mensal ponderada (50/40/10 × 1,13) e a meta proporcional ao período.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Base, KPIs executivos e previsão

**Files:**
- Create: `apps/shell/src/pages/dashboard/domain/base.ts`
- Create: `apps/shell/src/pages/dashboard/domain/kpis.ts`
- Create: `apps/shell/src/pages/dashboard/domain/previsao.ts`
- Test: `apps/shell/src/pages/dashboard/domain/kpis.test.ts`

**Interfaces:**
- Consumes: Task 1 e Task 2.
- Produces:
  - base: `ehServico(r)`, `aplicarCsv2026(dataverse: Reserva[], csv: Reserva[]): Reserva[]`, `temSegmento(f)`, `passaSegmentos(r, f)`, `filtrarServicos(todas, f): Reserva[]`, `soma(rows)`, `agrupar<T>(rows: T[], key: (r: T) => string): Map<string, T[]>`, `mesesComDados(rows): string[]`, `opcoesFiltro(todas): OpcoesFiltro` com `type Opcao = { value: string; label: string }` e `type OpcoesFiltro = { status: Opcao[]; clientes: Opcao[]; motoristas: Opcao[]; tipos: Opcao[] }`
  - kpis: `ticketStats(rows): { value: number; count: number; ticket: number }`, `recebimentoStats(rows): { recebido: number; base: number; percentual: number }`, `produzido(r)`, `reservavel(r)`, `cpPendentes(rows)`, `servicosFuturos(rows, nowMs)`, `aReceber(rows)`, `valorDoPeriodo(todas, inicio, fim, f): { value: number; count: number | null; hasData: boolean }`, `ticketDoPeriodo(todas, inicio, fim, f)`, `chipValor(rotulo, atual, anterior, fmt): Chip | null`, `semDado(rotulo): Chip`, `chipOuSemDado(rotulo, atual, anterior: number | null, fmt): Chip`, `type Contexto = { todas: Reserva[]; rv: Reserva[]; f: Filtros; now: Date }`, `type Comparacao = { lm: Periodo | null; ly: Periodo; lmValor: number; lyValor: number; lmServicos: number; lyServicos: number | null; produzido: number }`, `comparacao(ctx): Comparacao`, `kpisExecutivos(ctx, cmp: Comparacao): Kpi[]`
  - previsao: `previsao(rv, inicio, fim, now): { rotulo: string; texto: string }`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { aplicarCsv2026, filtrarServicos, opcoesFiltro } from './base'
import { aReceber, comparacao, cpPendentes, kpisExecutivos, recebimentoStats, servicosFuturos, ticketStats, valorDoPeriodo } from './kpis'
import { previsao } from './previsao'
import { reserva } from './test-utils'
import type { Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })

describe('base', () => {
  it('troca jan–mar/2026 do Dataverse pelo CSV pelo texto bruto da saída', () => {
    const dv = [reserva({ id: 'a', saidaRaw: '2026-03-31T22:00:00Z' }), reserva({ id: 'b', saidaRaw: '2026-04-01T01:00:00Z' }), reserva({ id: 'c', saidaRaw: '' })]
    expect(aplicarCsv2026(dv, [reserva({ id: 'csv' })]).map((r) => r.id)).toEqual(['b', 'c', 'csv'])
  })

  it('filtra serviço, período e segmentos (OR dentro, AND entre)', () => {
    const todas = [
      reserva({ id: '1', saidaRaw: '2026-10-02T12:00:00Z', cliente: 'Tenaris' }),
      reserva({ id: '2', saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Embraer' }),
      reserva({ id: '3', saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Tenaris', categoriaItem: 1 }),
      reserva({ id: '4', saidaRaw: '2026-09-30T12:00:00Z', cliente: 'Tenaris' }),
    ]
    expect(filtrarServicos(todas, f()).map((r) => r.id)).toEqual(['1', '2'])
    expect(filtrarServicos(todas, f({ clientes: ['Tenaris'] })).map((r) => r.id)).toEqual(['1'])
    expect(opcoesFiltro(todas).clientes.map((o) => o.value)).toEqual(['Embraer', 'Tenaris'])
  })
})

describe('KPIs', () => {
  it('ticket só com CP concluída e valor > 0', () => {
    const rows = [reserva({ cpConcluida: true, valor: 100 }), reserva({ cpConcluida: true, valor: 300 }), reserva({ cpConcluida: false, valor: 999 }), reserva({ cpConcluida: true, valor: 0 })]
    expect(ticketStats(rows)).toEqual({ value: 400, count: 2, ticket: 200 })
    expect(ticketStats([]).ticket).toBe(0)
  })

  it('recebimento: Pago sobre a base sem Pagante em viagem e Mensal', () => {
    const rows = [reserva({ fatStatus: 202410010, valor: 300 }), reserva({ fatStatus: 202410006, valor: 500 }), reserva({ fatStatus: 202410008, valor: 500 }), reserva({ fatStatus: null, valor: 100 })]
    expect(recebimentoStats(rows)).toEqual({ recebido: 300, base: 400, percentual: 75 })
  })

  it('CP pendente deduplicada pela CP e restrita a produzido + faturamento pendente + categoria serviço', () => {
    const base = { cpPendente: true, fatStatusLabel: 'Pendente', statusLabel: 'Concluído' }
    const rows = [reserva({ ...base, cpId: 'cp1' }), reserva({ ...base, cpId: 'cp1' }), reserva({ ...base, cpId: 'cp2', statusLabel: 'Programado' }), reserva({ ...base, cpId: 'cp3', fatStatusLabel: 'Faturado' }), reserva({ ...base, cpId: '' }), reserva({ ...base, cpId: 'cp4', categoriaItemLabel: 'Hospedagem' })]
    expect(cpPendentes(rows)).toHaveLength(1)
  })

  it('futuros: depois de agora, não cancelado/recusado nem produzido', () => {
    const nowMs = NOW.getTime()
    const rows = [reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Programado' }), reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Cancelado' }), reserva({ saidaRaw: '2026-10-20T12:00:00Z', statusLabel: 'Concluído' }), reserva({ saidaRaw: '2026-10-10T12:00:00Z', statusLabel: 'Programado' })]
    expect(servicosFuturos(rows, nowMs)).toHaveLength(1)
  })

  it('a receber: CP concluída + OP + não pago + valor > 0', () => {
    expect(aReceber([reserva({ cpConcluida: true, opId: 'op', valor: 50 }), reserva({ cpConcluida: true, opId: 'op', valor: 70, fatStatus: 202410010 }), reserva({ cpConcluida: true, opId: '', valor: 90 })])).toBe(50)
  })

  it('valor do período cai no histórico fixo quando dá zero e não há segmento', () => {
    expect(valorDoPeriodo([], '2025-02-01', '2025-02-14', f())).toEqual({ value: 454025.84 / 28 * 14, count: null, hasData: true })
    expect(valorDoPeriodo([], '2025-02-01', '2025-02-14', f({ clientes: ['X'] }))).toEqual({ value: 0, count: 0, hasData: false })
    const todas = [reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 80 })]
    expect(valorDoPeriodo(todas, '2026-09-01', '2026-09-30', f())).toEqual({ value: 80, count: 1, hasData: true })
  })

  it('KPIs executivos com LM e LY no mês corrente', () => {
    const todas = [
      reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 1000, cpConcluida: true, opId: 'op' }),
      reserva({ saidaRaw: '2026-10-03T12:00:00Z', valor: 3000, cpConcluida: true, fatStatus: 202410010 }),
      reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 2000, cpConcluida: true }),
    ]
    const ctx = { todas, rv: filtrarServicos(todas, f()), f: f(), now: NOW }
    const cmp = comparacao(ctx)
    expect(cmp).toMatchObject({ produzido: 4000, lmValor: 2000, lmServicos: 1 })
    const k = Object.fromEntries(kpisExecutivos(ctx, cmp).map((x) => [x.id, x]))
    expect(k.faturamento.valor).toBe('R$\u00a04,0k')
    expect(k.faturamento.chips[0]).toEqual({ rotulo: 'LM', tipo: 'valor', anterior: 'R$\u00a02,0k', variacao: 100 })
    expect(k.servicos.valor).toBe('2')
    expect(k.ticket.valor).toBe('R$\u00a02.000,00')
    expect(k.aReceber.valor).toBe('R$\u00a01,0k')
    expect(k.aReceber.apoio[0]).toEqual({ rotulo: '% do faturamento', texto: '25% pendente' })
    expect(k.recebimento.valor).toBe('75%')
    expect(k.servicos.chips.find((c) => c.rotulo === 'LY')).toEqual({ rotulo: 'LY', tipo: 'sem-dado' })
  })
})

describe('previsão', () => {
  const rv = [reserva({ saidaRaw: '2026-10-01T12:00:00Z', valor: 1000 }), reserva({ saidaRaw: '2026-10-10T12:00:00Z', valor: 2000 })]
  it('mês aberto: realizado + média diária × dias restantes', () => {
    expect(previsao(rv, '2026-10-01', '2026-10-15', NOW)).toEqual({ rotulo: 'Previsão até fim do mês', texto: 'R$\u00a06,2k' })
  })
  it('estados encerrado, futuro e sem base', () => {
    expect(previsao(rv, '2026-09-01', '2026-09-30', NOW).texto).toBe('período encerrado')
    expect(previsao(rv, '2026-11-01', '2026-11-30', NOW).texto).toBe('sem base futura')
    expect(previsao([], '2026-10-01', '2026-10-15', NOW).texto).toBe('sem base realizada')
  })
  it('anual só quando o filtro começa em 1º/jan e termina depois de hoje (paridade: "Este ano" até hoje é previsão do mês)', () => {
    expect(previsao(rv, '2026-01-01', '2026-12-31', NOW)).toEqual({ rotulo: 'Previsão anual', texto: 'R$\u00a03,8k' })
    expect(previsao(rv, '2026-01-01', '2026-10-15', NOW).rotulo).toBe('Previsão até fim do mês')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/kpis.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `base.ts`**

```ts
import { CAT_ITEM_SERVICO, CSV_2026_FIM, CSV_2026_INICIO, SEM_MOTORISTA } from './codes'
import { entre } from './periodo'
import type { Filtros, Reserva } from './types'

export const ehServico = (r: Reserva) => r.categoriaItem === CAT_ITEM_SERVICO

/** `enrichReservas` do legado: jan–mar/2026 do Dataverse sai (texto bruto, sem fuso) e entra o CSV. */
export function aplicarCsv2026(dataverse: Reserva[], csv: Reserva[]) {
  return dataverse.filter((r) => { const d = r.saidaRaw.slice(0, 10); return d < CSV_2026_INICIO || d > CSV_2026_FIM }).concat(csv)
}

export const temSegmento = (f: Filtros) => f.status.length + f.clientes.length + f.motoristas.length + f.tipos.length > 0

/** `passesActiveFilters`: OR dentro de cada filtro, AND entre eles; filtro vazio não restringe. */
export const passaSegmentos = (r: Reserva, f: Filtros) =>
  (!f.status.length || f.status.includes(r.statusLabel)) &&
  (!f.clientes.length || f.clientes.includes(r.cliente)) &&
  (!f.motoristas.length || f.motoristas.includes(r.motoristaKey)) &&
  (!f.tipos.length || f.tipos.includes(r.tipoVeiculo))

/** `rv` do legado: serviços no período e nos segmentos. */
export const filtrarServicos = (todas: Reserva[], f: Filtros) => todas.filter((r) => ehServico(r) && entre(r.dia, f.inicio, f.fim) && passaSegmentos(r, f))

export const soma = (rows: Reserva[]) => rows.reduce((s, r) => s + (r.valor || 0), 0)

export function agrupar<T>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = map.get(k)
    if (list) list.push(r)
    else map.set(k, [r])
  }
  return map
}

/** `mKeys`: meses (AAAA-MM) com serviço, em ordem. */
export const mesesComDados = (rows: Reserva[]) => [...new Set(rows.map((r) => r.mes).filter(Boolean))].sort()

export type Opcao = { value: string; label: string }
export type OpcoesFiltro = { status: Opcao[]; clientes: Opcao[]; motoristas: Opcao[]; tipos: Opcao[] }

const ordenar = (map: Map<string, string>) => [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

/** Opções dos filtros a partir de todas as reservas de serviço carregadas. */
export function opcoesFiltro(todas: Reserva[]): OpcoesFiltro {
  const status = new Map<string, string>()
  const clientes = new Map<string, string>()
  const motoristas = new Map<string, string>()
  const tipos = new Map<string, string>()
  for (const r of todas) {
    if (!ehServico(r)) continue
    status.set(r.statusLabel, r.statusLabel)
    clientes.set(r.cliente, r.cliente)
    if (r.motorista !== SEM_MOTORISTA) motoristas.set(r.motoristaKey, r.motorista)
    tipos.set(r.tipoVeiculo, r.tipoVeiculo)
  }
  return { status: ordenar(status), clientes: ordenar(clientes), motoristas: ordenar(motoristas), tipos: ordenar(tipos) }
}
```

- [ ] **Step 4: Implementar `kpis.ts`** (L10470–10501, L12343–12373, L13385–13660)

```ts
import { FAT_MENSAL, FAT_PAGANTE_EM_VIAGEM, FAT_PAGO, MESES_CURTOS } from './codes'
import { agrupar, ehServico, mesesComDados, passaSegmentos, soma, temSegmento } from './base'
import { brl, brlS, int, normL } from './format'
import { fixoNoPeriodo } from './meta'
import { entre, mesesDoAno, mostrarLM, parseDia, hojeBR, periodoAnoAnterior, periodoMesAnterior, type Periodo } from './periodo'
import { previsao } from './previsao'
import type { Chip, Filtros, Kpi, PontoSerie, Reserva } from './types'

export const ticketElegivel = (r: Reserva) => r.cpConcluida && r.valor > 0
export function ticketStats(rows: Reserva[]) {
  const eleg = rows.filter(ticketElegivel)
  const value = soma(eleg)
  return { value, count: eleg.length, ticket: eleg.length ? value / eleg.length : 0 }
}

export function recebimentoStats(rows: Reserva[]) {
  const recebido = soma(rows.filter((r) => r.fatStatus === FAT_PAGO && r.valor > 0))
  const base = soma(rows.filter((r) => r.fatStatus !== FAT_PAGANTE_EM_VIAGEM && r.fatStatus !== FAT_MENSAL && r.valor > 0))
  return { recebido, base, percentual: base ? (recebido / base) * 100 : 0 }
}

/** `isProducedReservation`. */
export const produzido = (r: Reserva) => { const k = normL(r.statusLabel); return k.includes('conclu') || k.includes('realiz') || k.includes('finaliz') }
/** `isReservableService`. */
export const reservavel = (r: Reserva) => { const k = normL(r.statusLabel); return !k.includes('cancel') && !k.includes('recus') }

/** `getSemValorRows`: uma linha por CP pendente de serviço já produzido com faturamento pendente. */
export function cpPendentes(rows: Reserva[]) {
  const vistos = new Set<string>()
  return rows.filter((r) => {
    if (!r.cpId || vistos.has(r.cpId)) return false
    const ok = r.cpPendente && produzido(r) && normL(r.fatStatusLabel).includes('pend') && normL(r.categoriaItemLabel).includes('servico')
    if (ok) vistos.add(r.cpId)
    return ok
  })
}

export const servicosFuturos = (rows: Reserva[], nowMs: number) =>
  rows.filter((r) => Number.isFinite(r.saidaMs) && r.saidaMs > nowMs && normL(r.categoriaItemLabel).includes('servico') && reservavel(r) && !produzido(r))

export const aReceber = (rows: Reserva[]) => soma(rows.filter((r) => r.cpConcluida && r.opId && r.fatStatus !== FAT_PAGO && r.valor > 0))

/** `getPeriodValueAndCount`: soma do Dataverse; zero sem segmento cai no histórico fixo (contagem fica null). */
export function valorDoPeriodo(todas: Reserva[], inicio: string, fim: string, f: Filtros) {
  const rows = todas.filter((r) => ehServico(r) && entre(r.dia, inicio, fim) && passaSegmentos(r, f))
  const value = soma(rows)
  if (value === 0 && !temSegmento(f)) {
    const fixo = fixoNoPeriodo(inicio, fim)
    if (fixo > 0) return { value: fixo, count: null as number | null, hasData: true }
  }
  return { value, count: rows.length as number | null, hasData: value > 0 || rows.length > 0 }
}

/** `getTicketStatsForPeriod`: sem filtro de categoria, como no legado. */
export const ticketDoPeriodo = (todas: Reserva[], inicio: string, fim: string, f: Filtros) =>
  ticketStats(todas.filter((r) => entre(r.dia, inicio, fim) && passaSegmentos(r, f)))

/** `fmtKpiChip`: sem valor anterior o chip não aparece. */
export function chipValor(rotulo: string, atual: number, anterior: number, fmt: (v: number) => string): Chip | null {
  if (!anterior) return null
  return { rotulo, tipo: 'valor', anterior: fmt(anterior), variacao: ((atual - anterior) / anterior) * 100 }
}
export const semDado = (rotulo: string): Chip => ({ rotulo, tipo: 'sem-dado' })
/** Chip que vira "s/dado" quando não há anterior (Serviços e Ticket no legado). */
export const chipOuSemDado = (rotulo: string, atual: number, anterior: number | null, fmt: (v: number) => string) =>
  chipValor(rotulo, atual, anterior ?? 0, fmt) ?? semDado(rotulo)

export type Contexto = { todas: Reserva[]; rv: Reserva[]; f: Filtros; now: Date }
export type Comparacao = { lm: Periodo | null; ly: Periodo; lmValor: number; lyValor: number; lmServicos: number; lyServicos: number | null; produzido: number }

/** LM/LY e faturamento produzido do período (L13440–13462). */
export function comparacao({ todas, f, now }: Contexto): Comparacao {
  const lm = mostrarLM(f.inicio, f.fim, now) ? periodoMesAnterior(f.inicio, f.fim) : null
  const ly = periodoAnoAnterior(f.inicio, f.fim)
  const lmData = lm ? valorDoPeriodo(todas, lm.inicio, lm.fim, f) : null
  const lyData = valorDoPeriodo(todas, ly.inicio, ly.fim, f)
  return {
    lm, ly,
    lmValor: lmData?.hasData ? lmData.value : 0,
    lyValor: lyData.hasData ? lyData.value : 0,
    lmServicos: lmData?.count ?? 0,
    lyServicos: lyData.count,
    produzido: valorDoPeriodo(todas, f.inicio, f.fim, f).value,
  }
}

/** Últimos 8 meses com serviço; sem nenhum, mai–dez do ano corrente (L13626–13636). */
function mesesTendencia(rv: Reserva[], now: Date) {
  const meses = mesesComDados(rv)
  return (meses.length ? meses : mesesDoAno(parseDia(hojeBR(now)).y)).slice(-8)
}

export function kpisExecutivos(ctx: Contexto, cmp: Comparacao): Kpi[] {
  const { todas, rv, f, now } = ctx
  const lm = cmp.lm
  const tk = ticketStats(rv).ticket
  const fat = soma(rv)
  const semValor = cpPendentes(rv)
  const futuros = servicosFuturos(rv, now.getTime())
  const receber = aReceber(rv)
  const receb = recebimentoStats(rv)
  const prev = previsao(rv, f.inicio, f.fim, now)
  const lmTk = lm ? ticketDoPeriodo(todas, lm.inicio, lm.fim, f).ticket : 0
  const lyTk = ticketDoPeriodo(todas, cmp.ly.inicio, cmp.ly.fim, f).ticket

  const byM = agrupar(rv, (r) => r.mes)
  const meses = mesesTendencia(rv, now)
  const serie = (fn: (rows: Reserva[]) => number): PontoSerie[] =>
    meses.map((mes) => ({ mes, rotulo: MESES_CURTOS[Number(mes.slice(5, 7)) - 1], valor: fn(byM.get(mes) ?? []) }))
  const compact = (chips: (Chip | null)[]) => chips.filter((c): c is Chip => c !== null)

  return [
    {
      id: 'faturamento', rotulo: 'Faturamento', valor: brlS(cmp.produzido),
      chips: compact([lm ? chipValor('LM', cmp.produzido, cmp.lmValor, brlS) : null, chipValor('LY', cmp.produzido, cmp.lyValor, brlS)]),
      apoio: [{ rotulo: prev.rotulo, texto: prev.texto }],
      serie: serie(soma),
    },
    {
      id: 'servicos', rotulo: 'Serviços', valor: int(rv.length),
      chips: [...(lm ? [chipOuSemDado('LM', rv.length, cmp.lmServicos, int)] : []), chipOuSemDado('LY', rv.length, cmp.lyServicos, int)],
      apoio: [],
      serie: serie((rows) => rows.length),
    },
    {
      id: 'ticket', rotulo: 'Ticket médio', valor: brl(tk),
      chips: [...(lm ? [chipOuSemDado('LM', tk, lmTk, brlS)] : []), chipOuSemDado('LY', tk, lyTk, brlS)],
      apoio: [],
      serie: serie((rows) => ticketStats(rows).ticket),
    },
    {
      id: 'aReceber', rotulo: 'A receber', valor: brlS(receber), chips: [],
      apoio: [{ rotulo: '% do faturamento', texto: `${fat > 0 ? ((receber / fat) * 100).toFixed(0) : 0}% pendente` }],
      serie: serie(aReceber),
    },
    {
      id: 'cpPendente', rotulo: 'CP pendente', valor: int(semValor.length), chips: [],
      apoio: [
        { rotulo: 'Projeção', texto: brlS(tk * semValor.length), atencao: semValor.length > 0 },
        { rotulo: 'Futuros', texto: `${int(futuros.length)} · ${brlS(futuros.length * tk)}` },
      ],
      serie: serie((rows) => cpPendentes(rows).length),
    },
    {
      id: 'recebimento', rotulo: 'Recebimento', valor: `${receb.percentual.toFixed(0)}%`, chips: [],
      apoio: [{ rotulo: 'Recebido', texto: `${brlS(receb.recebido)} de ${brlS(receb.base)}` }],
      serie: serie((rows) => recebimentoStats(rows).percentual),
    },
  ]
}
```

- [ ] **Step 5: Implementar `previsao.ts`** (L13425–13505)

```ts
import { soma } from './base'
import { brlS } from './format'
import { DIA_MS, diasNoMes, fmtDia, hojeBR, inicioMs, parseDia } from './periodo'
import type { Reserva } from './types'

/** Previsão do legado. Detalhe preservado: o fim do filtro vale até 23:59:59.000 e "hoje" até 23:59:59.999. */
export function previsao(rv: Reserva[], inicio: string, fim: string, now: Date) {
  const hoje = hojeBR(now)
  const { y, m, d } = parseDia(hoje)
  const anoIni = inicioMs(`${y}-01-01`)
  const anoFim = inicioMs(`${y}-12-31`) + DIA_MS - 1000
  const mesIni = inicioMs(fmtDia(y, m, 1))
  const hojeIni = inicioMs(hoje)
  const hojeFim = hojeIni + DIA_MS - 1
  const selIni = inicioMs(inicio)
  const selFim = inicioMs(fim) + DIA_MS - 1000
  const anual = selIni === anoIni && selFim >= hojeFim
  const estado = selIni > hojeFim ? 'future' : selFim < hojeIni ? 'closed' : 'open'
  const rotulo = anual ? 'Previsão anual' : 'Previsão até fim do mês'
  if (estado === 'closed') return { rotulo, texto: 'período encerrado' }
  if (estado === 'future') return { rotulo, texto: 'sem base futura' }

  const runIni = anual ? anoIni : Math.max(selIni, mesIni)
  const dentro = (r: Reserva, ini: number) => Number.isFinite(r.saidaMs) && r.saidaMs >= ini && r.saidaMs <= hojeFim && r.saidaMs <= selFim
  const atual = soma(rv.filter((r) => dentro(r, selIni)))
  const corrida = soma(rv.filter((r) => dentro(r, runIni)))
  if (!corrida) return { rotulo, texto: 'sem base realizada' }

  const decorridos = Math.max(1, Math.floor((hojeIni - runIni) / DIA_MS) + 1)
  const alvo = anual ? Math.round((anoFim - anoIni) / DIA_MS) + 1 : diasNoMes(y, m)
  const restantes = anual ? Math.max(0, alvo - decorridos) : Math.max(0, alvo - d)
  return { rotulo, texto: brlS(atual + (corrida / decorridos) * restantes) }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/kpis.test.ts`
Expected: PASS. Se a previsão anual der valor diferente de `R$ 3,8k`, confira: decorridos = 288 (01/01 a 15/10), alvo = 366 (arredondamento do legado), restantes = 78, 3000 + 3000/288 × 78 = 3812,5.

- [ ] **Step 7: Typecheck e commit**

Run: `pnpm --filter @betinhos/shell typecheck` → sem erros.

```bash
git add apps/shell/src/pages/dashboard/domain
git commit -m "Dashboard: base de serviços, KPIs executivos e previsão do legado

Porta o filtro rv (serviço, período e segmentos), a troca de jan–mar/2026
pelo CSV, ticket médio, recebimento, CP pendente deduplicada, serviços
futuros, a receber, valor do período com fallback no histórico fixo,
comparativos LM/LY com chips e a previsão até fim do mês/anual.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Alertas, destaques e análises

**Files:**
- Create: `apps/shell/src/pages/dashboard/domain/alertas.ts`
- Create: `apps/shell/src/pages/dashboard/domain/destaques.ts`
- Create: `apps/shell/src/pages/dashboard/domain/analises.ts`
- Test: `apps/shell/src/pages/dashboard/domain/analises.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 (`soma`, `agrupar`, `mesesComDados`, `temSegmento`, `ticketStats`, `ticketDoPeriodo`, `produzido`, `valorDoPeriodo`, `chipValor`, `chipOuSemDado`, `semDado`, `Contexto`, `Comparacao`, `metaMensal`, `metaProporcional`, `totalFixoNoPeriodo`, `FAT_FIXO`, `ANOS_MAPA`).
- Produces:
  - alertas: `type Secundarios = { manutencoes: Manutencao[]; multas: Multa[]; ocorrencias: Ocorrencia[]; funcionarios: Funcionario[]; veiculos: Veiculo[]; indisponiveis: Conjunto[] }` (manutenções, multas e ocorrências já filtradas pelo período), `alertasOperacao(rv, s, nowMs): AlertaItem[]`, `alertasQualidade(rv, nowMs): AlertaItem[]`, `cardsFrotaPessoas(rv, s, nowMs): CardSecundario[]`
  - destaques: `type TopMotorista = { nome: string; qtd: number; fat: number }`, `type ProducaoPT = { classificados: number; meses: { mes: string; rotulo: string; propria: number; terceirizada: number }[]; topPropria: TopMotorista[]; topTerceirizada: TopMotorista[] }`, `producaoPropriaTerceira(rv, veiculos): ProducaoPT`, `type Emergenciais = { total: number; de: number; percentual: number; top3: { cliente: string; qtd: number; percentual: number }[]; meses: { mes: string; rotulo: string; ranking: { cliente: string; qtd: number }[] }[] }`, `emergenciais(rv): Emergenciais`
  - analises: `type Destaque = { valor: string; sub: string; chips: Chip[]; apoio: Apoio[] }`, `topByShare`, e as funções/tipos abaixo (`totalProduzido`, `metaRealizado`, `faturamentoPorCliente`, `ticketMensal`, `statusServicos`, `custoFrota`, `topVolume`, `topFaturamento`, `servicosPorMotorista`).

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { alertasOperacao, alertasQualidade, cardsFrotaPessoas, type Secundarios } from './alertas'
import { emergenciais, producaoPropriaTerceira } from './destaques'
import { custoFrota, faturamentoPorCliente, metaRealizado, servicosPorMotorista, statusServicos, topByShare, topFaturamento, topVolume, totalProduzido } from './analises'
import { filtrarServicos } from './base'
import { comparacao } from './kpis'
import { reserva } from './test-utils'
import type { Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const nowMs = NOW.getTime()
const f = (p: Partial<Filtros> = {}): Filtros => ({ atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p })
const vazio: Secundarios = { manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] }

describe('alertas', () => {
  it('CNH: só funcionário "ativo" com validade até 90 dias; multas e ocorrências', () => {
    const s: Secundarios = {
      ...vazio,
      funcionarios: [
        { statusLabel: 'Ativo', cnhMs: nowMs + 30 * 86_400_000 },
        { statusLabel: 'Ativo', cnhMs: NaN },
        { statusLabel: 'Inativo', cnhMs: nowMs },
        { statusLabel: 'Ativo', cnhMs: nowMs + 200 * 86_400_000 },
      ],
      multas: [{ dia: '2026-10-02', status: 202410000 }, { dia: '2026-10-03', status: 1 }],
      ocorrencias: [{ dia: '2026-10-02' }],
    }
    const rv = [reserva(), reserva(), reserva(), reserva()]
    const [cnh, multas, oco] = alertasOperacao(rv, s, nowMs)
    expect(cnh).toEqual({ id: 'cnh', valor: '1', rotulo: 'CNH', status: 'Atenção', tom: 'danger' })
    expect(multas).toEqual({ id: 'multas', valor: '1', rotulo: 'Multas', status: '50% pendentes', tom: 'danger' })
    expect(oco).toEqual({ id: 'ocorrencias', valor: '1', rotulo: 'Ocorrências', status: '25,0% dos serviços · 1 a cada 4', tom: 'danger' })
    expect(alertasOperacao(rv, { ...vazio, indisponiveis: ['funcionarios'] }, nowMs)[0]).toEqual({ id: 'cnh', valor: '—', rotulo: 'CNH', status: 's/dado', tom: 'warn' })
  })

  it('qualidade com as datas de corte do legado', () => {
    const rv = [
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', motoristaId: 'm1', veiculoId: '' }),
      reserva({ saidaRaw: '2026-05-01T12:00:00Z', motoristaId: 'm1', veiculoId: '' }),
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', motoristaId: '', status: 202410008 }),
      reserva({ saidaRaw: '2026-03-01T12:00:00Z', motoristaId: '', status: 202410008, cliente: 'Sem cliente' }),
      reserva({ saidaRaw: '2026-07-01T12:00:00Z', tipoVeiculoRaw: '', cliente: 'Tenaris', motoristaId: 'm1', veiculoId: 'v1' }),
    ]
    const q = Object.fromEntries(alertasQualidade(rv, nowMs).map((a) => [a.id, a]))
    expect(q.semVeiculo.valor).toBe('1')
    expect(q.semTipoVeiculo.valor).toBe('1')
    expect(q.semMotorista.valor).toBe('1')
    expect(q.semCliente).toMatchObject({ valor: '3', status: '60,0% dos serviços', tom: 'warn' })
  })

  it('cards de frota e pessoas', () => {
    const rv = [reserva({ valor: 1000 })]
    const s: Secundarios = { ...vazio, manutencoes: [{ dia: '2026-10-02', valor: 200 }], veiculos: [{ id: 'a', statusLabel: 'Disponível', categoria: '' }, { id: 'b', statusLabel: 'Inativo', categoria: '' }, { id: 'c', statusLabel: 'Em manutenção', categoria: '' }] }
    const c = Object.fromEntries(cardsFrotaPessoas(rv, s, nowMs).map((x) => [x.id, x]))
    expect(c.manutencoes).toMatchObject({ valor: '1', apoio: 'R$ 200,00 · 20,0% da receita', atencao: true })
    expect(c.frota).toMatchObject({ valor: '2', apoio: 'Total: 3' })
  })
})

describe('destaques', () => {
  it('produção própria × terceirizada e top 5 por faturamento', () => {
    const rv = [
      reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'm1', valor: 100 }),
      reserva({ veiculoId: 'v1', motorista: 'Ana', motoristaKey: 'm1', valor: 100 }),
      reserva({ veiculoId: 'v2', motorista: 'Bia', motoristaKey: 'm2', valor: 500 }),
      reserva({ veiculoId: 'v9', motorista: 'Cid', motoristaKey: 'm3', valor: 900 }),
    ]
    const p = producaoPropriaTerceira(rv, [{ id: 'v1', statusLabel: 'Disponível', categoria: 'Propria' }, { id: 'v2', statusLabel: 'Disponível', categoria: 'Terceirizada' }])
    expect(p.classificados).toBe(3)
    expect(p.meses).toEqual([{ mes: '2026-10', rotulo: 'out/26', propria: 2, terceirizada: 1 }])
    expect(p.topPropria).toEqual([{ nome: 'Ana', qtd: 2, fat: 200 }])
  })

  it('emergencial = criado no mesmo dia (texto UTC) da saída', () => {
    const rv = [
      reserva({ cliente: 'Tenaris', criadoRaw: '2026-10-05T09:00:00Z', saidaRaw: '2026-10-05T15:00:00Z' }),
      reserva({ cliente: 'Tenaris', criadoRaw: '2026-10-06T09:00:00Z', saidaRaw: '2026-10-06T15:00:00Z' }),
      reserva({ cliente: 'Embraer', criadoRaw: '2026-10-07T09:00:00Z', saidaRaw: '2026-10-07T15:00:00Z' }),
      reserva({ cliente: 'Vale', criadoRaw: '2026-10-01T09:00:00Z', saidaRaw: '2026-10-07T15:00:00Z' }),
    ]
    const e = emergenciais(rv)
    expect(e).toMatchObject({ total: 3, de: 4, percentual: 75 })
    expect(e.top3.map((t) => t.cliente)).toEqual(['Tenaris', 'Embraer'])
    expect(e.meses[0].ranking[0]).toEqual({ cliente: 'Tenaris', qtd: 2 })
  })
})

describe('análises', () => {
  const todas = [
    reserva({ saidaRaw: '2026-10-02T12:00:00Z', cliente: 'Tenaris', valor: 600, cpConcluida: true, motorista: 'Ana', motoristaKey: 'm1' }),
    reserva({ saidaRaw: '2026-10-03T12:00:00Z', cliente: 'Embraer', valor: 300, cpConcluida: true, motorista: 'Ana', motoristaKey: 'm1', statusLabel: 'Cancelado' }),
    reserva({ saidaRaw: '2026-10-04T12:00:00Z', cliente: 'Sem cliente', valor: 100, motorista: 'Bia', motoristaKey: 'm2' }),
  ]
  const ctx = { todas, rv: filtrarServicos(todas, f()), f: f(), now: NOW }
  const cmp = comparacao(ctx)

  it('topByShare: >10% dos 10 primeiros, no mínimo 3', () => {
    expect(topByShare([50, 30, 15, 5], 100, (x) => x)).toEqual([50, 30, 15])
    expect(topByShare([90, 4, 3, 3], 100, (x) => x)).toEqual([90, 4, 3])
    expect(topByShare([1, 2], 0, (x) => x)).toEqual([1, 2])
  })

  it('total produzido: 3 anos recortados pelo filtro (como o legado), 2026 do Dataverse e meta proporcional', () => {
    const t = totalProduzido(ctx, cmp)
    expect(t.anos).toEqual([2024, 2025, 2026])
    expect(t.valor).toBe('R$ 1,0k')
    // O recorte usa as datas do filtro: anos fora dele ficam null e só outubro tem ponto.
    expect(t.pontos).toEqual([{ rotulo: 'Out', valores: [null, null, 1000] }])
    expect(t.apoio[0].rotulo).toBe('Meta')
    const anoTodo = { ...ctx, f: f({ atalho: 'anoAnt', inicio: '2025-01-01', fim: '2025-12-31' }) }
    const t2 = totalProduzido({ ...anoTodo, rv: filtrarServicos(todas, anoTodo.f) }, comparacao({ ...anoTodo, rv: [] }))
    expect(t2.pontos).toHaveLength(12)
    expect(t2.pontos[0].valores[1]).toBeCloseTo(336469.65, 4)
  })

  it('meta × realizado por mês do recorte', () => {
    const m = metaRealizado(ctx, cmp)
    expect(m.linhas).toHaveLength(1)
    expect(m.linhas[0]).toMatchObject({ mes: '2026-10', real: 1000 })
    expect(m.sub).toMatch(/^1 meses · /)
  })

  it('clientes, status, tops e motoristas', () => {
    expect(faturamentoPorCliente(ctx).linhas.map((l) => l.cliente)).toEqual(['Tenaris', 'Embraer'])
    const st = statusServicos(ctx)
    expect(st.sub).toBe('2 concluídos · 1 cancelados')
    expect(topVolume(ctx).linhas.map((l) => l.cliente)).toEqual(['Tenaris', 'Embraer', 'Sem cliente'])
    expect(topFaturamento(ctx).linhas[0]).toMatchObject({ cliente: 'Tenaris', valor: 'R$ 600,00' })
    const mot = servicosPorMotorista(ctx)
    expect(mot.valor).toBe('2')
    expect(mot.linhas[0]).toMatchObject({ nome: 'Ana', total: 2 })
  })

  it('custo da frota sobre o faturamento', () => {
    const c = custoFrota(ctx, [{ dia: '2026-10-02', valor: 150 }], false)
    expect(c.valor).toBe('R$ 150,00')
    expect(c.sub).toBe('1 manutenções · 15,0% da receita')
    expect(c.apoio[0]).toMatchObject({ atencao: true })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/analises.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `alertas.ts`** (L13337–13423, L13604–13687)

```ts
import { CAT_ITEM_SERVICO, CORTE_SEM_CLIENTE, CORTE_SEM_MOTORISTA, CORTE_SEM_VEICULO, MULTA_NOTIFICAR, SEM_CLIENTE, STATUS_SEM_MOTORISTA } from './codes'
import { soma } from './base'
import { brlS, dec, int, stL } from './format'
import { DIA_MS } from './periodo'
import type { AlertaItem, CardSecundario, Conjunto, Funcionario, Manutencao, Multa, Ocorrencia, Reserva, Veiculo } from './types'

export type Secundarios = { manutencoes: Manutencao[]; multas: Multa[]; ocorrencias: Ocorrencia[]; funcionarios: Funcionario[]; veiculos: Veiculo[]; indisponiveis: Conjunto[] }

/** `cnhWarn`: só status "ativo" e validade preenchida até 90 dias (sem validade não conta, como no código legado). */
export const cnhEmAtencao = (funcionarios: Funcionario[], nowMs: number) =>
  funcionarios.filter((f) => stL(f.statusLabel) === 'ativo' && Number.isFinite(f.cnhMs) && (f.cnhMs - nowMs) / DIA_MS <= 90)
export const multasPendentes = (multas: Multa[]) => multas.filter((m) => m.status === MULTA_NOTIFICAR)
const pctMultas = (multas: Multa[]) => (multas.length ? ((multasPendentes(multas).length / multas.length) * 100).toFixed(0) : '0')
const indisponivel = (id: string, rotulo: string): AlertaItem => ({ id, valor: '—', rotulo, status: 's/dado', tom: 'warn' })

export function alertasOperacao(rv: Reserva[], s: Secundarios, nowMs: number): AlertaItem[] {
  const fora = (c: Conjunto) => s.indisponiveis.includes(c)
  const cnh = cnhEmAtencao(s.funcionarios, nowMs).length
  const pend = multasPendentes(s.multas).length
  const oco = s.ocorrencias.length
  return [
    fora('funcionarios') ? indisponivel('cnh', 'CNH') : { id: 'cnh', valor: int(cnh), rotulo: 'CNH', status: cnh ? 'Atenção' : 'OK', tom: cnh ? 'danger' : 'ok' },
    fora('multas') ? indisponivel('multas', 'Multas') : { id: 'multas', valor: int(pend), rotulo: 'Multas', status: `${pctMultas(s.multas)}% pendentes`, tom: pend ? 'danger' : 'ok' },
    fora('ocorrencias') ? indisponivel('ocorrencias', 'Ocorrências') : {
      id: 'ocorrencias', valor: int(oco), rotulo: 'Ocorrências',
      status: rv.length && oco ? `${dec((oco / rv.length) * 100, 1)}% dos serviços · 1 a cada ${int(Math.round(rv.length / oco))}` : 's/dado',
      tom: oco ? 'danger' : 'ok',
    },
  ]
}

export function alertasQualidade(rv: Reserva[], nowMs: number): AlertaItem[] {
  const share = (n: number) => (rv.length ? `${dec((n / rv.length) * 100, 1)}% dos serviços` : 's/dado')
  const item = (id: string, rotulo: string, n: number): AlertaItem => ({ id, valor: int(n), rotulo, status: share(n), tom: n ? 'warn' : 'ok' })
  const ok = (r: Reserva) => Number.isFinite(r.saidaMs) && r.saidaMs <= nowMs
  const semVeiculo = rv.filter((r) => !stL(r.statusLabel).includes('cancel') && Boolean(r.motoristaId) && !r.veiculoId && ok(r) && r.saidaMs >= CORTE_SEM_VEICULO).length
  const semTipo = rv.filter((r) => !r.tipoVeiculoRaw).length
  const semMotorista = rv.filter((r) => !r.motoristaId && ok(r) && r.saidaMs >= CORTE_SEM_MOTORISTA && r.status != null && STATUS_SEM_MOTORISTA.has(r.status) && r.categoriaItem === CAT_ITEM_SERVICO).length
  const semCliente = rv.filter((r) => r.saidaRaw.slice(0, 10) >= CORTE_SEM_CLIENTE && r.cliente === SEM_CLIENTE).length
  return [
    item('semVeiculo', 'Sem veículo', semVeiculo),
    item('semTipoVeiculo', 'Sem tipo de veículo', semTipo),
    item('semMotorista', 'Sem motorista', semMotorista),
    item('semCliente', 'Sem cliente', semCliente),
  ]
}

export function cardsFrotaPessoas(rv: Reserva[], s: Secundarios, nowMs: number): CardSecundario[] {
  const fora = (c: Conjunto) => s.indisponiveis.includes(c)
  const semDado = (id: string, rotulo: string): CardSecundario => ({ id, rotulo, valor: '—', apoio: 's/dado', atencao: false })
  const fat = soma(rv)
  const custo = s.manutencoes.reduce((t, m) => t + (m.valor || 0), 0)
  const pctRec = fat > 0 ? (custo / fat) * 100 : 0
  const pend = multasPendentes(s.multas).length
  const cnh = cnhEmAtencao(s.funcionarios, nowMs).length
  const ativos = s.veiculos.filter((v) => { const k = stL(v.statusLabel); return k.includes('dispon') || k.includes('ativo') }).length
  return [
    fora('manutencoes') ? semDado('manutencoes', 'Manutenções') : { id: 'manutencoes', rotulo: 'Manutenções', valor: int(s.manutencoes.length), apoio: `${brlS(custo)} · ${dec(pctRec, 1)}% da receita`, atencao: custo > fat * 0.1 },
    fora('multas') ? semDado('multas', 'Multas') : { id: 'multas', rotulo: 'Multas', valor: int(s.multas.length), apoio: `${int(pend)} pendentes · ${pctMultas(s.multas)}%`, atencao: pend > 0 },
    fora('funcionarios') ? semDado('cnh', 'CNH em atenção') : { id: 'cnh', rotulo: 'CNH em atenção', valor: int(cnh), apoio: cnh ? `${int(cnh)} em atenção` : 'OK', atencao: cnh > 0 },
    fora('veiculos') ? semDado('frota', 'Frota ativa') : { id: 'frota', rotulo: 'Frota ativa', valor: int(ativos), apoio: `Total: ${int(s.veiculos.length)}`, atencao: false },
  ]
}
```

- [ ] **Step 4: Implementar `destaques.ts`** (L14174–14241)

```ts
import { SEM_CLIENTE, SEM_MOTORISTA } from './codes'
import { agrupar } from './base'
import { mesRotulo } from './periodo'
import type { CategoriaVeiculo, Reserva, Veiculo } from './types'

export type TopMotorista = { nome: string; qtd: number; fat: number }
export type ProducaoPT = { classificados: number; meses: { mes: string; rotulo: string; propria: number; terceirizada: number }[]; topPropria: TopMotorista[]; topTerceirizada: TopMotorista[] }

export function producaoPropriaTerceira(rv: Reserva[], veiculos: Veiculo[]): ProducaoPT {
  const tipo = new Map(veiculos.map((v) => [v.id, v.categoria]))
  const classificados = rv.map((r) => ({ r, kind: (tipo.get(r.veiculoId) ?? '') as CategoriaVeiculo })).filter((x) => x.kind)
  // O legado usa o mês do texto bruto (UTC), sem fuso.
  const meses = [...new Set(classificados.map(({ r }) => r.saidaRaw.slice(0, 7)).filter(Boolean))].sort()
  const conta = (mes: string, kind: CategoriaVeiculo) => classificados.filter((x) => x.kind === kind && x.r.saidaRaw.slice(0, 7) === mes).length
  const ranking = (kind: CategoriaVeiculo) => {
    const grupos = new Map<string, TopMotorista>()
    for (const { r } of classificados.filter((x) => x.kind === kind && x.r.motorista && x.r.motorista !== SEM_MOTORISTA)) {
      const atual = grupos.get(r.motoristaKey) ?? { nome: r.motorista, qtd: 0, fat: 0 }
      atual.qtd += 1
      atual.fat += r.valor || 0
      grupos.set(r.motoristaKey, atual)
    }
    return [...grupos.values()].sort((a, b) => b.fat - a.fat || b.qtd - a.qtd).slice(0, 5)
  }
  return {
    classificados: classificados.length,
    meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes), propria: conta(mes, 'Propria'), terceirizada: conta(mes, 'Terceirizada') })),
    topPropria: ranking('Propria'),
    topTerceirizada: ranking('Terceirizada'),
  }
}

export type Emergenciais = {
  total: number
  de: number
  percentual: number
  top3: { cliente: string; qtd: number; percentual: number }[]
  meses: { mes: string; rotulo: string; ranking: { cliente: string; qtd: number }[] }[]
}

const rankClientes = (rows: Reserva[], max: number) =>
  [...agrupar(rows, (r) => r.cliente || SEM_CLIENTE)].map(([cliente, list]) => ({ cliente, qtd: list.length }))
    .sort((a, b) => b.qtd - a.qtd || a.cliente.localeCompare(b.cliente, 'pt-BR')).slice(0, max)

/** Emergencial: `createdon` no mesmo dia (texto bruto UTC) da saída. */
export function emergenciais(rv: Reserva[]): Emergenciais {
  const em = rv.filter((r) => r.criadoRaw.slice(0, 10) === r.saidaRaw.slice(0, 10))
  const porMes = agrupar(em, (r) => r.saidaRaw.slice(0, 7))
  return {
    total: em.length,
    de: rv.length,
    percentual: rv.length ? (em.length / rv.length) * 100 : 0,
    top3: rankClientes(em, 3).map((x) => ({ ...x, percentual: em.length ? (x.qtd / em.length) * 100 : 0 })),
    meses: [...porMes.keys()].sort().map((mes) => ({ mes, rotulo: mesRotulo(mes), ranking: rankClientes(porMes.get(mes) ?? [], 5) })),
  }
}
```

- [ ] **Step 5: Implementar `analises.ts`** (L13689–14093)

```ts
import { ANOS_MAPA, FAT_FIXO } from '../data/historico'
import { MESES_CURTOS, MESES_TITULO, SEM_CLIENTE, SEM_MOTORISTA } from './codes'
import { agrupar, mesesComDados, soma, temSegmento } from './base'
import { brl, brlS, dec, int, stL } from './format'
import { chipOuSemDado, chipValor, produzido, semDado, ticketDoPeriodo, ticketStats, valorDoPeriodo, type Comparacao, type Contexto } from './kpis'
import { metaMensal, metaProporcional, totalFixoNoPeriodo } from './meta'
import { diasNoMes, hojeBR, mesRotulo, mesesDoAno, parseDia } from './periodo'
import type { Apoio, Chip, Manutencao, Reserva } from './types'

export type Destaque = { valor: string; sub: string; chips: Chip[]; apoio: Apoio[] }
const anoAtual = (now: Date) => parseDia(hojeBR(now)).y
const naoNulos = (chips: (Chip | null)[]) => chips.filter((c): c is Chip => c !== null)

/** `topByShare`: dos 10 primeiros, os acima de 10%; se ficarem menos de 3, os 3 primeiros. */
export function topByShare<T>(rows: T[], total: number, valor: (r: T) => number, max = 10): T[] {
  const ranked = rows.slice(0, max)
  if (!total || ranked.length <= 3) return ranked
  const eleg = ranked.filter((r) => (valor(r) / total) * 100 > 10)
  return eleg.length >= 3 ? eleg : ranked.slice(0, 3)
}

/** Meses do recorte; sem serviço, os 12 do ano corrente. */
const mesesOuAno = (rv: Reserva[], now: Date) => { const m = mesesComDados(rv); return m.length ? m : mesesDoAno(anoAtual(now)) }

export type TotalProduzido = Destaque & { anos: [number, number, number]; pontos: { rotulo: string; valores: (number | null)[] }[] }

export function totalProduzido(ctx: Contexto, cmp: Comparacao): TotalProduzido {
  const { todas, f, now } = ctx
  const a1 = anoAtual(now)
  const anos: [number, number, number] = [a1 - 2, a1 - 1, a1]
  const recorte = (ano: number, mes: number) => {
    const ms = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
    const me = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(diasNoMes(ano, mes)).padStart(2, '0')}`
    return { rs: f.inicio > ms ? f.inicio : ms, re: f.fim < me ? f.fim : me }
  }
  const serie = (ano: number) => Array.from({ length: 12 }, (_, mes) => {
    const { rs, re } = recorte(ano, mes)
    if (ano >= 2026) return rs > re ? null : valorDoPeriodo(todas, rs, re, f).value || null
    const valores = ANOS_MAPA.includes(ano) ? FAT_FIXO[ano] ?? [] : []
    return !temSegmento(f) && rs <= re ? totalFixoNoPeriodo(valores, ano, rs, re) : null
  })
  const series = anos.map(serie)
  const indices = Array.from({ length: 12 }, (_, i) => i).filter((i) => series.some((s) => s[i] !== null))
  const usar = indices.length ? indices : Array.from({ length: 12 }, (_, i) => i)
  const meta = metaProporcional(f.inicio, f.fim)
  const acumulado = cmp.produzido
  const progresso = meta ? (acumulado / meta) * 100 : 0
  return {
    anos,
    pontos: usar.map((i) => ({ rotulo: MESES_TITULO[i], valores: series.map((s) => s[i]) })),
    valor: brlS(acumulado),
    sub: `${anos[0]} a ${anos[2]}`,
    chips: naoNulos([cmp.lm ? chipValor('LM', acumulado, cmp.lmValor, brlS) : null, chipValor('LY', acumulado, cmp.lyValor, brlS)]),
    apoio: meta > 0 ? [{ rotulo: 'Meta', texto: `${brlS(meta)} · ${progresso.toFixed(0)}%${progresso >= 100 ? ' atingida' : ''}`, atencao: progresso < 100 }] : [],
  }
}

export type LinhaMeta = { mes: string; rotulo: string; meta: number; real: number; pct: number; tom: 'success' | 'info' | 'warning' }
export type MetaRealizado = Destaque & { linhas: LinhaMeta[] }

export function metaRealizado(ctx: Contexto, cmp: Comparacao): MetaRealizado {
  const { rv, now } = ctx
  const comDados = mesesComDados(rv)
  const meses = mesesOuAno(rv, now)
  const byM = agrupar(rv, (r) => r.mes)
  const ano = anoAtual(now)
  const linhas = meses.map((mes, i): LinhaMeta => {
    const [y, m] = mes.split('-').map(Number)
    const real = comDados.length ? soma(byM.get(mes) ?? []) : (ANOS_MAPA.includes(ano) ? FAT_FIXO[ano]?.[i] ?? 0 : 0)
    const meta = metaMensal(y, m - 1)
    const pct = meta > 0 ? (real / meta) * 100 : 0
    return { mes, rotulo: mesRotulo(mes), meta, real, pct, tom: pct >= 100 ? 'success' : pct >= 75 ? 'info' : 'warning' }
  })
  const totalMeta = linhas.reduce((t, l) => t + l.meta, 0)
  const totalReal = linhas.reduce((t, l) => t + l.real, 0)
  const pct = totalMeta > 0 ? (totalReal / totalMeta) * 100 : 0
  return {
    linhas,
    valor: brlS(totalReal),
    sub: `${meses.length} meses · ${dec(pct, 1)}% da meta`,
    chips: naoNulos([chipValor('LY', totalReal, cmp.lyValor, brlS)]),
    apoio: totalMeta > 0 ? [{ rotulo: 'Meta', texto: `${brlS(totalMeta)} · ${pct.toFixed(0)}%${pct >= 100 ? ' atingida' : ''}`, atencao: pct < 100 }] : [],
  }
}

export type Delta = { tipo: 'novo' } | { tipo: 'nada' } | { tipo: 'pct'; valor: number }
export type LinhaCliente = { cliente: string; total: number; participacao: number; meses: { mes: string; valor: number; delta: Delta }[] }
export type FatPorCliente = Destaque & { meses: { mes: string; rotulo: string }[]; linhas: LinhaCliente[] }

export function faturamentoPorCliente(ctx: Contexto): FatPorCliente {
  const { rv, now } = ctx
  const meses = mesesOuAno(rv, now)
  const fat = soma(rv)
  const top = [...agrupar(rv, (r) => r.cliente)].filter(([c]) => c !== SEM_CLIENTE).sort((a, b) => soma(b[1]) - soma(a[1])).slice(0, 6)
  const linhas = top.map(([cliente, rows]): LinhaCliente => {
    const porMes = agrupar(rows, (r) => r.mes)
    const total = soma(rows)
    return {
      cliente, total, participacao: fat > 0 ? (total / fat) * 100 : 0,
      meses: meses.map((mes, i) => {
        const valor = soma(porMes.get(mes) ?? [])
        const anterior = i > 0 ? soma(porMes.get(meses[i - 1]) ?? []) : null
        const delta: Delta = anterior === null || anterior === 0 ? (anterior === 0 && valor > 0 ? { tipo: 'novo' } : { tipo: 'nada' }) : { tipo: 'pct', valor: ((valor - anterior) / anterior) * 100 }
        return { mes, valor, delta }
      }),
    }
  })
  const apoio = linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${brlS(l.total)} · ${dec(l.participacao, 1)}%` }))
  return { meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes) })), linhas, valor: linhas[0] ? brlS(linhas[0].total) : '—', sub: linhas[0]?.cliente ?? 'Sem clientes no período', chips: [], apoio }
}

export type TicketMensal = Destaque & { pontos: { rotulo: string; valor: number | null }[] }

export function ticketMensal(ctx: Contexto, cmp: Comparacao): TicketMensal {
  const { todas, rv, f } = ctx
  const meses = mesesComDados(rv)
  const byM = agrupar(rv, (r) => r.mes)
  const tk = ticketStats(rv).ticket
  const lmTk = cmp.lm ? ticketDoPeriodo(todas, cmp.lm.inicio, cmp.lm.fim, f).ticket : 0
  return {
    pontos: meses.length ? meses.map((mes) => ({ rotulo: mesRotulo(mes), valor: ticketStats(byM.get(mes) ?? []).ticket })) : MESES_CURTOS.map((rotulo) => ({ rotulo, valor: null })),
    valor: brl(tk),
    sub: `${meses.length} meses`,
    // No legado o LY deste card é sempre "s/dado".
    chips: [...(cmp.lm ? [chipOuSemDado('LM', tk, lmTk, brlS)] : []), semDado('LY')],
    apoio: [],
  }
}

export type StatusServicos = Destaque & { linhas: { status: string; qtd: number; pct: number }[] }

export function statusServicos(ctx: Contexto): StatusServicos {
  const { rv } = ctx
  const por = agrupar(rv, (r) => r.statusLabel)
  const chaves = [...por.keys()].sort((a, b) => (por.get(b)?.length ?? 0) - (por.get(a)?.length ?? 0))
  const conc = rv.filter(produzido).length
  const canc = rv.filter((r) => { const k = stL(r.statusLabel); return k.includes('cancel') || k.includes('recus') }).length
  const concPct = rv.length ? (conc / rv.length) * 100 : 0
  return {
    linhas: topByShare(chaves, rv.length, (k) => por.get(k)?.length ?? 0).map((status) => {
      const qtd = por.get(status)?.length ?? 0
      return { status, qtd, pct: rv.length ? (qtd / rv.length) * 100 : 0 }
    }),
    valor: int(rv.length),
    sub: `${int(conc)} concluídos · ${int(canc)} cancelados`,
    chips: [],
    apoio: [{ rotulo: 'Concluídos', texto: `${dec(concPct, 1)}%`, atencao: concPct < 75 }],
  }
}

export type CustoFrota = Destaque & { pontos: { rotulo: string; valor: number }[] }

export function custoFrota(ctx: Contexto, manutencoes: Manutencao[], indisponivel: boolean): CustoFrota {
  if (indisponivel) return { pontos: [], valor: '—', sub: 's/dado', chips: [], apoio: [] }
  const fat = soma(ctx.rv)
  const porMes = agrupar(manutencoes, (m) => m.dia.slice(0, 7))
  const meses = [...porMes.keys()].filter(Boolean).sort()
  const custo = manutencoes.reduce((t, m) => t + (m.valor || 0), 0)
  const pctRec = fat > 0 ? (custo / fat) * 100 : 0
  return {
    pontos: meses.map((mes) => ({ rotulo: mesRotulo(mes), valor: (porMes.get(mes) ?? []).reduce((t, m) => t + (m.valor || 0), 0) })),
    valor: brlS(custo),
    sub: `${int(manutencoes.length)} manutenções · ${dec(pctRec, 1)}% da receita`,
    chips: [],
    apoio: [{ rotulo: '% da receita', texto: `${dec(pctRec, 1)}% · ${pctRec <= 10 ? 'OK' : 'Alto'}`, atencao: pctRec > 10 }],
  }
}

export type TopVolume = Destaque & { linhas: { cliente: string; qtd: number; pct: number }[] }

/** Inclui "Sem cliente", como no legado. */
export function topVolume(ctx: Contexto): TopVolume {
  const { rv } = ctx
  const ranked = [...agrupar(rv, (r) => r.cliente)].sort((a, b) => b[1].length - a[1].length)
  const linhas = topByShare(ranked, rv.length, ([, rows]) => rows.length).map(([cliente, rows]) => ({ cliente, qtd: rows.length, pct: rv.length ? (rows.length / rv.length) * 100 : 0 }))
  return { linhas, valor: linhas[0] ? int(linhas[0].qtd) : '—', sub: linhas[0]?.cliente ?? 'Sem serviços no período', chips: [], apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${dec(l.pct, 1)}%` })) }
}

export type TopFaturamento = Destaque & { linhas: { cliente: string; valor: string; ticket: string; pct: number }[] }

export function topFaturamento(ctx: Contexto): TopFaturamento {
  const { rv } = ctx
  const fat = soma(rv)
  const ranked = [...agrupar(rv, (r) => r.cliente)].sort((a, b) => soma(b[1]) - soma(a[1]))
  const top = topByShare(ranked, fat, ([, rows]) => soma(rows))
  const linhas = top.map(([cliente, rows]) => ({ cliente, valor: brl(soma(rows)), ticket: brl(ticketStats(rows).ticket), pct: fat ? (soma(rows) / fat) * 100 : 0 }))
  return { linhas, valor: top[0] ? brlS(soma(top[0][1])) : '—', sub: top[0]?.[0] ?? 'Sem serviços no período', chips: [], apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.cliente} · ${dec(l.pct, 1)}%` })) }
}

export type LinhaMotorista = { key: string; nome: string; meses: { qtd: number; pct: string }[]; total: number; pct: number }
export type ServicosPorMotorista = Destaque & { meses: { mes: string; rotulo: string }[]; linhas: LinhaMotorista[] }

export function servicosPorMotorista(ctx: Contexto): ServicosPorMotorista {
  const { rv, now } = ctx
  const mots = new Map<string, string>()
  for (const r of rv) if (r.motorista !== SEM_MOTORISTA) mots.set(r.motoristaKey, r.motorista)
  const meses = mesesOuAno(rv, now)
  const byM = agrupar(rv, (r) => r.mes)
  const totais = meses.map((mes) => (byM.get(mes) ?? []).length)
  const linhas = [...mots].map(([key, nome]): LinhaMotorista => {
    const porMes = meses.map((mes, i) => {
      const qtd = (byM.get(mes) ?? []).filter((r) => r.motoristaKey === key).length
      return { qtd, pct: totais[i] ? `${dec((qtd / totais[i]) * 100, 1)}%` : '—' }
    })
    const total = porMes.reduce((t, m) => t + m.qtd, 0)
    return { key, nome, meses: porMes, total, pct: rv.length ? (total / rv.length) * 100 : 0 }
  }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
  return {
    meses: meses.map((mes) => ({ mes, rotulo: mesRotulo(mes) })), linhas,
    valor: int(mots.size), sub: `${mots.size ? int(mots.size) : '—'} motoristas ativos`, chips: [],
    apoio: linhas.slice(0, 2).map((l, i) => ({ rotulo: `${i + 1}º`, texto: `${l.nome} · ${dec(l.pct, 1)}%` })),
  }
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/analises.test.ts`
Expected: PASS. Conferências de conta: no teste de qualidade, `semCliente` = 3 porque a linha de março tem `saidaRaw` < `2026-04-01` e não conta, e as reservas de teste sem cliente explícito usam `Sem cliente` (padrão de `reserva()`); ajuste só se a fábrica mudar.

- [ ] **Step 7: Typecheck e commit**

Run: `pnpm --filter @betinhos/shell typecheck` → sem erros.

```bash
git add apps/shell/src/pages/dashboard/domain
git commit -m "Dashboard: alertas, destaques e análises da aba Resumo

Porta os alertas de operação (CNH, multas, ocorrências) e de qualidade
com as datas de corte, os cards de frota e pessoas, a produção própria
× terceirizada com top 5 de motoristas, os serviços emergenciais e as
análises (total produzido em 3 anos, meta × realizado, clientes, ticket
mensal, status, custo da frota, tops e serviços por motorista).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Composição do Resumo

**Files:**
- Create: `apps/shell/src/pages/dashboard/domain/resumo.ts`
- Test: `apps/shell/src/pages/dashboard/domain/resumo.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `type Resumo` e `calcularResumo(dados: Dados, f: Filtros, now: Date): Resumo`.

- [ ] **Step 1: Teste (falha)**

```ts
import { describe, expect, it } from 'vitest'
import { calcularResumo } from './resumo'
import { reserva } from './test-utils'
import type { Dados, Filtros } from './types'

const NOW = new Date('2026-10-15T15:00:00Z')
const f: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const vazio: Dados = { reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] }

describe('calcularResumo', () => {
  it('não quebra sem dados', () => {
    const r = calcularResumo(vazio, f, NOW)
    expect(r.servicos).toBe(0)
    expect(r.kpis).toHaveLength(6)
    expect(r.qualidade.every((a) => a.status === 's/dado')).toBe(true)
  })

  it('filtra secundários pelo período e compõe as seções', () => {
    const dados: Dados = {
      ...vazio,
      reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 500, cliente: 'Tenaris' }), reserva({ saidaRaw: '2026-09-02T12:00:00Z', valor: 900 })],
      manutencoes: [{ dia: '2026-10-03', valor: 100 }, { dia: '2026-09-03', valor: 999 }],
      ocorrencias: [{ dia: '2026-10-05' }, { dia: '2026-08-01' }],
    }
    const r = calcularResumo(dados, f, NOW)
    expect(r.servicos).toBe(1)
    expect(r.custoFrota.valor).toBe('R$ 100,00')
    expect(r.operacao.find((a) => a.id === 'ocorrencias')?.valor).toBe('1')
    expect(r.clientes.linhas[0].cliente).toBe('Tenaris')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/domain/resumo.test.ts` → FAIL.

- [ ] **Step 3: Implementar `resumo.ts`**

```ts
import { alertasOperacao, alertasQualidade, cardsFrotaPessoas, type Secundarios } from './alertas'
import { custoFrota, faturamentoPorCliente, metaRealizado, servicosPorMotorista, statusServicos, ticketMensal, topFaturamento, topVolume, totalProduzido } from './analises'
import { filtrarServicos } from './base'
import { emergenciais, producaoPropriaTerceira } from './destaques'
import { comparacao, kpisExecutivos } from './kpis'
import { entre } from './periodo'
import type { Dados, Filtros } from './types'

export type Resumo = ReturnType<typeof calcularResumo>

/** Tudo que a aba Resumo mostra, calculado de uma vez a partir dos dados carregados e dos filtros. */
export function calcularResumo(dados: Dados, f: Filtros, now: Date) {
  const rv = filtrarServicos(dados.reservas, f)
  const ctx = { todas: dados.reservas, rv, f, now }
  const cmp = comparacao(ctx)
  const nowMs = now.getTime()
  const noPeriodo = <T extends { dia: string }>(rows: T[]) => rows.filter((r) => entre(r.dia, f.inicio, f.fim))
  const sec: Secundarios = { ...dados, manutencoes: noPeriodo(dados.manutencoes), multas: noPeriodo(dados.multas), ocorrencias: noPeriodo(dados.ocorrencias) }
  return {
    servicos: rv.length,
    kpis: kpisExecutivos(ctx, cmp),
    frota: cardsFrotaPessoas(rv, sec, nowMs),
    operacao: alertasOperacao(rv, sec, nowMs),
    qualidade: alertasQualidade(rv, nowMs),
    producao: producaoPropriaTerceira(rv, dados.veiculos),
    emergenciais: emergenciais(rv),
    totalProduzido: totalProduzido(ctx, cmp),
    metaRealizado: metaRealizado(ctx, cmp),
    clientes: faturamentoPorCliente(ctx),
    ticketMensal: ticketMensal(ctx, cmp),
    status: statusServicos(ctx),
    custoFrota: custoFrota(ctx, sec.manutencoes, dados.indisponiveis.includes('manutencoes')),
    topVolume: topVolume(ctx),
    topFaturamento: topFaturamento(ctx),
    motoristas: servicosPorMotorista(ctx),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**; depois `pnpm --filter @betinhos/shell test -- src/pages/dashboard` (todos os testes do domínio) → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/dashboard/domain/resumo.ts apps/shell/src/pages/dashboard/domain/resumo.test.ts
git commit -m "Dashboard: calcularResumo compõe KPIs, alertas, destaques e análises

Junta as regras da aba Resumo numa função pura que recebe os dados
carregados, os filtros e o horário atual, filtra os conjuntos
secundários pelo período e devolve tudo pronto para a tela.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Consultas, Source Dataverse/mock

**Files:**
- Create: `apps/shell/src/pages/dashboard/data/queries.ts`
- Create: `apps/shell/src/pages/dashboard/data/mock.ts`
- Create: `apps/shell/src/pages/dashboard/data/source.ts`
- Test: `apps/shell/src/pages/dashboard/data/data.test.ts`

**Interfaces:**
- Consumes: `Host` (`apps/shell/src/host.ts`), `formatted`, `DataverseClient`, `Row` (`@betinhos/dataverse`), domínio (Tasks 1–3), `reservasCsv2026` (Task 2).
- Produces: `type Source = { mock: boolean; carregar: (desde: string, ate: string) => Promise<Dados> }`, `createSource(host: Host): Source`, `carregarDataverse(client, sets, desde, ate): Promise<Dados>`, `mapReserva`, `mapCps`, `reservasPath`, `ENTITIES`, `criarDadosMock(now: Date): Dados`.

- [ ] **Step 1: Teste (falha)**

```ts
import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { carregarDataverse, createSource } from './source'
import { mapCps, mapReserva, reservasPath } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = { reserva: 'res', composicao: 'cps', manutencao: 'man', multa: 'mul', ocorrencia: 'oco', funcionario: 'fun', veiculo: 'vei' }
const client = (getAll: (path: string) => Promise<Row[]>) => ({ apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() }) as unknown as DataverseClient

describe('consultas do Dashboard', () => {
  it('janela de reservas em Brasília com fim inclusivo', () => {
    const p = reservasPath('res', '2024-01-01', '2026-10-15')
    expect(p).toContain('$expand=cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)')
    expect(decodeURIComponent(p)).toContain('cr40f_dataehorriodesada ge 2024-01-01T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-16T03:00:00.000Z')
  })

  it('mapeia reserva com CP, apelido, cliente e rótulos', () => {
    const cps = mapCps([{ cr40f_composicaodeprecosid: 'CP1', new_valortotal: 850.5, new_status: 100000001 }])
    const r = mapReserva({
      cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', createdon: '2026-10-01T10:00:00Z',
      cr40f_status: 202410008, [`cr40f_status${F}`]: 'Concluído', cr40f_statusdefaturamento: 202410010, [`cr40f_statusdefaturamento${F}`]: 'Pago',
      new_categoriadoitem: 100000000, [`new_categoriadoitem${F}`]: 'Serviço', cr40f_tipodeveiculo: 3, [`cr40f_tipodeveiculo${F}`]: 'Executivo',
      _cr40f_veiculo_value: 'V1', _new_composicaodepreco_value: 'cp1', _cr40f_financeiro_value: 'OP1',
      cr40f_Motorista: { cr40f_funcionariosid: 'M1', cr40f_nomecompleto: 'Carlos Oliveira', new_apelido: 'Oliveira' },
      cr40f_Cliente: { cr40f_nomedocliente: 'Tenaris' },
    }, cps)
    expect(r).toMatchObject({ id: 'r1', dia: '2026-10-02', mes: '2026-10', statusLabel: 'Concluído', fatStatus: 202410010, tipoVeiculo: 'Executivo', tipoVeiculoRaw: '3', veiculoId: 'v1', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Oliveira', cliente: 'Tenaris', valor: 850.5, cpConcluida: true, opId: 'op1' })
    expect(mapReserva({ cr40f_reservadeveculosid: 'R2' }, cps)).toMatchObject({ motorista: 'Sem motorista', motoristaKey: 'nome:sem motorista', cliente: 'Sem cliente', valor: 0, dia: '', statusLabel: 'Sem status' })
  })

  it('reservas e CPs obrigatórias; secundário que falha vira indisponível; CSV entra', async () => {
    const c = client(async (path) => {
      if (path.startsWith('res?')) return [{ cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', new_categoriadoitem: 100000000 }]
      if (path.startsWith('mul?')) throw new Error('sem permissão')
      return []
    })
    const d = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual(['multas'])
    expect(d.reservas.some((r) => r.id === 'r1')).toBe(true)
    expect(d.reservas.some((r) => r.id.startsWith('legacy-2026-'))).toBe(true)
    await expect(carregarDataverse(client(async (p) => { if (p.startsWith('cps?')) throw new Error('falhou'); return [] }), SETS, '2024-01-01', '2026-10-15')).rejects.toThrow('falhou')
  })

  it('mock devolve dados dentro da janela e marca mock', async () => {
    const s = createSource({ mode: 'mock' })
    expect(s.mock).toBe(true)
    const d = await s.carregar('2026-09-01', '2026-09-30')
    const doDataverse = d.reservas.filter((r) => !r.id.startsWith('legacy-'))
    expect(doDataverse.length).toBeGreaterThan(0)
    expect(doDataverse.every((r) => r.dia >= '2026-09-01' && r.dia <= '2026-09-30')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- src/pages/dashboard/data/data.test.ts` → FAIL.

- [ ] **Step 3: Implementar `queries.ts`**

```ts
import { formatted, type Row } from '@betinhos/dataverse'
import { CP_CONCLUIDA, CP_PENDENTE, SEM_CLIENTE, SEM_MOTORISTA, VEICULO_PROPRIO, VEICULO_TERCEIRO } from '../domain/codes'
import { normL } from '../domain/format'
import { DIA_MS, dayKey, inicioMs } from '../domain/periodo'
import type { CategoriaVeiculo, Funcionario, Manutencao, Multa, Ocorrencia, Reserva, Veiculo } from '../domain/types'

export const ENTITIES = {
  reserva: 'cr40f_reservadeveculos', composicao: 'cr40f_composicaodeprecos', manutencao: 'cr40f_manutencoes', multa: 'cr40f_multas',
  ocorrencia: 'cr40f_errooperacional', funcionario: 'cr40f_funcionarios', veiculo: 'cr40f_veiculos',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const lower = (v: unknown) => str(v).toLowerCase()
const asRow = (v: unknown) => (v && typeof v === 'object' ? (v as Row) : null)

const RESERVA_SELECT = [
  'cr40f_reservadeveculosid', 'cr40f_dataehorriodesada', 'createdon', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodoservico',
  'cr40f_tipodeveiculo', '_cr40f_veiculo_value', 'new_categoriadoitem', '_new_composicaodepreco_value', '_cr40f_financeiro_value',
]
const RESERVA_EXPAND = 'cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)'

/** Reservas com saída de `desde` 00:00 até o fim de `ate` em Brasília, na ordem do legado. */
export function reservasPath(set: string, desde: string, ate: string) {
  const filtro = `cr40f_dataehorriodesada ge ${new Date(inicioMs(desde)).toISOString()} and cr40f_dataehorriodesada lt ${new Date(inicioMs(ate) + DIA_MS).toISOString()}`
  return `${set}?$select=${RESERVA_SELECT.join(',')}&$expand=${RESERVA_EXPAND}&$filter=${encodeURIComponent(filtro)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada desc')}`
}
export const composicoesPath = (set: string) => `${set}?$select=cr40f_composicaodeprecosid,new_valortotal,new_status`
export const manutencoesPath = (set: string) => `${set}?$select=cr40f_datamanutencao,cr40f_valor`
export const multasPath = (set: string) => `${set}?$select=cr40f_dataehorario,cr40f_status`
export const ocorrenciasPath = (set: string) => `${set}?$select=cr40f_dataocorrencia`
export const funcionariosPath = (set: string) => `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status,cr40f_validadedacnh`
export const veiculosPath = (set: string) => `${set}?$select=cr40f_veiculosid,cr40f_statusdoveiculo,new_categoriadoveiculo`

export type Cp = { valor: number; pendente: boolean; concluida: boolean }
export function mapCps(rows: Row[]) {
  const map = new Map<string, Cp>()
  for (const p of rows) {
    const id = lower(p.cr40f_composicaodeprecosid)
    if (!id) continue
    const status = num(p.new_status)
    map.set(id, { valor: Number(p.new_valortotal) || 0, pendente: status === CP_PENDENTE, concluida: status === CP_CONCLUIDA })
  }
  return map
}

/** `enrichReservas` do legado para uma linha do Dataverse. */
export function mapReserva(row: Row, cps: Map<string, Cp>): Reserva {
  const saidaRaw = str(row.cr40f_dataehorriodesada)
  const dia = dayKey(saidaRaw)
  const mot = asRow(row.cr40f_Motorista)
  const nome = str(mot?.cr40f_nomecompleto) || SEM_MOTORISTA
  const motorista = str(mot?.new_apelido) || nome
  const motoristaId = lower(mot?.cr40f_funcionariosid)
  const cpId = lower(row._new_composicaodepreco_value)
  const cp = cps.get(cpId)
  return {
    id: lower(row.cr40f_reservadeveculosid), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: str(row.createdon),
    status: num(row.cr40f_status), statusLabel: formatted(row, 'cr40f_status') || 'Sem status',
    fatStatus: num(row.cr40f_statusdefaturamento), fatStatusLabel: formatted(row, 'cr40f_statusdefaturamento') || '—',
    categoriaItem: num(row.new_categoriadoitem), categoriaItemLabel: formatted(row, 'new_categoriadoitem'),
    tipoVeiculoRaw: row.cr40f_tipodeveiculo == null ? '' : String(row.cr40f_tipodeveiculo),
    tipoVeiculo: formatted(row, 'cr40f_tipodeveiculo') || '—',
    veiculoId: lower(row._cr40f_veiculo_value),
    motoristaId, motoristaKey: motoristaId || `nome:${motorista.toLowerCase()}`, motorista,
    cliente: str(asRow(row.cr40f_Cliente)?.cr40f_nomedocliente) || SEM_CLIENTE,
    cpId, valor: cp?.valor ?? 0, cpPendente: cp?.pendente ?? false, cpConcluida: cp?.concluida ?? false,
    opId: lower(row._cr40f_financeiro_value),
  }
}

export const mapManutencao = (row: Row): Manutencao => ({ dia: dayKey(str(row.cr40f_datamanutencao)), valor: Number(row.cr40f_valor) || 0 })
export const mapMulta = (row: Row): Multa => ({ dia: dayKey(str(row.cr40f_dataehorario)), status: num(row.cr40f_status) })
export const mapOcorrencia = (row: Row): Ocorrencia => ({ dia: dayKey(str(row.cr40f_dataocorrencia)) })
export const mapFuncionario = (row: Row): Funcionario => {
  const cnh = str(row.cr40f_validadedacnh)
  return { statusLabel: formatted(row, 'cr40f_status'), cnhMs: cnh ? Date.parse(cnh) : NaN }
}
/** Categoria pelo código ou pelo rótulo, como o legado (L14175–14180). */
export function mapVeiculo(row: Row): Veiculo {
  const raw = row.new_categoriadoveiculo == null ? '' : String(row.new_categoriadoveiculo)
  const label = normL(formatted(row, 'new_categoriadoveiculo'))
  const categoria: CategoriaVeiculo = raw === VEICULO_PROPRIO || label.includes('proprio') ? 'Propria' : raw === VEICULO_TERCEIRO || label.includes('terceiro') ? 'Terceirizada' : ''
  return { id: lower(row.cr40f_veiculosid), statusLabel: formatted(row, 'cr40f_statusdoveiculo'), categoria }
}
```

- [ ] **Step 4: Implementar `mock.ts`**

```ts
import { CAT_ITEM_SERVICO, SEM_CLIENTE, SEM_MOTORISTA } from '../domain/codes'
import { dayKey } from '../domain/periodo'
import type { Dados, Reserva, Veiculo } from '../domain/types'

/** Gerador determinístico (mulberry32): o mock mostra sempre os mesmos números. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLIENTES = ['Tenaris', 'Embraer', 'Particular', 'Vale', 'Natura', 'Itaú BBA', SEM_CLIENTE]
const MOTORISTAS = [
  { id: 'mock-m1', apelido: 'Oliveira' }, { id: 'mock-m2', apelido: 'Fábio' }, { id: 'mock-m3', apelido: 'Renata' },
  { id: 'mock-m4', apelido: 'Marcos' }, { id: 'mock-m5', apelido: 'Juliana' }, { id: 'mock-m6', apelido: 'Paulo' },
]
const VEICULOS: Veiculo[] = [
  { id: 'mock-v1', statusLabel: 'Disponível', categoria: 'Propria' }, { id: 'mock-v2', statusLabel: 'Disponível', categoria: 'Propria' },
  { id: 'mock-v3', statusLabel: 'Em manutenção', categoria: 'Propria' }, { id: 'mock-v4', statusLabel: 'Disponível', categoria: 'Terceirizada' },
  { id: 'mock-v5', statusLabel: 'Disponível', categoria: 'Terceirizada' },
]
const TIPOS = ['Executivo', 'Blindado', 'Van']
const FAT = [
  { code: 202410010, label: 'Pago' }, { code: 202410000, label: 'Pendente' }, { code: 202410008, label: 'Mensal' }, { code: 202410006, label: 'Pagante em viagem' },
]

/** Reservas de jan/2025 até 20 dias à frente, mais conjuntos secundários coerentes. */
export function criarDadosMock(now: Date): Dados {
  const rand = rng(20261008)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const reservas: Reserva[] = []
  const inicio = Date.parse('2025-01-01T12:00:00Z')
  const fim = now.getTime() + 20 * 86_400_000
  let n = 0
  for (let t = inicio; t < fim; t += 86_400_000) {
    const porDia = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < porDia; i++) {
      const saidaMs = t + Math.floor(rand() * 10) * 3_600_000
      const saidaRaw = new Date(saidaMs).toISOString()
      const dia = dayKey(saidaRaw)
      const futuro = saidaMs > now.getTime()
      const cancelado = !futuro && rand() < 0.06
      const status = futuro ? (rand() < 0.5 ? { code: 202410005, label: 'Programado' } : { code: 202410001, label: 'Confirmado' }) : cancelado ? { code: null, label: 'Cancelado' } : { code: 202410008, label: 'Concluído' }
      const mot = rand() < 0.9 ? pick(MOTORISTAS) : null
      const vei = rand() < 0.9 ? pick(VEICULOS) : null
      const temCp = !cancelado && rand() < 0.85
      const concluida = temCp && rand() < 0.8
      const fat = pick(FAT)
      const emergencial = rand() < 0.12
      const criadoRaw = new Date(emergencial ? saidaMs - 2 * 3_600_000 : saidaMs - (2 + Math.floor(rand() * 10)) * 86_400_000).toISOString()
      const motorista = mot?.apelido ?? SEM_MOTORISTA
      n++
      reservas.push({
        id: `mock-${n}`, saidaRaw, saidaMs, dia, mes: dia.slice(0, 7), criadoRaw,
        status: status.code, statusLabel: status.label, fatStatus: fat.code, fatStatusLabel: fat.label,
        categoriaItem: CAT_ITEM_SERVICO, categoriaItemLabel: 'Serviço',
        tipoVeiculoRaw: rand() < 0.95 ? '1' : '', tipoVeiculo: pick(TIPOS),
        veiculoId: vei?.id ?? '', motoristaId: mot?.id ?? '', motoristaKey: mot?.id ?? `nome:${motorista.toLowerCase()}`, motorista,
        cliente: pick(CLIENTES), cpId: temCp ? `mock-cp-${n}` : '', valor: temCp ? Math.round(300 + rand() * 2200) : 0,
        cpPendente: temCp && !concluida, cpConcluida: concluida, opId: concluida && rand() < 0.7 ? `mock-op-${n}` : '',
      })
    }
  }
  const dias = (qtd: number) => Array.from({ length: qtd }, (_, i) => dayKey(new Date(now.getTime() - i * 9 * 86_400_000).toISOString()))
  return {
    reservas,
    manutencoes: dias(40).map((dia) => ({ dia, valor: Math.round(200 + rand() * 3800) })),
    multas: dias(25).map((dia) => ({ dia, status: rand() < 0.3 ? 202410000 : 202410001 })),
    ocorrencias: dias(30).map((dia) => ({ dia })),
    funcionarios: MOTORISTAS.map((_, i) => ({ statusLabel: 'Ativo', cnhMs: now.getTime() + (i * 45 - 20) * 86_400_000 })),
    veiculos: VEICULOS,
    indisponiveis: [],
  }
}
```

- [ ] **Step 5: Implementar `source.ts`**

```ts
import type { DataverseClient, Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import { aplicarCsv2026 } from '../domain/base'
import { entre } from '../domain/periodo'
import type { Conjunto, Dados } from '../domain/types'
import { reservasCsv2026 } from './csv2026'
import { criarDadosMock } from './mock'
import {
  ENTITIES, composicoesPath, funcionariosPath, manutencoesPath, mapCps, mapFuncionario, mapManutencao, mapMulta, mapOcorrencia,
  mapReserva, mapVeiculo, multasPath, ocorrenciasPath, reservasPath, veiculosPath, type EntitySets,
} from './queries'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = { mock: boolean; carregar: (desde: string, ate: string) => Promise<Dados> }

/** Roda as tarefas com no máximo `limite` em paralelo e devolve o resultado de cada uma. */
async function comLimite<T>(tarefas: (() => Promise<T>)[], limite: number) {
  const resultados: PromiseSettledResult<T>[] = new Array(tarefas.length)
  let proxima = 0
  const worker = async () => {
    while (proxima < tarefas.length) {
      const i = proxima++
      try { resultados[i] = { status: 'fulfilled', value: await tarefas[i]() } } catch (reason) { resultados[i] = { status: 'rejected', reason } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, worker))
  return resultados
}

/** Reservas e CPs são obrigatórias; um conjunto secundário que falha vira `indisponiveis`. */
export async function carregarDataverse(client: DataverseClient, sets: EntitySets, desde: string, ate: string): Promise<Dados> {
  const [res, cps, man, mul, oco, fun, vei] = await comLimite<Row[]>([
    () => client.getAll(reservasPath(sets.reserva, desde, ate)),
    () => client.getAll(composicoesPath(sets.composicao)),
    () => client.getAll(manutencoesPath(sets.manutencao)),
    () => client.getAll(multasPath(sets.multa)),
    () => client.getAll(ocorrenciasPath(sets.ocorrencia)),
    () => client.getAll(funcionariosPath(sets.funcionario)),
    () => client.getAll(veiculosPath(sets.veiculo)),
  ], 4)
  if (res.status === 'rejected') throw res.reason
  if (cps.status === 'rejected') throw cps.reason
  const indisponiveis: Conjunto[] = []
  const ler = <T,>(r: PromiseSettledResult<Row[]>, conjunto: Conjunto, map: (row: Row) => T): T[] => {
    if (r.status === 'fulfilled') return r.value.map(map)
    indisponiveis.push(conjunto)
    return []
  }
  const cpMap = mapCps(cps.value)
  return {
    reservas: aplicarCsv2026(res.value.map((row) => mapReserva(row, cpMap)), reservasCsv2026()),
    manutencoes: ler(man, 'manutencoes', mapManutencao),
    multas: ler(mul, 'multas', mapMulta),
    ocorrencias: ler(oco, 'ocorrencias', mapOcorrencia),
    funcionarios: ler(fun, 'funcionarios', mapFuncionario),
    veiculos: ler(vei, 'veiculos', mapVeiculo),
    indisponiveis,
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const base = criarDadosMock(new Date())
  return {
    mock: true,
    async carregar(desde, ate) {
      await wait(300)
      return { ...base, reservas: aplicarCsv2026(base.reservas.filter((r) => entre(r.dia, desde, ate)), reservasCsv2026()) }
    },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities(Object.values(ENTITIES)).then((info) => {
    const get = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return {
      reserva: get(ENTITIES.reserva), composicao: get(ENTITIES.composicao), manutencao: get(ENTITIES.manutencao), multa: get(ENTITIES.multa),
      ocorrencia: get(ENTITIES.ocorrencia), funcionario: get(ENTITIES.funcionario), veiculo: get(ENTITIES.veiculo),
    }
  }).catch((error) => { sets = null; throw error }))
  return { mock: false, carregar: async (desde, ate) => carregarDataverse(host.client, await entitySets(), desde, ate) }
}
```

- [ ] **Step 6: Rodar e ver passar** — `pnpm --filter @betinhos/shell test -- src/pages/dashboard/data/data.test.ts` → PASS; `pnpm --filter @betinhos/shell typecheck` → sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/dashboard/data
git commit -m "Dashboard: consultas ao Dataverse, Source e dados de exemplo

Consulta as reservas pela janela de datas em Brasília com motorista e
cliente expandidos, todas as composições de preço (como o legado) e os
conjuntos secundários com no máximo 4 requisições em paralelo. Falha em
conjunto secundário vira indisponível sem derrubar a tela. O mock gera
dados determinísticos e também recebe o CSV de jan–mar/2026.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hook `useDashboard` com atualização real

**Files:**
- Create: `apps/shell/src/pages/dashboard/useDashboard.ts`
- Test: `apps/shell/src/pages/dashboard/useDashboard.test.ts`

**Interfaces:**
- Consumes: `Source` (Task 6), `Dados`.
- Produces: `INTERVALO_MS = 60_000`; `useDashboard(source, desde, ate): { dados: Dados | null; carregando: boolean; erro: string | null; atualizadoEm: Date | null; atualizar: () => Promise<void> }`. `dados` é `null` enquanto a janela pedida ainda não chegou (troca de período mostra skeleton); numa recarga da mesma janela os dados anteriores ficam.

- [ ] **Step 1: Teste (falha)**

```ts
// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { INTERVALO_MS, useDashboard } from './useDashboard'
import type { Source } from './data/source'
import type { Dados } from './domain/types'

const dados = (n: number): Dados => ({ reservas: [], manutencoes: Array.from({ length: n }, () => ({ dia: '2026-10-01', valor: 1 })), multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] })
const fonte = (impl: Source['carregar']): Source => ({ mock: true, carregar: vi.fn(impl) })
const visibilidade = (estado: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true })

afterEach(() => { vi.useRealTimers(); visibilidade('visible') })

describe('useDashboard', () => {
  it('carrega e refaz a consulta a cada 60 s só com a aba visível', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let n = 0
    const s = fonte(async () => dados(++n))
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await waitFor(() => expect(result.current.dados?.manutencoes).toHaveLength(1))
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    await waitFor(() => expect(result.current.dados?.manutencoes).toHaveLength(2))
    visibilidade('hidden')
    await act(async () => { vi.advanceTimersByTime(INTERVALO_MS) })
    expect(s.carregar).toHaveBeenCalledTimes(2)
  })

  it('resposta antiga não sobrescreve a nova e troca de janela zera os dados', async () => {
    const pendentes: ((d: Dados) => void)[] = []
    const s = fonte(() => new Promise<Dados>((resolve) => pendentes.push(resolve)))
    const { result, rerender } = renderHook(({ ate }) => useDashboard(s, '2024-01-01', ate), { initialProps: { ate: '2026-10-15' } })
    rerender({ ate: '2026-09-30' })
    expect(result.current.dados).toBeNull()
    await act(async () => { pendentes[1](dados(5)) })
    await act(async () => { pendentes[0](dados(9)) })
    expect(result.current.dados?.manutencoes).toHaveLength(5)
  })

  it('erro mantém a mensagem e permite tentar de novo', async () => {
    let falhar = true
    const s = fonte(async () => { if (falhar) throw new Error('Sem conexão'); return dados(1) })
    const { result } = renderHook(() => useDashboard(s, '2024-01-01', '2026-10-15'))
    await waitFor(() => expect(result.current.erro).toBe('Sem conexão'))
    falhar = false
    await act(async () => { await result.current.atualizar() })
    expect(result.current.erro).toBeNull()
    expect(result.current.dados).not.toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- src/pages/dashboard/useDashboard.test.ts` → FAIL.

- [ ] **Step 3: Implementar `useDashboard.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Dados } from './domain/types'

export const INTERVALO_MS = 60_000

type Estado = { chave: string; dados: Dados | null; carregando: boolean; erro: string | null; atualizadoEm: Date | null }
const mensagem = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga por janela, recarga a cada 60 s com a aba visível e proteção contra resposta fora de ordem. */
export function useDashboard(source: Source, desde: string, ate: string) {
  const chave = `${desde}|${ate}`
  const [estado, setEstado] = useState<Estado>({ chave: '', dados: null, carregando: true, erro: null, atualizadoEm: null })
  const token = useRef(0)
  const ultima = useRef(0)

  const atualizar = useCallback(async () => {
    const atual = ++token.current
    setEstado((s) => ({ ...s, carregando: true, erro: null }))
    try {
      const dados = await source.carregar(desde, ate)
      if (atual !== token.current) return
      ultima.current = Date.now()
      setEstado({ chave, dados, carregando: false, erro: null, atualizadoEm: new Date() })
    } catch (reason) {
      if (atual !== token.current) return
      setEstado((s) => ({ ...s, carregando: false, erro: mensagem(reason) }))
    }
  }, [source, desde, ate, chave])

  useEffect(() => { void atualizar() }, [atualizar])

  useEffect(() => {
    const visivel = () => document.visibilityState === 'visible'
    const id = window.setInterval(() => { if (visivel()) void atualizar() }, INTERVALO_MS)
    const aoVoltar = () => { if (visivel() && Date.now() - ultima.current >= INTERVALO_MS) void atualizar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [atualizar])

  return { dados: estado.chave === chave ? estado.dados : null, carregando: estado.carregando, erro: estado.erro, atualizadoEm: estado.atualizadoEm, atualizar }
}
```

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/shell/src/pages/dashboard/useDashboard.ts apps/shell/src/pages/dashboard/useDashboard.test.ts
git commit -m "Dashboard: hook de carga com atualização real a cada 60 s

Diferente do legado, a atualização automática refaz a consulta ao
Dataverse, só com a aba visível, e recarrega ao voltar para a aba depois
de um minuto. Respostas fora de ordem são descartadas e a troca de
período não mostra dados da janela anterior.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Gráficos e componentes

**Files:**
- Create: `apps/shell/src/pages/dashboard/charts/tokens.ts`, `charts/Charts.tsx`
- Create: `apps/shell/src/pages/dashboard/components/KpiChip.tsx`, `KpiGrid.tsx`, `AlertList.tsx`, `FrotaPessoas.tsx`, `ProducaoPropriaTerceira.tsx`, `Emergenciais.tsx`, `AnaliseCard.tsx`, `Analises.tsx`, `DashboardToolbar.tsx`
- Test: `apps/shell/src/pages/dashboard/components/components.test.tsx`

**Interfaces:**
- Consumes: `Resumo` (Task 5), `OpcoesFiltro`, `atalho` (Tasks 1 e 3), `@betinhos/ui` (`MetricCard`, `Surface`, `Table`, `StatusBadge`, `Button`, `Select`, `Input`, `PageToolbar`), `recharts`.
- Produces: `KpiGrid({ kpis, carregando })`, `KPI_PLACEHOLDER: Kpi[]`, `AlertList({ titulo, itens })`, `FrotaPessoas({ cards })`, `ProducaoPropriaTerceira({ dados, periodo })`, `Emergenciais({ dados, periodo })`, `Analises({ resumo, periodo })`, `DashboardToolbar({ filtros, opcoes, now, onChange })`. `periodo` é o texto "01/10/2026 a 15/10/2026".

- [ ] **Step 1: `charts/tokens.ts`**

```ts
/** Cores dos gráficos lidas dos tokens do Design System; o valor reserva é o mesmo do design-tokens.css. */
const TOKENS = {
  action: ['--bt-color-action', '#2159d2'],
  brand: ['--bt-color-brand', '#001a3d'],
  secondary: ['--bt-color-text-secondary', '#64748b'],
  border: ['--bt-color-border', '#e2e8f0'],
} as const
export type CorToken = keyof typeof TOKENS

export function cor(token: CorToken) {
  const [variavel, reserva] = TOKENS[token]
  if (typeof document === 'undefined') return reserva
  return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim() || reserva
}
```

- [ ] **Step 2: `charts/Charts.tsx`**

```tsx
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cor, type CorToken } from './tokens'

export type Serie = { chave: string; nome: string; cor: CorToken; tracejada?: boolean }
type Ponto = Record<string, string | number | null>
type Base = { dados: Ponto[]; formatar: (v: number) => string; altura?: number; descricao: string }

const eixo = () => ({ tick: { fill: cor('secondary'), fontSize: 11 }, stroke: cor('border'), tickLine: false })

/** Linhas com grade horizontal, tooltip e legenda; sem animação (recarga a cada 60 s). */
export function LinhaChart({ dados, series, formatar, altura = 240, descricao }: Base & { series: Serie[] }) {
  return (
    <figure className="dash-chart" style={{ height: altura }} aria-label={descricao}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={cor('border')} vertical={false} />
          <XAxis dataKey="rotulo" {...eixo()} />
          <YAxis {...eixo()} width={72} tickFormatter={(v) => formatar(Number(v))} />
          <Tooltip formatter={(v) => formatar(Number(v))} />
          {series.length > 1 ? <Legend /> : null}
          {series.map((s) => (
            <Line key={s.chave} type="monotone" dataKey={s.chave} name={s.nome} stroke={cor(s.cor)} strokeWidth={2} strokeDasharray={s.tracejada ? '4 3' : undefined} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}

export function BarraChart({ dados, formatar, altura = 240, descricao, nome }: Base & { nome: string }) {
  return (
    <figure className="dash-chart" style={{ height: altura }} aria-label={descricao}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={cor('border')} vertical={false} />
          <XAxis dataKey="rotulo" {...eixo()} />
          <YAxis {...eixo()} width={72} tickFormatter={(v) => formatar(Number(v))} />
          <Tooltip formatter={(v) => formatar(Number(v))} />
          <Bar dataKey="valor" name={nome} fill={cor('action')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

/** Tendência dos últimos meses no card de KPI; decorativa, o valor está no card. */
export function Sparkline({ dados }: { dados: Ponto[] }) {
  return (
    <div className="dash-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="valor" stroke={cor('action')} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: `KpiChip.tsx`, `KpiGrid.tsx`**

```tsx
// KpiChip.tsx
import { StatusBadge } from '@betinhos/ui'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { dec } from '../domain/format'
import type { Apoio, Chip } from '../domain/types'

/** Comparativo LM/LY: seta + sinal + texto, nunca só cor. */
export function KpiChip({ chip }: { chip: Chip }) {
  if (chip.tipo === 'sem-dado') return <StatusBadge tone="neutral">{chip.rotulo} s/dado</StatusBadge>
  const sobe = chip.variacao >= 0
  return (
    <StatusBadge tone={sobe ? 'success' : 'danger'} icon={sobe ? <TrendingUp size={14} /> : <TrendingDown size={14} />}>
      {chip.rotulo} {chip.anterior} {sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%
    </StatusBadge>
  )
}

export function ApoioTexto({ apoio }: { apoio: Apoio }) {
  return (
    <span className={apoio.atencao ? 'dash-apoio dash-apoio--atencao' : 'dash-apoio'}>
      <span className="dash-apoio__rotulo">{apoio.rotulo}</span> {apoio.texto}
    </span>
  )
}
```

```tsx
// KpiGrid.tsx
import type { ReactNode } from 'react'
import { MetricCard } from '@betinhos/ui'
import { Calculator, CarFront, Clock, Receipt, Wallet, CircleCheck } from 'lucide-react'
import { Sparkline } from '../charts/Charts'
import type { Kpi, KpiId } from '../domain/types'
import { ApoioTexto, KpiChip } from './KpiChip'

const ICONES: Record<KpiId, ReactNode> = {
  faturamento: <Wallet size={20} />, servicos: <CarFront size={20} />, ticket: <Receipt size={20} />,
  aReceber: <Clock size={20} />, cpPendente: <Calculator size={20} />, recebimento: <CircleCheck size={20} />,
}
const ROTULOS: [KpiId, string][] = [['faturamento', 'Faturamento'], ['servicos', 'Serviços'], ['ticket', 'Ticket médio'], ['aReceber', 'A receber'], ['cpPendente', 'CP pendente'], ['recebimento', 'Recebimento']]
/** Cards vazios para o skeleton da primeira carga. */
export const KPI_PLACEHOLDER: Kpi[] = ROTULOS.map(([id, rotulo]) => ({ id, rotulo, valor: '—', chips: [], apoio: [], serie: [] }))

export function KpiGrid({ kpis, carregando }: { kpis: Kpi[]; carregando: boolean }) {
  return (
    <section className="dash-kpis" aria-label="Indicadores executivos">
      {kpis.map((k) => (
        <div key={k.id} className="dash-kpi">
          <MetricCard
            icon={ICONES[k.id]}
            label={k.rotulo}
            value={k.valor}
            loading={carregando}
            hint={<span className="dash-kpi__hint">{k.chips.map((c) => <KpiChip key={c.rotulo} chip={c} />)}{k.apoio.map((a) => <ApoioTexto key={a.rotulo} apoio={a} />)}</span>}
          />
          {k.serie.length ? <Sparkline dados={k.serie} /> : null}
        </div>
      ))}
    </section>
  )
}
```

Se algum ícone não existir na versão instalada do `lucide-react` (o typecheck acusa), troque por um equivalente que exista (ex.: `CheckCircle2`, `Car`).

- [ ] **Step 4: `AlertList.tsx`, `FrotaPessoas.tsx`**

```tsx
// AlertList.tsx
import { StatusBadge, Surface, type StatusTone } from '@betinhos/ui'
import type { AlertaItem, Tom } from '../domain/types'

const TOM: Record<Tom, { tone: StatusTone; texto: string }> = { ok: { tone: 'success', texto: 'OK' }, warn: { tone: 'warning', texto: 'Atenção' }, danger: { tone: 'danger', texto: 'Atenção' } }

export function AlertList({ titulo, itens }: { titulo: string; itens: AlertaItem[] }) {
  return (
    <Surface title={titulo} compact className="dash-alertas">
      <ul className="dash-alertas__lista">
        {itens.map((a) => (
          <li key={a.id} className="dash-alerta">
            <strong className="dash-alerta__valor">{a.valor}</strong>
            <span className="dash-alerta__texto"><span className="dash-alerta__rotulo">{a.rotulo}</span><span className="dash-alerta__status">{a.status}</span></span>
            <StatusBadge tone={TOM[a.tom].tone}>{TOM[a.tom].texto}</StatusBadge>
          </li>
        ))}
      </ul>
    </Surface>
  )
}
```

```tsx
// FrotaPessoas.tsx
import { MetricCard } from '@betinhos/ui'
import type { CardSecundario } from '../domain/types'

export function FrotaPessoas({ cards }: { cards: CardSecundario[] }) {
  return (
    <section className="dash-frota" aria-label="Frota e pessoas">
      {cards.map((c) => <MetricCard key={c.id} label={c.rotulo} value={c.valor} tone={c.atencao ? 'warning' : 'info'} hint={c.apoio} />)}
    </section>
  )
}
```

- [ ] **Step 5: `AnaliseCard.tsx`**

```tsx
import { useState, type ReactNode } from 'react'
import { Button, Surface } from '@betinhos/ui'
import type { Apoio, Chip } from '../domain/types'
import { ApoioTexto, KpiChip } from './KpiChip'

type Props = { titulo: string; periodo: string; unidade: string; valor: string; sub?: string; chips?: Chip[]; apoio?: Apoio[]; grafico?: ReactNode; tabela: ReactNode }

/** Card de análise do DS §10.16: título, período, unidade, gráfico e alternativa em tabela. */
export function AnaliseCard({ titulo, periodo, unidade, valor, sub, chips = [], apoio = [], grafico, tabela }: Props) {
  const [verTabela, setVerTabela] = useState(!grafico)
  return (
    <Surface
      className="dash-analise"
      eyebrow={`${periodo} · ${unidade}`}
      title={titulo}
      action={grafico ? <Button variant="ghost" size="compact" aria-pressed={verTabela} onClick={() => setVerTabela((v) => !v)}>{verTabela ? 'Ver gráfico' : 'Ver tabela'}</Button> : undefined}
    >
      <div className="dash-analise__topo">
        <strong className="dash-analise__valor">{valor}</strong>
        {sub ? <span className="dash-analise__sub">{sub}</span> : null}
        {chips.length || apoio.length ? <span className="dash-chips">{chips.map((c) => <KpiChip key={c.rotulo} chip={c} />)}{apoio.map((a) => <ApoioTexto key={a.rotulo} apoio={a} />)}</span> : null}
      </div>
      {verTabela || !grafico ? tabela : grafico}
    </Surface>
  )
}
```

- [ ] **Step 6: `ProducaoPropriaTerceira.tsx`, `Emergenciais.tsx`**

```tsx
// ProducaoPropriaTerceira.tsx
import { Table } from '@betinhos/ui'
import { LinhaChart } from '../charts/Charts'
import type { ProducaoPT, TopMotorista } from '../domain/destaques'
import { brl, int } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'

function Top({ titulo, rows }: { titulo: string; rows: TopMotorista[] }) {
  return (
    <div className="dash-top">
      <h3 className="dash-top__titulo">{titulo}</h3>
      <Table
        columns={[
          { key: 'nome', header: 'Motorista', cell: (r: TopMotorista) => r.nome },
          { key: 'qtd', header: 'Serviços', align: 'end', cell: (r: TopMotorista) => int(r.qtd) },
          { key: 'fat', header: 'Faturamento', align: 'end', cell: (r: TopMotorista) => brl(r.fat) },
        ]}
        rows={rows}
        rowKey={(r) => r.nome}
        empty="Nenhum serviço no período."
      />
    </div>
  )
}

export function ProducaoPropriaTerceira({ dados, periodo }: { dados: ProducaoPT; periodo: string }) {
  const tabela = <div className="dash-tops"><Top titulo="Top 5 motoristas próprios" rows={dados.topPropria} /><Top titulo="Top 5 motoristas terceirizados" rows={dados.topTerceirizada} /></div>
  return (
    <AnaliseCard
      titulo="Produção própria × terceirizada"
      periodo={periodo}
      unidade="serviços por mês"
      valor={int(dados.classificados)}
      sub="serviços com veículo classificado"
      grafico={<>
        <LinhaChart descricao="Serviços por mês com veículo próprio e terceirizado" formatar={int} dados={dados.meses.map((m) => ({ rotulo: m.rotulo, propria: m.propria, terceirizada: m.terceirizada }))} series={[{ chave: 'propria', nome: 'Própria', cor: 'action' }, { chave: 'terceirizada', nome: 'Terceirizada', cor: 'brand' }]} />
        {tabela}
      </>}
      tabela={<>
        <Table columns={[{ key: 'm', header: 'Mês', cell: (m: ProducaoPT['meses'][number]) => m.rotulo }, { key: 'p', header: 'Própria', align: 'end', cell: (m: ProducaoPT['meses'][number]) => int(m.propria) }, { key: 't', header: 'Terceirizada', align: 'end', cell: (m: ProducaoPT['meses'][number]) => int(m.terceirizada) }]} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço com veículo classificado." />
        {tabela}
      </>}
    />
  )
}
```

```tsx
// Emergenciais.tsx
import { Table } from '@betinhos/ui'
import type { Emergenciais as Dados } from '../domain/destaques'
import { dec, int } from '../domain/format'
import { AnaliseCard } from './AnaliseCard'

type Mes = Dados['meses'][number]
const posicao = (i: number) => ({ key: `c${i}`, header: `${i + 1}º cliente`, hideBelow: i >= 2 ? ('mobile' as const) : undefined, cell: (m: Mes) => (m.ranking[i] ? `${m.ranking[i].cliente} · ${int(m.ranking[i].qtd)}` : '—') })

export function Emergenciais({ dados, periodo }: { dados: Dados; periodo: string }) {
  return (
    <AnaliseCard
      titulo="Serviços emergenciais"
      periodo={periodo}
      unidade="pedidos no mesmo dia da saída"
      valor={int(dados.total)}
      sub={`de ${int(dados.de)} serviços · ${dec(dados.percentual, 1)}%`}
      apoio={dados.top3.map((t, i) => ({ rotulo: `${i + 1}º`, texto: `${t.cliente} · ${dec(t.percentual, 1)}% · ${int(t.qtd)}` }))}
      tabela={<Table columns={[{ key: 'mes', header: 'Mês', cell: (m: Mes) => m.rotulo }, ...[0, 1, 2, 3, 4].map(posicao)]} rows={dados.meses} rowKey={(m) => m.mes} empty="Nenhum serviço emergencial no período." />}
    />
  )
}
```

- [ ] **Step 7: `Analises.tsx`**

```tsx
import { Progress, Table } from '@betinhos/ui'
import { BarraChart, LinhaChart } from '../charts/Charts'
import type { Delta, LinhaCliente, LinhaMeta, LinhaMotorista } from '../domain/analises'
import { brl, brlS, dec, int } from '../domain/format'
import type { Resumo } from '../domain/resumo'
import { AnaliseCard } from './AnaliseCard'

const delta = (d: Delta) => (d.tipo === 'novo' ? 'Novo' : d.tipo === 'nada' ? '—' : `${d.valor > 0 ? '+' : ''}${dec(d.valor, 1)}%`)
const pct = (v: number) => `${dec(v, 1)}%`

export function Analises({ resumo, periodo }: { resumo: Resumo; periodo: string }) {
  const { totalProduzido: tp, metaRealizado: mr, clientes, ticketMensal: tm, status, custoFrota: cf, topVolume: tv, topFaturamento: tf, motoristas } = resumo
  const anos = tp.anos.map(String)
  return (
    <section className="dash-analises" aria-label="Análises">
      <AnaliseCard
        titulo="Total produzido" periodo={periodo} unidade="R$ por mês" valor={tp.valor} sub={tp.sub} chips={tp.chips} apoio={tp.apoio}
        grafico={<LinhaChart descricao={`Faturamento mensal de ${anos.join(', ')}`} formatar={brlS} dados={tp.pontos.map((p) => ({ rotulo: p.rotulo, [anos[0]]: p.valores[0], [anos[1]]: p.valores[1], [anos[2]]: p.valores[2] }))} series={[{ chave: anos[0], nome: anos[0], cor: 'secondary', tracejada: true }, { chave: anos[1], nome: anos[1], cor: 'brand' }, { chave: anos[2], nome: anos[2], cor: 'action' }]} />}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof tp.pontos)[number]) => p.rotulo }, ...anos.map((a, i) => ({ key: a, header: a, align: 'end' as const, cell: (p: (typeof tp.pontos)[number]) => (p.valores[i] == null ? '—' : brl(p.valores[i])) }))]} rows={tp.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Meta × realizado" periodo={periodo} unidade="R$ por mês" valor={mr.valor} sub={mr.sub} chips={mr.chips} apoio={mr.apoio}
        tabela={<Table columns={[
          { key: 'm', header: 'Mês', cell: (l: LinhaMeta) => l.rotulo },
          { key: 'meta', header: 'Meta', align: 'end', cell: (l: LinhaMeta) => brl(l.meta) },
          { key: 'real', header: 'Realizado', align: 'end', cell: (l: LinhaMeta) => brl(l.real) },
          { key: 'pct', header: 'Atingimento', cell: (l: LinhaMeta) => <Progress value={Math.min(100, l.pct)} label={pct(l.pct)} tone={l.tom} /> },
        ]} rows={mr.linhas} rowKey={(l) => l.mes} />}
      />
      <AnaliseCard
        titulo="Faturamento por cliente" periodo={periodo} unidade="R$" valor={clientes.valor} sub={clientes.sub} apoio={clientes.apoio}
        tabela={<Table columns={[
          { key: 'c', header: 'Cliente', cell: (l: LinhaCliente) => l.cliente },
          ...clientes.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, hideBelow: 'compact' as const, cell: (l: LinhaCliente) => `${brlS(l.meses[i].valor)} · ${delta(l.meses[i].delta)}` })),
          { key: 't', header: 'Total', align: 'end', cell: (l: LinhaCliente) => brlS(l.total) },
          { key: 'p', header: 'Participação', align: 'end', cell: (l: LinhaCliente) => pct(l.participacao) },
        ]} rows={clientes.linhas} rowKey={(l) => l.cliente} empty="Nenhum cliente com faturamento no período." />}
      />
      <AnaliseCard
        titulo="Ticket médio mensal" periodo={periodo} unidade="R$ por serviço" valor={tm.valor} sub={tm.sub} chips={tm.chips}
        grafico={<BarraChart descricao="Ticket médio por mês" nome="Ticket médio" formatar={brlS} dados={tm.pontos} />}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof tm.pontos)[number]) => p.rotulo }, { key: 'v', header: 'Ticket médio', align: 'end', cell: (p: (typeof tm.pontos)[number]) => (p.valor == null ? '—' : brl(p.valor)) }]} rows={tm.pontos} rowKey={(p) => p.rotulo} />}
      />
      <AnaliseCard
        titulo="Status dos serviços" periodo={periodo} unidade="serviços" valor={status.valor} sub={status.sub} apoio={status.apoio}
        tabela={<Table columns={[{ key: 's', header: 'Status', cell: (l: (typeof status.linhas)[number]) => l.status }, { key: 'q', header: 'Serviços', align: 'end', cell: (l: (typeof status.linhas)[number]) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof status.linhas)[number]) => pct(l.pct) }]} rows={status.linhas} rowKey={(l) => l.status} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Custo da frota" periodo={periodo} unidade="R$ em manutenções" valor={cf.valor} sub={cf.sub} apoio={cf.apoio}
        grafico={cf.pontos.length ? <BarraChart descricao="Custo de manutenção por mês" nome="Custo" formatar={brlS} dados={cf.pontos} /> : undefined}
        tabela={<Table columns={[{ key: 'm', header: 'Mês', cell: (p: (typeof cf.pontos)[number]) => p.rotulo }, { key: 'v', header: 'Custo', align: 'end', cell: (p: (typeof cf.pontos)[number]) => brl(p.valor) }]} rows={cf.pontos} rowKey={(p) => p.rotulo} empty="Nenhuma manutenção no período." />}
      />
      <AnaliseCard
        titulo="Clientes por volume" periodo={periodo} unidade="serviços" valor={tv.valor} sub={tv.sub} apoio={tv.apoio}
        tabela={<Table columns={[{ key: 'c', header: 'Cliente', cell: (l: (typeof tv.linhas)[number]) => l.cliente }, { key: 'q', header: 'Serviços', align: 'end', cell: (l: (typeof tv.linhas)[number]) => int(l.qtd) }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof tv.linhas)[number]) => pct(l.pct) }]} rows={tv.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Clientes por faturamento" periodo={periodo} unidade="R$" valor={tf.valor} sub={tf.sub} apoio={tf.apoio}
        tabela={<Table columns={[{ key: 'c', header: 'Cliente', cell: (l: (typeof tf.linhas)[number]) => l.cliente }, { key: 'v', header: 'Faturamento', align: 'end', cell: (l: (typeof tf.linhas)[number]) => l.valor }, { key: 't', header: 'Ticket médio', align: 'end', hideBelow: 'mobile', cell: (l: (typeof tf.linhas)[number]) => l.ticket }, { key: 'p', header: 'Participação', align: 'end', cell: (l: (typeof tf.linhas)[number]) => pct(l.pct) }]} rows={tf.linhas} rowKey={(l) => l.cliente} empty="Nenhum serviço no período." />}
      />
      <AnaliseCard
        titulo="Serviços por motorista" periodo={periodo} unidade="serviços" valor={motoristas.valor} sub={motoristas.sub} apoio={motoristas.apoio}
        tabela={<Table columns={[
          { key: 'n', header: 'Motorista', cell: (l: LinhaMotorista) => l.nome },
          ...motoristas.meses.map((m, i) => ({ key: m.mes, header: m.rotulo, align: 'end' as const, hideBelow: 'compact' as const, cell: (l: LinhaMotorista) => `${int(l.meses[i].qtd)} · ${l.meses[i].pct}` })),
          { key: 't', header: 'Total', align: 'end', cell: (l: LinhaMotorista) => int(l.total) },
          { key: 'p', header: 'Participação', align: 'end', cell: (l: LinhaMotorista) => pct(l.pct) },
        ]} rows={motoristas.linhas} rowKey={(l) => l.key} empty="Nenhum motorista no período." />}
      />
    </section>
  )
}
```

Confira a API de `Progress` em `packages/ui/src/components/Misc.tsx` (`ProgressProps`). Se não aceitar `tone`/`label`, mostre o percentual como texto e omita a barra; não crie CSS de barra própria.

- [ ] **Step 8: `DashboardToolbar.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Button, Input, PageToolbar, Select } from '@betinhos/ui'
import { X } from 'lucide-react'
import type { OpcoesFiltro } from '../domain/base'
import { atalho } from '../domain/periodo'
import type { Atalho, Filtros } from '../domain/types'

const ATALHOS: { value: Atalho; label: string }[] = [
  { value: 'hoje', label: 'Hoje' }, { value: 'ult7', label: 'Últimos 7 dias' }, { value: 'ult30', label: 'Últimos 30 dias' },
  { value: 'esteMes', label: 'Este mês' }, { value: 'mesAnt', label: 'Mês anterior' }, { value: 'esteAno', label: 'Este ano' },
  { value: 'anoAnt', label: 'Ano anterior' }, { value: 'personalizado', label: 'Personalizado' },
]
const DATA = /^\d{4}-\d{2}-\d{2}$/

type Props = { filtros: Filtros; opcoes: OpcoesFiltro; now: Date; onChange: (f: Filtros) => void }

export function DashboardToolbar({ filtros, opcoes, now, onChange }: Props) {
  const [rascunho, setRascunho] = useState({ inicio: filtros.inicio, fim: filtros.fim })
  useEffect(() => setRascunho({ inicio: filtros.inicio, fim: filtros.fim }), [filtros.inicio, filtros.fim])
  const invalido = rascunho.inicio > rascunho.fim
  const datas = (proximo: { inicio: string; fim: string }) => {
    setRascunho(proximo)
    if (DATA.test(proximo.inicio) && DATA.test(proximo.fim) && proximo.inicio <= proximo.fim) onChange({ ...filtros, ...proximo })
  }
  const segmentos = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length
  return (
    <PageToolbar
      variant="filters"
      label="Filtros do dashboard"
      start={<>
        <Select aria-label="Período" searchable={false} clearable={false} options={ATALHOS} value={filtros.atalho}
          onChange={(v) => { const a = (v ?? 'esteAno') as Atalho; onChange(a === 'personalizado' ? { ...filtros, atalho: a } : { ...filtros, atalho: a, ...atalho(a, now) }) }} />
        {filtros.atalho === 'personalizado' ? <>
          <Input type="date" aria-label="Início" value={rascunho.inicio} invalid={invalido} onChange={(e) => datas({ ...rascunho, inicio: e.target.value })} />
          <Input type="date" aria-label="Fim" value={rascunho.fim} invalid={invalido} onChange={(e) => datas({ ...rascunho, fim: e.target.value })} />
          {invalido ? <span className="dash-erro" role="alert">O início precisa ser antes do fim.</span> : null}
        </> : null}
        <Select multiple aria-label="Status" placeholder="Status" searchable={false} options={opcoes.status} value={filtros.status} onChange={(v) => onChange({ ...filtros, status: v })} />
        <Select multiple aria-label="Cliente" placeholder="Cliente" options={opcoes.clientes} value={filtros.clientes} onChange={(v) => onChange({ ...filtros, clientes: v })} />
        <Select multiple aria-label="Motorista" placeholder="Motorista" options={opcoes.motoristas} value={filtros.motoristas} onChange={(v) => onChange({ ...filtros, motoristas: v })} />
        <Select multiple aria-label="Tipo de veículo" placeholder="Tipo de veículo" searchable={false} options={opcoes.tipos} value={filtros.tipos} onChange={(v) => onChange({ ...filtros, tipos: v })} />
      </>}
      end={segmentos ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange({ ...filtros, status: [], clientes: [], motoristas: [], tipos: [] })}>Limpar filtros</Button> : undefined}
    />
  )
}
```

Confira em `Field.tsx` o nome da prop de estado inválido em `ControlStyle` (`invalid`). Se for outra, use a do componente.

- [ ] **Step 9: Teste dos componentes**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlertList } from './AlertList'
import { AnaliseCard } from './AnaliseCard'
import { KpiChip } from './KpiChip'

afterEach(cleanup)

describe('componentes do Dashboard', () => {
  it('chip mostra seta, sinal e texto', () => {
    render(<KpiChip chip={{ rotulo: 'LM', tipo: 'valor', anterior: 'R$ 2,0k', variacao: -12.34 }} />)
    expect(screen.getByText(/LM R\$ 2,0k −12,3%/)).toBeTruthy()
  })

  it('alerta tem status em texto, não só cor', () => {
    render(<AlertList titulo="Operação" itens={[{ id: 'cnh', valor: '2', rotulo: 'CNH', status: 'Atenção', tom: 'danger' }]} />)
    expect(screen.getByText('CNH')).toBeTruthy()
    expect(screen.getAllByText('Atenção').length).toBeGreaterThan(0)
  })

  it('card de análise alterna entre gráfico e tabela', () => {
    render(<AnaliseCard titulo="Custo" periodo="01/10/2026 a 15/10/2026" unidade="R$" valor="R$ 10,00" grafico={<p>grafico</p>} tabela={<p>tabela</p>} />)
    expect(screen.getByText('grafico')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver tabela' }))
    expect(screen.getByText('tabela')).toBeTruthy()
  })
})
```

Run: `pnpm --filter @betinhos/shell test -- src/pages/dashboard/components` → PASS; `pnpm --filter @betinhos/shell typecheck` → sem erros.

- [ ] **Step 10: Commit**

```bash
git add apps/shell/src/pages/dashboard/charts apps/shell/src/pages/dashboard/components
git commit -m "Dashboard: gráficos Recharts com tokens e componentes da aba Resumo

Wrappers de linha, barra e sparkline com cores lidas dos tokens do
Design System, chips LM/LY com seta e texto, lista de alertas com selo,
cards de frota e pessoas, produção própria × terceirizada, emergenciais,
cards de análise com alternativa em tabela e a barra de filtros.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Página, estilos, rota e menu

**Files:**
- Create: `apps/shell/src/pages/dashboard/DashboardPage.tsx`, `dashboard.css`, `DashboardPage.test.tsx`
- Modify: `apps/shell/src/nav/menu.ts` (tipo `page` e item), `apps/shell/src/nav/menu.test.ts`, `apps/shell/src/app/RouteLayout.tsx`, `apps/shell/src/app/AppShell.tsx` (ícone)

**Interfaces:**
- Consumes: tudo das Tasks 1–8; `PageLayout`, `useMedia` (`../operacional/useMedia`), `useShellHeader`.
- Produces: `DashboardPage({ host })`, rota `#/dashboard`.

- [ ] **Step 1: Teste da página (falha)**

```tsx
// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { atalho } from './domain/periodo'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Dashboard', () => {
  it('abre no mock com "Este ano" e mostra as seções', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Dados de exemplo')).toBeTruthy()
    const kpis = await screen.findByRole('region', { name: 'Indicadores executivos' })
    expect(within(kpis).getByText('Faturamento')).toBeTruthy()
    expect(await screen.findByText('Qualidade dos dados')).toBeTruthy()
    expect(screen.getByText('Total produzido')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Abrir dashboard completo/ })).toBeTruthy()
  })

  it('trocar o período para "Mês anterior" recalcula', async () => {
    render(<DashboardPage host={{ mode: 'mock' }} />)
    await screen.findByRole('region', { name: 'Indicadores executivos' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Período' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Mês anterior' }))
    const p = atalho('mesAnt', new Date())
    const br = (d: string) => d.split('-').reverse().join('/')
    expect((await screen.findAllByText(`${br(p.inicio)} a ${br(p.fim)}`, { exact: false })).length).toBeGreaterThan(0)
  })
})
```

Ajuste os seletores do `Select` (papel do gatilho e das opções) ao que `PagantesPage.test.tsx` usa para abrir um `Select` do DS, se for diferente.

- [ ] **Step 2: Rodar e ver falhar** — `pnpm --filter @betinhos/shell test -- src/pages/dashboard/DashboardPage.test.tsx` → FAIL.

- [ ] **Step 3: `DashboardPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, StatusBadge, buttonClassName, useShellHeader } from '@betinhos/ui'
import { ExternalLink, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor } from '../../nav/useHashRoute'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { opcoesFiltro, type OpcoesFiltro } from './domain/base'
import { int } from './domain/format'
import { atalho, cargaDesde } from './domain/periodo'
import { calcularResumo } from './domain/resumo'
import type { Filtros } from './domain/types'
import { useDashboard } from './useDashboard'
import { AlertList } from './components/AlertList'
import { Analises } from './components/Analises'
import { DashboardToolbar } from './components/DashboardToolbar'
import { Emergenciais } from './components/Emergenciais'
import { FrotaPessoas } from './components/FrotaPessoas'
import { KPI_PLACEHOLDER, KpiGrid } from './components/KpiGrid'
import { ProducaoPropriaTerceira } from './components/ProducaoPropriaTerceira'
import './dashboard.css'

const SEM_OPCOES: OpcoesFiltro = { status: [], clientes: [], motoristas: [], tipos: [] }
const dataBR = (dia: string) => dia.split('-').reverse().join('/')
const horaBR = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function DashboardPage({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const [filtros, setFiltros] = useState<Filtros>(() => ({ atalho: 'esteAno', ...atalho('esteAno', new Date()), status: [], clientes: [], motoristas: [], tipos: [] }))
  const [now, setNow] = useState(() => new Date())
  const db = useDashboard(source, cargaDesde(filtros.inicio, now), filtros.fim)

  // Cada recarga avança o relógio; um atalho relativo ("Este mês") acompanha a virada do dia.
  useEffect(() => { if (db.atualizadoEm) setNow(db.atualizadoEm) }, [db.atualizadoEm])
  useEffect(() => {
    if (filtros.atalho === 'personalizado') return
    const p = atalho(filtros.atalho, now)
    if (p.inicio !== filtros.inicio || p.fim !== filtros.fim) setFiltros((f) => ({ ...f, ...p }))
  }, [now, filtros.atalho, filtros.inicio, filtros.fim])

  const resumo = useMemo(() => (db.dados ? calcularResumo(db.dados, filtros, now) : null), [db.dados, filtros, now])
  const opcoes = useMemo(() => (db.dados ? opcoesFiltro(db.dados.reservas) : SEM_OPCOES), [db.dados])
  const periodo = `${dataBR(filtros.inicio)} a ${dataBR(filtros.fim)}`
  const carregandoPrimeira = !resumo && db.carregando

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dashboard" onClick={() => void db.atualizar()} />, [db.atualizar])
  useShellHeader({ title: 'Dashboard', actions: headerActions })

  const segmentado = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length > 0
  const limpar = () => setFiltros((f) => ({ ...f, status: [], clientes: [], motoristas: [], tipos: [] }))

  return (
    <PageLayout
      eyebrow="Operacional"
      title="Dashboard"
      meta={<span className="dash-meta">
        <span>{periodo}</span>
        {resumo ? <span>{int(resumo.servicos)} serviços</span> : null}
        {db.atualizadoEm ? <span>atualizado {horaBR(db.atualizadoEm)}</span> : null}
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </span>}
      description="Indicadores executivos, alertas e análises da operação no período escolhido."
      actions={<>
        <a className={buttonClassName({ variant: 'secondary' })} href={hrefFor('new_dashboard')}><ExternalLink size={16} aria-hidden="true" /> Abrir dashboard completo</a>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={db.carregando && Boolean(resumo)} onClick={() => void db.atualizar()}>Atualizar</Button>}
      </>}
      toolbar={<DashboardToolbar filtros={filtros} opcoes={opcoes} now={now} onChange={setFiltros} />}
    >
      {db.erro && resumo ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro} Os números são da carga anterior.</Alert> : null}
      {db.erro && !resumo && !db.carregando ? (
        <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Não foi possível carregar o dashboard" action={<Button variant="primary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro}</EmptyState>
      ) : null}
      {db.dados?.indisponiveis.length ? <Alert tone="warning" title="Alguns dados não carregaram">Os cards marcados com s/dado dependem de tabelas que não responderam. Os demais números estão corretos.</Alert> : null}

      {carregandoPrimeira ? <KpiGrid kpis={KPI_PLACEHOLDER} carregando /> : null}
      {resumo && resumo.servicos === 0 && segmentado ? (
        <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum serviço para estes filtros" action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros de status, cliente, motorista e tipo.</EmptyState>
      ) : null}
      {resumo ? <>
        <KpiGrid kpis={resumo.kpis} carregando={false} />
        <div className="dash-alertas-grid">
          <AlertList titulo="Operação" itens={resumo.operacao} />
          <AlertList titulo="Qualidade dos dados" itens={resumo.qualidade} />
        </div>
        <FrotaPessoas cards={resumo.frota} />
        <div className="dash-destaques">
          <ProducaoPropriaTerceira dados={resumo.producao} periodo={periodo} />
          <Emergenciais dados={resumo.emergenciais} periodo={periodo} />
        </div>
        <Analises resumo={resumo} periodo={periodo} />
      </> : null}
    </PageLayout>
  )
}
```

Se `hrefFor` não aceitar o id de um item `webresource` como `new_dashboard`, confira em `apps/shell/src/nav/useHashRoute.ts` e use o mesmo formato que o menu gera (`#/new_dashboard`).

- [ ] **Step 4: `dashboard.css`** (só tokens)

```css
.dash-meta { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-2); color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-13); font-variant-numeric: tabular-nums; }

.dash-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--bt-space-3); }
.dash-kpi { position: relative; display: flex; flex-direction: column; min-width: 0; }
.dash-kpi .bt-metric { flex: 1; }
.dash-kpi__hint { display: flex; flex-wrap: wrap; gap: var(--bt-space-1); align-items: center; }
.dash-spark { height: 36px; margin-top: calc(-1 * var(--bt-space-2)); padding: 0 var(--bt-space-3) var(--bt-space-2); pointer-events: none; }

.dash-apoio { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-12); }
.dash-apoio__rotulo { font-weight: var(--bt-font-weight-bold); }
.dash-apoio--atencao { color: var(--bt-color-warning); }
.dash-chips { display: flex; flex-wrap: wrap; gap: var(--bt-space-1); align-items: center; }

.dash-alertas-grid, .dash-destaques { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); }
.dash-alertas__lista { list-style: none; margin: 0; padding: 0; display: grid; }
.dash-alerta { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: var(--bt-space-3); padding: var(--bt-space-2) 0; border-top: 1px solid var(--bt-color-border); }
.dash-alerta:first-child { border-top: 0; }
.dash-alerta__valor { font-size: var(--bt-font-size-20); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); font-variant-numeric: tabular-nums; }
.dash-alerta__texto { display: flex; flex-direction: column; min-width: 0; }
.dash-alerta__rotulo { font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-primary); }
.dash-alerta__status { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-12); }

.dash-frota { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--bt-space-3); }

.dash-analises { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); }
.dash-analise { min-width: 0; }
.dash-analise__topo { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--bt-space-2); margin-bottom: var(--bt-space-3); }
.dash-analise__valor { font-size: var(--bt-font-size-26); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); font-variant-numeric: tabular-nums; }
.dash-analise__sub { color: var(--bt-color-text-secondary); font-size: var(--bt-font-size-13); }
.dash-chart { margin: 0; width: 100%; }
.dash-tops { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); margin-top: var(--bt-space-3); }
.dash-top__titulo { margin: 0 0 var(--bt-space-2); font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-text-primary); }
.dash-analise .bt-table, .dash-tops .bt-table { overflow-x: auto; }
.dash-erro { color: var(--bt-color-danger); font-size: var(--bt-font-size-12); align-self: center; }

@media (max-width: 1120px) {
  .dash-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-frota { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .dash-alertas-grid, .dash-destaques, .dash-analises, .dash-tops { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .dash-kpis, .dash-frota { grid-template-columns: minmax(0, 1fr); }
}
```

Confira o nome real da classe raiz do `Table` do DS (`packages/ui/src/components/table.css`) e troque `.bt-table` se for diferente. Uma tabela larga deve rolar dentro do próprio card, nunca a página.

- [ ] **Step 5: Menu, rota e ícone**

Em `apps/shell/src/nav/menu.ts`:
- No tipo `page`, inclua `'dashboard'` na união: `page: 'componentes' | 'operacional' | 'frota' | 'funcionarios' | 'curriculos' | 'pagantes' | 'pessoas' | 'dashboard'`.
- No grupo `operacional`, troque `wr('Dashboard', 'new_dashboard'),` por:

```ts
      { kind: 'page', id: 'dashboard', label: 'Dashboard', page: 'dashboard' },
      wr('Dashboard (completo)', 'new_dashboard'),
```

Em `apps/shell/src/nav/menu.test.ts`, acrescente ao teste existente que lista os itens:

```ts
  expect(findItem('dashboard')?.item).toMatchObject({ kind: 'page', page: 'dashboard', label: 'Dashboard' })
  expect(findItem('new_dashboard')?.item).toMatchObject({ kind: 'webresource', label: 'Dashboard (completo)' })
```

Em `apps/shell/src/app/RouteLayout.tsx`: `import { DashboardPage } from '../pages/dashboard/DashboardPage'` e, no bloco `item.kind === 'page'`, antes do `return <ComponentsPage />`: `if (item.page === 'dashboard') return <DashboardPage host={host} />`.

Em `apps/shell/src/app/AppShell.tsx`, no `ITEM_ICONS`, acrescente `dashboard: <LayoutDashboard />,` (o ícone já é importado para `new_dashboard`).

- [ ] **Step 6: Rodar tudo**

Run: `pnpm --filter @betinhos/shell test` → toda a suíte PASS (as anteriores continuam passando).
Run: `pnpm --filter @betinhos/shell typecheck` → sem erros.
Run: `rg -n "#[0-9a-fA-F]{3,8}\b|gradient" apps/shell/src/pages/dashboard --glob '!*.test.*' --glob '!data/historico2026.ts'` → só os valores reserva de `charts/tokens.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/dashboard apps/shell/src/nav/menu.ts apps/shell/src/nav/menu.test.ts apps/shell/src/app/RouteLayout.tsx apps/shell/src/app/AppShell.tsx
git commit -m "Dashboard: página #/dashboard com a aba Resumo no menu Operacional

Monta a página com PageHeader, barra de filtros, KPIs executivos,
alertas de operação e qualidade, frota e pessoas, destaques e análises,
com skeleton na primeira carga, erro com nova tentativa e vazio por
filtro. O item Dashboard do menu passa a abrir a rota React; o
WebResource legado continua como Dashboard (completo).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificação no navegador (mock) e paridade em DEV

**Files:** nenhum novo (só correções que a verificação encontrar, cada uma com teste e commit próprio).

- [ ] **Step 1: Subir o dev server** com `preview_start` do navegador do Claude (configuração do shell em `.claude/launch.json`; se não existir, crie com `pnpm --filter @betinhos/shell dev` e a porta salva no script `dev`, 36472). Abra `#/dashboard`.

- [ ] **Step 2: Verificar com dados de exemplo**
- Console sem erros; as cinco seções aparecem; selo "Dados de exemplo".
- Períodos Hoje, Este mês, Mês anterior, Este ano, Ano anterior e Personalizado (início depois do fim mostra o erro e não recalcula).
- Filtros de status, cliente, motorista e tipo recalculam; "Limpar filtros" volta tudo; um filtro sem resultado mostra o vazio com "Limpar filtros".
- "Ver tabela"/"Ver gráfico" alterna em cada análise; foco visível por teclado em todos os controles.
- Larguras 1280, 1120, 820, 560, 375 e 320 px: sem rolagem horizontal da página (`document.documentElement.scrollWidth <= innerWidth`), KPIs em 3/2/1 colunas.
- A marca de versão do shell não cobre conteúdo (problema conhecido no celular: registre, não altere o componente compartilhado).

- [ ] **Step 3: Paridade em DEV (com o Renan, só leitura)**
Peça ao Renan para copiar o `.env` para a worktree e autorizar a publicação em DEV (`pnpm push`, login por device code feito por ele). Sem esse ok, pare aqui e reporte.
Com o shell em DEV, abra `#/dashboard` e o `new_dashboard` legado no mesmo momento, nos períodos "Este ano" e "Mês anterior". Compare os 6 KPIs executivos, os 4 cards de frota e pessoas e os 7 alertas. Registre na spec (§8) cada divergência e a causa; corrija o que for bug (com teste e commit) antes de concluir.

- [ ] **Step 4: Relatório final**
Informe: versão publicada (se houve `pnpm push`), resultado da paridade, prints de 1280 e 375 px e pendências.
