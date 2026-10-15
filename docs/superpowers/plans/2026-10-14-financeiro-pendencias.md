# Financeiro automático — Plano 2: tela de Pendências

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rota `#/pendencias` no shell que lista divergências financeiras dos tipos 1, 2, 3 e 5 (spec §5) e corrige os tipos 1 e 3 pela Custom API `cr40f_SincronizarFinanceiro`, com prévia (`simular`) antes de aplicar.

**Architecture:** Módulo `apps/shell/src/pages/pendencias/` no molde de `pages/ops`: `domain/` puro e testado (tipos, detecção, filtros, query de URL), `data/` (queries, mock, source com chamada da Custom API), `usePendencias.ts`, `components/` e `PendenciasPage.tsx`. Reaproveita `loadPagantes`/tipos de Pagantes e `mapOp` de OPs. O tipo 4 (Mensal) e o "Fechar mês" ficam para o Plano 3.

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library, `@betinhos/ui`, `@betinhos/dataverse`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-14-financeiro-automatico-design.md` (§3 regras, §5 tela).

## Global Constraints

- Design System: ler `C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md` antes de UI; só tokens `--bt-*`; sem gradiente; tema claro; `#FCFCFB` em listas, campos e cabeçalhos neutros; azul só para foco, seleção, status, ícones e ações.
- Preserve o padrão de OPs: `PageLayout`, `useShellHeader`, `ToastProvider`, filtros na URL (`useQueryFilters`), visões em `localStorage` com try/catch, `Drawer size="wide"`, tabela ≥ 820 px e cards abaixo, mock sem Xrm.
- Toda escrita passa pela Custom API (`simular` → confirmação → `aplicar`). O shell não faz `update` em OP, Reserva nem CP.
- Detecção de divergência espelha as regras do motor (spec §3); valores de choice em `apps/shell/src/pages/pendencias/domain/codes.ts`, idênticos a `packages/plugins/Cr40f.Financeiro.Plugin/Codigos.cs`.
- Drawer/modal: clicar fora, X e Esc fecham; durante a chamada à API o overlay não fecha.
- Versão de build visível em todas as telas (já fornecida pelo shell); publicar com `pnpm push` e informar a versão.
- 320 px sem rolagem horizontal. `pnpm test` e `pnpm typecheck` verdes.
- Commits em português, detalhados, com trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `pages/pendencias/domain/codes.ts` | valores de choice (espelho de `Codigos.cs`) |
| `pages/pendencias/domain/types.ts` | `Reserva`, `OpResumo`, `Pendencia`, `TipoPendencia` |
| `pages/pendencias/domain/detect.ts` | `detectarPendencias(ops, reservas, pagantes)` puro |
| `pages/pendencias/domain/filters.ts` | filtros, visões, período |
| `pages/pendencias/domain/query.ts` | filtros ↔ URL |
| `pages/pendencias/domain/domain.test.ts` | testes do domínio |
| `pages/pendencias/data/queries.ts` | paths OData e `mapReserva` |
| `pages/pendencias/data/mock.ts` | dados de exemplo com os 4 tipos |
| `pages/pendencias/data/source.ts` | `load`, `sincronizar(opId, modo)` |
| `pages/pendencias/usePendencias.ts` | carga + recarga |
| `pages/pendencias/components/*.tsx` | toolbar, lista, drawer, diálogo de correção |
| `pages/pendencias/PendenciasPage.tsx` | página |
| `pages/pendencias/PendenciasPage.test.tsx` | teste da página em mock |
| `nav/menu.ts`, `app/RouteLayout.tsx` | rota e item de menu |

---

### Task 1: Códigos, tipos e detecção de pendências

**Files:**
- Create: `apps/shell/src/pages/pendencias/domain/codes.ts`, `types.ts`, `detect.ts`, `domain.test.ts`

**Interfaces:**
- Produces: `detectarPendencias(ops: OpResumo[], reservas: Reserva[], pagantes: PaganteResumo[]): Pendencia[]`.

- [ ] **Step 1: `codes.ts`**

```ts
/** Espelho de packages/plugins/Cr40f.Financeiro.Plugin/Codigos.cs (metadata conferida em DEV, 14/10/2026). */
export const OP = { aberta: 202410000, pendente: 100000001, parcial: 202410006, paga: 202410003, cancelada: 202410004 } as const
export const PAG = { pendente: 202410001, pago: 202410002, cancelado: 202410005, autorizado: 202410007 } as const
export const FAT = { pago: 202410010, pagante: 202410006, mensal: 202410008, pendente: 202410005, pagamentoPendente: 202410007 } as const
export const CP = { pendente: 100000000, concluida: 100000001 } as const
export const RESERVA_CONCLUIDA = 202410008
```

- [ ] **Step 2: `types.ts`**

```ts
export type TipoPendencia = 'op-paga-desalinhada' | 'pago-sem-op-paga' | 'op-sem-pagamento-reserva-paga' | 'rateio-nao-fecha'

export type Reserva = {
  id: string; codigo: string; saida: Date | null; cliente: string; clienteId: string
  status: number | null; fatStatus: number | null; fatLabel: string
  opId: string | null; opCodigo: string; cpId: string | null; cpStatus: number | null; cpValor: number | null
}
export type OpResumo = { id: string; codigo: string; status: number | null; valor: number | null; cliente: string }
export type PaganteResumo = { id: string; opId: string; status: number | null; valor: number | null }

export type Pendencia = {
  id: string                 // `${tipo}:${opId ?? reservaId}`
  tipo: TipoPendencia
  opId: string | null
  opCodigo: string
  reservaIds: string[]
  cliente: string
  data: Date | null          // saída mais recente das reservas envolvidas
  valor: number | null       // valor da OP, ou soma das CPs
  detalhe: string            // frase curta para a lista
  corrigivel: boolean        // tipos 1 e 3: botão Corrigir (Custom API)
}

export const TIPO_LABEL: Record<TipoPendencia, string> = {
  'op-paga-desalinhada': 'OP paga, serviço desalinhado',
  'pago-sem-op-paga': 'Serviço pago sem OP paga',
  'op-sem-pagamento-reserva-paga': 'OP sem pagamento, serviço pago',
  'rateio-nao-fecha': 'Rateio não fecha',
}
```

- [ ] **Step 3: Testes (`domain.test.ts`)**

```ts
import { describe, expect, it } from 'vitest'
import { CP, FAT, OP, PAG } from './codes'
import { detectarPendencias } from './detect'
import type { OpResumo, PaganteResumo, Reserva } from './types'

const op = (id: string, status: number, valor: number | null = 1000): OpResumo => ({ id, codigo: `OP-${id}`, status, valor, cliente: 'AGC' })
const res = (id: string, opId: string | null, fat: number, cp: number | null = CP.pendente, cpValor = 1000): Reserva => ({
  id, codigo: `OS-${id}`, saida: new Date(2026, 9, 1), cliente: 'AGC', clienteId: 'c1', status: 202410008,
  fatStatus: fat, fatLabel: '', opId, opCodigo: opId ? `OP-${opId}` : '', cpId: cp == null ? null : `cp-${id}`, cpStatus: cp, cpValor,
})
const pag = (opId: string, status: number, valor: number): PaganteResumo => ({ id: `${opId}-${status}-${valor}`, opId, status, valor })

describe('detectarPendencias', () => {
  it('tipo 1: OP paga com reserva não paga ou CP pendente', () => {
    const p = detectarPendencias([op('1', OP.paga)], [res('a', '1', FAT.pagante, CP.pendente)], [pag('1', PAG.pago, 1000)])
    expect(p.map((x) => x.tipo)).toEqual(['op-paga-desalinhada'])
    expect(p[0]).toMatchObject({ opId: '1', reservaIds: ['a'], corrigivel: true })
  })

  it('tipo 1 não aparece quando tudo está alinhado', () => {
    expect(detectarPendencias([op('1', OP.paga)], [res('a', '1', FAT.pago, CP.concluida)], [pag('1', PAG.pago, 1000)])).toEqual([])
  })

  it('tipo 2: reserva Pago sem OP ou com OP não paga', () => {
    const p = detectarPendencias([op('1', OP.parcial)], [res('a', null, FAT.pago), res('b', '1', FAT.pago)], [pag('1', PAG.pago, 400), pag('1', PAG.pendente, 600)])
    const t2 = p.filter((x) => x.tipo === 'pago-sem-op-paga')
    expect(t2.map((x) => x.reservaIds[0]).sort()).toEqual(['a', 'b'])
    expect(t2.every((x) => !x.corrigivel)).toBe(true)
  })

  it('tipo 3: OP cancelada ou sem pagante ativo com reserva ainda Pago', () => {
    const p = detectarPendencias(
      [op('1', OP.cancelada), op('2', OP.aberta)],
      [res('a', '1', FAT.pago), res('b', '2', FAT.pago)],
      [pag('2', PAG.cancelado, 1000)],
    )
    const t3 = p.filter((x) => x.tipo === 'op-sem-pagamento-reserva-paga')
    expect(t3.map((x) => x.opId).sort()).toEqual(['1', '2'])
    expect(t3.every((x) => x.corrigivel)).toBe(true)
    // a reserva do tipo 3 não é contada de novo como tipo 2
    expect(p.filter((x) => x.tipo === 'pago-sem-op-paga')).toEqual([])
  })

  it('tipo 5: soma do rateio ativo diferente do total da OP', () => {
    const p = detectarPendencias([op('1', OP.pendente, 1000)], [res('a', '1', FAT.pagamentoPendente)], [pag('1', PAG.pendente, 600), pag('1', PAG.cancelado, 400)])
    expect(p.map((x) => x.tipo)).toEqual(['rateio-nao-fecha'])
  })

  it('tipo 5 usa a soma das CPs quando a OP não tem valor e ignora OP sem pagante', () => {
    expect(detectarPendencias([op('1', OP.pendente, null)], [res('a', '1', FAT.pagamentoPendente, CP.pendente, 1000)], [pag('1', PAG.pendente, 1000)])).toEqual([])
    expect(detectarPendencias([op('2', OP.aberta, 1000)], [res('b', '2', FAT.pendente)], [])).toEqual([])
  })

  it('ignora reservas informativas sem evento de dinheiro', () => {
    expect(detectarPendencias([op('1', OP.pendente)], [res('a', '1', FAT.pagante)], [pag('1', PAG.pendente, 1000)])).toEqual([])
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @betinhos/shell exec vitest run src/pages/pendencias 2>&1 | tail -6`
Expected: falha por `./detect` inexistente.

- [ ] **Step 5: `detect.ts`**

```ts
import { CP, FAT, OP, PAG } from './codes'
import type { OpResumo, PaganteResumo, Pendencia, Reserva, TipoPendencia } from './types'

const cents = (v: number | null | undefined) => Math.round((v ?? 0) * 100)
const isPago = (s: number | null) => s === PAG.pago || s === PAG.autorizado
const latest = (rs: Reserva[]) => rs.reduce<Date | null>((d, r) => (r.saida && (!d || r.saida > d) ? r.saida : d), null)

/** Espelha spec §3: só aponta o que o motor corrigiria (1, 3) ou o que precisa de gente (2, 5). */
export function detectarPendencias(ops: OpResumo[], reservas: Reserva[], pagantes: PaganteResumo[]): Pendencia[] {
  const out: Pendencia[] = []
  const porOp = new Map<string, Reserva[]>()
  for (const r of reservas) if (r.opId) porOp.set(r.opId, [...(porOp.get(r.opId) ?? []), r])
  const pagsPorOp = new Map<string, PaganteResumo[]>()
  for (const p of pagantes) pagsPorOp.set(p.opId, [...(pagsPorOp.get(p.opId) ?? []), p])
  const jaListadas = new Set<string>()

  const push = (tipo: TipoPendencia, o: OpResumo | null, rs: Reserva[], detalhe: string, corrigivel: boolean) => {
    const valor = o?.valor ?? (rs.length ? rs.reduce((s, r) => s + (r.cpValor ?? 0), 0) : null)
    out.push({
      id: `${tipo}:${o?.id ?? rs[0]?.id}`, tipo, opId: o?.id ?? null, opCodigo: o?.codigo ?? '', reservaIds: rs.map((r) => r.id),
      cliente: o?.cliente || rs[0]?.cliente || '', data: latest(rs), valor, detalhe, corrigivel,
    })
  }

  for (const o of ops) {
    const rs = porOp.get(o.id) ?? []
    const ativos = (pagsPorOp.get(o.id) ?? []).filter((p) => p.status !== PAG.cancelado)
    if (o.status === OP.paga) {
      const desalinhadas = rs.filter((r) => r.fatStatus !== FAT.pago || (r.cpId != null && r.cpStatus !== CP.concluida))
      if (desalinhadas.length) push('op-paga-desalinhada', o, desalinhadas, `${desalinhadas.length} serviço(s) sem Pago/Concluída`, true)
      continue
    }
    const pagasNaReserva = rs.filter((r) => r.fatStatus === FAT.pago)
    const semPagamento = o.status === OP.cancelada || !ativos.some((p) => isPago(p.status))
    if (semPagamento && pagasNaReserva.length) {
      push('op-sem-pagamento-reserva-paga', o, pagasNaReserva, o.status === OP.cancelada ? 'OP cancelada' : 'Nenhum pagante ativo pago', true)
      pagasNaReserva.forEach((r) => jaListadas.add(r.id))
    }
    if (o.status !== OP.cancelada && ativos.length) {
      const total = o.valor ?? (rs.length && rs.every((r) => r.cpId) ? rs.reduce((s, r) => s + (r.cpValor ?? 0), 0) : null)
      const soma = ativos.reduce((s, p) => s + cents(p.valor), 0)
      if (total != null && soma !== cents(total)) push('rateio-nao-fecha', o, rs, `Rateio ${(soma / 100).toFixed(2)} × total ${total.toFixed(2)}`, false)
    }
  }

  const opPorId = new Map(ops.map((o) => [o.id, o]))
  for (const r of reservas) {
    if (r.fatStatus !== FAT.pago || jaListadas.has(r.id)) continue
    const o = r.opId ? opPorId.get(r.opId) : undefined
    if (o?.status === OP.paga) continue
    push('pago-sem-op-paga', o ?? null, [r], o ? `OP ${o.codigo} não está paga` : 'Sem OP', false)
  }
  return out.sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0))
}
```

Observação: uma reserva Pago cuja OP está fora do período carregado aparece como tipo 2 com `o` indefinido; o detalhe fica "Sem OP". Isso é aceitável porque a reserva é carregada pelo período e a OP é buscada pelos ids das reservas (Task 3), então `o` só falta quando realmente não existe.

- [ ] **Step 6: Rodar e ver passar** (mesmo comando) → 7 testes passando.

- [ ] **Step 7: Commit**

```bash
git add apps/shell/src/pages/pendencias/domain
git commit -m "pendencias: domínio puro com códigos, tipos e detecção das divergências 1, 2, 3 e 5"
```

---

### Task 2: Filtros, visões e query de URL

**Files:**
- Create: `apps/shell/src/pages/pendencias/domain/filters.ts`, `query.ts`
- Modify: `apps/shell/src/pages/pendencias/domain/domain.test.ts`

**Interfaces:**
- Consumes: `Pendencia`, `TipoPendencia`.
- Produces: `Filters`, `EMPTY_FILTERS`, `filterPendencias`, `periodoStart`, `BUILTIN_VIEWS`, `VIEWS_KEY`, `loadViews`, `saveViews`, `newView`, `matchView`, `viewFilters`, `pendenciasQuery` — com as **mesmas assinaturas** de `apps/shell/src/pages/ops/domain/filters.ts` e `query.ts` (leia-os e espelhe; troque `Op` por `Pendencia`).

- [ ] **Step 1: Ler** `apps/shell/src/pages/ops/domain/filters.ts`, `query.ts` e o trecho de `domain.test.ts` que os testa.

- [ ] **Step 2: Testes** (acrescentar ao `domain.test.ts`):

```ts
import { EMPTY_FILTERS, filterPendencias, BUILTIN_VIEWS } from './filters'

describe('filterPendencias', () => {
  const base = detectarPendencias(
    [op('1', OP.paga), op('2', OP.cancelada)],
    [res('a', '1', FAT.pagante), res('b', '2', FAT.pago)],
    [pag('1', PAG.pago, 1000)],
  )
  it('filtra por tipo', () => {
    expect(filterPendencias(base, { ...EMPTY_FILTERS, tipos: ['op-sem-pagamento-reserva-paga'] }).map((p) => p.opId)).toEqual(['2'])
  })
  it('busca por OP, OS e cliente sem acento nem caixa', () => {
    expect(filterPendencias(base, { ...EMPTY_FILTERS, q: 'op-1' }).map((p) => p.opId)).toEqual(['1'])
    expect(filterPendencias(base, { ...EMPTY_FILTERS, q: 'agc' })).toHaveLength(2)
  })
  it('visão "Corrigíveis" mostra só tipos 1 e 3', () => {
    const v = BUILTIN_VIEWS.find((x) => x.id === 'corrigiveis')!
    expect(filterPendencias(base, v.filters).every((p) => p.corrigivel)).toBe(true)
  })
})
```

`Filters` = `{ q: string; periodo: '30' | '90' | '365' | 'tudo'; tipos: TipoPendencia[] }`; `EMPTY_FILTERS.periodo = '90'`. Visões prontas: `todas`, `corrigiveis` (tipos 1 e 3), `rateio` (tipo 5). Chave de visões: `betinhos.pendencias.visoes.v1`. A busca compara `opCodigo`, códigos das reservas (passados via campo `busca` montado em `filterPendencias` a partir de `detalhe`, `opCodigo`, `cliente`) normalizados com o mesmo `norm` usado em OPs.

- [ ] **Step 3–5:** ver falhar, implementar espelhando OPs, ver passar (`pnpm --filter @betinhos/shell exec vitest run src/pages/pendencias 2>&1 | tail -6`).

- [ ] **Step 6: Commit** `pendencias: filtros, visões salvas e estado na URL`

---

### Task 3: Dados — queries, mock e source com a Custom API

**Files:**
- Create: `apps/shell/src/pages/pendencias/data/queries.ts`, `mock.ts`, `source.ts`, `data.test.ts`

**Interfaces:**
- Produces:
```ts
export type Mudanca = { entidade: string; id: string; campo: string; de: number | null; para: number | null; limparLookup: boolean; motivo: string }
export type Sincronizacao = { opId: string; modo: 'simular' | 'aplicar'; mudancas: Mudanca[]; aplicadas: boolean }
export type Source = {
  mock: boolean
  load: (since: Date | null) => Promise<{ ops: OpResumo[]; reservas: Reserva[]; pagantes: PaganteResumo[] }>
  sincronizar: (opId: string, modo: 'simular' | 'aplicar') => Promise<Sincronizacao>
  kv: KV
}
```

- [ ] **Step 1: `queries.ts`**
  - Reservas: entity `cr40f_reservadeveculos`; `$select=cr40f_reservadeveculosid,cr40f_id,cr40f_dataehorriodesada,cr40f_status,cr40f_statusdefaturamento,_cr40f_financeiro_value,_new_composicaodepreco_value,_cr40f_cliente_value`; `$expand=new_ComposicaodePreco($select=new_status,new_valortotal)`; `$filter` = `statecode eq 0 and cr40f_dataehorriodesada ge <since ISO>` (sem since: só `statecode eq 0`) **e** `(cr40f_statusdefaturamento eq 202410010 or _cr40f_financeiro_value ne null)`. Antes de codar, confirmar o nome da navigation property da CP lendo `apps/shell/src/pages/dashboard/data/queries.ts` (ela já resolve `cpNav` pela metadata — reutilize a mesma função em vez de fixar o nome).
  - `mapReserva(row)`: cliente pelo FormattedValue de `_cr40f_cliente_value`; `opCodigo` pelo FormattedValue de `_cr40f_financeiro_value`; `fatLabel` pelo FormattedValue.
  - OPs: reutilizar `ENTITY_OP`, `mapOp` de `pages/ops/data/queries.ts`; filtrar por `cr40f_financeiroid` nos ids distintos das reservas, em blocos de 10 (mesmo padrão de chunks do Operacional), e mapear para `OpResumo`.
  - Pagantes: `cr40f_pagantes` com `$select=cr40f_pagantesid,_cr40f_financeiro_value,cr40f_status,cr40f_valor` e `_cr40f_financeiro_value eq <id>` em blocos de 10.

- [ ] **Step 2: `mock.ts`** — `createMockPendencias(now)` devolve `{ ops, reservas, pagantes }` que produzem exatamente um caso de cada tipo 1, 2, 3 e 5 e um caso alinhado (para provar que não aparece).

- [ ] **Step 3: `source.ts`**
  - Mock: `load` devolve o mock com `wait(350)`; `sincronizar` calcula as mudanças com uma versão mínima local (tipo 1 → reserva `FAT.pago` e CP `CP.concluida`; tipo 3 → reserva `FAT.pagamentoPendente` ou `FAT.pendente` se OP cancelada), aplica no mock quando `modo === 'aplicar'` e devolve `Sincronizacao`.
  - Dataverse:
```ts
async sincronizar(opId, modo) {
  const set = await entitySetOp()
  const body = { cr40f_RequestJson: JSON.stringify({ modo, origem: 'manual' }) }
  const res = await host.client.request<{ cr40f_ResponseJson: string }>(`${set}(${cleanId(opId)})/Microsoft.Dynamics.CRM.cr40f_SincronizarFinanceiro`, { method: 'POST', body: JSON.stringify(body) })
  return JSON.parse(res.cr40f_ResponseJson) as Sincronizacao
}
```
  `cleanId` vem de `@betinhos/dataverse`. Erros do servidor sobem como `Error` com a mensagem da API (o client já extrai `error.message`).

- [ ] **Step 4: `data.test.ts`**: `mapReserva` com uma linha crua (FormattedValues incluídos) e `createMockPendencias` → `detectarPendencias` devolve os tipos `['op-paga-desalinhada','pago-sem-op-paga','op-sem-pagamento-reserva-paga','rateio-nao-fecha']` (ordem indiferente, use `sort()`); mock `sincronizar(opTipo1, 'aplicar')` → próxima detecção sem o tipo 1.

- [ ] **Step 5:** rodar testes, `pnpm typecheck`, commit `pendencias: dados (OData, mock) e chamada da Custom API cr40f_SincronizarFinanceiro`.

---

### Task 4: Hook e página com lista, toolbar e drawer

**Files:**
- Create: `apps/shell/src/pages/pendencias/usePendencias.ts`, `components/PendenciasToolbar.tsx`, `components/PendenciasList.tsx`, `components/PendenciaDrawer.tsx`, `PendenciasPage.tsx`, `pendencias.css`, `PendenciasPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `PendenciasPage({ host })`.

- [ ] **Step 1: Ler** `apps/shell/src/pages/ops/OpsPage.tsx`, `useOps.ts`, `components/OpsToolbar.tsx`, `components/OpsList.tsx`, `components/OpDrawer.tsx`, `ops.css` e `DESIGN_SYSTEM.md`. Espelhar estrutura, nomes de classes (prefixo `pend-`), estados (skeleton, erro com "Tentar de novo", vazio, vazio por filtro) e responsividade.

- [ ] **Step 2: `usePendencias(source, since)`**: carrega `source.load`, roda `detectarPendencias`, guarda `{ list, loading, error }`, expõe `reload`; recarga mais recente vence (token, como `useOps`).

- [ ] **Step 3: Página**
  - `PageHeader` via `useShellHeader`: eyebrow "Financeiro", título "Pendências", meta "N pendências · R$ total" (total = soma de `valor`), selo "Dados de exemplo" no mock, botão de recarregar.
  - Toolbar: visões, busca, período, tipos (multi), limpar, salvar visão (reutilize `SaveViewDialog` de Pagantes).
  - Lista ≥ 820 px: tabela (Tipo como `StatusBadge` — tom `warning` para 1/3, `info` para 2, `danger` para 5 —, OP, Cliente, Serviços (qtd), Data, Valor, Ação). < 820 px: cards.
  - Ação por linha: tipos 1 e 3 → "Corrigir"; tipo 2 → "Abrir OP" (navega `#/ops?abrir=<opId>`) ou, sem OP, "Ver serviço" (`#/geral?abrir=<reservaId>`); tipo 5 → "Rateio" (abre `GerarPagantesFrame` com a URL de `createPagantesSource(host).gerarPagantesUrl(opId)`).
  - Drawer: detalhe (tipo, motivo, OP, reservas com status de faturamento e CP, valores).
  - Filtros, página e pendência aberta na URL (`#/pendencias?q=…&tipos=…&abrir=…`).

- [ ] **Step 4: Teste da página** (`PendenciasPage.test.tsx`, molde de `OpsPage.test.tsx`): renderiza em mock, mostra 4 linhas, filtrar por tipo reduz para 1, abrir uma linha mostra o drawer.

- [ ] **Step 5:** `pnpm --filter @betinhos/shell test 2>&1 | tail -6`, `pnpm typecheck`, commit `pendencias: página com lista, filtros, visões e ficha`.

---

### Task 5: Diálogo Corrigir (simular → aplicar)

**Files:**
- Create: `apps/shell/src/pages/pendencias/components/CorrigirDialog.tsx`
- Modify: `PendenciasPage.tsx`, `PendenciasPage.test.tsx`

- [ ] **Step 1: Teste** (em mock): clicar "Corrigir" numa pendência tipo 1 abre o diálogo com a lista de mudanças ("Serviço OS-… : Pagamento Pendente → Pago", "Composição: Pendente → Concluída"); confirmar mostra toast de sucesso e a linha some após a recarga; erro da API mostra a mensagem no diálogo e mantém aberto.

- [ ] **Step 2: Implementar**
  - Ao abrir: `source.sincronizar(opId, 'simular')`; skeleton enquanto carrega.
  - Lista de mudanças legível: entidade → "OP"/"Serviço"/"Composição"; valores pelos rótulos (mapa local a partir de `codes.ts`: `FAT`, `CP`, `OP`); `limparLookup` → "desvincular da OP".
  - Zero mudanças: "Nada a corrigir — os dados já estão alinhados." e só botão Fechar.
  - Confirmar: `sincronizar(opId, 'aplicar')`, botão em estado de carregamento, overlay e Esc **não** fecham durante a chamada; sucesso → toast "N alteração(ões) aplicada(s)" e `reload()`.
  - Usar o `Dialog`/`ConfirmDialog` de `@betinhos/ui` no mesmo padrão de `ops/components/CancelDialog.tsx`.

- [ ] **Step 3:** testes, typecheck, commit `pendencias: correção com prévia (simular) e confirmação (aplicar) pela Custom API`.

---

### Task 6: Rota, menu e publicação em DEV

**Files:**
- Modify: `apps/shell/src/nav/menu.ts`, `apps/shell/src/app/RouteLayout.tsx`, `apps/shell/src/pages/urlQuery.test.ts` (se cobrir todas as rotas)

- [ ] **Step 1:** em `menu.ts`, acrescentar `'pendencias'` ao union de `page` e o item `{ kind: 'page', id: 'pendencias', label: 'Pendências', page: 'pendencias' }` no grupo Financeiro, logo após Pagantes.
- [ ] **Step 2:** em `RouteLayout.tsx`, importar `PendenciasPage` e `if (item.page === 'pendencias') return <PendenciasPage host={host} />`.
- [ ] **Step 3:** se `urlQuery.test.ts` enumera as queries das telas, acrescentar `pendenciasQuery` no mesmo formato.
- [ ] **Step 4:** `pnpm test 2>&1 | tail -6` e `pnpm typecheck 2>&1 | tail -3` verdes; commit `pendencias: rota #/pendencias e item no menu Financeiro`.
- [ ] **Step 5 (controlador):** `pnpm push` (publica o shell em DEV; login interativo do push-dev), informar a versão publicada; no navegador autenticado em DEV abrir `#/pendencias`, conferir lista sem erro no console, 320 px sem rolagem, e um "Corrigir" em modo prévia (sem aplicar) numa OP de teste.

---

## Próximo

- **Plano 3:** `cr40f_FecharMesCliente` (Custom API unbound no mesmo registrador) + pendência tipo 4 (Mensal, Concluída, sem OP, mês fechado) e botão "Fechar mês" que abre o Gerar Pagantes.
