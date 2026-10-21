# Equipamentos MVP — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa por tarefa. Passos com checkbox (`- [ ]`).

**Objetivo:** criar `#/equipamentos` (cadastro de equipamentos com responsável atual) e a aba Equipamentos na ficha do funcionário, mais o script que cria o schema no Dataverse DEV.

**Arquitetura:** módulo React novo em `apps/shell/src/pages/equipamentos/`, no molde de `pages/infracoes/` (`domain/` puro → `data/` com Source Dataverse ou mock → `useEquipamentos` → página com `useListView` → drawers). Schema por `packages/deploy/provision-equipamentos.ps1` (molde `provision-documentos.ps1`) e privilégios por `conceder-privilegios-equipamentos.ps1` (molde `conceder-privilegios-documentos.ps1`).

**Stack:** React 18 + TypeScript, `@betinhos/ui` (Table, Drawer, Dialog, Field, Input, Select, Textarea, ViewBar, StatusBadge), `@betinhos/dataverse`, Vitest + Testing Library (jsdom), Windows PowerShell 5.1.

**Spec:** `docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md`

## Restrições globais

- Comandos do shell rodam em `apps/shell`: `pnpm test -- <arquivo>`, `pnpm typecheck`, `pnpm dev` (porta 36472, mock automático em localhost).
- Worktree sem `node_modules`: rode `pnpm install --frozen-lockfile` na raiz do worktree antes da Tarefa 1. Não altere versões nem o lockfile.
- Textos de UI em pt-BR com acentos; arquivos em UTF-8. Scripts `.ps1` salvos **com BOM** (Windows PowerShell 5.1).
- Design System: só tokens `--bt-*` e primitivas de `@betinhos/ui`; tema claro; sem gradiente; status sempre com texto.
- Status (choice `cr40f_status`): 100000000 Em uso, 100000001 Disponível, 100000002 Em manutenção, 100000003 Baixado.
- Nomes lógicos: `cr40f_equipamento` (PK `cr40f_equipamentoid`), `cr40f_tipoequipamento` (PK `cr40f_tipoequipamentoid`), lookups `cr40f_tipo` (nav `cr40f_Tipo`) e `cr40f_responsavel` (nav `cr40f_Responsavel` → `cr40f_funcionarios`).
- Limpar lookup na Web API: `DELETE <set>(<id>)/cr40f_Responsavel/$ref`, nunca `@odata.bind: null` (padrão de `pages/operacional/data/mutations.ts`).
- Link direto para um item: `#/equipamentos?ver=<guid>` (convenção `useQueryAlvo`).
- Nada roda contra PROD. `-Apply` dos scripts e `pnpm push` só no checkout principal, na `main`, depois do merge (CLAUDE.md do repo).
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Ajustes ao spec decididos neste plano

1. Tabelas `UserOwned` (o `Ensure-Table` do molde só cria assim; Documentos também é UserOwned). O spec dizia "escopo organização".
2. Link direto usa `?ver=<guid>` (convenção do shell), não `?id=`.
3. "Sem responsável" é uma **visão pronta** + filtro avançado `Com responsável = Não` (filtros rápidos do DS saem das colunas). "Responsável" continua como filtro rápido.
4. Mensagem de tabela ausente segue o padrão do shell: "Tabela cr40f_equipamento não encontrada na metadata."

A Tarefa 9 atualiza o spec com esses quatro pontos.

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `pages/equipamentos/domain/types.ts` | tipos `Equipamento`, `TipoEquipamento`, `Pessoa` |
| `pages/equipamentos/domain/choices.ts` | status: valores, rótulos, tom |
| `pages/equipamentos/domain/cadastros.ts` | validação de tipo, ordenação, opções de seletor |
| `pages/equipamentos/domain/form.ts` | formulário, regras status × responsável, validação, série repetida, diff |
| `pages/equipamentos/domain/lista.ts` | colunas, campos de filtro, busca, ordenação, visões |
| `pages/equipamentos/domain/domain.test.ts` | testes do domínio e dos mappers |
| `pages/equipamentos/data/queries.ts` | nomes lógicos, paths, mappers, payload |
| `pages/equipamentos/data/mock.ts` | dados de exemplo |
| `pages/equipamentos/data/source.ts` | Source Dataverse ou mock |
| `pages/equipamentos/useEquipamentos.ts` | carga, recarga, upsert |
| `pages/equipamentos/components/EquipamentosList.tsx` | tabela (desktop) e cards (celular) |
| `pages/equipamentos/components/EquipamentoForm.tsx` | campos do formulário |
| `pages/equipamentos/components/EquipamentoDrawer.tsx` | cadastro/edição, descartar alterações |
| `pages/equipamentos/components/TiposDrawer.tsx` | adicionar, renomear, inativar tipos |
| `pages/equipamentos/EquipamentosPage.tsx` | página |
| `pages/equipamentos/EquipamentosPage.test.tsx` | testes da página |
| `pages/equipamentos/equipamentos.css` | estilos `eq-*` |
| `nav/menu.ts`, `nav/menu.test.ts`, `app/routes.tsx`, `app/AppShell.tsx` | registro da rota |
| `pages/funcionarios/data/{types,source,dataverse,mock}.ts`, `components/{RelatedTabs,Ficha,Ficha.test}.tsx` | aba Equipamentos |
| `packages/deploy/provision-equipamentos.ps1`, `conceder-privilegios-equipamentos.ps1` | schema e privilégios no DEV |
| `.claude/skills/verificar-equipamentos/SKILL.md` | skill de verificação |

Caminhos `pages/…`, `nav/…`, `app/…` são relativos a `apps/shell/src/`.

---

### Tarefa 1: Domínio — tipos, status e formulário

**Arquivos:**
- Criar: `pages/equipamentos/domain/types.ts`, `domain/choices.ts`, `domain/cadastros.ts`, `domain/form.ts`
- Teste: `pages/equipamentos/domain/domain.test.ts`

**Interfaces:**
- Consome: `parseValor` de `pages/infracoes/domain/form.ts`; `normalize` de `pages/infracoes/domain/filters.ts`.
- Produz: `Equipamento`, `TipoEquipamento`, `Pessoa`; `STATUS`, `STATUS_OPTIONS`, `statusLabel(v)`, `statusTone(v)`; `validateTipo(nome, tipos, selfId): string | null`, `byNome`, `opcoesAtivas(list, atualId)`; `EquipamentoForm`, `FormErrors`, `Changes`, `MAX_LENGTH`, `emptyForm()`, `toForm(e)`, `withResponsavel(f, id)`, `withStatus(f, status)`, `validateForm(f)`, `serieRepetida(f, list, selfId)`, `diffForm(base, f)`, `hasChanges(c)`, `isDirty(a, b)`, `applyForm(e, f, tipos, pessoas)`, `emptyEquipamento(id)`.

- [ ] **Passo 1: escrever os testes que falham**

`pages/equipamentos/domain/domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { STATUS, statusLabel } from './choices'
import { opcoesAtivas, validateTipo } from './cadastros'
import { applyForm, diffForm, emptyEquipamento, emptyForm, hasChanges, isDirty, serieRepetida, toForm, validateForm, withResponsavel, withStatus } from './form'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

const S = (v: number) => String(v)
const tipos: TipoEquipamento[] = [{ id: 't1', nome: 'Notebook', ativo: true }, { id: 't2', nome: 'Pager', ativo: false }, { id: 't3', nome: 'Mouse', ativo: true }]
const pessoas: Pessoa[] = [{ id: 'p1', nome: 'Bruna Lima', ativo: true }, { id: 'p2', nome: 'Fabio Nunes', ativo: false }]
const item = (over: Partial<Equipamento> = {}): Equipamento => ({ ...emptyEquipamento('e1'), descricao: 'Notebook do Financeiro', tipoId: 't1', tipoNome: 'Notebook', numeroSerie: 'DL5440-001', status: STATUS.emUso, responsavelId: 'p1', responsavelNome: 'Bruna Lima', ...over })

describe('status e responsável', () => {
  it('escolher responsável em item Disponível sugere Em uso', () => {
    expect(withResponsavel(emptyForm(), 'p1')).toMatchObject({ responsavelId: 'p1', status: S(STATUS.emUso) })
  })
  it('limpar responsável em item Em uso sugere Disponível', () => {
    expect(withResponsavel({ ...emptyForm(), status: S(STATUS.emUso), responsavelId: 'p1' }, '')).toMatchObject({ responsavelId: '', status: S(STATUS.disponivel) })
  })
  it('não mexe em Em manutenção', () => {
    expect(withResponsavel({ ...emptyForm(), status: S(STATUS.manutencao) }, 'p1').status).toBe(S(STATUS.manutencao))
  })
  it('Baixado limpa o responsável', () => {
    expect(withStatus({ ...emptyForm(), responsavelId: 'p1' }, S(STATUS.baixado))).toMatchObject({ responsavelId: '', status: S(STATUS.baixado) })
  })
  it('rótulo do status', () => {
    expect(statusLabel(STATUS.manutencao)).toBe('Em manutenção')
    expect(statusLabel(null)).toBe('Sem status')
  })
})

describe('validação', () => {
  it('exige descrição, tipo e status', () => {
    expect(validateForm({ ...emptyForm(), status: '' })).toMatchObject({ descricao: 'Informe a descrição.', tipoId: 'Escolha o tipo.', status: 'Escolha o status.' })
  })
  it('rejeita valor inválido e aceita 3.499,90', () => {
    const base = { ...emptyForm(), descricao: 'X', tipoId: 't1' }
    expect(validateForm({ ...base, valorCompra: '-10' }).valorCompra).toBe('Valor inválido. Use o formato 1.467,35.')
    expect(validateForm({ ...base, valorCompra: '3.499,90' })).toEqual({})
  })
  it('Baixado com responsável é erro', () => {
    expect(validateForm({ ...emptyForm(), descricao: 'X', tipoId: 't1', status: S(STATUS.baixado), responsavelId: 'p1' }).responsavelId).toBe('Item baixado não fica com responsável.')
  })
  it('limita tamanho da descrição', () => {
    expect(validateForm({ ...emptyForm(), descricao: 'a'.repeat(201), tipoId: 't1' }).descricao).toBe('No máximo 200 caracteres.')
  })
})

describe('série repetida', () => {
  const list = [item(), item({ id: 'e2', numeroSerie: '' })]
  it('acha outro item ignorando caixa, espaço e traço', () => {
    expect(serieRepetida({ ...emptyForm(), numeroSerie: 'dl5440 001' }, list, null)?.id).toBe('e1')
  })
  it('ignora o próprio item e série vazia', () => {
    expect(serieRepetida(toForm(item()), list, 'e1')).toBeNull()
    expect(serieRepetida(emptyForm(), list, null)).toBeNull()
  })
})

describe('diff e aplicação', () => {
  it('cadastro manda só o preenchido e o tipo', () => {
    const c = diffForm(null, { ...emptyForm(), descricao: ' Mouse ', tipoId: 't3' })
    expect(c).toEqual({ campos: { cr40f_name: 'Mouse', cr40f_status: STATUS.disponivel }, tipoId: 't3' })
  })
  it('edição manda só o que mudou; limpar responsável vira null', () => {
    const base = toForm(item())
    const next = withResponsavel({ ...base, marcaModelo: 'Dell' }, '')
    expect(diffForm(base, next)).toEqual({ campos: { cr40f_marcamodelo: 'Dell', cr40f_status: STATUS.disponivel }, responsavelId: null })
  })
  it('sem mudança não tem alterações', () => {
    const base = toForm(item())
    expect(hasChanges(diffForm(base, { ...base }))).toBe(false)
    expect(isDirty(base, { ...base })).toBe(false)
  })
  it('data e valor vazios viram null na edição', () => {
    const base = toForm(item({ dataCompra: '2026-01-10', valorCompra: 3499.9 }))
    expect(diffForm(base, { ...base, dataCompra: '', valorCompra: '' }).campos).toEqual({ cr40f_datacompra: null, cr40f_valorcompra: null })
  })
  it('aplica nomes de tipo e responsável', () => {
    const saved = applyForm(item(), { ...toForm(item()), tipoId: 't3', responsavelId: 'p2', valorCompra: '89,90' }, tipos, pessoas)
    expect(saved).toMatchObject({ tipoNome: 'Mouse', responsavelNome: 'Fabio Nunes', valorCompra: 89.9 })
  })
})

describe('cadastros', () => {
  it('tipo exige nome único sem caixa e acento', () => {
    expect(validateTipo('  ', tipos, null)).toBe('Informe o nome do tipo.')
    expect(validateTipo('NOTEBOOK', tipos, null)).toBe('Já existe o tipo Notebook.')
    expect(validateTipo('Notebook', tipos, 't1')).toBeNull()
    expect(validateTipo('Webcam', tipos, null)).toBeNull()
  })
  it('opções mostram ativos e o atual inativo marcado', () => {
    expect(opcoesAtivas(tipos, null).map((o) => o.label)).toEqual(['Mouse', 'Notebook'])
    expect(opcoesAtivas(tipos, 't2').map((o) => o.label)).toEqual(['Mouse', 'Notebook', 'Pager (inativo)'])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run (em `apps/shell`): `pnpm test -- src/pages/equipamentos/domain/domain.test.ts`
Esperado: FAIL, módulos `./choices`, `./cadastros`, `./form` não encontrados.

- [ ] **Passo 3: implementar**

`pages/equipamentos/domain/types.ts`:

```ts
/** Equipamento da empresa (`cr40f_equipamento`). */
export type Equipamento = {
  id: string
  descricao: string
  tipoId: string | null
  tipoNome: string
  marcaModelo: string
  numeroSerie: string
  status: number | null
  /** Funcionário com o item; null = escritório/estoque. */
  responsavelId: string | null
  responsavelNome: string
  /** `aaaa-mm-dd` (coluna só data). */
  dataCompra: string | null
  valorCompra: number | null
  observacoes: string
  modificadoEm: Date | null
}

/** Cadastro de tipos (`cr40f_tipoequipamento`); inativo some dos seletores. */
export type TipoEquipamento = { id: string; nome: string; ativo: boolean }

/** Funcionário que pode ser responsável (`cr40f_funcionarios`). */
export type Pessoa = { id: string; nome: string; ativo: boolean }
```

`pages/equipamentos/domain/choices.ts`:

```ts
import type { StatusTone } from '@betinhos/ui'

/** Valores do choice `cr40f_status` criados por provision-equipamentos.ps1. */
export const STATUS = { emUso: 100000000, disponivel: 100000001, manutencao: 100000002, baixado: 100000003 } as const

export const STATUS_OPTIONS = [
  { value: STATUS.emUso, label: 'Em uso' },
  { value: STATUS.disponivel, label: 'Disponível' },
  { value: STATUS.manutencao, label: 'Em manutenção' },
  { value: STATUS.baixado, label: 'Baixado' },
]

const TONE: Record<number, StatusTone> = { [STATUS.emUso]: 'info', [STATUS.disponivel]: 'success', [STATUS.manutencao]: 'warning', [STATUS.baixado]: 'neutral' }

export const statusLabel = (v: number | null) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? 'Sem status'
export const statusTone = (v: number | null): StatusTone => (v == null ? 'neutral' : TONE[v] ?? 'neutral')
```

`pages/equipamentos/domain/cadastros.ts`:

```ts
import { normalize } from '../../infracoes/domain/filters'
import type { TipoEquipamento } from './types'

export const MAX_TIPO = 100

export const byNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR')

/** Nome obrigatório e único (sem diferenciar caixa e acento). */
export function validateTipo(nome: string, tipos: TipoEquipamento[], selfId: string | null): string | null {
  const t = nome.trim()
  if (!t) return 'Informe o nome do tipo.'
  if (t.length > MAX_TIPO) return `No máximo ${MAX_TIPO} caracteres.`
  const key = normalize(t)
  const dup = tipos.find((o) => o.id !== selfId && normalize(o.nome.trim()) === key)
  return dup ? `Já existe o tipo ${dup.nome}.` : null
}

/** Opções de seletor: ativos, mais o valor atual do item mesmo se inativo. */
export function opcoesAtivas<T extends { id: string; nome: string; ativo: boolean }>(list: T[], atualId: string | null | undefined) {
  return list
    .filter((x) => x.ativo || x.id === atualId)
    .sort(byNome)
    .map((x) => ({ value: x.id, label: x.ativo ? x.nome : `${x.nome} (inativo)` }))
}
```

`pages/equipamentos/domain/form.ts`:

```ts
import type { Row } from '@betinhos/dataverse'
import { normalize } from '../../infracoes/domain/filters'
import { parseValor } from '../../infracoes/domain/form'
import { STATUS } from './choices'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

/** Valores do formulário como texto; '' = vazio; status como string do número. */
export type EquipamentoForm = {
  descricao: string; tipoId: string; marcaModelo: string; numeroSerie: string
  status: string; responsavelId: string; dataCompra: string; valorCompra: string; observacoes: string
}
export type FormKey = keyof EquipamentoForm
export type FormErrors = Partial<Record<FormKey, string>>
/** O que mudou: colunas simples e, só quando mudaram, os lookups (`responsavelId: null` = limpar). */
export type Changes = { campos: Row; tipoId?: string; responsavelId?: string | null }

export const MAX_LENGTH = { descricao: 200, marcaModelo: 200, numeroSerie: 100, observacoes: 2000 } as const
const COLUMNS = {
  descricao: 'cr40f_name', marcaModelo: 'cr40f_marcamodelo', numeroSerie: 'cr40f_numeroserie', status: 'cr40f_status',
  dataCompra: 'cr40f_datacompra', valorCompra: 'cr40f_valorcompra', observacoes: 'cr40f_observacoes',
} as const
type ColumnKey = keyof typeof COLUMNS

const S = (v: number) => String(v)
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function emptyEquipamento(id: string): Equipamento {
  return { id, descricao: '', tipoId: null, tipoNome: '', marcaModelo: '', numeroSerie: '', status: STATUS.disponivel, responsavelId: null, responsavelNome: '', dataCompra: null, valorCompra: null, observacoes: '', modificadoEm: null }
}

export function emptyForm(): EquipamentoForm {
  return { descricao: '', tipoId: '', marcaModelo: '', numeroSerie: '', status: S(STATUS.disponivel), responsavelId: '', dataCompra: '', valorCompra: '', observacoes: '' }
}

export function toForm(e: Equipamento): EquipamentoForm {
  return {
    descricao: e.descricao, tipoId: e.tipoId ?? '', marcaModelo: e.marcaModelo, numeroSerie: e.numeroSerie,
    status: e.status == null ? '' : S(e.status), responsavelId: e.responsavelId ?? '', dataCompra: e.dataCompra ?? '',
    valorCompra: e.valorCompra == null ? '' : decimal.format(e.valorCompra), observacoes: e.observacoes,
  }
}

/** Spec 4.3: responsável em item Disponível sugere Em uso; sem responsável em item Em uso sugere Disponível. */
export function withResponsavel(f: EquipamentoForm, responsavelId: string): EquipamentoForm {
  let status = f.status
  if (responsavelId && status === S(STATUS.disponivel)) status = S(STATUS.emUso)
  if (!responsavelId && status === S(STATUS.emUso)) status = S(STATUS.disponivel)
  return { ...f, responsavelId, status }
}

/** Item baixado nunca fica com responsável. */
export function withStatus(f: EquipamentoForm, status: string): EquipamentoForm {
  return { ...f, status, responsavelId: status === S(STATUS.baixado) ? '' : f.responsavelId }
}

export function validateForm(f: EquipamentoForm): FormErrors {
  const e: FormErrors = {}
  if (!f.descricao.trim()) e.descricao = 'Informe a descrição.'
  if (!f.tipoId) e.tipoId = 'Escolha o tipo.'
  if (!f.status) e.status = 'Escolha o status.'
  else if (f.status === S(STATUS.baixado) && f.responsavelId) e.responsavelId = 'Item baixado não fica com responsável.'
  if (Number.isNaN(parseValor(f.valorCompra))) e.valorCompra = 'Valor inválido. Use o formato 1.467,35.'
  if (f.dataCompra && !/^\d{4}-\d{2}-\d{2}$/.test(f.dataCompra)) e.dataCompra = 'Data inválida.'
  for (const [key, max] of Object.entries(MAX_LENGTH) as [keyof typeof MAX_LENGTH, number][]) {
    if (!e[key] && f[key].trim().length > max) e[key] = `No máximo ${max} caracteres.`
  }
  return e
}

const serieKey = (s: string) => normalize(s).replace(/[\s.\-/]/g, '')

/** Outro item com o mesmo número de série (aviso; não bloqueia). */
export function serieRepetida(f: EquipamentoForm, list: Equipamento[], selfId: string | null): Equipamento | null {
  const key = serieKey(f.numeroSerie)
  if (!key) return null
  return list.find((o) => o.id !== selfId && serieKey(o.numeroSerie) === key) ?? null
}

const clean = (v: string) => { const t = v.trim(); return t ? t : null }

function columnValue(k: ColumnKey, f: EquipamentoForm): unknown {
  if (k === 'status') return f.status ? Number(f.status) : null
  if (k === 'valorCompra') return parseValor(f.valorCompra)
  if (k === 'dataCompra') return f.dataCompra || null
  return clean(f[k])
}

/** Diferença entre o formulário salvo (`base`, null no cadastro) e o atual. */
export function diffForm(base: EquipamentoForm | null, f: EquipamentoForm): Changes {
  const campos: Row = {}
  for (const k of Object.keys(COLUMNS) as ColumnKey[]) {
    if (base && base[k] === f[k]) continue
    const v = columnValue(k, f)
    if (base || v != null) campos[COLUMNS[k]] = v
  }
  const out: Changes = { campos }
  if (!base || base.tipoId !== f.tipoId) out.tipoId = f.tipoId
  if (base ? base.responsavelId !== f.responsavelId : Boolean(f.responsavelId)) out.responsavelId = f.responsavelId || null
  return out
}

export const hasChanges = (c: Changes) => Object.keys(c.campos).length > 0 || c.tipoId !== undefined || c.responsavelId !== undefined

export const isDirty = (a: EquipamentoForm, b: EquipamentoForm) => (Object.keys(a) as FormKey[]).some((k) => a[k] !== b[k])

/** Aplica o formulário salvo ao item da lista (UI sem recarregar). */
export function applyForm(e: Equipamento, f: EquipamentoForm, tipos: TipoEquipamento[], pessoas: Pessoa[]): Equipamento {
  return {
    ...e,
    descricao: f.descricao.trim(), tipoId: f.tipoId || null, tipoNome: tipos.find((t) => t.id === f.tipoId)?.nome ?? '',
    marcaModelo: f.marcaModelo.trim(), numeroSerie: f.numeroSerie.trim(), status: f.status ? Number(f.status) : null,
    responsavelId: f.responsavelId || null, responsavelNome: pessoas.find((p) => p.id === f.responsavelId)?.nome ?? '',
    dataCompra: f.dataCompra || null, valorCompra: parseValor(f.valorCompra), observacoes: f.observacoes.trim(), modificadoEm: new Date(),
  }
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/equipamentos/domain/domain.test.ts`
Esperado: PASS (todos os `describe` acima).

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos/domain
git commit -m "feat(equipamentos): domínio do formulário, status e tipos" -m "Tipos Equipamento/TipoEquipamento/Pessoa, status do choice cr40f_status, regras status x responsável do spec 4.3, validação, aviso de série repetida e diff do formulário para a Web API, com testes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Domínio — lista, filtros e visões

**Arquivos:**
- Criar: `pages/equipamentos/domain/lista.ts`
- Teste: acrescentar em `pages/equipamentos/domain/domain.test.ts`

**Interfaces:**
- Consome: `STATUS`, `STATUS_OPTIONS`, `byNome`, tipos da Tarefa 1; `sortRows` de `app/listSort`.
- Produz: `TELA`, `EQUIPAMENTO_SORT`, `EQUIPAMENTO_COLUMNS`, `equipamentoFields(tipos, pessoas)`, `readEquipamento(e, key)`, `matchesKeyword(e, q)`, `sortEquipamentos(list, sort)`, `EQUIPAMENTO_DEFAULT_FILTERS`, `builtinViews()`.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar ao topo de `domain.test.ts` os imports:

```ts
import { matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { EQUIPAMENTO_DEFAULT_FILTERS, builtinViews, equipamentoFields, matchesKeyword, readEquipamento, sortEquipamentos } from './lista'
```

E no fim do arquivo:

```ts
describe('lista', () => {
  const list = [
    item(),
    item({ id: 'e2', descricao: 'Notebook reserva', responsavelId: null, responsavelNome: '', status: STATUS.disponivel, numeroSerie: '' }),
    item({ id: 'e3', descricao: 'Impressora antiga', tipoNome: 'Impressora', responsavelId: null, responsavelNome: '', status: STATUS.baixado }),
  ]
  const fields = equipamentoFields(tipos, pessoas)
  const apply = (filters: TableFilters) => list.filter((e) => matchesFilters(e, readFilters(filters, fields), fields, readEquipamento)).map((e) => e.id)
  const view = (id: string) => JSON.parse(builtinViews().find((v) => v.id === id)!.config).filters as TableFilters

  it('visão padrão esconde baixados', () => {
    expect(apply(EQUIPAMENTO_DEFAULT_FILTERS)).toEqual(['e1', 'e2'])
  })
  it('visões prontas: sem responsável e baixados', () => {
    expect(apply(view('sem-responsavel'))).toEqual(['e2'])
    expect(apply(view('baixados'))).toEqual(['e3'])
    expect(apply(view('todos'))).toEqual(['e1', 'e2', 'e3'])
  })
  it('busca por responsável, série e tipo sem acento', () => {
    expect(list.filter((e) => matchesKeyword(e, 'bruna')).map((e) => e.id)).toEqual(['e1'])
    expect(list.filter((e) => matchesKeyword(e, 'dl5440')).map((e) => e.id)).toEqual(['e1'])
    expect(list.filter((e) => matchesKeyword(e, 'impressora')).map((e) => e.id)).toEqual(['e3'])
  })
  it('ordena por descrição', () => {
    expect(sortEquipamentos(list, { key: 'equipamento', dir: 'asc' }).map((e) => e.id)).toEqual(['e3', 'e1', 'e2'])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/equipamentos/domain/domain.test.ts`
Esperado: FAIL, `./lista` não encontrado.

- [ ] **Passo 3: implementar**

`pages/equipamentos/domain/lista.ts`:

```ts
import { CONFIG_VERSION, emptyFilters, type FilterCondition, type FilterField, type FilterOption, type StoredView, type TableFilters, type ViewColumnDef, type ViewConfig, type ViewSort } from '@betinhos/ui'
import { sortRows } from '../../../app/listSort'
import { normalize } from '../../infracoes/domain/filters'
import { byNome } from './cadastros'
import { STATUS, STATUS_OPTIONS } from './choices'
import type { Equipamento, Pessoa, TipoEquipamento } from './types'

/** Equipamentos no padrão de listas do DS (§10.9.1/§10.9.2). A Visão padrão esconde os baixados. */

export const TELA = 'equipamentos'
export const EQUIPAMENTO_SORT: ViewSort = { key: 'equipamento', dir: 'asc' }

/** Colunas na ordem padrão; a primeira (Equipamento) é fixa. */
export const EQUIPAMENTO_COLUMNS: ViewColumnDef[] = [
  { key: 'equipamento', label: 'Equipamento' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'marcaModelo', label: 'Marca/modelo' },
  { key: 'serie', label: 'Nº de série' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'status', label: 'Status' },
  { key: 'compra', label: 'Compra' },
]

const SIM_NAO: FilterOption[] = [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }]

/** Campos de filtro; tipo e responsável vêm dos cadastros carregados. */
export function equipamentoFields(tipos: TipoEquipamento[], pessoas: Pessoa[]): FilterField[] {
  return [
    { key: 'equipamento', label: 'Equipamento', kind: 'text' },
    { key: 'tipo', label: 'Tipo', kind: 'choice', options: [...tipos].sort(byNome).map((t) => ({ value: t.id, label: t.nome })) },
    { key: 'marcaModelo', label: 'Marca/modelo', kind: 'text' },
    { key: 'serie', label: 'Nº de série', kind: 'text' },
    { key: 'responsavel', label: 'Responsável', kind: 'choice', options: [...pessoas].sort(byNome).map((p) => ({ value: p.id, label: p.nome })) },
    { key: 'status', label: 'Status', kind: 'choice', options: STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label })) },
    { key: 'compra', label: 'Valor de compra', kind: 'number', money: true },
    { key: 'comResponsavel', label: 'Com responsável', kind: 'bool', options: SIM_NAO, advancedOnly: true },
    { key: 'baixado', label: 'Baixado', kind: 'bool', options: SIM_NAO, advancedOnly: true },
  ]
}

export function readEquipamento(e: Equipamento, key: string): unknown {
  switch (key) {
    case 'equipamento': return e.descricao
    case 'tipo': return e.tipoId
    case 'marcaModelo': return e.marcaModelo
    case 'serie': return e.numeroSerie
    case 'responsavel': return e.responsavelId
    case 'status': return e.status == null ? null : String(e.status)
    case 'compra': return e.valorCompra
    case 'comResponsavel': return Boolean(e.responsavelId)
    case 'baixado': return e.status === STATUS.baixado
    default: return null
  }
}

/** Busca (fora da visão): descrição, tipo, marca/modelo, série e responsável. */
export function matchesKeyword(e: Equipamento, query: string) {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = normalize([e.descricao, e.tipoNome, e.marcaModelo, e.numeroSerie, e.responsavelNome].join(' '))
  return terms.every((t) => hay.includes(t))
}

export function sortEquipamentos(list: Equipamento[], sort: ViewSort | null) {
  if (!sort) return list
  return sortRows(list, (e) => {
    switch (sort.key) {
      case 'equipamento': return e.descricao || null
      case 'tipo': return e.tipoNome || null
      case 'marcaModelo': return e.marcaModelo || null
      case 'serie': return e.numeroSerie || null
      case 'responsavel': return e.responsavelNome || null
      case 'status': return e.status
      case 'compra': return e.dataCompra
      default: return null
    }
  }, sort.dir)
}

const flag = (field: string, yes: boolean): FilterCondition => ({ type: 'condition', id: `${field}-${yes ? 'yes' : 'no'}`, field, op: yes ? 'yes' : 'no' })
const advanced = (items: FilterCondition[]): TableFilters => ({ ...emptyFilters(), advanced: { ...emptyFilters().advanced, items } })

/** A Visão padrão: tudo menos os baixados. */
export const EQUIPAMENTO_DEFAULT_FILTERS = advanced([flag('baixado', false)])

const configWith = (filters: TableFilters): ViewConfig => ({
  v: CONFIG_VERSION,
  columns: EQUIPAMENTO_COLUMNS.map((c) => ({ key: c.key, visible: true })),
  sort: EQUIPAMENTO_SORT,
  filters: filters as unknown as Record<string, unknown>,
})

export function builtinViews(): StoredView[] {
  const view = (id: string, name: string, ordem: number, filters: TableFilters): StoredView => ({ id, name, publica: true, mine: false, ordem, config: JSON.stringify(configWith(filters)) })
  return [
    view('todos', 'Todos, inclusive baixados', 1, emptyFilters()),
    view('sem-responsavel', 'Sem responsável', 2, advanced([flag('baixado', false), flag('comResponsavel', false)])),
    view('baixados', 'Baixados', 3, advanced([flag('baixado', true)])),
  ]
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/equipamentos/domain/domain.test.ts`
Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos/domain
git commit -m "feat(equipamentos): colunas, filtros, busca e visões da lista" -m "Campos de filtro com tipo e responsável dinâmicos, Visão padrão sem baixados e visões prontas Todos, Sem responsável e Baixados, com testes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: Dados — queries, mock e Source

**Arquivos:**
- Criar: `pages/equipamentos/data/queries.ts`, `data/mock.ts`, `data/source.ts`
- Teste: acrescentar em `pages/equipamentos/domain/domain.test.ts`

**Interfaces:**
- Consome: `Changes` (Tarefa 1); `Host` de `apps/shell/src/host.ts` (`mode`, `client.getAll/create/update/request`, `metadata.entities`).
- Produz: `ENTITIES`, `NAV`, `EntitySets`, `mapEquipamento(row)`, `mapTipo(row)`, `mapPessoa(row)`, `toPayload(c, sets)`, `responsavelRefPath(set, id)`, `estadoPayload(ativo)`; `createMockTipos()`, `createMockPessoas()`, `createMockEquipamentos()`; `type Carga = { equipamentos; tipos; pessoas }`, `type Source = { mock; load(); create(c); update(id, c); createTipo(nome); renameTipo(id, nome); setTipoAtivo(id, ativo) }`, `createSource(host)`.

- [ ] **Passo 1: escrever os testes que falham**

Imports a acrescentar em `domain.test.ts`:

```ts
import { mapEquipamento, mapPessoa, mapTipo, responsavelRefPath, toPayload } from '../data/queries'
import { createMockEquipamentos, createMockPessoas, createMockTipos } from '../data/mock'
```

No fim do arquivo:

```ts
describe('dados', () => {
  const F = '@OData.Community.Display.V1.FormattedValue'
  const sets = { equipamento: 'cr40f_equipamentos', tipo: 'cr40f_tipoequipamentos', funcionario: 'cr40f_funcionarioses' }

  it('mapeia equipamento com rótulos formatados e data só dia', () => {
    const e = mapEquipamento({
      cr40f_equipamentoid: 'E1', cr40f_name: 'Notebook', _cr40f_tipo_value: 'T1', [`_cr40f_tipo_value${F}`]: 'Notebook', cr40f_status: 100000000,
      _cr40f_responsavel_value: 'P1', [`_cr40f_responsavel_value${F}`]: 'Bruna', cr40f_datacompra: '2026-01-10', cr40f_valorcompra: 3499.9, cr40f_numeroserie: 'null',
    })
    expect(e).toMatchObject({ id: 'e1', tipoId: 't1', tipoNome: 'Notebook', responsavelId: 'p1', responsavelNome: 'Bruna', dataCompra: '2026-01-10', valorCompra: 3499.9, numeroSerie: '' })
  })
  it('sem lookups vira null', () => {
    expect(mapEquipamento({ cr40f_equipamentoid: 'E2', cr40f_name: 'Mouse' })).toMatchObject({ tipoId: null, responsavelId: null, dataCompra: null })
  })
  it('tipo e pessoa leem o estado', () => {
    expect(mapTipo({ cr40f_tipoequipamentoid: 'T1', cr40f_name: 'Pager', statecode: 1 })).toEqual({ id: 't1', nome: 'Pager', ativo: false })
    expect(mapPessoa({ cr40f_funcionariosid: 'P1', cr40f_nomecompleto: 'Bruna', statecode: 0 })).toEqual({ id: 'p1', nome: 'Bruna', ativo: true })
  })
  it('payload liga lookups por @odata.bind e não manda responsável limpo', () => {
    expect(toPayload({ campos: { cr40f_name: 'X' }, tipoId: 't1', responsavelId: 'p1' }, sets)).toEqual({
      cr40f_name: 'X', 'cr40f_Tipo@odata.bind': '/cr40f_tipoequipamentos(t1)', 'cr40f_Responsavel@odata.bind': '/cr40f_funcionarioses(p1)',
    })
    expect(toPayload({ campos: {}, responsavelId: null }, sets)).toEqual({})
    expect(responsavelRefPath('cr40f_equipamentos', '{E1}')).toBe('cr40f_equipamentos(e1)/cr40f_Responsavel/$ref')
  })
  it('mock cobre baixado, sem responsável e responsável inativo', () => {
    const list = createMockEquipamentos()
    const pessoas = createMockPessoas()
    expect(list.some((e) => e.status === STATUS.baixado)).toBe(true)
    expect(list.some((e) => !e.responsavelId && e.status !== STATUS.baixado)).toBe(true)
    expect(list.some((e) => pessoas.find((p) => p.id === e.responsavelId)?.ativo === false)).toBe(true)
    expect(createMockTipos().some((t) => !t.ativo)).toBe(true)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/equipamentos/domain/domain.test.ts`
Esperado: FAIL, `../data/queries` e `../data/mock` não encontrados.

- [ ] **Passo 3: implementar**

`pages/equipamentos/data/queries.ts`:

```ts
import { cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Changes } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

export const ENTITIES = { equipamento: 'cr40f_equipamento', tipo: 'cr40f_tipoequipamento', funcionario: 'cr40f_funcionarios' } as const
export type EntitySets = Record<keyof typeof ENTITIES, string>
/** Propriedades de navegação dos lookups (SchemaName criado por provision-equipamentos.ps1). */
export const NAV = { tipo: 'cr40f_Tipo', responsavel: 'cr40f_Responsavel' } as const

const SELECT = [
  'cr40f_equipamentoid', 'cr40f_name', '_cr40f_tipo_value', 'cr40f_marcamodelo', 'cr40f_numeroserie', 'cr40f_status',
  '_cr40f_responsavel_value', 'cr40f_datacompra', 'cr40f_valorcompra', 'cr40f_observacoes', 'modifiedon',
]

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const text = (v: unknown) => { const t = str(v).trim(); return /^(null|undefined)$/i.test(t) ? '' : t }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const date = (v: unknown) => { if (typeof v !== 'string' || !v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d }
const order = (column: string) => `&$orderby=${encodeURIComponent(`${column} asc`)}`

export const equipamentosPath = (set: string) => `${set}?$select=${SELECT.join(',')}${order('cr40f_name')}`
export const tiposPath = (set: string) => `${set}?$select=cr40f_tipoequipamentoid,cr40f_name,statecode${order('cr40f_name')}`
/** Ativos e inativos: o item de um funcionário desligado continua mostrando o nome, com selo. */
export const pessoasPath = (set: string) => `${set}?$select=cr40f_funcionariosid,cr40f_nomecompleto,statecode${order('cr40f_nomecompleto')}`

export function mapEquipamento(row: Row): Equipamento {
  const lookupId = (k: string) => (row[k] ? cleanId(str(row[k])) : null)
  const lookupName = (k: string) => (row[k] ? formatted(row, k) : '')
  return {
    id: cleanId(str(row.cr40f_equipamentoid)), descricao: text(row.cr40f_name),
    tipoId: lookupId('_cr40f_tipo_value'), tipoNome: lookupName('_cr40f_tipo_value'),
    marcaModelo: text(row.cr40f_marcamodelo), numeroSerie: text(row.cr40f_numeroserie), status: num(row.cr40f_status),
    responsavelId: lookupId('_cr40f_responsavel_value'), responsavelNome: lookupName('_cr40f_responsavel_value'),
    dataCompra: text(row.cr40f_datacompra).slice(0, 10) || null, valorCompra: num(row.cr40f_valorcompra),
    observacoes: text(row.cr40f_observacoes), modificadoEm: date(row.modifiedon),
  }
}

export const mapTipo = (row: Row): TipoEquipamento => ({ id: cleanId(str(row.cr40f_tipoequipamentoid)), nome: text(row.cr40f_name), ativo: row.statecode !== 1 })
export const mapPessoa = (row: Row): Pessoa => ({ id: cleanId(str(row.cr40f_funcionariosid)), nome: text(row.cr40f_nomecompleto), ativo: row.statecode !== 1 })

/** Lookups novos por @odata.bind; limpar o responsável é DELETE no $ref (`responsavelRefPath`). */
export function toPayload(c: Changes, sets: EntitySets): Row {
  const p: Row = { ...c.campos }
  if (c.tipoId) p[`${NAV.tipo}@odata.bind`] = `/${sets.tipo}(${c.tipoId})`
  if (c.responsavelId) p[`${NAV.responsavel}@odata.bind`] = `/${sets.funcionario}(${c.responsavelId})`
  return p
}

export const responsavelRefPath = (set: string, id: string) => `${set}(${cleanId(id)})/${NAV.responsavel}/$ref`

/** Inativar/reativar tipo mexe só no estado; o statuscode acompanha (Ativo 1, Inativo 2). */
export const estadoPayload = (ativo: boolean): Row => ({ statecode: ativo ? 0 : 1, statuscode: ativo ? 1 : 2 })

export async function loadAll(client: DataverseClient, sets: EntitySets) {
  const [equipamentos, tipos, pessoas] = await Promise.all([
    client.getAll(equipamentosPath(sets.equipamento)), client.getAll(tiposPath(sets.tipo)), client.getAll(pessoasPath(sets.funcionario)),
  ])
  return { equipamentos: equipamentos.map(mapEquipamento), tipos: tipos.map(mapTipo), pessoas: pessoas.map(mapPessoa) }
}
```

`pages/equipamentos/data/mock.ts`:

```ts
import { STATUS } from '../domain/choices'
import { emptyEquipamento } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`
const tid = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`

const TIPOS: [string, boolean][] = [
  ['Notebook', true], ['Monitor', true], ['Mouse', true], ['Teclado', true], ['Celular', true],
  ['Máquina de cartão', true], ['Impressora', true], ['Outro', true], ['Pager', false],
]

/** Tipos de exemplo; Pager inativo. */
export function createMockTipos(): TipoEquipamento[] {
  return TIPOS.map(([nome, ativo], i) => ({ id: tid(i + 1), nome, ativo }))
}

/** Mesmos ids e nomes do mock de Funcionários (aba da ficha); m5 está inativo. */
export function createMockPessoas(): Pessoa[] {
  return [
    { id: 'm1', nome: 'Carlos Alberto Teste', ativo: true },
    { id: 'm2', nome: 'Bruna Ficticia Lima', ativo: true },
    { id: 'm3', nome: 'Diego Exemplo Rocha', ativo: true },
    { id: 'm4', nome: 'Elaine Mock Duarte', ativo: true },
    { id: 'm5', nome: 'Fabio Demo Nunes', ativo: false },
  ]
}

/** Itens de exemplo: em uso, disponível, manutenção, baixado, responsável inativo e item sem série. */
export function createMockEquipamentos(): Equipamento[] {
  const tipos = createMockTipos()
  const pessoas = createMockPessoas()
  const make = (n: number, descricao: string, tipo: string, marcaModelo: string, numeroSerie: string, status: number, responsavelId: string | null, dataCompra: string | null = null, valorCompra: number | null = null): Equipamento => {
    const t = tipos.find((x) => x.nome === tipo)!
    return {
      ...emptyEquipamento(id(n)), descricao, tipoId: t.id, tipoNome: t.nome, marcaModelo, numeroSerie, status, responsavelId,
      responsavelNome: pessoas.find((p) => p.id === responsavelId)?.nome ?? '', dataCompra, valorCompra, modificadoEm: new Date('2026-10-01T12:00:00Z'),
    }
  }
  return [
    make(1, 'Notebook do Financeiro', 'Notebook', 'Dell Latitude 5440', 'DL5440-001', STATUS.emUso, 'm2', '2025-03-12', 5899.9),
    make(2, 'Notebook reserva', 'Notebook', 'Lenovo ThinkPad E14', 'TP-E14-778', STATUS.disponivel, null, '2024-11-04', 4299),
    make(3, 'Monitor 24" recepção', 'Monitor', 'LG 24MP400', 'LG24-3321', STATUS.emUso, 'm4', '2025-06-20', 799.9),
    make(4, 'Mouse sem fio', 'Mouse', 'Logitech M170', '', STATUS.emUso, 'm2'),
    make(5, 'Maquininha Carlos', 'Máquina de cartão', 'Stone S920', 'S920-55410', STATUS.emUso, 'm1'),
    make(6, 'Maquininha reserva', 'Máquina de cartão', 'Stone S920', 'S920-55411', STATUS.manutencao, null),
    make(7, 'Celular plantão', 'Celular', 'Samsung A15', 'A15-90011', STATUS.emUso, 'm5', '2025-01-15', 1099),
    make(8, 'Impressora antiga', 'Impressora', 'HP LaserJet 1102w', 'HP1102-01', STATUS.baixado, null, '2019-08-01', 899),
  ]
}
```

`pages/equipamentos/data/source.ts`:

```ts
import { cleanId } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { Changes } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { createMockEquipamentos, createMockPessoas, createMockTipos } from './mock'
import { ENTITIES, estadoPayload, loadAll, responsavelRefPath, toPayload, type EntitySets } from './queries'

export type Carga = { equipamentos: Equipamento[]; tipos: TipoEquipamento[]; pessoas: Pessoa[] }

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  create: (c: Changes) => Promise<string>
  update: (id: string, c: Changes) => Promise<void>
  createTipo: (nome: string) => Promise<string>
  renameTipo: (id: string, nome: string) => Promise<void>
  setTipoAtivo: (id: string, ativo: boolean) => Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let seq = 100
  const nextId = (prefix: string) => { seq += 1; return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}` }
  return {
    mock: true,
    async load() { await wait(300); return { equipamentos: createMockEquipamentos(), tipos: createMockTipos(), pessoas: createMockPessoas() } },
    async create() { await wait(400); return nextId('eeeeeeee') },
    async update() { await wait(400) },
    async createTipo() { await wait(300); return nextId('dddddddd') },
    async renameTipo() { await wait(300) },
    async setTipoAtivo() { await wait(300) },
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
    return { equipamento: get(ENTITIES.equipamento), tipo: get(ENTITIES.tipo), funcionario: get(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async () => loadAll(host.client, await entitySets()),
    create: async (c) => { const s = await entitySets(); return cleanId(await host.client.create(s.equipamento, toPayload(c, s))) },
    async update(id, c) {
      const s = await entitySets()
      const payload = toPayload(c, s)
      if (Object.keys(payload).length) await host.client.update(s.equipamento, id, payload)
      if (c.responsavelId === null) await host.client.request(responsavelRefPath(s.equipamento, id), { method: 'DELETE' })
    },
    createTipo: async (nome) => cleanId(await host.client.create((await entitySets()).tipo, { cr40f_name: nome.trim() })),
    renameTipo: async (id, nome) => host.client.update((await entitySets()).tipo, id, { cr40f_name: nome.trim() }),
    setTipoAtivo: async (id, ativo) => host.client.update((await entitySets()).tipo, id, estadoPayload(ativo)),
  }
}
```

- [ ] **Passo 4: rodar testes e typecheck**

Run: `pnpm test -- src/pages/equipamentos/domain/domain.test.ts` → PASS.
Run: `pnpm typecheck` → sem erros. Se `host.client.request` exigir outro formato de opções, siga a assinatura usada em `pages/geral/data/source.ts:332`.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos/data apps/shell/src/pages/equipamentos/domain/domain.test.ts
git commit -m "feat(equipamentos): fonte de dados Dataverse e mock" -m "Paths e mappers de cr40f_equipamento, cr40f_tipoequipamento e cr40f_funcionarios; payload com @odata.bind e DELETE no \$ref para limpar responsável; mock com itens baixados, sem responsável e responsável inativo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: Página, lista e rota

**Arquivos:**
- Criar: `pages/equipamentos/useEquipamentos.ts`, `components/EquipamentosList.tsx`, `EquipamentosPage.tsx`, `equipamentos.css`
- Modificar: `nav/menu.ts:13` e `:73`, `nav/menu.test.ts`, `app/routes.tsx` (`PAGE_LOADERS`), `app/AppShell.tsx` (import de `lucide-react` e `ITEM_ICONS`)
- Teste: `pages/equipamentos/EquipamentosPage.test.tsx`

**Interfaces:**
- Consome: Tarefas 1–3.
- Produz: `useEquipamentos(source)` → `{ equipamentos, tipos, pessoas, loaded, loading, error, reload, upsert(e), upsertTipo(t) }`; `EquipamentosTable`, `EquipamentosCards`, `fmtData(iso)`, `money`; `EquipamentosPage({ host })`. A Tarefa 5 troca o placeholder do drawer.

- [ ] **Passo 1: escrever o teste que falha**

`pages/equipamentos/EquipamentosPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EquipamentosPage } from './EquipamentosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/equipamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const openButton = (nome: string) => screen.findByRole('button', { name: new RegExp(`^${nome}`) })

describe('Equipamentos', () => {
  it('lista os itens e esconde baixados na visão padrão', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook do Financeiro')
    expect(screen.queryByText('Impressora antiga')).toBeNull()
  })

  it('responsável inativo aparece com selo', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = (await openButton('Celular plantão')).closest('.bt-table__row') as HTMLElement
    expect(within(row).getByText('Fabio Demo Nunes')).toBeTruthy()
    expect(within(row).getByText('Inativo')).toBeTruthy()
  })

  it('item sem responsável mostra o texto no lugar do nome', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = (await openButton('Notebook reserva')).closest('.bt-table__row') as HTMLElement
    await waitFor(() => expect(within(row).getByText('Sem responsável')).toBeTruthy())
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/equipamentos/EquipamentosPage.test.tsx`
Esperado: FAIL, `./EquipamentosPage` não encontrado.

- [ ] **Passo 3: implementar**

`pages/equipamentos/useEquipamentos.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import { byNome } from './domain/cadastros'
import type { Equipamento, TipoEquipamento } from './domain/types'

type State = Carga & { loaded: boolean; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const byDescricao = (a: Equipamento, b: Equipamento) => a.descricao.localeCompare(b.descricao, 'pt-BR')

/** Itens, tipos e pessoas carregados juntos, com token contra respostas fora de ordem; upserts refletem o que foi salvo sem recarregar. */
export function useEquipamentos(source: Source) {
  const [state, setState] = useState<State>({ equipamentos: [], tipos: [], pessoas: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ equipamentos: [...c.equipamentos].sort(byDescricao), tipos: [...c.tipos].sort(byNome), pessoas: c.pessoas, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const upsert = useCallback((e: Equipamento) => setState((s) => ({
    ...s,
    equipamentos: (s.equipamentos.some((x) => x.id === e.id) ? s.equipamentos.map((x) => (x.id === e.id ? e : x)) : [...s.equipamentos, e]).sort(byDescricao),
  })), [])

  /** Renomear o tipo também atualiza o nome nos itens. */
  const upsertTipo = useCallback((t: TipoEquipamento) => setState((s) => ({
    ...s,
    tipos: (s.tipos.some((x) => x.id === t.id) ? s.tipos.map((x) => (x.id === t.id ? t : x)) : [...s.tipos, t]).sort(byNome),
    equipamentos: s.equipamentos.map((e) => (e.tipoId === t.id ? { ...e, tipoNome: t.nome } : e)),
  })), [])

  return { ...state, reload, upsert, upsertTipo }
}
```

`pages/equipamentos/components/EquipamentosList.tsx`:

```tsx
import type { ReactNode } from 'react'
import { StatusBadge, Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { openFromRow } from '../../pagantes/components/PagantesList'
import { statusLabel, statusTone } from '../domain/choices'
import type { Equipamento } from '../domain/types'

type Props = { list: Equipamento[]; inativos: Set<string>; onOpen: (id: string) => void; loading?: boolean }
type TableProps = Props & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** `aaaa-mm-dd` → `dd/mm/aaaa` sem passar por Date (evita deslocar o dia pelo fuso). */
export const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')
const fmtCompra = (e: Equipamento) => [fmtData(e.dataCompra), e.valorCompra == null ? '' : money.format(e.valorCompra)].filter(Boolean).join(' · ') || '—'

function OpenName({ e, onOpen }: { e: Equipamento; onOpen: (id: string) => void }) {
  return (
    <button type="button" className="eq-open" onClick={() => onOpen(e.id)}>
      <strong>{e.descricao || 'Sem descrição'}</strong>
      {e.marcaModelo ? <span>{e.marcaModelo}</span> : null}
    </button>
  )
}

export function StatusSelo({ e }: { e: Equipamento }) {
  return <StatusBadge tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusBadge>
}

function Responsavel({ e, inativos }: { e: Equipamento; inativos: Set<string> }) {
  if (!e.responsavelId) return <span className="eq-muted">Sem responsável</span>
  return (
    <span className="eq-badges">
      <span>{e.responsavelNome || 'Funcionário'}</span>
      {inativos.has(e.responsavelId) ? <StatusBadge tone="warning">Inativo</StatusBadge> : null}
    </span>
  )
}

export function EquipamentosTable({ list, inativos, onOpen, loading, view, quickFilters, footer, empty }: TableProps) {
  const columns: TableColumn<Equipamento>[] = [
    { key: 'equipamento', header: 'Equipamento', label: 'Equipamento', sortable: true, defaultWidth: 280, width: 'minmax(200px, 2fr)', cell: (e) => <OpenName e={e} onOpen={onOpen} /> },
    { key: 'tipo', header: 'Tipo', label: 'Tipo', sortable: true, defaultWidth: 150, width: 'minmax(110px, .8fr)', cell: (e) => e.tipoNome || '—' },
    { key: 'marcaModelo', header: 'Marca/modelo', label: 'Marca/modelo', sortable: true, defaultWidth: 180, width: 'minmax(120px, 1fr)', hideBelow: 'compact', cell: (e) => e.marcaModelo || '—' },
    { key: 'serie', header: 'Nº de série', label: 'Nº de série', sortable: true, defaultWidth: 140, width: 'minmax(100px, .8fr)', hideBelow: 'compact', cell: (e) => <span className="eq-num">{e.numeroSerie || '—'}</span> },
    { key: 'responsavel', header: 'Responsável', label: 'Responsável', sortable: true, defaultWidth: 200, width: 'minmax(140px, 1.2fr)', cell: (e) => <Responsavel e={e} inativos={inativos} /> },
    { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 140, width: 'minmax(110px, .8fr)', cell: (e) => <StatusSelo e={e} /> },
    { key: 'compra', header: 'Compra', label: 'Compra', sortable: true, defaultWidth: 190, width: 'minmax(140px, 1fr)', hideBelow: 'compact', cell: (e) => <span className="eq-num">{fmtCompra(e)}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.eq-open')}>
      <Table className="eq-table" columns={columns} rows={list} rowKey={(e) => e.id} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

export function EquipamentosCards({ list, inativos, onOpen }: Props) {
  return (
    <ul className="eq-cards" aria-label="Equipamentos" onClick={(event) => openFromRow(event, '.eq-card', '.eq-card__open')}>
      {list.map((e) => (
        <li key={e.id} className="eq-card">
          <button type="button" className="eq-card__open" onClick={() => onOpen(e.id)}>
            <strong className="eq-card__name">{e.descricao || 'Sem descrição'}</strong>
            <span className="eq-card__meta">{[e.tipoNome, e.marcaModelo, e.numeroSerie && `Série ${e.numeroSerie}`].filter(Boolean).join(' · ')}</span>
          </button>
          <div className="eq-card__foot"><Responsavel e={e} inativos={inativos} /><StatusSelo e={e} /></div>
        </li>
      ))}
    </ul>
  )
}
```

`pages/equipamentos/EquipamentosPage.tsx` (drawers entram nas Tarefas 5 e 6):

```tsx
import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader } from '@betinhos/ui'
import { Laptop, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { STATUS } from './domain/choices'
import { EQUIPAMENTO_COLUMNS, EQUIPAMENTO_DEFAULT_FILTERS, EQUIPAMENTO_SORT, TELA, builtinViews, equipamentoFields, matchesKeyword, readEquipamento, sortEquipamentos } from './domain/lista'
import { useEquipamentos } from './useEquipamentos'
import { EquipamentosCards, EquipamentosTable } from './components/EquipamentosList'
import './equipamentos.css'

export function EquipamentosPage({ host }: { host: Host }) {
  return <ToastProvider><Equipamentos host={host} /></ToastProvider>
}

function Equipamentos({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const data = useEquipamentos(source)
  const fields = useMemo(() => equipamentoFields(data.tipos, data.pessoas), [data.tipos, data.pessoas])

  // Visões, colunas e filtros (DS §10.9.1/§10.9.2); a Visão padrão esconde os baixados. Busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters } = useListView({
    host,
    defaultName: 'Equipamentos em uso e disponíveis',
    tela: TELA,
    columns: EQUIPAMENTO_COLUMNS,
    defaultSort: EQUIPAMENTO_SORT,
    defaultFilters: EQUIPAMENTO_DEFAULT_FILTERS,
    fields,
    ready: data.loaded,
    builtins: builtinViews,
  })
  const [query, setQuery] = useQueryTexto('q')
  const [, setTarget] = useQueryAlvo()

  const inativos = useMemo(() => new Set(data.pessoas.filter((p) => !p.ativo).map((p) => p.id)), [data.pessoas])
  const visible = useMemo(() => {
    const list = data.equipamentos.filter((e) => matchesFilters(e, filters, fields, readEquipamento) && matchesKeyword(e, query))
    return sortEquipamentos(list, view.config.sort)
  }, [data.equipamentos, filters, fields, query, view.config.sort])
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar equipamentos" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Equipamentos', actions: headerActions })

  const novo = () => setTarget({ mode: 'create' })
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar os equipamentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <EquipamentosTable list={[]} inativos={inativos} onOpen={() => undefined} loading />
  } else if (!data.equipamentos.length) {
    body = <EmptyState className="surface" align="start" icon={<Laptop size={36} />} title="Nenhum equipamento cadastrado" action={<Button icon={<Plus size={16} />} onClick={novo}>Novo equipamento</Button>}>Cadastre notebooks, monitores, máquinas de cartão e outros itens da empresa.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const semResponsavel = data.equipamentos.filter((e) => !e.responsavelId && e.status !== STATUS.baixado).length
    const footer = <span className="eq-num">{visible.length} de {data.equipamentos.length} · {semResponsavel} sem responsável</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum equipamento com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <EquipamentosCards list={slice} inativos={inativos} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <EquipamentosTable list={slice} inativos={inativos} onOpen={open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page eq-page">
      <div role="toolbar" aria-label="Comandos de equipamentos">
        <ViewBar view={view} columns={EQUIPAMENTO_COLUMNS} filters={{ fields }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="eq-search" value={query} onChange={setQuery} placeholder="Buscar por descrição, série ou responsável" aria-label="Buscar equipamentos" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={novo}>Novo equipamento</Button>
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
    </div>
  )
}
```

`pages/equipamentos/equipamentos.css`:

```css
/* Equipamentos: lista, cards, formulário e tipos. Só tokens do Design System. */
.eq-num { font-variant-numeric: tabular-nums; }
.eq-muted { margin: 0; font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.eq-badges { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-1); }
.eq-search { flex: 1 1 260px; min-width: 200px; max-width: 360px; }

.eq-open { display: grid; gap: var(--bt-space-0-5); min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; border-radius: var(--bt-radius-xs); }
.eq-open strong { font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); }
.eq-open span { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.eq-open:focus-visible, .eq-card__open:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); }

.eq-table .bt-table__row:not(.bt-table__row--loading), .eq-card { cursor: pointer; }
@media (hover: hover) and (pointer: fine) {
  .eq-table .bt-table__row:not(.bt-table__row--loading):hover, .eq-card:hover { background-color: var(--bt-color-surface-soft); }
  .eq-open:hover strong { color: var(--bt-color-action); }
}

.eq-cards { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; }
.eq-card { border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.eq-card__open { display: grid; gap: var(--bt-space-1); width: 100%; min-height: var(--bt-control-height-touch); padding: var(--bt-space-3) var(--bt-space-3) var(--bt-space-2); border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.eq-card__name { font-size: var(--bt-font-size-14); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); }
.eq-card__meta { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); overflow-wrap: anywhere; }
.eq-card__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--bt-space-2); padding: 0 var(--bt-space-3) var(--bt-space-3); }

/* Formulário (Tarefa 5) */
.eq-form { display: grid; gap: var(--bt-space-4); }
.eq-form__section { display: grid; gap: var(--bt-space-3); margin: 0; padding: 0; border: 0; min-width: 0; }
.eq-form__legend { margin: 0; padding: 0; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.08em; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.eq-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); }
.eq-form__wide { grid-column: 1 / -1; }
@container (max-width: 520px) { .eq-form__grid { grid-template-columns: minmax(0, 1fr); } }

/* Tipos (Tarefa 6) */
.eq-tipos { display: grid; gap: var(--bt-space-4); }
.eq-tipos__add { display: flex; align-items: flex-end; gap: var(--bt-space-2); }
.eq-tipos__add > :first-child { flex: 1 1 auto; }
.eq-tipos__list { display: grid; gap: var(--bt-space-1); margin: 0; padding: 0; list-style: none; }
.eq-tipos__item { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-2); min-height: var(--bt-control-height-touch); padding: var(--bt-space-1) var(--bt-space-2); border-bottom: var(--bt-border-width-default) solid var(--bt-color-border); }
.eq-tipos__name { flex: 1 1 160px; min-width: 0; font-size: var(--bt-font-size-13); }
```

Antes de usar `@container`, confira se o corpo do `Drawer` do DS declara `container-type`; se não declarar, troque essa regra por `@media (max-width: 520px)`.

Registro da rota:

- `nav/menu.ts:13`: acrescente `| 'equipamentos'` à união de `page`.
- `nav/menu.ts`, grupo `cadastros`, logo depois do item `infracoes`: `{ kind: 'page', id: 'equipamentos', label: 'Equipamentos', page: 'equipamentos' },`
- `app/routes.tsx`, em `PAGE_LOADERS`: `equipamentos: () => import('../pages/equipamentos/EquipamentosPage').then((m) => m.EquipamentosPage),`
- `app/AppShell.tsx`: acrescente `Laptop` ao import de `lucide-react` e `equipamentos: <Laptop />,` em `ITEM_ICONS`.
- `nav/menu.test.ts`, junto da asserção de `documentos`: `expect(findItem('equipamentos')?.group.id).toBe('cadastros')`

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/equipamentos src/nav/menu.test.ts src/app/routes.test.tsx` → PASS.
Run: `pnpm typecheck` → sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos apps/shell/src/nav/menu.ts apps/shell/src/nav/menu.test.ts apps/shell/src/app/routes.tsx apps/shell/src/app/AppShell.tsx
git commit -m "feat(equipamentos): página #/equipamentos com lista e filtros" -m "Rota em Cadastros, tabela no desktop e cards no celular, busca, visões, selo de responsável inativo, estados de carga, vazio e erro." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: Drawer de cadastro e edição

**Arquivos:**
- Criar: `pages/equipamentos/components/EquipamentoForm.tsx`, `components/EquipamentoDrawer.tsx`
- Modificar: `pages/equipamentos/EquipamentosPage.tsx`
- Teste: acrescentar em `pages/equipamentos/EquipamentosPage.test.tsx`

**Interfaces:**
- Consome: Tarefas 1–4; `useQueryAlvo` (`[alvo, alterar]`, alvo `{ mode: 'view' | 'edit'; id } | { mode: 'create' } | null`).
- Produz: `EquipamentoDrawer({ target, onTarget, list, tipos, pessoas, source, onSaved })`.

- [ ] **Passo 1: escrever os testes que falham**

Acrescentar `fireEvent` ao import de `@testing-library/react` e, dentro do `describe`:

```tsx
  it('abre o item, edita e salva', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await openButton('Notebook reserva'))
    await screen.findByRole('dialog', { name: 'Notebook reserva' })
    fireEvent.change(document.querySelector('input[name="marcaModelo"]') as HTMLInputElement, { target: { value: 'Lenovo ThinkPad E16' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Notebook reserva salvo.')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Lenovo ThinkPad E16')).toBeTruthy())
  })

  it('avisa número de série repetido sem bloquear', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(await openButton('Notebook reserva'))
    await screen.findByRole('dialog', { name: 'Notebook reserva' })
    fireEvent.change(document.querySelector('input[name="numeroSerie"]') as HTMLInputElement, { target: { value: 'dl5440 001' } })
    expect(await screen.findByText(/Já usado em Notebook do Financeiro/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByText('Notebook reserva salvo.')).toBeTruthy()
  })

  it('cadastro exige tipo e pede confirmação ao fechar com alterações', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook reserva')
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    await screen.findByRole('dialog', { name: 'Novo equipamento' })
    fireEvent.change(document.querySelector('input[name="descricao"]') as HTMLInputElement, { target: { value: 'Webcam sala' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar equipamento' }))
    expect(await screen.findByText('Escolha o tipo.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo equipamento' })).toBeNull())
  })

  it('link com id inexistente avisa e mantém a lista', async () => {
    window.location.hash = '#/equipamentos?ver=00000000-0000-0000-0000-000000000000'
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Equipamento não encontrado')).toBeTruthy()
  })
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/equipamentos/EquipamentosPage.test.tsx`
Esperado: FAIL nos quatro testes novos (nenhum dialog abre).

- [ ] **Passo 3: implementar**

`pages/equipamentos/components/EquipamentoForm.tsx`:

```tsx
import { Alert, Field, Input, Select, Textarea, type SelectOption } from '@betinhos/ui'
import { STATUS, STATUS_OPTIONS } from '../domain/choices'
import { opcoesAtivas } from '../domain/cadastros'
import { MAX_LENGTH, withResponsavel, withStatus, type EquipamentoForm as FormValues, type FormErrors } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  disabled: boolean
  tipos: TipoEquipamento[]
  pessoas: Pessoa[]
  /** Valores gravados no item: continuam no seletor mesmo inativos. */
  tipoAtual: string | null
  responsavelAtual: string | null
  repetido: Equipamento | null
}

const STATUS_SELECT: SelectOption[] = STATUS_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))

/** Cadastro e edição do equipamento; controlado pelo drawer. */
export function EquipamentoForm({ formId, form, errors, onChange, onSubmit, disabled, tipos, pessoas, tipoAtual, responsavelAtual, repetido }: Props) {
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => onChange({ ...form, [key]: value })
  const baixado = form.status === String(STATUS.baixado)
  return (
    <form id={formId} className="eq-form" noValidate onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <p className="eq-muted">Campos com * são obrigatórios.</p>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Item</legend>
        <div className="eq-form__grid">
          <Field label="Descrição" required error={errors.descricao} className="eq-form__wide" hint="Como o item é conhecido, ex.: Notebook do Financeiro.">
            <Input name="descricao" value={form.descricao} maxLength={MAX_LENGTH.descricao} disabled={disabled} onChange={(e) => set('descricao', e.target.value)} />
          </Field>
          <Field label="Tipo" required error={errors.tipoId}>
            <Select name="tipoId" options={opcoesAtivas(tipos, tipoAtual)} clearable={false} disabled={disabled} value={form.tipoId || null} onChange={(v) => set('tipoId', v ?? '')} placeholder="Selecionar" />
          </Field>
          <Field label="Marca/modelo" error={errors.marcaModelo}>
            <Input name="marcaModelo" value={form.marcaModelo} maxLength={MAX_LENGTH.marcaModelo} disabled={disabled} onChange={(e) => set('marcaModelo', e.target.value)} />
          </Field>
          <Field label="Nº de série" error={errors.numeroSerie} className="eq-form__wide">
            <Input name="numeroSerie" value={form.numeroSerie} maxLength={MAX_LENGTH.numeroSerie} disabled={disabled} onChange={(e) => set('numeroSerie', e.target.value)} />
          </Field>
          {repetido ? (
            <Alert tone="warning" title="Número de série repetido" className="eq-form__wide">
              Já usado em {repetido.descricao}{repetido.status === STATUS.baixado ? ' (baixado)' : ''}. Confira antes de salvar.
            </Alert>
          ) : null}
        </div>
      </fieldset>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Com quem está</legend>
        <div className="eq-form__grid">
          <Field label="Status" required error={errors.status}>
            <Select name="status" options={STATUS_SELECT} searchable={false} clearable={false} disabled={disabled} value={form.status || null} onChange={(v) => onChange(withStatus(form, v ?? ''))} placeholder="Selecionar" />
          </Field>
          <Field label="Responsável" error={errors.responsavelId} hint={baixado ? 'Item baixado não fica com responsável.' : 'Vazio = escritório ou estoque.'}>
            <Select name="responsavelId" options={opcoesAtivas(pessoas, responsavelAtual)} clearable disabled={disabled || baixado} value={form.responsavelId || null} onChange={(v) => onChange(withResponsavel(form, v ?? ''))} placeholder="Sem responsável" />
          </Field>
        </div>
      </fieldset>
      <fieldset className="eq-form__section">
        <legend className="eq-form__legend">Compra</legend>
        <div className="eq-form__grid">
          <Field label="Data de compra" error={errors.dataCompra}>
            <Input name="dataCompra" type="date" value={form.dataCompra} disabled={disabled} onChange={(e) => set('dataCompra', e.target.value)} />
          </Field>
          <Field label="Valor de compra (R$)" error={errors.valorCompra}>
            <Input name="valorCompra" inputMode="decimal" placeholder="3.499,90" value={form.valorCompra} disabled={disabled} onChange={(e) => set('valorCompra', e.target.value)} />
          </Field>
          <Field label="Observações" error={errors.observacoes} className="eq-form__wide" hint="Acessórios, estado do item. Não anote senhas aqui.">
            <Textarea name="observacoes" rows={3} value={form.observacoes} maxLength={MAX_LENGTH.observacoes} disabled={disabled} onChange={(e) => set('observacoes', e.target.value)} />
          </Field>
        </div>
      </fieldset>
    </form>
  )
}
```

Se `Alert` não aceitar `className`, embrulhe-o em `<div className="eq-form__wide">`.

`pages/equipamentos/components/EquipamentoDrawer.tsx`:

```tsx
import { useEffect, useId, useState } from 'react'
import { Alert, Button, Dialog, Drawer, useToast } from '@betinhos/ui'
import type { Source } from '../data/source'
import { applyForm, diffForm, emptyEquipamento, emptyForm, hasChanges, isDirty, serieRepetida, toForm, validateForm, type EquipamentoForm as FormValues, type FormErrors } from '../domain/form'
import type { Equipamento, Pessoa, TipoEquipamento } from '../domain/types'
import { EquipamentoForm } from './EquipamentoForm'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Equipamento[]
  tipos: TipoEquipamento[]
  pessoas: Pessoa[]
  source: Source
  onSaved: (e: Equipamento) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Cadastro e edição no mesmo drawer; fechar com alteração pede confirmação; salvando não fecha. */
export function EquipamentoDrawer({ target, onTarget, list, tipos, pessoas, source, onSaved }: Props) {
  const toast = useToast()
  const formId = useId()
  const creating = target?.mode === 'create'
  const current = target && target.mode !== 'create' ? list.find((e) => e.id === target.id) ?? null : null
  const key = target == null ? null : target.mode === 'create' ? 'create' : `item:${target.id}`

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(emptyForm)
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  // Prepara o formulário só ao abrir outro item ou o cadastro (não a cada atualização da lista).
  useEffect(() => {
    if (!key) { setReady(null); return }
    const start = current ? toForm(current) : emptyForm()
    setBase(start)
    setForm(start)
    setErrors({})
    setReady(key)
  }, [key])

  const open = ready === key && key != null
  const dirty = open && isDirty(base, form)
  const repetido = open ? serieRepetida(form, list, current?.id ?? null) : null

  function close() {
    if (saving) return
    if (dirty) { setPendingExit(true); return }
    onTarget(null)
  }

  async function save() {
    if (saving) return
    const found = validateForm(form)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) { document.querySelector<HTMLElement>(`.eq-form [name="${first}"]:not([type="hidden"])`)?.focus(); return }
    setSaving(true)
    try {
      if (creating) {
        const id = await source.create(diffForm(null, form))
        const saved = applyForm(emptyEquipamento(id), form, tipos, pessoas)
        onSaved(saved)
        toast({ tone: 'success', message: `${saved.descricao} cadastrado.` })
      } else if (current) {
        const changes = diffForm(base, form)
        if (hasChanges(changes)) await source.update(current.id, changes)
        const saved = applyForm(current, form, tipos, pessoas)
        onSaved(saved)
        toast({ tone: 'success', message: `${saved.descricao} salvo.` })
      }
      setBase(form)
      onTarget(null)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. Nada foi perdido do formulário. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const missing = target != null && !creating && !current
  const title = creating ? 'Novo equipamento' : current?.descricao || 'Equipamento'
  const footer = missing ? undefined : (
    <>
      <Button variant="secondary" disabled={saving} onClick={close}>Cancelar</Button>
      <Button type="submit" form={formId} loading={saving}>{creating ? 'Cadastrar equipamento' : 'Salvar alterações'}</Button>
    </>
  )

  return (
    <>
      <Drawer open={target != null} onClose={close} size="wide" eyebrow="Equipamentos" title={title} footer={footer}>
        {missing
          ? <Alert tone="warning" title="Equipamento não encontrado">O link pode ser de um item de outro ambiente. Atualize a lista e procure pela busca.</Alert>
          : open ? <EquipamentoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} disabled={saving}
              tipos={tipos} pessoas={pessoas} tipoAtual={current?.tipoId ?? null} responsavelAtual={current?.responsavelId ?? null} repetido={repetido} />
          : null}
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); setForm(base); onTarget(null) }}>Descartar</Button>
        </>}>
        As alterações deste equipamento ainda não foram salvas.
      </Dialog>
    </>
  )
}
```

Em `EquipamentosPage.tsx`:
- troque `const [, setTarget] = useQueryAlvo()` por `const [target, setTarget] = useQueryAlvo()`;
- importe `EquipamentoDrawer` de `./components/EquipamentoDrawer`;
- logo depois de `{body}`: `{data.loaded ? <EquipamentoDrawer target={target} onTarget={setTarget} list={data.equipamentos} tipos={data.tipos} pessoas={data.pessoas} source={source} onSaved={data.upsert} /> : null}`

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/equipamentos` → PASS. Run: `pnpm typecheck` → sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos
git commit -m "feat(equipamentos): drawer de cadastro e edição" -m "Formulário com tipo, status e responsável (regras do spec 4.3), aviso de série repetida, confirmação ao descartar alterações, bloqueio de fechamento durante o salvamento e aviso para link de item inexistente." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: Drawer de tipos

**Arquivos:**
- Criar: `pages/equipamentos/components/TiposDrawer.tsx`
- Modificar: `pages/equipamentos/EquipamentosPage.tsx`
- Teste: acrescentar em `pages/equipamentos/EquipamentosPage.test.tsx`

**Interfaces:**
- Consome: `validateTipo`, `byNome` (Tarefa 1), `Source.createTipo/renameTipo/setTipoAtivo` (Tarefa 3), `useEquipamentos().upsertTipo` (Tarefa 4).
- Produz: `TiposDrawer({ open, onClose, tipos, uso, source, onSaved })`.

- [ ] **Passo 1: escrever o teste que falha**

```tsx
  it('gerencia tipos: adiciona, bloqueia repetido, renomeia e inativa', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook reserva')
    fireEvent.click(screen.getByRole('button', { name: 'Tipos' }))
    const drawer = await screen.findByRole('dialog', { name: 'Tipos de equipamento' })
    const novo = drawer.querySelector('input[name="novoTipo"]') as HTMLInputElement

    fireEvent.change(novo, { target: { value: 'Webcam' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText('Tipo Webcam adicionado.')).toBeTruthy()

    fireEvent.change(novo, { target: { value: 'notebook' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Adicionar' }))
    expect(await within(drawer).findByText('Já existe o tipo Notebook.')).toBeTruthy()
    fireEvent.change(novo, { target: { value: '' } })

    fireEvent.click(within(drawer).getByRole('button', { name: 'Renomear tipo Monitor' }))
    fireEvent.change(drawer.querySelector('input[name="renomearTipo"]') as HTMLInputElement, { target: { value: 'Monitor LCD' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Salvar nome' }))
    expect(await screen.findByText('Tipo Monitor LCD salvo.')).toBeTruthy()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Inativar tipo Mouse' }))
    expect(await screen.findByText('Tipo Mouse inativado.')).toBeTruthy()
    expect(within(drawer).getByRole('button', { name: 'Reativar tipo Mouse' })).toBeTruthy()
  })
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/equipamentos/EquipamentosPage.test.tsx`
Esperado: FAIL, botão "Tipos" não existe.

- [ ] **Passo 3: implementar**

`pages/equipamentos/components/TiposDrawer.tsx`:

```tsx
import { useState } from 'react'
import { Button, Dialog, Drawer, Field, Input, StatusBadge, useToast } from '@betinhos/ui'
import { Archive, ArchiveRestore, Check, Pencil, Plus, X } from 'lucide-react'
import type { Source } from '../data/source'
import { MAX_TIPO, validateTipo } from '../domain/cadastros'
import type { TipoEquipamento } from '../domain/types'

type Props = {
  open: boolean
  onClose: () => void
  tipos: TipoEquipamento[]
  /** Quantos itens usam cada tipo. */
  uso: Map<string, number>
  source: Source
  onSaved: (t: TipoEquipamento) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const itens = (n: number) => (n === 1 ? '1 item' : `${n} itens`)

/** Adicionar, renomear e inativar tipos; inativo some dos seletores, mas os itens mantêm o tipo. */
export function TiposDrawer({ open, onClose, tipos, uso, source, onSaved }: Props) {
  const toast = useToast()
  const [novo, setNovo] = useState('')
  const [erroNovo, setErroNovo] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ id: string; nome: string } | null>(null)
  const [erroEdit, setErroEdit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingExit, setPendingExit] = useState(false)

  const original = edit ? tipos.find((t) => t.id === edit.id)?.nome ?? '' : ''
  const dirty = novo.trim() !== '' || (edit != null && edit.nome !== original)
  const lista = [...tipos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))

  function reset() { setNovo(''); setErroNovo(null); setEdit(null); setErroEdit(null) }
  function close() {
    if (busy) return
    if (dirty) { setPendingExit(true); return }
    reset()
    onClose()
  }

  async function run(action: () => Promise<void>, falha: string) {
    setBusy(true)
    try { await action() } catch (reason) { toast({ tone: 'danger', message: `${falha} ${reasonText(reason)}` }) } finally { setBusy(false) }
  }

  function add() {
    const erro = validateTipo(novo, tipos, null)
    setErroNovo(erro)
    if (erro || busy) return
    const nome = novo.trim()
    void run(async () => {
      const id = await source.createTipo(nome)
      onSaved({ id, nome, ativo: true })
      setNovo('')
      toast({ tone: 'success', message: `Tipo ${nome} adicionado.` })
    }, 'Não foi possível adicionar o tipo.')
  }

  function rename() {
    if (!edit || busy) return
    const erro = validateTipo(edit.nome, tipos, edit.id)
    setErroEdit(erro)
    if (erro) return
    const atual = tipos.find((t) => t.id === edit.id)
    if (!atual) return
    const nome = edit.nome.trim()
    void run(async () => {
      if (nome !== atual.nome) await source.renameTipo(atual.id, nome)
      onSaved({ ...atual, nome })
      setEdit(null)
      toast({ tone: 'success', message: `Tipo ${nome} salvo.` })
    }, 'Não foi possível renomear o tipo.')
  }

  function toggle(t: TipoEquipamento) {
    if (busy) return
    void run(async () => {
      await source.setTipoAtivo(t.id, !t.ativo)
      onSaved({ ...t, ativo: !t.ativo })
      toast({ tone: 'success', message: `Tipo ${t.nome} ${t.ativo ? 'inativado' : 'reativado'}.` })
    }, `Não foi possível ${t.ativo ? 'inativar' : 'reativar'} o tipo.`)
  }

  return (
    <>
      <Drawer open={open} onClose={close} eyebrow="Equipamentos" title="Tipos de equipamento">
        <div className="eq-tipos">
          <form className="eq-tipos__add" noValidate onSubmit={(e) => { e.preventDefault(); add() }}>
            <Field label="Novo tipo" error={erroNovo ?? undefined}>
              <Input name="novoTipo" value={novo} maxLength={MAX_TIPO} disabled={busy} onChange={(e) => { setNovo(e.target.value); setErroNovo(null) }} />
            </Field>
            <Button type="submit" icon={<Plus size={16} />} loading={busy && novo.trim() !== ''}>Adicionar</Button>
          </form>
          <p className="eq-muted">Tipo inativo deixa de aparecer para novos itens; os itens que já usam continuam com ele.</p>
          <ul className="eq-tipos__list">
            {lista.map((t) => (
              <li key={t.id} className="eq-tipos__item">
                {edit?.id === t.id ? (
                  <form className="eq-tipos__add eq-tipos__name" noValidate onSubmit={(e) => { e.preventDefault(); rename() }}>
                    <Field label={`Nome do tipo ${t.nome}`} error={erroEdit ?? undefined}>
                      <Input name="renomearTipo" value={edit.nome} maxLength={MAX_TIPO} disabled={busy} autoFocus onChange={(e) => { setEdit({ id: t.id, nome: e.target.value }); setErroEdit(null) }} />
                    </Field>
                    <Button type="submit" icon={<Check size={16} />} loading={busy}>Salvar nome</Button>
                    <Button variant="ghost" icon={<X size={16} />} aria-label="Cancelar renomeação" disabled={busy} onClick={() => { setEdit(null); setErroEdit(null) }} />
                  </form>
                ) : (
                  <>
                    <span className="eq-tipos__name">{t.nome}</span>
                    {t.ativo ? null : <StatusBadge tone="neutral">Inativo</StatusBadge>}
                    <span className="eq-muted eq-num">{itens(uso.get(t.id) ?? 0)}</span>
                    <Button variant="ghost" size="compact" icon={<Pencil size={16} />} aria-label={`Renomear tipo ${t.nome}`} disabled={busy} onClick={() => setEdit({ id: t.id, nome: t.nome })} />
                    <Button variant="ghost" size="compact" icon={t.ativo ? <Archive size={16} /> : <ArchiveRestore size={16} />} aria-label={`${t.ativo ? 'Inativar' : 'Reativar'} tipo ${t.nome}`} disabled={busy} onClick={() => toggle(t)} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
      <Dialog open={pendingExit} onClose={() => setPendingExit(false)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={() => { setPendingExit(false); reset(); onClose() }}>Descartar</Button>
        </>}>
        O nome digitado ainda não foi salvo.
      </Dialog>
    </>
  )
}
```

Em `EquipamentosPage.tsx`:
- importe `useState` e `Tags` (lucide) e `TiposDrawer`;
- `const [tiposOpen, setTiposOpen] = useState(false)`;
- `const usoTipos = useMemo(() => { const m = new Map<string, number>(); for (const e of data.equipamentos) if (e.tipoId) m.set(e.tipoId, (m.get(e.tipoId) ?? 0) + 1); return m }, [data.equipamentos])`;
- na `ViewBar`, antes de "Novo equipamento": `<Button variant="secondary" icon={<Tags size={16} />} disabled={!data.loaded} onClick={() => setTiposOpen(true)}>Tipos</Button>`;
- depois do `EquipamentoDrawer`: `{data.loaded ? <TiposDrawer open={tiposOpen} onClose={() => setTiposOpen(false)} tipos={data.tipos} uso={usoTipos} source={source} onSaved={data.upsertTipo} /> : null}`

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/equipamentos` → PASS. Run: `pnpm typecheck` → sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/equipamentos
git commit -m "feat(equipamentos): cadastro de tipos editável pela tela" -m "Drawer de tipos com adicionar, renomear (atualiza o nome nos itens), inativar e reativar; nome único sem diferenciar caixa e acento; contagem de itens por tipo; confirmação ao descartar nome não salvo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: Aba Equipamentos na ficha do funcionário

**Arquivos:**
- Modificar: `pages/funcionarios/data/types.ts` (novo tipo), `data/source.ts:38` (contrato), `data/dataverse.ts` (depois de `posses`, ~linha 173), `data/mock.ts:139` (depois de `posses`), `components/RelatedTabs.tsx`, `components/Ficha.tsx:13,20-31,233`
- Teste: `pages/funcionarios/components/Ficha.test.tsx`

**Interfaces:**
- Produz: `EquipamentoResumo = { id; descricao; tipo; numeroSerie; status }`; `DataSource.equipamentos(id): Promise<EquipamentoResumo[]>`; `EquipamentosTab({ source, id })`.

- [ ] **Passo 1: escrever o teste que falha**

Em `Ficha.test.tsx`, troque a assinatura de `fakeSource` para aceitar sobrescritas e acrescente o método novo:

```tsx
function fakeSource(save: DataSource['save'], extra: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    list: async () => [record], get: async () => structuredClone(record), save,
    uploadImage: async () => {}, saveLogins: async () => {}, multas: async () => [], posses: async () => [], equipamentos: async () => [], anotacoes: async () => [], addAnotacao: async () => {}, updateAnotacao: async () => {}, deleteAnotacao: async () => {}, limitesAnexo: async () => ({ maxBytes: 5e6, bloqueadas: [] }), anexo: async () => ({ nome: 'a', blob: new Blob() }),
    documentos: { pasta: () => '', listar: async () => [], enviar: async () => { throw new Error('n/a') }, abrir: async () => ({ nome: '', blob: new Blob() }), excluir: async () => {} },
    searchVeiculos: async () => [], openForm: () => {},
    ...extra,
  }
}
```

Novo teste no `describe('Ficha')`:

```tsx
  it('aba Equipamentos lista o que está com o funcionário e abre o item', async () => {
    const equipamentos = vi.fn(async () => [{ id: 'e1', descricao: 'Notebook do Financeiro', tipo: 'Notebook', numeroSerie: 'DL5440-001', status: 'Em uso' }])
    await renderFicha(fakeSource(vi.fn(async () => 'f1'), { equipamentos }))
    fireEvent.click(screen.getByRole('tab', { name: 'Equipamentos' }))
    expect(await screen.findByText('Notebook do Financeiro')).toBeTruthy()
    expect(screen.getByText('Notebook · Série DL5440-001')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir equipamento Notebook do Financeiro' }).getAttribute('href')).toBe('#/equipamentos?ver=e1')
    expect(equipamentos).toHaveBeenCalledWith('f1')
  })

  it('aba Equipamentos vazia explica', async () => {
    await renderFicha(fakeSource(vi.fn(async () => 'f1')))
    fireEvent.click(screen.getByRole('tab', { name: 'Equipamentos' }))
    expect(await screen.findByText('Nenhum equipamento com este funcionário.')).toBeTruthy()
  })
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `pnpm test -- src/pages/funcionarios/components/Ficha.test.tsx`
Esperado: FAIL (tab "Equipamentos" não existe; typecheck acusaria `equipamentos` fora do contrato).

- [ ] **Passo 3: implementar**

`pages/funcionarios/data/types.ts`, depois de `Posse`:

```ts
/** Equipamento com o funcionário (aba da ficha; o cadastro fica em #/equipamentos). */
export type EquipamentoResumo = {
  id: string
  descricao: string
  tipo: string
  numeroSerie: string
  status: string
}
```

`pages/funcionarios/data/source.ts`: importe `EquipamentoResumo` em `./types` e, depois de `posses(id: string): Promise<Posse[]>`:

```ts
  /** Equipamentos com o funcionário, exceto os baixados. */
  equipamentos(id: string): Promise<EquipamentoResumo[]>
```

`pages/funcionarios/data/dataverse.ts`, logo depois do método `posses` (importe `EquipamentoResumo`):

```ts
    async equipamentos(id): Promise<EquipamentoResumo[]> {
      // 100000003 = Baixado (provision-equipamentos.ps1): a aba mostra só o que está com a pessoa.
      const rows = await retrieveAll('cr40f_equipamento', `?$select=cr40f_name,_cr40f_tipo_value,cr40f_numeroserie,cr40f_status&$filter=_cr40f_responsavel_value eq ${id} and cr40f_status ne 100000003&$orderby=cr40f_name asc`)
      return rows.map((row) => ({
        id: cleanId(String(row.cr40f_equipamentoid)),
        descricao: String(row.cr40f_name ?? ''),
        tipo: String(row[`_cr40f_tipo_value${FORMATTED}`] ?? ''),
        numeroSerie: String(row.cr40f_numeroserie ?? ''),
        status: String(row[`cr40f_status${FORMATTED}`] ?? ''),
      }))
    },
```

`pages/funcionarios/data/mock.ts`, depois da linha `posses: …`:

```ts
    equipamentos: (id) => delay(id === 'm1' ? [{ id: 'eeeeeeee-0000-4000-8000-000000000005', descricao: 'Maquininha Carlos', tipo: 'Máquina de cartão', numeroSerie: 'S920-55410', status: 'Em uso' }] : []),
```

`pages/funcionarios/components/RelatedTabs.tsx`: troque o import de `@betinhos/ui` para incluir `buttonClassName`, o de tipos para incluir `EquipamentoResumo`, e acrescente no fim:

```tsx
export function EquipamentosTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.equipamentos(id), [source, id])
  const { data, loading, error } = useLoad<EquipamentoResumo[]>(load)
  return (
    <div className="related">
      <Status loading={loading} error={error} empty={!data?.length} emptyText="Nenhum equipamento com este funcionário." />
      <ul className="cards">
        {data?.map((item) => (
          <li key={item.id} className="card">
            <div className="card-main">
              <strong>{item.descricao}</strong>
              <span className="muted">{[item.tipo, item.numeroSerie && `Série ${item.numeroSerie}`].filter(Boolean).join(' · ') || '—'}</span>
            </div>
            <StatusBadge tone="info">{item.status || '—'}</StatusBadge>
            <a className={buttonClassName({ variant: 'ghost' })} href={`#/equipamentos?ver=${item.id}`} aria-label={`Abrir equipamento ${item.descricao}`}><ExternalLink size={16} aria-hidden /></a>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`pages/funcionarios/components/Ficha.tsx`:
- linha 13: `import { EquipamentosTab, MultasTab, VeiculosTab } from './RelatedTabs'`
- linha 20: `type Tab = 'dados' | 'documentos' | 'multas' | 'veiculos' | 'equipamentos' | 'anotacoes'`
- em `TABS`, depois de Veículos: `{ key: 'equipamentos', label: 'Equipamentos' },`
- depois da linha da `VeiculosTab` (~233): `{original && tab === 'equipamentos' && <EquipamentosTab source={source} id={original.id} />}`

- [ ] **Passo 4: rodar e ver passar**

Run: `pnpm test -- src/pages/funcionarios` → PASS. Run: `pnpm typecheck` → sem erros (se outro arquivo implementar `DataSource`, o typecheck aponta; acrescente `equipamentos` nele também).

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/funcionarios
git commit -m "feat(funcionarios): aba Equipamentos na ficha" -m "Lista, só leitura, os equipamentos com o funcionário (exceto baixados), com link para #/equipamentos?ver=<id>; mock e teste da aba." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: Scripts de schema e privilégios (DEV)

**Arquivos:**
- Criar: `packages/deploy/provision-equipamentos.ps1`, `packages/deploy/conceder-privilegios-equipamentos.ps1` (ambos UTF-8 **com BOM**)

**Interfaces:**
- Produz no Dataverse DEV: tabelas, colunas, choice e lookups exatamente com os nomes das Restrições globais; semente de 11 tipos.

- [ ] **Passo 1: montar `provision-equipamentos.ps1`**

1. Copie as linhas 1–196 de `packages/deploy/provision-documentos.ps1` (do `param` até o fim de `function Ensure-Lookup`), mantendo o BOM.
2. Troque o comentário das linhas 6–7 por:

```powershell
# Provisiona as tabelas de equipamentos (cr40f_tipoequipamento, cr40f_equipamento) no Dataverse DEV e inclui na solucao do .env.
# Idempotente: cria so o que falta e semeia os tipos por nome. Sem -Apply roda em DRY RUN. Configuracao vem do .env da raiz do monorepo.
```

3. Troque `Write-Host "[documentos] $Message"` por `Write-Host "[equipamentos] $Message"`.
4. Depois de `function Ensure-Lookup`, acrescente:

```powershell
function Money([string] $Schema, [string] $Display, [string] $Description) {
  @{ "@odata.type" = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"; SchemaName = $Schema; DisplayName = Label $Display; Description = Label $Description; MinValue = 0; MaxValue = 1000000000; Precision = 2; PrecisionSource = 2 }
}

if (-not (Get-EntityId "cr40f_funcionarios")) { throw "Tabela cr40f_funcionarios nao existe neste ambiente." }

$tipo = "cr40f_tipoequipamento"; $equip = "cr40f_equipamento"
$tipoId = Ensure-Table $tipo "cr40f_TipoEquipamento" "Tipo de equipamento" "Tipos de equipamento" "Catálogo de tipos (Notebook, Monitor, Máquina de cartão…)"
$equipId = Ensure-Table $equip "cr40f_Equipamento" "Equipamento" "Equipamentos" "Equipamento da empresa e o funcionário com ele agora."
if (-not $Apply -and (-not $tipoId -or -not $equipId)) { Write-Step "DRY RUN OK; use -Apply"; exit 0 }

# Status: valores espelham apps/shell/src/pages/equipamentos/domain/choices.ts
Ensure-AttributeOn $equip (Text "cr40f_MarcaModelo" "Marca/modelo" "Marca e modelo do item" 200)
Ensure-AttributeOn $equip (Text "cr40f_NumeroSerie" "Nº de série" "Número de série do fabricante" 100)
Ensure-AttributeOn $equip (Picklist "cr40f_Status" "Status" "Situação do item" @("Em uso", "Disponível", "Em manutenção", "Baixado") "ApplicationRequired")
Ensure-AttributeOn $equip (DateOnly "cr40f_DataCompra" "Data de compra" "Quando o item foi comprado")
Ensure-AttributeOn $equip (Money "cr40f_ValorCompra" "Valor de compra" "Valor pago pelo item")
Ensure-AttributeOn $equip @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; SchemaName = "cr40f_Observacoes"; DisplayName = Label "Observações"; Description = Label "Acessórios e estado do item"; MaxLength = 2000; Format = "TextArea" }
# Excluir tipo ou funcionario nao apaga o equipamento: o lookup fica vazio (spec secao 4.2).
Ensure-Lookup "cr40f_tipoequipamento_cr40f_equipamento_tipo" $tipo $equip "cr40f_Tipo" "Tipo" "Tipo do equipamento" "RemoveLink" "ApplicationRequired"
Ensure-Lookup "cr40f_funcionarios_cr40f_equipamento_responsavel" "cr40f_funcionarios" $equip "cr40f_Responsavel" "Responsável" "Funcionário com o item agora; vazio = escritório/estoque" "RemoveLink"

if ($Apply) {
  Invoke-Dataverse "POST" "PublishXml" @{ ParameterXml = "<importexportxml><entities><entity>$tipo</entity><entity>$equip</entity></entities></importexportxml>" } | Out-Null
  $esperado = @{
    $tipo = @("cr40f_name")
    $equip = @("cr40f_name", "cr40f_marcamodelo", "cr40f_numeroserie", "cr40f_status", "cr40f_datacompra", "cr40f_valorcompra", "cr40f_observacoes", "cr40f_tipo", "cr40f_responsavel")
  }
  $missing = @(); foreach ($e in $esperado.Keys) { $missing += @($esperado[$e] | Where-Object { -not (Get-AttributeId $e $_) } | ForEach-Object { "$e.$_" }) }
  if ($missing.Count) { throw "Colunas ausentes apos a publicacao: $($missing -join ', ')" }
  foreach ($t in @($tipoId, $equipId)) {
    if (@(Get-Rows "solutioncomponents" "solutioncomponentid" "_solutionid_value eq $solutionId and objectid eq $t and componenttype eq 1").Count -eq 0) { throw "Tabela $t nao esta na solucao $SolutionUniqueName." }
  }

  $set = (Invoke-Dataverse "GET" "EntityDefinitions(LogicalName='$tipo')?`$select=EntitySetName").EntitySetName
  foreach ($nome in @("Notebook", "Desktop", "Monitor", "Mouse", "Teclado", "Headset", "Celular", "Tablet", "Máquina de cartão", "Impressora", "Outro")) {
    if (@(Get-Rows $set "cr40f_tipoequipamentoid" "cr40f_name eq '$(Escape-OData $nome)'").Count -gt 0) { continue }
    Invoke-Dataverse "POST" $set @{ cr40f_name = $nome } | Out-Null
    Write-Step "tipo criado $nome"
  }
  Write-Step "SCHEMA OK: tabelas publicadas, na solucao $SolutionUniqueName e tipos semeados. Rode conceder-privilegios-equipamentos.ps1."
}
else { Write-Step "DRY RUN OK; use -Apply" }
```

- [ ] **Passo 2: montar `conceder-privilegios-equipamentos.ps1`**

Copie `packages/deploy/conceder-privilegios-documentos.ps1` inteiro (com BOM) e troque:
- comentário do `param` `$Roles`: `# Papeis que recebem nas tabelas de equipamentos o mesmo acesso que ja tem em cr40f_funcionarios (decisao do Renan em 21/10/2026).`
- linhas 8–9 do cabeçalho: `# Copia, para cr40f_tipoequipamento e cr40f_equipamento, os privilegios (e a profundidade) que cada papel listado tem em cr40f_funcionarios.`
- `Write-Host "[privilegios-documentos] $Message"` → `Write-Host "[privilegios-equipamentos] $Message"`
- `$tabelas = @("cr40f_tipodocumento", "cr40f_documento", "cr40f_avisodestinatario")` → `$tabelas = @("cr40f_tipoequipamento", "cr40f_equipamento")`
- comentário `# Privilegios das tabelas novas, por nome (prvReadcr40f_documento...).` → `(prvReadcr40f_equipamento...)`
- mensagem `rode provision-documentos.ps1 -Apply antes` → `rode provision-equipamentos.ps1 -Apply antes`

- [ ] **Passo 3: checar sintaxe e BOM**

```powershell
foreach ($f in "packages/deploy/provision-equipamentos.ps1","packages/deploy/conceder-privilegios-equipamentos.ps1") { $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$null, [ref]$e); "$f erros: $($e.Count)"; $b=[IO.File]::ReadAllBytes((Resolve-Path $f))[0..2]; "BOM: $($b -join ',')" }
```

Esperado: `erros: 0` e `BOM: 239,187,191` nos dois. Não rode com `-Apply` aqui (worktree, sem `.env`).

- [ ] **Passo 4: commit**

```bash
git add packages/deploy/provision-equipamentos.ps1 packages/deploy/conceder-privilegios-equipamentos.ps1
git commit -m "feat(deploy): scripts de schema e privilégios de equipamentos" -m "provision-equipamentos.ps1 cria cr40f_tipoequipamento e cr40f_equipamento no DEV (colunas, choice de status, lookups com RemoveLink), inclui na solução, publica e semeia 11 tipos; conceder-privilegios-equipamentos.ps1 copia os privilégios de cr40f_funcionarios para as tabelas novas. PROD bloqueado; dry run por padrão." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: Verificação local, skill de verificação e PR

**Arquivos:**
- Criar: `.claude/skills/verificar-equipamentos/SKILL.md` (via skill `verificacao-criar`)
- Modificar: `.claude/skills/verificar-index.md`, `docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md` (ajustes da seção "Ajustes ao spec")

- [ ] **Passo 1: suíte e tipos**

Run (em `apps/shell`): `pnpm typecheck` e `pnpm test`. Esperado: tudo verde. Timeout isolado do Vitest com a máquina carregada: rode o arquivo sozinho antes de concluir que é falha.

- [ ] **Passo 2: navegador em mock**

`pnpm dev` (porta 36472, via preview do app) e skill `ux-audit` modos Rápido e Fluxo em `#/equipamentos`, desktop e 375 px:
cadastrar item → atribuir responsável (status vira Em uso) → trocar responsável → marcar Baixado (responsável some) → filtrar visão "Sem responsável" → Tipos: adicionar, renomear, inativar → `#/funcionarios`, ficha de Carlos Alberto Teste, aba Equipamentos → clicar no item abre `#/equipamentos?ver=…`.
Critérios: console sem erros, overlay fecha o drawer, "Descartar alterações?" aparece com alteração, versão do build visível no canto. Guarde screenshots.

- [ ] **Passo 3: skill de verificação**

Rode a skill `verificacao-criar` para a área "equipamentos": `.claude/skills/verificar-equipamentos/SKILL.md` com o roteiro do Passo 2, os dados do mock (Notebook do Financeiro, Celular plantão com responsável inativo, Impressora antiga baixada) e a verificação no DEV da Tarefa 10. Acrescente a linha em `.claude/skills/verificar-index.md`.

- [ ] **Passo 4: atualizar o spec**

Em `docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md`: tabelas UserOwned (seção 4), link `?ver=` (5.2 e 5.4), "Sem responsável" como visão pronta (5.1) e mensagem "Tabela … não encontrada na metadata." (seção 7).

- [ ] **Passo 5: qualidade e verificação antes do PR**

Rode `qualidade-antes-do-pr` (simplify + karpathy-coder + `/code-review high --fix`) e `verificacao-manter`. Corrija o que sair, rode de novo `pnpm typecheck` e `pnpm test`.

- [ ] **Passo 6: commit e PR**

```bash
git add .claude/skills/verificar-equipamentos .claude/skills/verificar-index.md docs/superpowers/specs/2026-10-21-equipamentos-mvp-design.md
git commit -m "docs(equipamentos): skill de verificação e ajustes do spec" -m "Roteiro de verificação em mock e no DEV; spec alinhado ao que foi implementado (UserOwned, ?ver=, visão Sem responsável, mensagem de tabela ausente)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/mvp-equipamentos-module-e42b21
gh pr create --base main --title "feat(equipamentos): MVP do módulo de equipamentos" --body-file "$SCRATCHPAD/pr-equipamentos.md"
```

`pr-equipamentos.md` (no scratchpad da sessão) traz: resumo do que entrou, comandos de teste com resultado, screenshots do Passo 2 e a seção "Não verificado no DEV". O corpo diz explicitamente que schema e teste autenticado no DEV ficam para depois do merge (Tarefa 10) e termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

### Tarefa 10: Publicação no DEV (depois do merge, no checkout principal)

Só com o PR mesclado e OK do Renan. Nada em PROD.

- [ ] **Passo 1:** no checkout principal `Sistema Betinhos`: `git checkout main` e `git pull`.
- [ ] **Passo 2:** `powershell.exe -File packages/deploy/provision-equipamentos.ps1` (dry run). Esperado: "DRY RUN criaria a tabela cr40f_tipoequipamento" e "… cr40f_equipamento". Se disser que as tabelas já existem, pare e compare a metadata antes de seguir.
- [ ] **Passo 3:** `powershell.exe -File packages/deploy/provision-equipamentos.ps1 -Apply`. Esperado: `SCHEMA OK`.
- [ ] **Passo 4:** `powershell.exe -File packages/deploy/conceder-privilegios-equipamentos.ps1` (dry run, conferir papéis) e depois com `-Apply`. Esperado: `PRIVILEGIOS OK`.
- [ ] **Passo 5:** `pnpm push` (nunca em paralelo). Commit do bump: `build: Sistema Betinhos vX.Y.Z publicado no DEV a partir da main`.
- [ ] **Passo 6:** teste autenticado no DEV (navegador interno): cadastrar um item real, atribuir, limpar responsável (confere o DELETE no `$ref`), conferir a aba na ficha, inativar um tipo. Informar ao Renan a versão publicada.
