# Painel "Filtros" (lista única com grupos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o painel "Filtros" do DS (abas "Por coluna"/"Avançado") por uma lista única de condições em forma de frase, com grupos, condições só leitura e aviso de visão alterada, e ligar a Composição a ele.

**Architecture:** O formato gravado `TableFilters { quick, advanced }` não muda. O painel converte na entrada (`toPanelList`) e na saída (`fromPanelList`) para uma lista `FilterGroup` e edita só essa lista. Componentes novos pequenos (`FilterFieldPicker`, `FilterRow`) montam o painel. A Composição deixa o diálogo `ReadOnlyFilters` e passa as condições travadas ao painel pelo `ViewBar`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), CSS puro com tokens do DS. Dois repositórios: `design-system-betinhos` (pacote `@betinhos-executive-service/ui`, em `packages/ui`) e `Sistema-Betinhos` (`apps/shell`).

**Spec:** `docs/superpowers/specs/2026-11-16-painel-filtros-design.md` (neste repositório). Leia inteira antes da Task 1.

## Global Constraints

- Nada de biblioteca nova (sem Framer Motion): CSS transitions; animar só `transform` e `opacity`; `prefers-reduced-motion: reduce` tira os deslocamentos.
- Entrada de linha/grupo: 150 ms `cubic-bezier(0.23, 1, 0.32, 1)`; saída 120 ms opacidade; popover `scale(0.97)` + opacidade 150 ms, origem no gatilho; nada anima em ação de teclado.
- Textos exatos: "Filtros", "Onde", "e", "ou", "Sempre", "só leitura", "+ Adicionar filtro", "+ Adicionar grupo", "+ Filtro", "Limpar", "Mostrar N <noun>", "Mostrar resultados", "Nenhum filtro", "Mostrando todas as N <noun>.", "Filtros diferentes da visão salva", "Restaurar", "escolha um valor", "1 filtro sem valor não entra" / "N filtros sem valor não entram", menu da linha "Trocar campo", "Duplicar", "Colocar num grupo", "Remover"; seletor "Buscar campo…", "Colunas da tabela", "Outros campos".
- Formato gravado (`TableFilters`, `readFilters`, `storedFilters`, `filtersToFetchXml`) não muda de comportamento.
- `MAX_GROUP_DEPTH = 2` continua: o painel não cria grupo dentro de grupo.
- Breakpoint do celular: `(max-width: 820px)` (`useMediaQuery`), Drawer no desktop, Sheet no celular.
- Tokens do DS (`packages/tokens/design-tokens.css`); sem cores fixas novas fora dos tokens.
- Este PC (do Renan) não roda testes/builds: tudo roda na máquina Betinhos-Renan.
- Repositório público: nada de URL com `sig=`, CPF ou planilha.
- Versão do DS: 1.35.0 (minor).

---

## Parte A — `design-system-betinhos`

Trabalhe numa branch nova a partir da `main` atualizada (`git fetch && git switch -c feat/painel-filtros-lista origin/main`). Comandos de teste: `pnpm --filter @betinhos-executive-service/ui test -- <arquivo>` e `pnpm --filter @betinhos-executive-service/ui typecheck` (confira os nomes reais em `package.json` da raiz se o filtro não bater).

### Task 1: `toPanelList` / `fromPanelList` / `QUICK_OPS`

**Files:**
- Modify: `packages/ui/src/tableView/filters.ts` (depois de `countIncomplete`)
- Modify: `packages/ui/src/index.ts:56-58` (exportar `toPanelList`, `fromPanelList`, `QUICK_OPS`)
- Test: `packages/ui/src/tableView/filters.test.ts`

**Interfaces:**
- Produces: `QUICK_OPS: Record<FilterKind, FilterOp[]>`; `toPanelList(filters: TableFilters, fields: FilterField[]): FilterGroup` (raiz com `id: 'raiz'`); `fromPanelList(list: FilterGroup, fields: FilterField[]): TableFilters`.

- [ ] **Step 1: Write the failing tests** (no fim de `filters.test.ts`; usa `fields`, `c` e `withQuick` já definidos no topo)

```ts
describe('toPanelList e fromPanelList', () => {
  const g = (logic: 'and' | 'or', items: Array<FilterCondition | ReturnType<typeof newGroup>>, id = 'raiz') => ({ type: 'group' as const, id, logic, items })
  const casos: Array<[string, TableFilters]> = [
    ['vazio', emptyFilters()],
    ['só rápido', withQuick({ nome: c('nome', 'contains', { value: 'ana' }), status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }) })],
    ['só avançado e', withQuick({}, g('and', [c('valor', 'gt', { value: 10 }), c('cidade', 'contains', { value: 'Rio' })]))],
    ['só avançado ou', withQuick({}, g('or', [c('valor', 'gt', { value: 10 }), c('nome', 'eq', { value: 'x' })]))],
    ['rápido + avançado ou', withQuick({ nome: c('nome', 'contains', { value: 'ana' }) }, g('or', [c('valor', 'gt', { value: 10 }), c('data', 'today')]))],
    ['rápido + avançado com grupo', withQuick({ nome: c('nome', 'contains', { value: 'ana' }) }, g('and', [c('cidade', 'contains', { value: 'Rio' }), g('or', [c('valor', 'lt', { value: 5 }), c('blindado', 'yes')], 'g1')]))],
  ]
  for (const [nome, filtros] of casos) {
    it(`ida e volta sem mudança: ${nome}`, () => {
      expect(fromPanelList(toPanelList(filtros, fields), fields)).toEqual(filtros)
    })
  }
  it('lista começa pelos rápidos, na ordem dos campos', () => {
    const list = toPanelList(withQuick({ status: c('status', 'in', { values: [{ value: '1', label: 'Pendente' }] }), nome: c('nome', 'contains', { value: 'a' }) }), fields)
    expect(list.items.map((i) => (i.type === 'condition' ? i.field : 'grupo'))).toEqual(['nome', 'status'])
    expect(list.logic).toBe('and')
  })
  it('avançado em ou com rápido vira grupo dentro da lista', () => {
    const list = toPanelList(withQuick({ nome: c('nome', 'contains', { value: 'a' }) }, g('or', [c('valor', 'gt', { value: 1 }), c('data', 'today')])), fields)
    expect(list.items).toHaveLength(2)
    expect(list.items[1]).toMatchObject({ type: 'group', logic: 'or' })
  })
  it('sem rápido, avançado em ou é a própria lista', () => {
    const list = toPanelList(withQuick({}, g('or', [c('valor', 'gt', { value: 1 })])), fields)
    expect(list).toMatchObject({ id: 'raiz', logic: 'or' })
  })
  it('volta ao rápido só a condição única do campo, completa e com operador da célula', () => {
    const list = g('and', [
      c('nome', 'ends', { value: 'a' }),                 // operador que a célula não mostra → avançado
      c('valor', 'gt', { value: 1 }), c('valor', 'lt', { value: 9 }), // dois do mesmo campo → avançado
      c('cidade', 'contains', { value: 'Rio' }),          // advancedOnly → avançado
      c('status', 'in', { values: [] }),                  // incompleta → avançado
      c('data', 'last-7'),                                // vai para o rápido
    ])
    const out = fromPanelList(list, fields)
    expect(Object.keys(out.quick)).toEqual(['data'])
    expect(out.advanced.items).toHaveLength(5)
  })
  it('lista em ou vai inteira para o avançado', () => {
    const out = fromPanelList(g('or', [c('nome', 'contains', { value: 'a' }), c('data', 'today')]), fields)
    expect(out.quick).toEqual({})
    expect(out.advanced).toMatchObject({ id: 'raiz', logic: 'or' })
  })
})
```

Adicione `toPanelList, fromPanelList, newGroup` ao import do topo (`newGroup` já está).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @betinhos-executive-service/ui test -- src/tableView/filters.test.ts`
Expected: FAIL — `toPanelList is not a function` / export ausente.

- [ ] **Step 3: Implement** (em `filters.ts`, depois de `countIncomplete`)

```ts
// ---------- Lista do painel (§10.9.2) ----------

/** Operadores que a célula do filtro rápido (cabeçalho da coluna) sabe mostrar. */
export const QUICK_OPS: Record<FilterKind, FilterOp[]> = {
  text: ['contains', 'eq', 'begins', 'not-contains', 'empty', 'not-empty'],
  number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'between', 'empty'],
  choice: ['in'],
  lookup: ['in'],
  date: [...DATE_PRESETS, 'between'],
  bool: ['yes', 'no'],
}

/**
 * Filtros gravados → lista única do painel: rápidos primeiro (na ordem dos campos), depois o avançado. Avançado em "e"
 * entra item a item; em "ou" entra como grupo (ou vira a própria lista quando não há rápido).
 */
export function toPanelList(filters: TableFilters, fields: FilterField[]): FilterGroup {
  const quick = fields.flatMap((f) => (filters.quick[f.key] ? [filters.quick[f.key]] : []))
  const adv = filters.advanced
  if (adv.logic === 'or' && !quick.length) return { ...adv, id: 'raiz' }
  const tail = adv.logic === 'and' ? adv.items : adv.items.length ? [{ ...adv, id: adv.id === 'raiz' ? newId() : adv.id }] : []
  return { type: 'group', id: 'raiz', logic: 'and', items: [...quick, ...tail] }
}

/** Lista do painel → filtros gravados. Inverso de `toPanelList`: o que a célula da coluna sabe mostrar volta ao rápido. */
export function fromPanelList(list: FilterGroup, fields: FilterField[]): TableFilters {
  if (list.logic === 'or') return { quick: {}, advanced: { ...list, id: 'raiz' } }
  const map = fieldMap(fields)
  const count = new Map<string, number>()
  for (const item of list.items) if (item.type === 'condition') count.set(item.field, (count.get(item.field) ?? 0) + 1)
  const quick: Record<string, FilterCondition> = {}
  const rest: Array<FilterCondition | FilterGroup> = []
  for (const item of list.items) {
    const field = item.type === 'condition' ? map.get(item.field) : undefined
    const toQuick = item.type === 'condition' && field && !field.advancedOnly && count.get(item.field) === 1
      && QUICK_OPS[field.kind].includes(item.op) && !conditionProblem(item, field)
    if (toQuick) quick[item.field] = item
    else rest.push(item)
  }
  const only = rest.length === 1 ? rest[0] : undefined
  const advanced: FilterGroup = only?.type === 'group' ? { ...only, id: 'raiz' } : { type: 'group', id: 'raiz', logic: 'and', items: rest }
  return { quick, advanced }
}
```

Atenção: no caso "rápido + avançado ou", `toPanelList` dá ao grupo embrulhado um `id` novo e `fromPanelList` devolve `id: 'raiz'`, então a ida e volta fica igual. No caso "rápido + avançado com grupo" (avançado em "e" com uma condição e um grupo), `rest` tem 2 itens e a raiz fica "e" com `id: 'raiz'`. Se o teste de ida e volta falhar pela ordem das chaves de `quick`, ordene `quick` pela ordem de `fields` antes de devolver.

- [ ] **Step 4: Run test to verify it passes** — mesmo comando; Expected: PASS (e o resto de `filters.test.ts` continua verde).
- [ ] **Step 5: Exportar** em `packages/ui/src/index.ts` junto dos outros nomes de `./tableView/filters`, rodar `typecheck`.
- [ ] **Step 6: Commit** — `git commit -am "feat(filtros): lista única do painel (toPanelList/fromPanelList)"`

### Task 2: seletor de campo `FilterFieldPicker`

**Files:**
- Create: `packages/ui/src/tableView/FilterFieldPicker.tsx`
- Modify: `packages/ui/src/tableView/table-view.css` (classes `bt-fpick*`)
- Test: `packages/ui/src/tableView/FilterFieldPicker.test.tsx`

**Interfaces:**
- Consumes: `FilterField`, `fieldLabel` de `filters.ts`; o popover/âncora já usado pelo `ColumnFilter.tsx` (leia `ColumnFilter.tsx` e reuse o mesmo mecanismo de âncora/posição; no celular use `Sheet`).
- Produces: `FilterFieldPicker({ anchor, fields, onPick, onClose }: { anchor: HTMLElement | null; fields: FilterField[]; onPick: (field: FilterField) => void; onClose: () => void })`.

Comportamento: input "Buscar campo…" com foco ao abrir; filtra por `label` e `relation` sem acento e sem caixa (`normalize('NFD').replace(/\p{M}/gu, '')`); seção "Colunas da tabela" (campos sem `relation`, ordem de `fields`) e "Outros campos" (com `relation`, mostrada à direita em cinza); seção vazia some; setas ↑/↓ movem o item ativo, `Enter` escolhe, `Esc` fecha (com `stopPropagation`, para não fechar o painel). `role="listbox"` + `role="option"` + `aria-activedescendant`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FilterFieldPicker } from './FilterFieldPicker'
import type { FilterField } from './filters'

const fields: FilterField[] = [
  { key: 'cliente', label: 'Cliente', kind: 'lookup' },
  { key: 'valor', label: 'Valor total', kind: 'number' },
  { key: 'placa', label: 'Placa', kind: 'text', relation: 'Veículo', advancedOnly: true },
]
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(cleanup)

const mount = (onPick = vi.fn(), onClose = vi.fn()) => {
  const anchor = document.createElement('button'); document.body.append(anchor)
  render(<FilterFieldPicker anchor={anchor} fields={fields} onPick={onPick} onClose={onClose} />)
  return { onPick, onClose }
}

it('separa colunas da tabela e outros campos', () => {
  mount()
  expect(screen.getByText('Colunas da tabela')).toBeTruthy()
  expect(screen.getByText('Outros campos')).toBeTruthy()
  expect(screen.getByRole('option', { name: /Placa/ }).textContent).toContain('Veículo')
})
it('busca sem acento e escolhe com Enter', () => {
  const { onPick } = mount()
  const input = screen.getByPlaceholderText('Buscar campo…')
  fireEvent.change(input, { target: { value: 'veiculo' } })
  expect(screen.queryByText('Colunas da tabela')).toBeNull()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith(fields[2])
})
it('setas movem o item ativo e Esc fecha', () => {
  const { onPick, onClose } = mount()
  const input = screen.getByPlaceholderText('Buscar campo…')
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onPick).toHaveBeenCalledWith(fields[1])
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run** `pnpm --filter @betinhos-executive-service/ui test -- src/tableView/FilterFieldPicker.test.tsx` → FAIL (módulo não existe).
- [ ] **Step 3: Implement** o componente conforme o comportamento acima (item ativo começa no primeiro; clique no item chama `onPick`).
- [ ] **Step 4: Run** → PASS; `typecheck`.
- [ ] **Step 5: Commit** — `feat(filtros): seletor de campo com busca`

### Task 3: linha em frase `FilterRow`

**Files:**
- Create: `packages/ui/src/tableView/FilterRow.tsx`
- Modify: `packages/ui/src/tableView/table-view.css` (classes `bt-frow*`)
- Test: `packages/ui/src/tableView/FilterRow.test.tsx`

**Interfaces:**
- Consumes: `FilterFieldPicker` (Task 2); `FilterValueEditor` e `LookupSearch` de `FilterEditors.tsx` (o editor de valor que o painel atual já usa no avançado — leia como `ConditionRow` em `FiltersPanel.tsx` o chama e reuse); `FILTER_OPS`, `conditionProblem`, `describeCondition`, `fieldLabel`, `newCondition`.
- Produces:

```ts
export type FilterRowProps = {
  condition: FilterCondition
  fields: FilterField[]
  search?: LookupSearch
  /** Abre o popover do valor ao montar (linha recém-criada). */
  autoOpen?: 'field' | 'value'
  /** `null` remove. */
  onChange: (next: FilterCondition) => void
  onRemove: () => void
  onDuplicate: () => void
  /** Ausente dentro de grupo. */
  onWrap?: () => void
}
export function FilterRow(props: FilterRowProps): JSX.Element
```

Comportamento:
- Caixa `role="group"` com `aria-label` = `describeCondition(condition, fields)` e `tabIndex={0}`; `Delete`/`Backspace` com a caixa em foco chama `onRemove`.
- Três botões-token: campo (`fieldLabel`, negrito) → `FilterFieldPicker`; operador (rótulo de `FILTER_OPS`) → menu com os operadores do tipo, `empty`/`not-empty` depois de um divisor; valor (texto de `describeCondition` sem o campo e o operador, ou "escolha um valor" em cinza quando `conditionProblem` acusa) → popover com `FilterValueEditor`. Operador sem valor (`!needsValue`) esconde o token de valor.
- Trocar campo: mesmo `kind` mantém `op`, `value`, `to`, `values`; outro `kind` → `newCondition(field)` com o mesmo `id`.
- Menu "⋯" (`aria-label="Mais ações do filtro"`): "Trocar campo", "Duplicar", "Colocar num grupo" (só com `onWrap`), divisor, "Remover".
- Botão × `aria-label="Remover filtro"`.
- Celular: tokens quebram (campo em cima; operador e valor embaixo) via CSS; popovers usam `Sheet`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FilterRow } from './FilterRow'
import type { FilterCondition, FilterField } from './filters'

const fields: FilterField[] = [
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Pendente' }, { value: '2', label: 'Aprovado' }] },
  { key: 'tipo', label: 'Tipo', kind: 'choice', options: [{ value: '1', label: 'A' }] },
  { key: 'valor', label: 'Valor total', kind: 'number' },
]
const cond: FilterCondition = { type: 'condition', id: 'c1', field: 'status', op: 'in', values: [{ value: '1', label: 'Pendente' }] }
beforeEach(() => { vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(cleanup)
const mount = (extra: Partial<Parameters<typeof FilterRow>[0]> = {}) => {
  const p = { onChange: vi.fn(), onRemove: vi.fn(), onDuplicate: vi.fn(), onWrap: vi.fn(), ...extra }
  render(<FilterRow condition={cond} fields={fields} {...p} />)
  return p
}

it('lê como frase', () => {
  mount()
  expect(screen.getByRole('group').getAttribute('aria-label')).toMatch(/Status.*é um de.*Pendente/)
})
it('trocar operador oferece os do tipo, com vazio/preenchido depois', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: /é um de/ }))
  const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
  expect(items).toEqual(['é um de', 'não é nenhum de', 'está vazio', 'está preenchido'])
  fireEvent.click(screen.getByRole('menuitem', { name: 'está vazio' }))
  expect(p.onChange).toHaveBeenCalledWith(expect.objectContaining({ op: 'empty' }))
})
it('trocar para campo do mesmo tipo mantém o operador; de outro tipo reinicia', () => {
  const p = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Status' }))
  fireEvent.click(screen.getByRole('option', { name: /Tipo/ }))
  expect(p.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c1', field: 'tipo', op: 'in' }))
  fireEvent.click(screen.getByRole('button', { name: 'Status' }))
  fireEvent.click(screen.getByRole('option', { name: /Valor total/ }))
  expect(p.onChange).toHaveBeenLastCalledWith({ type: 'condition', id: 'c1', field: 'valor', op: 'eq' })
})
it('Del na caixa remove; menu tem Colocar num grupo só com onWrap', () => {
  const p = mount()
  fireEvent.keyDown(screen.getByRole('group'), { key: 'Delete' })
  expect(p.onRemove).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  expect(screen.getByRole('menuitem', { name: 'Colocar num grupo' })).toBeTruthy()
  cleanup()
  mount({ onWrap: undefined })
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  expect(screen.queryByRole('menuitem', { name: 'Colocar num grupo' })).toBeNull()
})
it('valor ausente mostra "escolha um valor"', () => {
  cleanup()
  render(<FilterRow condition={{ ...cond, values: [] }} fields={fields} onChange={vi.fn()} onRemove={vi.fn()} onDuplicate={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'escolha um valor' })).toBeTruthy()
})
```

- [ ] **Step 2: Run** `... test -- src/tableView/FilterRow.test.tsx` → FAIL.
- [ ] **Step 3: Implement** conforme acima. Se `newCondition` gerar `id` novo, sobrescreva com `condition.id`.
- [ ] **Step 4: Run** → PASS; `typecheck`.
- [ ] **Step 5: Commit** — `feat(filtros): condição em frase com tokens editáveis`

### Task 4: `FiltersPanel` em lista única

**Files:**
- Modify (reescrever o corpo): `packages/ui/src/tableView/FiltersPanel.tsx`
- Modify: `packages/ui/src/tableView/table-view.css` (remover `bt-filters__quick*`/abas que ficarem sem uso; novas `bt-filters__list`, `__conn`, `__group`, `__locked`, `__alt`, `__empty`, `__add`; animações da Global Constraints com `@media (prefers-reduced-motion: reduce)`)
- Test: `packages/ui/src/tableView/FiltersPanel.test.tsx` (novo)

**Interfaces:**
- Consumes: `toPanelList`, `fromPanelList` (Task 1); `FilterFieldPicker` (Task 2); `FilterRow` (Task 3); `appendTo`, `removeNode`, `updateNode`, `newCondition`, `newGroup`, `countIncomplete`, `emptyFilters`, `MAX_GROUP_DEPTH`.
- Produces (props; as antigas continuam):

```ts
export type FilterLocked = { id: string; label: string; reason?: string }
export type FiltersPanelProps = {
  open: boolean
  onClose: () => void
  fields: FilterField[]
  value: TableFilters
  onApply: (filters: TableFilters) => void
  search?: LookupSearch
  countPreview?: (filters: TableFilters) => Promise<number | null>
  /** @deprecated Sem abas desde 1.35; ignorado. */
  initialTab?: FiltersPanelTab
  /** Filtros da visão salva: liga "Filtros diferentes da visão salva · Restaurar". */
  saved?: TableFilters
  /** Condições que a tela não sabe editar (sempre valem). */
  locked?: FilterLocked[]
  /** Remove uma condição só leitura (aplica na hora). Sem ela, sem ×. */
  onRemoveLocked?: (id: string) => void
  /** Substantivo da lista; padrão { one: 'registro', other: 'registros' }. */
  noun?: { one: string; other: string }
}
```

Comportamento (detalhes na spec, seções "Estrutura", "Adicionar e editar", "Teclado", "Movimento"):
- Rascunho = `toPanelList(value, fields)` a cada abertura; "Mostrar" chama `onApply(fromPanelList(draft, fields))` e fecha. `changed` compara `fromPanelList(draft)` com `value` (JSON).
- Conectores: 1ª linha "Onde"; 2ª linha botão (`aria-label="Trocar para ou"`/`"Trocar para e"`) que alterna `logic` do grupo; demais rótulo sem clique. Mesmo esquema dentro do grupo.
- Grupo: bloco com × (`aria-label="Remover grupo"`), "+ Filtro" no fim; ficar vazio remove o grupo. `onWrap` só na raiz: troca a linha por `{ ...newGroup('or'), items: [linha] }` e abre o seletor para a segunda linha do grupo.
- "+ Adicionar filtro": abre `FilterFieldPicker`; ao escolher, `appendTo(draft, 'raiz', newCondition(field))` com `autoOpen='value'` naquela linha. "+ Adicionar grupo": cria grupo "ou" e abre o seletor para a primeira linha dele.
- Só leitura: no topo, conector "Sempre", cadeado, "só leitura" com `title={reason}` (e ⓘ com tooltip), × (`aria-label="Remover condição da visão"`) só com `onRemoveLocked`.
- Aviso `saved`: aparece quando `saved` existe e `fromPanelList(draft)` difere de `saved` (JSON após `readFilters` dos dois); "Restaurar" troca o rascunho por `toPanelList(saved)`.
- Estado vazio (sem itens e sem `locked`): "Nenhum filtro", "Mostrando todas as N <noun.other>." (N do `countPreview`; sem N, só "Nenhum filtro") e "+ Adicionar filtro".
- Rodapé: "Limpar" (rascunho vazio; `locked` fica) à esquerda; à direita, nota de incompletos ("1 filtro sem valor não entra"/"N filtros sem valor não entram") e o primário "Mostrar N <noun>" / "Mostrar resultados", desabilitado sem mudança, número em `aria-live="polite"`; durante o recálculo (400 ms), o texto antigo com classe `is-stale` (opacidade 0.5).
- Sem "Cancelar". `Esc` com popover aberto fecha o popover (os popovers param a propagação); `Esc` no painel = `requestClose` (diálogo de descarte atual). `Ctrl/Cmd+Enter` aplica.
- Remover linha: foco vai para a próxima linha (ou "+ Adicionar filtro").

- [ ] **Step 1: Write the failing tests** (`FiltersPanel.test.tsx`)

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FiltersPanel, type FiltersPanelProps } from './FiltersPanel'
import { emptyFilters, type FilterCondition, type FilterField, type TableFilters } from './filters'

const fields: FilterField[] = [
  { key: 'cliente', label: 'Cliente', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'choice', options: [{ value: '1', label: 'Pendente' }, { value: '2', label: 'Aprovado' }] },
  { key: 'valor', label: 'Valor total', kind: 'number' },
]
const c = (field: string, op: FilterCondition['op'], extra: Partial<FilterCondition> = {}): FilterCondition => ({ type: 'condition', id: `${field}-${op}`, field, op, ...extra })
const com = (quick: TableFilters['quick'], advanced = emptyFilters().advanced): TableFilters => ({ quick, advanced })

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) })
afterEach(() => { cleanup(); vi.useRealTimers() })

const mount = (extra: Partial<FiltersPanelProps> = {}) => {
  const p = { onClose: vi.fn(), onApply: vi.fn(), ...extra }
  render(<FiltersPanel open fields={fields} value={com({})} {...p} />)
  return p
}

it('sem filtro mostra o estado vazio', () => {
  mount()
  expect(screen.getByText('Nenhum filtro')).toBeTruthy()
  expect(screen.queryByRole('tab')).toBeNull()
})
it('rápidos e avançados aparecem na mesma lista, com Onde / e', () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'Tenaris' }) }, { type: 'group', id: 'raiz', logic: 'and', items: [c('valor', 'gt', { value: 1000 })] }) })
  expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([expect.stringMatching(/Cliente/), expect.stringMatching(/Valor total/)])
  expect(screen.getByText('Onde')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Trocar para ou' })).toBeTruthy()
})
it('adicionar filtro e aplicar grava no formato de sempre', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'x' }) }) })
  fireEvent.click(screen.getByRole('button', { name: '+ Adicionar filtro' }))
  fireEvent.click(screen.getByRole('option', { name: /Valor total/ }))
  fireEvent.click(screen.getAllByRole('button', { name: 'Remover filtro' })[0]) // remove a 1ª (cliente)
  fireEvent.click(screen.getByRole('button', { name: /^Mostrar/ }))
  expect(p.onApply).toHaveBeenCalledWith(expect.objectContaining({ quick: {} }))
})
it('e/ou alterna a lógica da raiz', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }), valor: c('valor', 'gt', { value: 1 }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Trocar para ou' }))
  fireEvent.click(screen.getByRole('button', { name: /^Mostrar/ }))
  expect(p.onApply.mock.calls[0][0]).toMatchObject({ quick: {}, advanced: { logic: 'or' } })
})
it('colocar num grupo embrulha a linha num grupo ou', () => {
  mount({ value: com({ valor: c('valor', 'gt', { value: 1 }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Mais ações do filtro' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar num grupo' }))
  fireEvent.click(screen.getByRole('option', { name: /Cliente/ }))
  expect(screen.getByRole('button', { name: 'Remover grupo' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '+ Adicionar grupo', hidden: false })).toBeTruthy() // só na raiz
})
it('condição só leitura fica no topo com Sempre; × só com onRemoveLocked', () => {
  const onRemoveLocked = vi.fn()
  mount({ locked: [{ id: 'l1', label: 'Região da origem é Sul', reason: 'Não editável aqui' }], onRemoveLocked })
  expect(screen.getByText('Sempre')).toBeTruthy()
  expect(screen.getByText('Região da origem é Sul')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Remover condição da visão' }))
  expect(onRemoveLocked).toHaveBeenCalledWith('l1')
  cleanup()
  mount({ locked: [{ id: 'l1', label: 'Região da origem é Sul' }] })
  expect(screen.queryByRole('button', { name: 'Remover condição da visão' })).toBeNull()
})
it('aviso de visão alterada e Restaurar', () => {
  const saved = com({ cliente: c('cliente', 'contains', { value: 'Tenaris' }) })
  mount({ value: saved, saved })
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro' }))
  expect(screen.getByText('Filtros diferentes da visão salva')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
  expect(screen.queryByText('Filtros diferentes da visão salva')).toBeNull()
})
it('contagem no primário com o substantivo da lista', async () => {
  mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }), countPreview: () => Promise.resolve(42), noun: { one: 'composição', other: 'composições' } })
  await act(async () => { vi.advanceTimersByTime(400) })
  expect(screen.getByRole('button', { name: /Mostrar 42 composições/ })).toBeTruthy()
})
it('Esc com mudança pede confirmação; sem mudança fecha', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }) })
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
  expect(p.onClose).toHaveBeenCalled()
})
it('Ctrl+Enter aplica', () => {
  const p = mount({ value: com({ cliente: c('cliente', 'contains', { value: 'a' }) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Remover filtro' }))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true })
  expect(p.onApply).toHaveBeenCalled()
})
```

Ajuste os seletores se o `Drawer` do DS usar outro `role`, mas mantenha cada caso.

- [ ] **Step 2: Run** `... test -- src/tableView/FiltersPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement** a reescrita. Mantenha o diálogo de descarte atual e o efeito de `countPreview` (agora sobre `fromPanelList(draft)`).
- [ ] **Step 4: Run** o arquivo → PASS; depois a suíte inteira do pacote (`viewDiscard`, `ViewBar.*`, `tableView.test.ts` podem citar "Aplicar"/"Por coluna": atualize para os textos novos, sem tirar a intenção dos testes) e `typecheck`.
- [ ] **Step 5: Commit** — `feat(filtros): painel em lista única com grupos, só leitura e visão alterada`

### Task 5: `ViewBar`, `FilterChips`, exports, versão e documentação

**Files:**
- Modify: `packages/ui/src/tableView/ViewBar.tsx` (tipo `filters` em `ViewBarProps` ~linha 58; bloco do `FiltersPanel` ~linha 452)
- Modify: `packages/ui/src/tableView/FilterChips.tsx` (o "editar avançado" só abre o painel)
- Modify: `packages/ui/src/index.ts` (exportar `FilterLocked`)
- Modify: `packages/ui/package.json` (`"version": "1.35.0"`), CHANGELOG do pacote se existir, e a seção §10.9.2 da documentação do DS (procure `10.9.2` no repositório: `git grep -n "10.9.2" -- '*.md'`)
- Test: o teste de `ViewBar` existente mais próximo (ex. `viewDiscard.test.tsx`) ganha um caso

**Interfaces:**
- Consumes: `FiltersPanelProps` (Task 4).
- Produces: `ViewBarProps['filters']` com `locked?: FilterLocked[]`, `onRemoveLocked?: (id: string) => void`, `noun?: { one: string; other: string }`. O `ViewBar` passa `saved={readFilters(view.active.config.filters, filters.fields)}` (confira o caminho real da config da visão ativa em `useTableView.ts`/`config.ts`).

- [ ] **Step 1: Write the failing test** (no arquivo de teste do ViewBar com `filters`, ou num novo `ViewBar.filters.test.tsx` montando como `viewDiscard.test.tsx`): passando `filters={{ fields, locked: [{ id: 'l1', label: 'Região é Sul' }], noun: { one: 'composição', other: 'composições' } }}`, abrir "Filtros" mostra "Sempre" e "Região é Sul".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** o repasse; remover o estado `filtersTab` (vira booleano `filtersOpen`); `FilterChips.onEditAdvanced` abre o painel.
- [ ] **Step 4: Run** a suíte inteira do pacote + `typecheck` → PASS.
- [ ] **Step 5: Docs e versão**: 1.35.0; na §10.9.2, trocar a descrição das abas pela lista única (resumo da spec: frase, conectores, grupo de um nível, só leitura com "Sempre", aviso de visão alterada, rodapé "Mostrar N").
- [ ] **Step 6: Commit** — `feat(filtros): ViewBar repassa só leitura, substantivo e visão salva; 1.35.0`

### Task 6: prints, PR e publicação do DS

- [ ] **Step 1:** Se o DS tiver playground/demo (procure `apps/` ou `docs/` com Vite), tire prints do painel: antes (na `origin/main`) e depois, desktop 1440×900 e celular 375×812, com: lista com grupo + só leitura + aviso de visão alterada; seletor de campo aberto; estado vazio. Sem playground, os prints saem da Parte B.
- [ ] **Step 2:** Abra o PR do DS para `main` (descrição: resumo da spec, prints, "formato gravado sem mudança"). Com o CI verde, faça o merge e confirme que a versão 1.35.0 foi publicada no GitHub Packages (veja o workflow de publicação do repositório). Se a publicação não for automática, siga o processo documentado no README do DS.

## Parte B — `Sistema-Betinhos`

Branch nova a partir da `develop` atualizada: `t3/painel-filtros-composicao`. Testes: `pnpm --filter shell test -- <arquivo>` e `pnpm typecheck` (confira o nome do pacote em `apps/shell/package.json`).

### Task 7: condições travadas legíveis e removíveis uma a uma

**Files:**
- Create: `apps/shell/src/pages/composicao/data/locked-labels.ts` (move `describeNative` e o que ele usa de `components/ReadOnlyFilters.tsx`)
- Modify: `apps/shell/src/pages/composicao/useComposicaoViewState.ts:42,188-192,210`
- Test: `apps/shell/src/pages/composicao/data/table-view.test.ts` (ou `locked-labels.test.ts` novo)

**Interfaces:**
- Consumes: `LockedFilters`, `lockedCount`, `fromTableFilters` (`data/table-view.ts`); `FilterLocked` do DS (1.35.0).
- Produces: `lockedItems(locked: LockedFilters, catalog, valueLabel): FilterLocked[]` em `locked-labels.ts` (id estável: `f:<índice>` para `filters`, `g:<índice>` para `groups`, `o:<índice>` para `orGroups`; rótulo: nome de exibição do catálogo + operador em português + valor formatado; grupos: `"uma destas: A; B"`; `reason` = texto da spec); `removeLockedFilter(id: string): void` no retorno de `useComposicaoViewState`, no lugar de `clearLockedFilters`; o retorno expõe `locked: FilterLocked[]` (no lugar de `lockedFilters`).

- [ ] **Step 1: Write the failing tests**: (a) `lockedItems` com um `ViewFilter` de atributo do catálogo devolve o rótulo de exibição, nunca o nome lógico (use um caso real da visão Tenaris do mock, se houver; senão monte um `ViewFilter` com `attribute: 'cr40f_regiao'` e catálogo `{ cr40f_regiao: 'Região' }`); (b) um grupo vira um item "uma destas: …"; (c) remover `f:0` de dois filtros travados deixa só o outro em `fromTableFilters` (teste no nível de `table-view.ts`, como os testes atuais de `fromTableFilters`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lockedItems` e `removeLockedFilter` (filtra o item de `tableFilters.locked` pelo id e chama `fromTableFilters(tableFilters.filters, { ...tableFilters, locked: semOItem }, …)`, como `clearLockedFilters` faz hoje com tudo).
- [ ] **Step 4: Run** → PASS; typecheck.
- [ ] **Step 5: Commit** — `feat(composicao): condições da visão legíveis e removíveis uma a uma`

### Task 8: ligar a Composição ao painel novo

**Files:**
- Modify: `apps/shell/package.json:19` (`"@betinhos/ui": "npm:@betinhos-executive-service/ui@^1.35.0"`) + `pnpm install` (lockfile)
- Modify: `apps/shell/src/pages/composicao/components/CompositionCommandLine.tsx:66,77`
- Delete: `apps/shell/src/pages/composicao/components/ReadOnlyFilters.tsx` (e seu teste, se houver)
- Test: `apps/shell/src/pages/composicao/ComposicaoPage.view-bar.test.tsx`

- [ ] **Step 1: Atualizar o teste** `ComposicaoPage.view-bar.test.tsx`: onde ele espera o botão/diálogo "Filtros da visão (N)", passar a abrir "Filtros" e esperar "Sempre" + o rótulo legível; remover uma condição da visão chama a remoção e o rótulo some.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: `filters={p.ready ? { fields: p.view.filterFields, search: p.view.search, locked: p.view.locked, onRemoveLocked: p.view.removeLockedFilter, noun: { one: 'composição', other: 'composições' } } : undefined}`; tirar o `<ReadOnlyFilters … />` e o import; apagar o componente.
- [ ] **Step 4: Run** testes da Composição + `pnpm typecheck` + `pnpm test` do shell → PASS.
- [ ] **Step 5: Commit** — `feat(composicao): painel de filtros em lista única (DS 1.35)`

### Task 9: prints e PR

- [ ] **Step 1:** `pnpm dev` (mock, porta 36472) e prints da Composição em `#/composicao` (ou a rota real; veja a skill `verificar-composicao`): painel antes (develop) e depois, desktop 1440 e celular 375, com filtros de visão + grupo + só leitura; seletor de campo; estado vazio. Também o painel numa lista comum (ex. Funcionários). Rode a skill `ux-audit` no modo Rápido no painel (drill de 30 s + console).
- [ ] **Step 2:** PR para `develop` com resumo, prints e "parte com Dataverse DEV não verificada na nuvem" se for o caso. Não fazer merge.
