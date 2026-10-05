# Currículos em React — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** criar a rota React `#/curriculos` do shell, com funil de candidatos por status, detalhe e edição em drawer e cadastro com rascunho, idempotência e upload pelo Power Automate. Ela substitui no menu o item nativo `table('new_curriculo')`.

**Arquitetura:**
- O domínio são funções puras testadas com Vitest (`apps/shell/src/pages/curriculos/domain`).
- A camada de dados é uma `Source` com duas implementações: Dataverse e mock em memória para o `pnpm dev`.
- `data/submit.ts` orquestra criação idempotente e salvamento de registro existente, com dependências injetadas (testável em node).
- O hook `useCurriculos` faz a carga, as mudanças otimistas com rollback e o upsert; `useBoardDrag` faz o arrasto com pointer events, sem re-render por movimento.
- A UI usa `packages/ui` sem mudanças (o `Drawer` já é controlado e permite interceptar o fechamento).

**Stack:** React 19, TypeScript, Vite 7, Vitest 3 (ambiente node, sem jsdom), lucide-react, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-05-curriculos-react-design.md`. Leia antes de começar.

## Metadata confirmada em DEV (05/10/2026, somente leitura)

Consulta feita com o MCP `Dataverse_DEV` (`describe('tables/new_curriculo')` e `read_query`):

- Entity set: **`new_curriculos`**; chave `new_curriculoid`; `statecode` 0 = Ativo.
- Textos: `new_nomecompleto` (200, obrigatório), `new_cpf` (14), `new_email` (150), `new_telefone` (30), `new_whatsapp` (30), `new_cidade` (100), `new_estado` (2), `new_cargointeresse` (120), `new_ultimocargo` (120), `new_ultimaempresa` (150), `new_indicadopor` (200), `new_linkcurriculo` (URL 500), `new_experiencia` e `new_observacoes` (multilinha).
- Números: `new_pretensaosalarial` é **MONEY** (o Dataverse preenche a moeda padrão); `new_nota` é INT.
- Choices (iguais a `index.html:1371-1409`):
  - `new_statuscurriculo`: Novo 100000000, Em análise 100000001, Aprovado para banco 100000002, Reprovado 100000003, Contratado 100000004;
  - `new_categoriacnh`: A … Não informado (100000000 a 100000007);
  - `new_origemcurriculo`: Indicação … Outro (100000000 a 100000006);
  - `new_disponibilidade`: Imediata … A combinar (100000000 a 100000004).
- Linhas ativas em DEV: 45 (6 Novo, 23 Em análise, 10 Aprovado para banco, 6 Reprovado, 0 Contratado, nenhuma sem status).

O código não usa esses valores: o entity set vem de `host.metadata.entities()` e as opções de `host.metadata.choices()`. Os valores aparecem só no mock.

## Restrições globais

- Fuso `America/Sao_Paulo`. Datas `dd/MM/yyyy`; moeda `R$ 1.234,56`.
- Visual:
  - só tokens `--bt-*` do Design System 1.4.0: **nenhuma cor nova, nenhum gradiente, sem dark mode**;
  - colunas, campos, busca e cabeçalhos neutros em `var(--bt-color-surface-neutral)` (`#FCFCFB`);
  - azul só em foco, seleção (coluna-alvo), status, ícones e ações.
- Motion:
  - anima só `transform` e `opacity`, nunca `transition: all`;
  - hover só em `@media (hover: hover) and (pointer: fine)`;
  - pressionar = `scale(.97)` em 150 ms; assentamento do card em 200 ms `--bt-ease-out`; drawer 220 ms (do componente);
  - `prefers-reduced-motion` é tratado pela regra global dos tokens (zera transições, inclusive as inline).
- Status nunca só por cor. Alvos touch de 44 px. Textos em pt-BR com acentos; botões começam com verbo.
- **Repositório público:** nunca copiar para código, testes, commits ou PR as URLs assinadas do Flow que estão no legado. A URL vem só de `import.meta.env.VITE_CURRICULO_UPLOAD_URL`, no `.env` local (ignorado pelo git).
- Choices só da metadata fora do mock. Entity set só da metadata.
- Não portar o log em `new_appmotoristaslog`. Não mexer no redirect do "Novo" do model-driven.
- `domain/` não importa `@betinhos/ui` em runtime (só `import type`), para os testes rodarem em node sem carregar React.
- PROD é somente leitura. Escrita só em DEV, na última tarefa, com o ok do Renan.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Todos os comandos rodam na raiz da worktree `C:\Users\mendo\Desktop\vscode\Sistema Betinhos\.claude\worktrees\curriculos-react`. Rode `pnpm install` uma vez antes da Tarefa 1.

## Mapa de arquivos

```
apps/shell/src/pages/curriculos/
  domain/types.ts            Curriculo, ChoiceSet
  domain/text.ts             normalize, digits, máscaras, daysAgo, formatMoney, formatDate
  domain/form.ts             FIELDS, MAX_LENGTH, emptyForm, toForm, validateForm, createPayload, changePayload, isDirty, payloadSignature
  domain/funnel.ts           buildStages, stageFor, groupByStage, filtros, cargoOptions, choiceLabel
  domain/duplicates.ts       phoneKey, findDuplicates, duplicateMessage
  domain/drag.ts             passedThreshold, resolveDrop, settleDelta
  domain/submission.ts       KV, rascunho, pendência, nextStep
  domain/fixtures.ts         makeCurriculo (só testes)
  domain/*.test.ts
  data/queries.ts            ENTITY, curriculosPath, mapCurriculo, loadCurriculos
  data/mutations.ts          statusPatch, linkPatch
  data/upload.ts             ACCEPT, MAX_FILE_SIZE, fileProblem, flowBody, parseFlowResponse, toBase64, postToFlow
  data/submit.ts             submitNew, saveExisting
  data/mock.ts               MOCK_CHOICES, createMockRows
  data/source.ts             Source, createSource(host, uploadUrl)
  data/data.test.ts, data/submit.test.ts
  useCurriculos.ts           carga, otimismo, upsert
  useBoardDrag.ts            arrasto e assentamento (FLIP)
  components/CurriculoFilters.tsx
  components/CurriculoCard.tsx
  components/FunnelBoard.tsx     (+ BoardSkeleton)
  components/FunnelTabs.tsx
  components/CurriculoView.tsx
  components/CurriculoForm.tsx
  components/CurriculoDrawer.tsx
  CurriculosPage.tsx
  curriculos.css             classes `cv-`
apps/shell/src/nav/menu.ts, app/RouteLayout.tsx, app/AppShell.tsx   rota nova
apps/shell/vite.config.ts, apps/shell/src/vite-env.d.ts, .env.example   VITE_CURRICULO_UPLOAD_URL
```

Reuso: `useMedia` vem de `pages/operacional/useMedia.ts`; `telHref`/`whatsappHref` de `pages/operacional/domain/phone.ts`.

---

### Tarefa 1: tipos, texto e formulário

**Arquivos:**
- Criar: `domain/types.ts`, `domain/text.ts`, `domain/form.ts`, `domain/fixtures.ts`
- Teste: `domain/form.test.ts`

(caminhos relativos a `apps/shell/src/pages/curriculos/`)

**Interfaces:**
- Consome: `ChoiceOption` e `Row` de `@betinhos/dataverse` (só tipos).
- Produz:
  - `Curriculo`, `ChoiceSet`;
  - `normalize`, `digits`, `maskCpf`, `maskPhone`, `maskUf`, `maskNota`, `daysAgo(date, now)`, `formatMoney(n)`, `formatDate(d)`;
  - `FIELDS`, `FormKey`, `CurriculoForm`, `FormErrors`, `MAX_LENGTH`, `FORM_KEYS`, `emptyForm(status)`, `toForm(c)`, `parseDecimal`, `validateForm`, `createPayload`, `changePayload`, `isDirty`, `payloadSignature`;
  - `makeCurriculo(patch)`.

- [ ] **Passo 1: tipos e fixture**

```ts
// domain/types.ts
import type { ChoiceOption } from '@betinhos/dataverse'

export type Curriculo = {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  whatsapp: string
  cidade: string
  estado: string
  cargo: string
  experiencia: string
  ultimoCargo: string
  ultimaEmpresa: string
  pretensao: number | null
  nota: number | null
  indicadoPor: string
  disponibilidade: number | null
  cnh: number | null
  origem: number | null
  /** Valor da choice new_statuscurriculo; null cai na primeira etapa (Novo). */
  status: number | null
  link: string
  observacoes: string
  criadoEm: Date | null
}

/** Opções reais das quatro colunas choice, lidas da metadata. */
export type ChoiceSet = {
  status: ChoiceOption[]
  cnh: ChoiceOption[]
  origem: ChoiceOption[]
  disponibilidade: ChoiceOption[]
}
```

```ts
// domain/fixtures.ts
import type { Curriculo } from './types'

/** Currículo completo para testes; sobrescreva só o que importa. */
export function makeCurriculo(patch: Partial<Curriculo> = {}): Curriculo {
  return {
    id: 'x', nome: 'Candidato', cpf: '', email: '', telefone: '', whatsapp: '', cidade: '', estado: '', cargo: '',
    experiencia: '', ultimoCargo: '', ultimaEmpresa: '', pretensao: null, nota: null, indicadoPor: '',
    disponibilidade: null, cnh: null, origem: null, status: null, link: '', observacoes: '', criadoEm: null,
    ...patch,
  }
}
```

- [ ] **Passo 2: escrever o teste que falha**

```ts
// domain/form.test.ts
import { describe, expect, it } from 'vitest'
import { daysAgo, digits, formatMoney, maskCpf, maskPhone, maskUf, normalize } from './text'
import { changePayload, createPayload, emptyForm, isDirty, parseDecimal, payloadSignature, toForm, validateForm } from './form'
import { makeCurriculo } from './fixtures'

const curriculo = makeCurriculo({
  id: 'a', nome: 'Ana', cpf: '123.456.789-01', email: 'ana@exemplo.com', telefone: '(11) 98888-2001', cidade: 'São Paulo',
  estado: 'SP', cargo: 'Motorista', pretensao: 3500.5, nota: 8, cnh: 100000001, status: 100000001,
})

describe('texto', () => {
  it('normaliza e extrai dígitos', () => {
    expect(normalize(' São JOÃO ')).toBe('sao joao')
    expect(digits('(11) 9-8')).toBe('1198')
  })
  it('mascara CPF, telefone e UF', () => {
    expect(maskCpf('12345678901')).toBe('123.456.789-01')
    expect(maskCpf('1234')).toBe('123.4')
    expect(maskCpf('123.456.789-0199')).toBe('123.456.789-01')
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
    expect(maskPhone('119')).toBe('(11) 9')
    expect(maskPhone('1')).toBe('1')
    expect(maskUf('sp1')).toBe('SP')
  })
  it('conta os dias no fuso de São Paulo', () => {
    const now = new Date('2026-10-05T10:00:00-03:00')
    expect(daysAgo(new Date('2026-10-05T00:30:00-03:00'), now)).toBe('hoje')
    expect(daysAgo(new Date('2026-10-04T23:59:00-03:00'), now)).toBe('ontem')
    expect(daysAgo(new Date('2026-09-25T12:00:00-03:00'), now)).toBe('há 10 dias')
    expect(daysAgo(null, now)).toBe('')
  })
  it('formata moeda', () => {
    expect(formatMoney(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50')
  })
})

describe('formulário', () => {
  it('valida obrigatórios e formatos', () => {
    const form = { ...emptyForm(100000000), cpf: '123', email: 'ana@', estado: 'S', pretensao: '3.500,00', nota: '11', link: 'www.x.com' }
    expect(validateForm(form)).toEqual({
      nome: 'Informe o nome completo.',
      cpf: 'O CPF precisa ter 11 dígitos.',
      email: 'Use um e-mail no formato nome@dominio.com.',
      estado: 'Use a sigla com 2 letras, ex.: SP.',
      cargo: 'Informe o cargo de interesse.',
      pretensao: 'Use só números, ex.: 3500,00.',
      nota: 'Use um número inteiro de 0 a 10.',
      link: 'Use um endereço que comece com http:// ou https://.',
    })
    expect(validateForm(toForm(curriculo))).toEqual({})
  })
  it('monta o payload de criação só com o preenchido', () => {
    const form = { ...emptyForm(100000000), nome: ' Ana ', cargo: 'Motorista', pretensao: '3500,50', nota: '0', cnh: '100000001' }
    expect(createPayload(form)).toEqual({
      new_nomecompleto: 'Ana', new_cargointeresse: 'Motorista', new_pretensaosalarial: 3500.5, new_nota: 0,
      new_categoriacnh: 100000001, new_statuscurriculo: 100000000,
    })
  })
  it('monta o payload de alteração só com o que mudou', () => {
    const before = toForm(curriculo)
    const after = { ...before, email: '', nota: '9', cidade: 'São Paulo ' }
    expect(changePayload(before, after)).toEqual({ new_email: null, new_nota: 9 })
    expect(isDirty(before, before)).toBe(false)
    expect(isDirty(before, after)).toBe(true)
  })
  it('assina o payload sem depender da ordem das chaves', () => {
    expect(payloadSignature({ b: 1, a: 'x' })).toBe(payloadSignature({ a: 'x', b: 1 }))
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('abc')).toBeNull()
  })
})
```

- [ ] **Passo 3: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos/domain/form.test.ts`. Esperado: FAIL, módulos não encontrados.

- [ ] **Passo 4: implementar**

```ts
// domain/text.ts
const DAY = 86_400_000
const TZ = 'America/Sao_Paulo'
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Minúsculas e sem acento, para a busca achar "joao" em "João". */
export const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const digits = (text: string) => text.replace(/\D/g, '')

export function maskCpf(raw: string) {
  return digits(raw).slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** (11) 3333-4444 ou (11) 98765-4321; corrige o legado, que errava o fixo de 10 dígitos. */
export function maskPhone(raw: string) {
  const d = digits(raw).slice(0, 11)
  if (d.length < 3) return d
  const rest = d.slice(2)
  const split = rest.length > 8 ? 5 : 4
  return rest.length > split ? `(${d.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}` : `(${d.slice(0, 2)}) ${rest}`
}

export const maskUf = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
export const maskNota = (raw: string) => digits(raw).slice(0, 2)

/** "hoje", "ontem" ou "há N dias", contando dias de calendário em São Paulo. */
export function daysAgo(date: Date | null, now: Date) {
  if (!date) return ''
  const days = Math.round((Date.parse(keyFormat.format(now)) - Date.parse(keyFormat.format(date))) / DAY)
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`
}

export const formatMoney = (value: number) => moneyFormat.format(value)
export const formatDate = (date: Date) => dateFormat.format(date)
```

```ts
// domain/form.ts
import type { Row } from '@betinhos/dataverse'
import type { Curriculo } from './types'
import { digits } from './text'

/** Campo do formulário → coluna de new_curriculo (confirmadas na metadata de DEV). */
export const FIELDS = {
  nome: 'new_nomecompleto', cpf: 'new_cpf', email: 'new_email', telefone: 'new_telefone', whatsapp: 'new_whatsapp',
  cidade: 'new_cidade', estado: 'new_estado', cargo: 'new_cargointeresse', experiencia: 'new_experiencia',
  ultimoCargo: 'new_ultimocargo', ultimaEmpresa: 'new_ultimaempresa', pretensao: 'new_pretensaosalarial', nota: 'new_nota',
  indicadoPor: 'new_indicadopor', disponibilidade: 'new_disponibilidade', cnh: 'new_categoriacnh', origem: 'new_origemcurriculo',
  status: 'new_statuscurriculo', link: 'new_linkcurriculo', observacoes: 'new_observacoes',
} as const

export type FormKey = keyof typeof FIELDS
/** Tudo em texto, como nos inputs; choices guardam o valor numérico em string ('' = vazio). */
export type CurriculoForm = Record<FormKey, string>
export type FormErrors = Partial<Record<FormKey, string>>

export const FORM_KEYS = Object.keys(FIELDS) as FormKey[]

/** Tamanho máximo dos textos, conforme a metadata de DEV. */
export const MAX_LENGTH: Partial<Record<FormKey, number>> = {
  nome: 200, cpf: 14, email: 150, telefone: 30, whatsapp: 30, cidade: 100, estado: 2, cargo: 120,
  ultimoCargo: 120, ultimaEmpresa: 150, indicadoPor: 200, link: 500,
}

const CHOICES: FormKey[] = ['disponibilidade', 'cnh', 'origem', 'status']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emptyForm(status: number | null): CurriculoForm {
  const form = Object.fromEntries(FORM_KEYS.map((key) => [key, ''])) as CurriculoForm
  form.status = status == null ? '' : String(status)
  return form
}

const numberText = (value: number | null) => (value == null ? '' : String(value))

export function toForm(c: Curriculo): CurriculoForm {
  return {
    nome: c.nome, cpf: c.cpf, email: c.email, telefone: c.telefone, whatsapp: c.whatsapp, cidade: c.cidade, estado: c.estado,
    cargo: c.cargo, experiencia: c.experiencia, ultimoCargo: c.ultimoCargo, ultimaEmpresa: c.ultimaEmpresa,
    pretensao: c.pretensao == null ? '' : String(c.pretensao).replace('.', ','),
    nota: numberText(c.nota), indicadoPor: c.indicadoPor, disponibilidade: numberText(c.disponibilidade), cnh: numberText(c.cnh),
    origem: numberText(c.origem), status: numberText(c.status), link: c.link, observacoes: c.observacoes,
  }
}

/** "3500", "3500,5" ou "3500.50"; recusa separador de milhar. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : null
}

export function validateForm(form: CurriculoForm): FormErrors {
  const errors: FormErrors = {}
  const has = (key: FormKey) => form[key].trim() !== ''
  if (!has('nome')) errors.nome = 'Informe o nome completo.'
  if (has('cpf') && digits(form.cpf).length !== 11) errors.cpf = 'O CPF precisa ter 11 dígitos.'
  if (has('email') && !EMAIL.test(form.email.trim())) errors.email = 'Use um e-mail no formato nome@dominio.com.'
  if (has('estado') && !/^[A-Z]{2}$/.test(form.estado.trim())) errors.estado = 'Use a sigla com 2 letras, ex.: SP.'
  if (!has('cargo')) errors.cargo = 'Informe o cargo de interesse.'
  if (has('pretensao') && parseDecimal(form.pretensao) == null) errors.pretensao = 'Use só números, ex.: 3500,00.'
  if (has('nota') && !(/^\d{1,2}$/.test(form.nota.trim()) && Number(form.nota) <= 10)) errors.nota = 'Use um número inteiro de 0 a 10.'
  if (has('link') && !/^https?:\/\/\S+$/i.test(form.link.trim())) errors.link = 'Use um endereço que comece com http:// ou https://.'
  return errors
}

/** Valor do campo no formato da coluna; `null` quando vazio. */
function columnValue(key: FormKey, raw: string): string | number | null {
  const text = raw.trim()
  if (!text) return null
  if (key === 'pretensao') return parseDecimal(text)
  if (key === 'nota' || CHOICES.includes(key)) return Number(text)
  return text
}

/** Criação: só os campos preenchidos, como no legado. */
export function createPayload(form: CurriculoForm): Row {
  const payload: Row = {}
  for (const key of FORM_KEYS) {
    const value = columnValue(key, form[key])
    if (value != null) payload[FIELDS[key]] = value
  }
  return payload
}

/** Alteração: só o que mudou; campo esvaziado vira `null`. */
export function changePayload(before: CurriculoForm, after: CurriculoForm): Row {
  const payload: Row = {}
  for (const key of FORM_KEYS) if (before[key].trim() !== after[key].trim()) payload[FIELDS[key]] = columnValue(key, after[key])
  return payload
}

export const isDirty = (before: CurriculoForm, after: CurriculoForm) => FORM_KEYS.some((key) => before[key] !== after[key])

/** Assinatura estável (chaves ordenadas) usada pela idempotência, igual ao legado. */
export function payloadSignature(payload: Row) {
  return JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map((key) => [key, payload[key]])))
}
```

- [ ] **Passo 5: rodar e ver passar.** Mesmo comando. Esperado: PASS.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/curriculos/domain
git commit -m "Currículos: tipos, máscaras e regras do formulário" -m "Adiciona o tipo Curriculo, as máscaras de CPF, telefone e UF (corrigindo o fixo de 10 dígitos do legado), o 'há N dias' no fuso de São Paulo e as regras do formulário: validação, payload de criação só com o preenchido, payload de alteração só com o que mudou e a assinatura usada pela idempotência." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: funil, filtros, duplicidade e arrasto

**Arquivos:**
- Criar: `domain/funnel.ts`, `domain/duplicates.ts`, `domain/drag.ts`
- Teste: `domain/funnel.test.ts`, `domain/duplicates.test.ts`

**Interfaces:**
- Consome: `Curriculo`, `normalize`, `digits`, `makeCurriculo` (Tarefa 1); `StatusTone` de `@betinhos/ui` (só tipo).
- Produz:
  - `StageKey`, `Stage = { key, value, label, short, tone, confirm }`, `buildStages(options)`, `stageFor(c, stages)`, `groupByStage(list, stages): Map<number, Curriculo[]>`, `choiceLabel(options, value)`;
  - `Filters`, `EMPTY_FILTERS`, `hasFilters`, `filterCurriculos(list, filters)`, `cargoOptions(list)`;
  - `Duplicate`, `phoneKey`, `findDuplicates(form, list, selfId)`, `duplicateMessage(d)`;
  - `DRAG_THRESHOLD`, `passedThreshold(dx, dy)`, `resolveDrop(from, target)`, `settleDelta(from, to)`.

- [ ] **Passo 1: escrever os testes que falham**

```ts
// domain/funnel.test.ts
import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, buildStages, cargoOptions, choiceLabel, filterCurriculos, groupByStage, hasFilters, type Filters } from './funnel'
import { makeCurriculo as make } from './fixtures'

const STATUS = [
  { value: 100000000, label: 'Novo' }, { value: 100000001, label: 'Em análise' }, { value: 100000002, label: 'Aprovado para banco' },
  { value: 100000003, label: 'Reprovado' }, { value: 100000004, label: 'Contratado' },
]

describe('etapas', () => {
  it('ordena pelo funil e não pela metadata', () => {
    const stages = buildStages(STATUS)
    expect(stages.map((s) => s.key)).toEqual(['novo', 'analise', 'aprovado', 'contratado', 'reprovado'])
    expect(stages[2]).toMatchObject({ value: 100000002, short: 'Aprovado p/ banco', tone: 'success', confirm: false })
    expect(stages.filter((s) => s.confirm).map((s) => s.key)).toEqual(['contratado', 'reprovado'])
    expect(choiceLabel(STATUS, 100000001)).toBe('Em análise')
    expect(choiceLabel(STATUS, null)).toBe('')
  })
  it('agrupa e manda status vazio para Novo', () => {
    const stages = buildStages(STATUS)
    const groups = groupByStage([make({ id: '1' }), make({ id: '2', status: 100000003 }), make({ id: '3', status: 100000000 })], stages)
    expect(groups.get(100000000)?.map((c) => c.id)).toEqual(['1', '3'])
    expect(groups.get(100000003)?.map((c) => c.id)).toEqual(['2'])
    expect(groups.get(100000004)).toEqual([])
  })
})

describe('filtros', () => {
  const list = [
    make({ id: '1', nome: 'João Prado', cidade: 'São Paulo', telefone: '(11) 98888-2001', cargo: 'Motorista executivo', cnh: 1, origem: 2, nota: 9 }),
    make({ id: '2', nome: 'Elaine Souza', cidade: 'Santo André', telefone: '(11) 3333-4444', cargo: 'motorista executivo ', cnh: 2, origem: 3, nota: 5 }),
    make({ id: '3', nome: 'Karina', cidade: 'Rio', cargo: 'Assistente' }),
  ]
  const ids = (f: Partial<Filters>) => filterCurriculos(list, { ...EMPTY_FILTERS, ...f }).map((c) => c.id)

  it('busca sem acento por nome, cidade e telefone', () => {
    expect(ids({ query: 'joao' })).toEqual(['1'])
    expect(ids({ query: 'santo andre' })).toEqual(['2'])
    expect(ids({ query: '3333-44' })).toEqual(['2'])
    expect(ids({ query: '98888' })).toEqual(['1'])
  })
  it('combina cargo, CNH, origem e nota mínima', () => {
    expect(ids({ cargo: 'Motorista executivo' })).toEqual(['1', '2'])
    expect(ids({ cnh: 2 })).toEqual(['2'])
    expect(ids({ origem: 2 })).toEqual(['1'])
    expect(ids({ notaMin: 6 })).toEqual(['1'])
    expect(hasFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasFilters({ ...EMPTY_FILTERS, notaMin: 0 })).toBe(true)
  })
  it('lista cargos sem repetir', () => {
    expect(cargoOptions(list)).toEqual(['Assistente', 'Motorista executivo'])
  })
})
```

```ts
// domain/duplicates.test.ts
import { describe, expect, it } from 'vitest'
import { duplicateMessage, findDuplicates } from './duplicates'
import { passedThreshold, resolveDrop, settleDelta } from './drag'
import { makeCurriculo as make } from './fixtures'

describe('duplicidade', () => {
  const list = [
    make({ id: 'a', nome: 'Ana', cpf: '123.456.789-01', telefone: '(11) 98888-2001' }),
    make({ id: 'b', nome: 'Bruno', whatsapp: '+55 11 3333-4444' }),
  ]
  it('acha CPF e telefone só por dígitos', () => {
    expect(findDuplicates({ cpf: '12345678901', telefone: '', whatsapp: '' }, list, null)).toEqual([{ kind: 'CPF', id: 'a', nome: 'Ana' }])
    expect(findDuplicates({ cpf: '', telefone: '1133334444', whatsapp: '' }, list, null)).toEqual([{ kind: 'telefone', id: 'b', nome: 'Bruno' }])
    expect(duplicateMessage({ kind: 'CPF', id: 'a', nome: 'Ana' })).toBe('Já existe um currículo com este CPF: Ana')
  })
  it('ignora o próprio registro e números curtos', () => {
    expect(findDuplicates({ cpf: '123.456.789-01', telefone: '(11) 98888-2001', whatsapp: '' }, list, 'a')).toEqual([])
    expect(findDuplicates({ cpf: '123', telefone: '2001', whatsapp: '' }, list, null)).toEqual([])
  })
})

describe('arrasto', () => {
  it('só começa depois de 6 px', () => {
    expect(passedThreshold(3, 4)).toBe(false)
    expect(passedThreshold(6, 0)).toBe(true)
  })
  it('ignora soltar na mesma coluna ou fora', () => {
    expect(resolveDrop(1, 1)).toBeNull()
    expect(resolveDrop(1, null)).toBeNull()
    expect(resolveDrop(1, 2)).toBe(2)
  })
  it('calcula o deslocamento do assentamento', () => {
    expect(settleDelta({ left: 300, top: 120 }, { left: 40, top: 200 })).toEqual({ x: 260, y: -80 })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos/domain`. Esperado: FAIL nos dois arquivos novos.

- [ ] **Passo 3: implementar**

```ts
// domain/funnel.ts
import type { ChoiceOption } from '@betinhos/dataverse'
import type { StatusTone } from '@betinhos/ui'
import type { Curriculo } from './types'
import { digits, normalize } from './text'

export type StageKey = 'novo' | 'analise' | 'aprovado' | 'contratado' | 'reprovado'
export type Stage = { key: StageKey; value: number; label: string; short: string; tone: StatusTone; confirm: boolean }

// A ordem do funil é fixa; os valores e rótulos vêm da metadata e são casados pelo rótulo sem acento.
const RULES: { key: StageKey; match: RegExp; tone: StatusTone }[] = [
  { key: 'novo', match: /^novo/, tone: 'info' },
  { key: 'analise', match: /analise/, tone: 'warning' },
  { key: 'aprovado', match: /aprovad/, tone: 'success' },
  { key: 'contratado', match: /contratad/, tone: 'success' },
  { key: 'reprovado', match: /reprovad/, tone: 'neutral' },
]

export function buildStages(options: ChoiceOption[]): Stage[] {
  return RULES.flatMap((rule) => {
    const option = options.find((o) => rule.match.test(normalize(o.label)))
    if (!option) return []
    return [{
      key: rule.key,
      value: option.value,
      label: option.label,
      short: rule.key === 'aprovado' ? option.label.replace(/para banco/i, 'p/ banco') : option.label,
      tone: rule.tone,
      confirm: rule.key === 'contratado' || rule.key === 'reprovado',
    }]
  })
}

/** Etapa do currículo; sem status (ou status desconhecido) cai na primeira etapa. */
export const stageFor = (c: Curriculo, stages: Stage[]): Stage | undefined => stages.find((s) => s.value === c.status) ?? stages[0]

/** Colunas na ordem da lista recebida (createdon desc). */
export function groupByStage(list: Curriculo[], stages: Stage[]) {
  const groups = new Map<number, Curriculo[]>(stages.map((s) => [s.value, []]))
  for (const c of list) {
    const stage = stageFor(c, stages)
    if (stage) groups.get(stage.value)!.push(c)
  }
  return groups
}

export const choiceLabel = (options: ChoiceOption[], value: number | null) => (value == null ? '' : options.find((o) => o.value === value)?.label ?? '')

export type Filters = { query: string; cargo: string | null; cnh: number | null; origem: number | null; notaMin: number | null }
export const EMPTY_FILTERS: Filters = { query: '', cargo: null, cnh: null, origem: null, notaMin: null }

export const hasFilters = (f: Filters) => f.query.trim() !== '' || f.cargo != null || f.cnh != null || f.origem != null || f.notaMin != null

/** Sem letras e com 3+ dígitos: procura no telefone e no WhatsApp; senão, cada palavra no nome ou na cidade. */
function matchesQuery(c: Curriculo, query: string) {
  const q = normalize(query)
  if (!q) return true
  if (!/[a-z]/.test(q)) {
    const d = digits(q)
    if (d.length >= 3) return `${digits(c.telefone)} ${digits(c.whatsapp)}`.includes(d)
  }
  const text = normalize(`${c.nome} ${c.cidade}`)
  return q.split(/\s+/).every((token) => text.includes(token))
}

export function filterCurriculos(list: Curriculo[], f: Filters) {
  return list.filter((c) =>
    matchesQuery(c, f.query)
    && (f.cargo == null || normalize(c.cargo) === normalize(f.cargo))
    && (f.cnh == null || c.cnh === f.cnh)
    && (f.origem == null || c.origem === f.origem)
    && (f.notaMin == null || (c.nota != null && c.nota >= f.notaMin)))
}

/** Cargos distintos (ignorando acento e caixa), na primeira grafia encontrada, em ordem alfabética. */
export function cargoOptions(list: Curriculo[]) {
  const seen = new Map<string, string>()
  for (const c of list) {
    const cargo = c.cargo.trim()
    if (cargo && !seen.has(normalize(cargo))) seen.set(normalize(cargo), cargo)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
```

```ts
// domain/duplicates.ts
import type { Curriculo } from './types'
import { digits } from './text'

export type Duplicate = { kind: 'CPF' | 'telefone'; id: string; nome: string }

/** Telefone sem DDI 55, com 10 ou 11 dígitos; null quando curto demais para comparar. */
export function phoneKey(raw: string) {
  let d = digits(raw)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

/** Aviso, não bloqueio: primeiro registro com o mesmo CPF e primeiro com o mesmo telefone ou WhatsApp. */
export function findDuplicates(form: { cpf: string; telefone: string; whatsapp: string }, list: Curriculo[], selfId: string | null): Duplicate[] {
  const others = list.filter((c) => c.id !== selfId)
  const result: Duplicate[] = []
  const cpf = digits(form.cpf)
  if (cpf.length === 11) {
    const hit = others.find((c) => digits(c.cpf) === cpf)
    if (hit) result.push({ kind: 'CPF', id: hit.id, nome: hit.nome })
  }
  const phones = [form.telefone, form.whatsapp].map(phoneKey).filter((p): p is string => p != null)
  if (phones.length) {
    const hit = others.find((c) => [c.telefone, c.whatsapp].some((p) => { const key = phoneKey(p); return key != null && phones.includes(key) }))
    if (hit) result.push({ kind: 'telefone', id: hit.id, nome: hit.nome })
  }
  return result
}

export const duplicateMessage = (d: Duplicate) => `Já existe um currículo com este ${d.kind}: ${d.nome}`
```

```ts
// domain/drag.ts
export const DRAG_THRESHOLD = 6

/** Clique vira arrasto só depois de 6 px, para não roubar o clique que abre o card. */
export const passedThreshold = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRAG_THRESHOLD

/** Etapa de destino; null quando soltou fora de coluna ou na própria coluna. */
export const resolveDrop = (from: number, target: number | null) => (target == null || target === from ? null : target)

/** Deslocamento inicial do FLIP: de onde o card foi solto até a posição nova. */
export const settleDelta = (from: { left: number; top: number }, to: { left: number; top: number }) => ({ x: from.left - to.left, y: from.top - to.top })
```

- [ ] **Passo 4: rodar e ver passar.** Mesmo comando. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/curriculos/domain
git commit -m "Currículos: etapas do funil, filtros, duplicidade e regras do arrasto" -m "As etapas saem das opções reais de new_statuscurriculo, casadas pelo rótulo sem acento e na ordem Novo, Em análise, Aprovado p/ banco, Contratado e Reprovado (as duas últimas pedem confirmação). Busca sem acento por nome, cidade ou telefone; filtros por cargo, CNH, origem e nota mínima; aviso de CPF ou telefone repetido; limiar, alvo e deslocamento do arrasto." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: rascunho e submissão pendente

**Arquivos:**
- Criar: `domain/submission.ts`
- Teste: `domain/submission.test.ts`

**Interfaces:**
- Consome: `CurriculoForm`, `FORM_KEYS` (Tarefa 1).
- Produz: `KV`, `DRAFT_KEY`, `PENDING_KEY`, `Pending`, `Step`, `readPending`, `writePending`, `clearPending`, `nextStep(pending, signature, hasFile)`, `readDraft(kv, base)`, `writeDraft`, `clearDraft`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// domain/submission.test.ts
import { describe, expect, it } from 'vitest'
import { DRAFT_KEY, PENDING_KEY, clearDraft, clearPending, nextStep, readDraft, readPending, writeDraft, writePending, type KV, type Pending } from './submission'
import { emptyForm } from './form'

function memory() {
  const data = new Map<string, string>()
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
  return { kv, data }
}

describe('pendência', () => {
  const p: Pending = { recordId: 'r1', signature: 's', phase: 'record-created', fileName: 'cv.pdf' }
  it('decide o próximo passo', () => {
    expect(nextStep(null, 's', true)).toBe('create')
    expect(nextStep(p, 'outra', true)).toBe('create')
    expect(nextStep(p, 's', true)).toBe('upload')
    expect(nextStep(p, 's', false)).toBe('need-file')
    expect(nextStep({ ...p, phase: 'upload-completed', webUrl: 'https://s/x' }, 's', false)).toBe('link')
  })
  it('lê, grava e descarta pendência inválida', () => {
    const { kv, data } = memory()
    writePending(kv, p)
    expect(readPending(kv)).toEqual(p)
    kv.setItem(PENDING_KEY, '{"recordId":1}')
    expect(readPending(kv)).toBeNull()
    expect(data.has(PENDING_KEY)).toBe(false)
    kv.setItem(PENDING_KEY, 'não é json')
    expect(readPending(kv)).toBeNull()
    writePending(kv, p)
    clearPending(kv)
    expect(readPending(kv)).toBeNull()
  })
})

describe('rascunho', () => {
  it('restaura só os campos conhecidos', () => {
    const { kv } = memory()
    const base = emptyForm(100000000)
    expect(readDraft(kv, base)).toBeNull()
    writeDraft(kv, { ...base, nome: 'Ana' })
    expect(readDraft(kv, base)).toEqual({ ...base, nome: 'Ana' })
    kv.setItem(DRAFT_KEY, JSON.stringify({ nome: 'Bia', extra: 'x', nota: 5 }))
    expect(readDraft(kv, base)).toEqual({ ...base, nome: 'Bia' })
    clearDraft(kv)
    expect(readDraft(kv, base)).toBeNull()
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos/domain/submission.test.ts`. Esperado: FAIL.

- [ ] **Passo 3: implementar**

```ts
// domain/submission.ts
import { FORM_KEYS, type CurriculoForm } from './form'

/** O que a tela usa do localStorage; injetável para testar em node. */
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const DRAFT_KEY = 'betinhos.curriculos.rascunho.v1'
export const PENDING_KEY = 'betinhos.curriculos.pendente.v1'

export type Pending = { recordId: string; signature: string; phase: 'record-created' | 'upload-completed'; fileName: string; webUrl?: string }
export type Step = 'create' | 'upload' | 'link' | 'need-file'

function remove(kv: KV, key: string) {
  try { kv.removeItem(key) } catch { /* armazenamento bloqueado */ }
}
function write(kv: KV, key: string, value: unknown) {
  try { kv.setItem(key, JSON.stringify(value)) } catch { /* cheio ou bloqueado: segue sem persistir */ }
}
function readJson(kv: KV, key: string): unknown {
  try {
    const raw = kv.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    remove(kv, key)
    return null
  }
}

export function readPending(kv: KV): Pending | null {
  const value = readJson(kv, PENDING_KEY) as Partial<Pending> | null
  if (!value) return null
  if (typeof value.recordId !== 'string' || typeof value.signature !== 'string' || (value.phase !== 'record-created' && value.phase !== 'upload-completed')) {
    remove(kv, PENDING_KEY)
    return null
  }
  const pending: Pending = { recordId: value.recordId, signature: value.signature, phase: value.phase, fileName: typeof value.fileName === 'string' ? value.fileName : '' }
  if (typeof value.webUrl === 'string') pending.webUrl = value.webUrl
  return pending
}

export const writePending = (kv: KV, pending: Pending) => write(kv, PENDING_KEY, pending)
export const clearPending = (kv: KV) => remove(kv, PENDING_KEY)

/** Mesmas regras do legado (index.html:2215-2300): só retoma quando o payload é idêntico. */
export function nextStep(pending: Pending | null, signature: string, hasFile: boolean): Step {
  if (!pending || pending.signature !== signature) return 'create'
  if (pending.phase === 'upload-completed' && pending.webUrl) return 'link'
  return hasFile ? 'upload' : 'need-file'
}

/** Rascunho salvo sobre `base`; null quando não há nada diferente dela. */
export function readDraft(kv: KV, base: CurriculoForm): CurriculoForm | null {
  const value = readJson(kv, DRAFT_KEY)
  if (!value || typeof value !== 'object') return null
  const draft = { ...base }
  let changed = false
  for (const key of FORM_KEYS) {
    const field = (value as Record<string, unknown>)[key]
    if (typeof field === 'string' && field !== base[key]) { draft[key] = field; changed = true }
  }
  return changed ? draft : null
}

export const writeDraft = (kv: KV, form: CurriculoForm) => write(kv, DRAFT_KEY, form)
export const clearDraft = (kv: KV) => remove(kv, DRAFT_KEY)
```

- [ ] **Passo 4: rodar e ver passar.** Mesmo comando. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/curriculos/domain
git commit -m "Currículos: rascunho e submissão pendente sem duplicar registro" -m "Porta a idempotência do legado: a submissão com arquivo fica pendente nas fases record-created e upload-completed, e o próximo passo (criar, só enviar, só gravar o link ou pedir o arquivo) depende da assinatura do payload. O rascunho do cadastro guarda só campos conhecidos. Tudo sobre um KV injetável, testado em node." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: consultas, upload, mock, Source e variável de ambiente

**Arquivos:**
- Criar: `data/queries.ts`, `data/mutations.ts`, `data/upload.ts`, `data/mock.ts`, `data/source.ts`
- Teste: `data/data.test.ts`
- Modificar: `apps/shell/vite.config.ts`, `apps/shell/src/vite-env.d.ts`, `.env.example`

**Interfaces:**
- Consome:
  - de `@betinhos/dataverse`: `cleanId`, `getHostXrm`, `DataverseClient`, `Row`;
  - `Host` de `apps/shell/src/host.ts` (`host.client`, `host.metadata.entities`, `host.metadata.choices`);
  - Tarefas 1 a 3.
- Produz:
  - `ENTITY`, `curriculosPath(set)`, `mapCurriculo(row)`, `loadCurriculos(client, set)`;
  - `statusPatch(value)`, `linkPatch(url)`;
  - `ACCEPT`, `MAX_FILE_SIZE`, `fileProblem(file)`, `FlowFile`, `flowBody(...)`, `parseFlowResponse(text)`, `toBase64(blob)`, `postToFlow(url, body, fetchImpl?)`;
  - `MOCK_CHOICES`, `createMockRows(now)`;
  - `Source`, `createSource(host, uploadUrl)`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// data/data.test.ts
import { describe, expect, it, vi } from 'vitest'
import { curriculosPath, mapCurriculo } from './queries'
import { linkPatch, statusPatch } from './mutations'
import { MAX_FILE_SIZE, fileProblem, flowBody, parseFlowResponse, postToFlow, toBase64 } from './upload'
import { MOCK_CHOICES, createMockRows } from './mock'
import { buildStages, groupByStage } from '../domain/funnel'

describe('consultas', () => {
  it('lê todas as linhas ativas, mais novas primeiro', () => {
    const path = decodeURIComponent(curriculosPath('new_curriculos'))
    expect(path.startsWith('new_curriculos?$select=new_curriculoid,new_nomecompleto,new_cpf,')).toBe(true)
    expect(path).toContain(',createdon&$filter=statecode eq 0&$orderby=createdon desc')
  })
  it('mapeia a linha com números e nulos', () => {
    const c = mapCurriculo({
      new_curriculoid: '{ABC-1}', new_nomecompleto: 'Ana', new_nota: 8, new_pretensaosalarial: 3500,
      new_statuscurriculo: 100000001, new_cpf: null, createdon: '2026-10-01T12:00:00Z',
    })
    expect(c).toMatchObject({ id: 'abc-1', nome: 'Ana', nota: 8, pretensao: 3500, status: 100000001, cpf: '', cnh: null, link: '' })
    expect(c.criadoEm?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })
  it('monta os PATCH', () => {
    expect(statusPatch(100000004)).toEqual({ new_statuscurriculo: 100000004 })
    expect(linkPatch('https://s/x')).toEqual({ new_linkcurriculo: 'https://s/x' })
  })
})

describe('upload', () => {
  it('recusa tipo e tamanho fora do limite', () => {
    expect(fileProblem({ name: 'cv.PDF', size: MAX_FILE_SIZE })).toBeNull()
    expect(fileProblem({ name: 'cv.exe', size: 1 })).toBe('cv.exe não é um tipo aceito. Use PDF, DOC, DOCX, PNG ou JPG.')
    expect(fileProblem({ name: 'cv.pdf', size: MAX_FILE_SIZE + 1 })).toBe('cv.pdf passa de 10 MB. Reduza o arquivo antes de enviar.')
  })
  it('monta o corpo do Flow igual ao legado', () => {
    const body = flowBody('r1', { name: 'cv.pdf', type: '', size: 3, base64: 'AAA' },
      { new_nomecompleto: 'Ana', new_email: 'ana@x.com', new_cargointeresse: 'Motorista', new_nota: 8 }, 'Renan', '2026-10-05T12:00:00.000Z')
    expect(body).toEqual({
      curriculoId: 'r1', expenseId: 'r1', externalId: 'new_curriculo', fileName: 'cv.pdf', mimeType: 'application/octet-stream', fileSize: 3,
      base64: 'AAA', candidateName: 'Ana', candidateEmail: 'ana@x.com', cargoInteresse: 'Motorista', indicadoPor: '',
      uploadedBy: 'Renan', uploadedAt: '2026-10-05T12:00:00.000Z',
    })
  })
  it('lê o webUrl e tolera resposta vazia ou não JSON', async () => {
    expect(parseFlowResponse('')).toEqual({ webUrl: '' })
    expect(parseFlowResponse('{"webUrl":"https://s/x","driveItemId":"1"}')).toEqual({ webUrl: 'https://s/x' })
    expect(parseFlowResponse('ok')).toEqual({ webUrl: '' })
    expect(await toBase64(new Blob(['oi']))).toBe('b2k=')
  })
  it('posta no Flow e falha com o status HTTP', async () => {
    const ok = vi.fn(async () => new Response('{"webUrl":"https://s/x"}', { status: 200 }))
    expect(await postToFlow('https://flow.invalid/run', { a: 1 }, ok as unknown as typeof fetch)).toBe('https://s/x')
    expect(ok).toHaveBeenCalledWith('https://flow.invalid/run', expect.objectContaining({ method: 'POST', body: '{"a":1}' }))
    const bad = vi.fn(async () => new Response('x', { status: 502 }))
    await expect(postToFlow('https://flow.invalid/run', {}, bad as unknown as typeof fetch)).rejects.toThrow('O envio do arquivo falhou (HTTP 502).')
  })
})

describe('mock', () => {
  it('cobre as cinco etapas e o status vazio', () => {
    const list = createMockRows(new Date('2026-10-05T12:00:00-03:00')).map(mapCurriculo)
    const stages = buildStages(MOCK_CHOICES.status)
    expect(stages).toHaveLength(5)
    expect(list.some((c) => c.status == null)).toBe(true)
    const groups = groupByStage(list, stages)
    expect(stages.every((s) => (groups.get(s.value) ?? []).length > 0)).toBe(true)
    expect(groups.get(100000000)).toHaveLength(3)
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos/data`. Esperado: FAIL.

- [ ] **Passo 3: implementar `queries.ts` e `mutations.ts`**

```ts
// data/queries.ts
import { cleanId, type DataverseClient, type Row } from '@betinhos/dataverse'
import { FIELDS } from '../domain/form'
import type { Curriculo } from '../domain/types'

export const ENTITY = 'new_curriculo'
const SELECT = ['new_curriculoid', ...Object.values(FIELDS), 'createdon']

/** Todas as linhas ativas; o getAll segue o @odata.nextLink. */
export function curriculosPath(entitySet: string) {
  return `${entitySet}?$select=${SELECT.join(',')}&$filter=${encodeURIComponent('statecode eq 0')}&$orderby=${encodeURIComponent('createdon desc')}`
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Usa os valores crus: os rótulos das choices vêm do ChoiceSet na hora de mostrar. */
export function mapCurriculo(row: Row): Curriculo {
  return {
    id: cleanId(str(row.new_curriculoid)),
    nome: str(row.new_nomecompleto), cpf: str(row.new_cpf), email: str(row.new_email), telefone: str(row.new_telefone),
    whatsapp: str(row.new_whatsapp), cidade: str(row.new_cidade), estado: str(row.new_estado), cargo: str(row.new_cargointeresse),
    experiencia: str(row.new_experiencia), ultimoCargo: str(row.new_ultimocargo), ultimaEmpresa: str(row.new_ultimaempresa),
    pretensao: num(row.new_pretensaosalarial), nota: num(row.new_nota), indicadoPor: str(row.new_indicadopor),
    disponibilidade: num(row.new_disponibilidade), cnh: num(row.new_categoriacnh), origem: num(row.new_origemcurriculo),
    status: num(row.new_statuscurriculo), link: str(row.new_linkcurriculo), observacoes: str(row.new_observacoes),
    criadoEm: typeof row.createdon === 'string' ? new Date(row.createdon) : null,
  }
}

export async function loadCurriculos(client: DataverseClient, entitySet: string) {
  return (await client.getAll(curriculosPath(entitySet))).map(mapCurriculo)
}
```

```ts
// data/mutations.ts
export const statusPatch = (value: number) => ({ new_statuscurriculo: value })
export const linkPatch = (url: string) => ({ new_linkcurriculo: url })
```

- [ ] **Passo 4: implementar `upload.ts`**

```ts
// data/upload.ts
import type { Row } from '@betinhos/dataverse'
import { ENTITY } from './queries'

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const EXTENSIONS = ACCEPT.split(',')

/** Mensagem de recusa do arquivo, ou null quando ele pode ser enviado. */
export function fileProblem(file: { name: string; size: number }) {
  if (!EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) return `${file.name} não é um tipo aceito. Use PDF, DOC, DOCX, PNG ou JPG.`
  if (file.size > MAX_FILE_SIZE) return `${file.name} passa de 10 MB. Reduza o arquivo antes de enviar.`
  return null
}

export type FlowFile = { name: string; type: string; size: number; base64: string }

/** Corpo do POST ao Flow, com as mesmas chaves do legado (index.html:2325-2350). */
export function flowBody(recordId: string, file: FlowFile, payload: Row, uploadedBy: string, uploadedAt: string) {
  const text = (key: string) => (typeof payload[key] === 'string' ? (payload[key] as string) : '')
  return {
    curriculoId: recordId, expenseId: recordId, externalId: ENTITY,
    fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size, base64: file.base64,
    candidateName: text('new_nomecompleto'), candidateEmail: text('new_email'), cargoInteresse: text('new_cargointeresse'),
    indicadoPor: text('new_indicadopor'), uploadedBy, uploadedAt,
  }
}

export function parseFlowResponse(text: string) {
  if (!text.trim()) return { webUrl: '' }
  try {
    const body = JSON.parse(text) as { webUrl?: unknown }
    return { webUrl: typeof body.webUrl === 'string' ? body.webUrl : '' }
  } catch {
    return { webUrl: '' }
  }
}

/** Base64 sem o prefixo data:, em blocos para não estourar a pilha com arquivos de 10 MB. */
export async function toBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

/** Envia ao Flow e devolve o webUrl (vazio quando o Flow não devolve). */
export async function postToFlow(url: string, body: unknown, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`O envio do arquivo falhou (HTTP ${response.status}).`)
  return parseFlowResponse(await response.text()).webUrl
}
```

- [ ] **Passo 5: implementar `mock.ts`.** Os valores das choices abaixo são os de DEV e só valem no mock.

```ts
// data/mock.ts
import type { Row } from '@betinhos/dataverse'
import type { ChoiceSet } from '../domain/types'
import { normalize } from '../domain/text'

const opts = (first: number, labels: string[]) => labels.map((label, index) => ({ value: first + index, label }))

export const MOCK_CHOICES: ChoiceSet = {
  status: [
    { value: 100000000, label: 'Novo' }, { value: 100000001, label: 'Em análise' }, { value: 100000002, label: 'Aprovado para banco' },
    { value: 100000003, label: 'Reprovado' }, { value: 100000004, label: 'Contratado' },
  ],
  cnh: opts(100000000, ['A', 'B', 'C', 'D', 'E', 'AB', 'ACC', 'Não informado']),
  origem: opts(100000000, ['Indicação', 'WhatsApp', 'Site', 'LinkedIn', 'Instagram', 'Presencial', 'Outro']),
  disponibilidade: opts(100000000, ['Imediata', 'Até 7 dias', 'Até 15 dias', 'Até 30 dias', 'A combinar']),
}

type Seed = [nome: string, cargo: string, cidade: string, uf: string, status: number | null, cnh: number | null, nota: number | null, origem: number | null, indicado: string, telefone: string, cpf: string, dias: number]

const SEEDS: Seed[] = [
  ['Ana Paula Ribeiro', 'Motorista executivo', 'São Paulo', 'SP', 100000000, 100000001, 8, 100000000, 'Carlos Henrique', '(11) 98888-2001', '123.456.789-01', 0],
  ['Bruno Teixeira', 'Motorista executivo', 'Guarulhos', 'SP', 100000000, 100000003, 7, 100000001, '', '(11) 98888-2002', '', 1],
  ['Camila Duarte', 'Assistente operacional', 'Osasco', 'SP', null, null, null, 100000002, '', '(11) 98888-2003', '', 3],
  ['Diego Martins', 'Motorista executivo', 'São Paulo', 'SP', 100000001, 100000004, 9, 100000003, '', '(11) 98888-2004', '', 5],
  ['Elaine Souza', 'Coordenadora de tráfego', 'Santo André', 'SP', 100000001, 100000001, 6, 100000000, 'Marina Lopes', '(11) 3333-4444', '', 8],
  ['Fábio Nogueira', 'Motorista executivo', 'Campinas', 'SP', 100000001, 100000005, 7, 100000005, '', '(19) 97777-1005', '', 12],
  ['Gisele Araújo', 'Atendimento ao cliente', 'São Paulo', 'SP', 100000002, null, 8, 100000004, '', '(11) 96666-1006', '', 20],
  ['Henrique Lima', 'Motorista executivo', 'Barueri', 'SP', 100000002, 100000003, 10, 100000000, 'Rita Fernandes', '(11) 95555-1007', '', 26],
  ['Isabela Rocha', 'Motorista executivo', 'São Bernardo do Campo', 'SP', 100000002, 100000001, 8, 100000002, '', '(11) 94444-1008', '', 33],
  ['João Victor Prado', 'Motorista executivo', 'São Paulo', 'SP', 100000004, 100000003, 9, 100000000, 'Carlos Henrique', '(11) 93333-1009', '', 41],
  ['Karina Melo', 'Assistente operacional', 'Rio de Janeiro', 'RJ', 100000003, null, 4, 100000006, '', '(21) 92222-1010', '', 47],
  ['Lucas Pereira', 'Motorista executivo', 'Mogi das Cruzes', 'SP', 100000003, 100000001, 5, 100000001, '', '(11) 91111-1011', '', 60],
]

/** Linhas no formato da Web API, com casos de cada etapa, status vazio e CPF repetível (123.456.789-01). */
export function createMockRows(now: Date): Row[] {
  return SEEDS.map(([nome, cargo, cidade, uf, status, cnh, nota, origem, indicado, telefone, cpf, dias], index) => {
    const slug = normalize(nome).replace(/\s+/g, '.')
    return {
      new_curriculoid: `mock-${index + 1}`, new_nomecompleto: nome, new_cargointeresse: cargo, new_cidade: cidade, new_estado: uf,
      new_statuscurriculo: status, new_categoriacnh: cnh, new_nota: nota, new_origemcurriculo: origem, new_indicadopor: indicado,
      new_telefone: telefone, new_whatsapp: telefone, new_cpf: cpf, new_email: `${slug}@exemplo.com`,
      new_pretensaosalarial: 3200 + index * 150, new_disponibilidade: 100000000 + (index % 5),
      new_ultimocargo: 'Motorista particular', new_ultimaempresa: 'Transportes Exemplo',
      new_experiencia: 'Experiência com transporte executivo e atendimento a clientes corporativos.',
      new_linkcurriculo: index % 3 === 0 ? `https://exemplo.invalid/curriculos/${slug}.pdf` : null,
      new_observacoes: index === 3 ? 'Disponível para plantão aos fins de semana.' : '',
      createdon: new Date(now.getTime() - dias * 86_400_000).toISOString(),
    }
  })
}
```

- [ ] **Passo 6: implementar `source.ts`**

```ts
// data/source.ts
import { getHostXrm, type Row } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { KV } from '../domain/submission'
import { MOCK_CHOICES, createMockRows } from './mock'
import { ENTITY, loadCurriculos, mapCurriculo } from './queries'
import { flowBody, postToFlow, toBase64 } from './upload'

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  /** false quando o build não tem VITE_CURRICULO_UPLOAD_URL. */
  uploadEnabled: boolean
  load: () => Promise<Curriculo[]>
  choices: () => Promise<ChoiceSet>
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  /** Envia o arquivo ao Flow e devolve o webUrl (vazio quando o Flow não devolve). */
  upload: (recordId: string, file: File, payload: Row) => Promise<string>
  kv: KV
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function memoryKV(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

/** localStorage quando disponível; memória em aba privada ou armazenamento bloqueado. */
function browserKV(): KV {
  try {
    window.localStorage.getItem(DRAFT_PROBE)
    return window.localStorage
  } catch {
    return memoryKV()
  }
}
const DRAFT_PROBE = 'betinhos.curriculos.probe'

function userName() {
  try {
    const context = getHostXrm()?.Utility?.getGlobalContext() as { userSettings?: { userName?: string } } | undefined
    return context?.userSettings?.userName || 'Usuário não identificado'
  } catch {
    return 'Usuário não identificado'
  }
}

function createMockSource(): Source {
  const rows = createMockRows(new Date())
  let seq = 0
  return {
    mock: true,
    uploadEnabled: true,
    async load() { await wait(350); return rows.map(mapCurriculo) },
    choices: async () => MOCK_CHOICES,
    async create(payload) {
      await wait(400)
      seq += 1
      const id = `mock-novo-${seq}`
      rows.unshift({ ...payload, new_curriculoid: id, createdon: new Date().toISOString() })
      return id
    },
    async update(id, payload) {
      await wait(400)
      const row = rows.find((r) => r.new_curriculoid === id)
      if (!row) throw new Error('Currículo não encontrado.')
      Object.assign(row, payload)
    },
    async upload(_recordId, file) {
      await wait(700) // upload simulado: nada sai do navegador
      return `https://exemplo.invalid/curriculos/${encodeURIComponent(file.name)}`
    },
    kv: browserKV(),
  }
}

export function createSource(host: Host, uploadUrl: string | undefined): Source {
  if (host.mode === 'mock') return createMockSource()
  const url = uploadUrl?.trim() ?? ''
  let set: Promise<string> | null = null
  const entitySet = () => (set ??= host.metadata.entities([ENTITY]).then((info) => {
    const value = info.get(ENTITY)?.entitySetName
    if (!value) throw new Error(`Tabela ${ENTITY} não encontrada na metadata.`)
    return value
  }).catch((error) => { set = null; throw error }))

  return {
    mock: false,
    uploadEnabled: url !== '',
    load: async () => loadCurriculos(host.client, await entitySet()),
    async choices() {
      const [status, cnh, origem, disponibilidade] = await Promise.all(
        ['new_statuscurriculo', 'new_categoriacnh', 'new_origemcurriculo', 'new_disponibilidade'].map((attribute) => host.metadata.choices(ENTITY, attribute)),
      )
      return { status, cnh, origem, disponibilidade }
    },
    create: async (payload) => host.client.create(await entitySet(), payload),
    update: async (id, payload) => host.client.update(await entitySet(), id, payload),
    async upload(recordId, file, payload) {
      if (!url) throw new Error('Envio de arquivo indisponível neste ambiente.')
      const base64 = await toBase64(file)
      return postToFlow(url, flowBody(recordId, { name: file.name, type: file.type, size: file.size, base64 }, payload, userName(), new Date().toISOString()))
    },
    kv: browserKV(),
  }
}
```

Antes do passo 7, confira em `packages/dataverse/src/metadata.ts` que `entities(names)` devolve um `Map` por nome lógico (é o uso do `operacional/data/source.ts`). Se devolver outro formato, ajuste só o `.then`.

- [ ] **Passo 7: variável de ambiente.**
  - `apps/shell/vite.config.ts`: dentro de `defineConfig({ ... })`, acrescente `envDir: '../..',` logo depois de `plugins: [react()],` (o `.env` fica na raiz do monorepo; o Vite só expõe as variáveis `VITE_*` ao cliente).
  - `apps/shell/src/vite-env.d.ts`: acrescente no fim

```ts
interface ImportMetaEnv {
  /** URL do Power Automate HTTP que recebe o arquivo do currículo. Só no .env local; nunca versionar. */
  readonly VITE_CURRICULO_UPLOAD_URL?: string
}
```

  - `.env.example`: acrescente no fim, **sem valor**:

```
# URL do Power Automate HTTP que recebe o arquivo do currículo (Currículos). Sem ela, o upload fica desabilitado.
VITE_CURRICULO_UPLOAD_URL=
```

- [ ] **Passo 8: rodar e ver passar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos` e `pnpm typecheck`. Esperado: PASS e nenhum erro de tipo. Confira com `git diff -- .env.example` que nenhuma URL entrou.

- [ ] **Passo 9: commit**

```bash
git add apps/shell/src/pages/curriculos/data apps/shell/vite.config.ts apps/shell/src/vite-env.d.ts .env.example
git commit -m "Currículos: leitura, upload pelo Flow, dados de exemplo e Source" -m "Lê todas as linhas ativas de new_curriculo (entity set pela metadata, seguindo o nextLink), com as opções das quatro choices vindas de metadata.choices. Monta o corpo do Power Automate igual ao legado e grava o link devolvido. A URL do Flow vem só de VITE_CURRICULO_UPLOAD_URL, lida do .env da raiz (envDir) e acrescentada vazia ao .env.example; sem ela o upload fica desabilitado. Source em memória para o pnpm dev com upload simulado." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: criação idempotente e salvamento de registro existente

**Arquivos:**
- Criar: `data/submit.ts`
- Teste: `data/submit.test.ts`

**Interfaces:**
- Consome: `payloadSignature` (Tarefa 1), `readPending`/`writePending`/`clearPending`/`nextStep`/`KV` (Tarefa 3), `linkPatch` (Tarefa 4).
- Produz:
  - `SubmitDeps = { create, update, upload, kv, uploadEnabled }` (um `Source` satisfaz este tipo);
  - `SubmitResult = { recordId, link, message, uploadFailed }`;
  - `submitNew(deps, payload, file): Promise<SubmitResult>`;
  - `saveExisting(deps, id, changes, file, fullPayload): Promise<Omit<SubmitResult, 'recordId'>>`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// data/submit.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import { saveExisting, submitNew, type SubmitDeps } from './submit'
import { readPending, type KV } from '../domain/submission'

function memory(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

function setup(upload: (id: string, file: File, payload: Row) => Promise<string> = async () => 'https://s/cv.pdf') {
  const kv = memory()
  const create = vi.fn(async (_payload: Row) => 'r1')
  const update = vi.fn(async (_id: string, _payload: Row) => {})
  const uploadFn = vi.fn(upload)
  const deps: SubmitDeps = { create, update, upload: uploadFn, kv, uploadEnabled: true }
  return { kv, create, update, upload: uploadFn, deps }
}

const payload = { new_nomecompleto: 'Ana', new_cargointeresse: 'Motorista', new_statuscurriculo: 100000000 }
const file = new File(['cv'], 'cv.pdf', { type: 'application/pdf' })

describe('submitNew', () => {
  it('cria, envia e grava o link', async () => {
    const t = setup()
    expect(await submitNew(t.deps, payload, file)).toEqual({ recordId: 'r1', link: 'https://s/cv.pdf', message: 'Currículo registrado e arquivo anexado.', uploadFailed: false })
    expect(t.update).toHaveBeenCalledWith('r1', { new_linkcurriculo: 'https://s/cv.pdf' })
    expect(readPending(t.kv)).toBeNull()
  })
  it('não duplica o registro quando o upload falha e o usuário salva de novo', async () => {
    let fail = true
    const t = setup(async () => { if (fail) throw new Error('HTTP 502'); return 'https://s/cv.pdf' })
    const first = await submitNew(t.deps, payload, file)
    expect(first).toMatchObject({ recordId: 'r1', uploadFailed: true })
    expect(readPending(t.kv)?.phase).toBe('record-created')
    fail = false
    const second = await submitNew(t.deps, payload, file)
    expect(t.create).toHaveBeenCalledTimes(1)
    expect(second).toMatchObject({ recordId: 'r1', link: 'https://s/cv.pdf', message: 'Cadastro concluído sem duplicar o registro.', uploadFailed: false })
  })
  it('retoma só a gravação do link', async () => {
    const t = setup()
    t.update.mockRejectedValueOnce(new Error('timeout'))
    await expect(submitNew(t.deps, payload, file)).rejects.toThrow('timeout')
    expect(readPending(t.kv)).toMatchObject({ phase: 'upload-completed', webUrl: 'https://s/cv.pdf' })
    const result = await submitNew(t.deps, payload, null)
    expect(t.create).toHaveBeenCalledTimes(1)
    expect(t.upload).toHaveBeenCalledTimes(1)
    expect(result.message).toBe('Cadastro retomado e link gravado sem duplicar o registro.')
  })
  it('pede o arquivo quando o registro já existe sem ele', async () => {
    const t = setup(async () => { throw new Error('falhou') })
    await submitNew(t.deps, payload, file)
    await expect(submitNew(t.deps, payload, null)).rejects.toThrow('Este cadastro já foi criado e aguarda o arquivo "cv.pdf".')
    expect(t.create).toHaveBeenCalledTimes(1)
  })
  it('sem arquivo ou sem Flow, só cria', async () => {
    const t = setup()
    expect((await submitNew(t.deps, payload, null)).message).toBe('Currículo registrado.')
    const u = setup()
    const result = await submitNew({ ...u.deps, uploadEnabled: false }, payload, file)
    expect(result.message).toBe('Currículo registrado. Envio de arquivo indisponível neste ambiente.')
    expect(u.upload).not.toHaveBeenCalled()
    expect(readPending(u.kv)).toBeNull()
  })
})

describe('saveExisting', () => {
  it('salva só o que mudou e anexa o arquivo', async () => {
    const t = setup()
    expect(await saveExisting(t.deps, 'r9', {}, null, payload)).toEqual({ link: null, message: 'Alterações salvas.', uploadFailed: false })
    expect(t.update).not.toHaveBeenCalled()
    const result = await saveExisting(t.deps, 'r9', { new_nota: 9 }, file, payload)
    expect(t.update.mock.calls).toEqual([['r9', { new_nota: 9 }], ['r9', { new_linkcurriculo: 'https://s/cv.pdf' }]])
    expect(result).toEqual({ link: 'https://s/cv.pdf', message: 'Alterações salvas e arquivo anexado.', uploadFailed: false })
  })
  it('mantém as alterações quando só o upload falha', async () => {
    const t = setup(async () => { throw new Error('HTTP 500') })
    expect(await saveExisting(t.deps, 'r9', { new_nota: 9 }, file, payload)).toEqual({
      link: null, message: 'Alterações salvas, mas o envio do arquivo falhou. Anexe de novo e salve para tentar outra vez.', uploadFailed: true,
    })
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/curriculos/data/submit.test.ts`. Esperado: FAIL.

- [ ] **Passo 3: implementar**

```ts
// data/submit.ts
import type { Row } from '@betinhos/dataverse'
import { payloadSignature } from '../domain/form'
import { clearPending, nextStep, readPending, writePending, type KV } from '../domain/submission'
import { linkPatch } from './mutations'

export type SubmitDeps = {
  create: (payload: Row) => Promise<string>
  update: (id: string, payload: Row) => Promise<void>
  upload: (recordId: string, file: File, payload: Row) => Promise<string>
  kv: KV
  uploadEnabled: boolean
}

export type SubmitResult = { recordId: string; link: string | null; message: string; uploadFailed: boolean }

/**
 * Cadastro novo sem duplicar: cria uma vez, envia o arquivo e grava o link.
 * Upload que falha depois de criar não lança; deixa a pendência para o próximo "Salvar" com o mesmo payload.
 */
export async function submitNew(deps: SubmitDeps, payload: Row, file: File | null): Promise<SubmitResult> {
  const signature = payloadSignature(payload)
  const pending = readPending(deps.kv)
  const step = nextStep(pending, signature, file != null)

  if (step === 'need-file' && pending) {
    throw new Error(`Este cadastro já foi criado e aguarda o arquivo "${pending.fileName}". Anexe o arquivo para concluir sem duplicar o registro.`)
  }
  if (step === 'link' && pending?.webUrl) {
    await deps.update(pending.recordId, linkPatch(pending.webUrl))
    clearPending(deps.kv)
    return { recordId: pending.recordId, link: pending.webUrl, message: 'Cadastro retomado e link gravado sem duplicar o registro.', uploadFailed: false }
  }

  const resumed = step === 'upload' && pending != null
  const recordId = resumed ? pending.recordId : await deps.create(payload)
  const toUpload = file && deps.uploadEnabled ? file : null
  if (!toUpload) {
    clearPending(deps.kv)
    return { recordId, link: null, message: file ? 'Currículo registrado. Envio de arquivo indisponível neste ambiente.' : 'Currículo registrado.', uploadFailed: false }
  }
  if (!resumed) writePending(deps.kv, { recordId, signature, phase: 'record-created', fileName: toUpload.name })

  let webUrl: string
  try {
    webUrl = await deps.upload(recordId, toUpload, payload)
  } catch {
    return { recordId, link: null, message: 'Currículo registrado, mas o envio do arquivo falhou. Salve de novo com o mesmo arquivo para concluir sem duplicar.', uploadFailed: true }
  }
  if (webUrl) {
    writePending(deps.kv, { recordId, signature, phase: 'upload-completed', fileName: toUpload.name, webUrl })
    await deps.update(recordId, linkPatch(webUrl))
  }
  clearPending(deps.kv)
  const message = resumed ? 'Cadastro concluído sem duplicar o registro.'
    : webUrl ? 'Currículo registrado e arquivo anexado.' : 'Currículo registrado; o envio do arquivo não devolveu o link.'
  return { recordId, link: webUrl || null, message, uploadFailed: false }
}

/** Registro existente: PATCH só do que mudou e, com arquivo, upload e link. */
export async function saveExisting(deps: SubmitDeps, id: string, changes: Row, file: File | null, fullPayload: Row): Promise<Omit<SubmitResult, 'recordId'>> {
  if (Object.keys(changes).length) await deps.update(id, changes)
  if (!file) return { link: null, message: 'Alterações salvas.', uploadFailed: false }
  if (!deps.uploadEnabled) return { link: null, message: 'Alterações salvas. Envio de arquivo indisponível neste ambiente.', uploadFailed: false }
  let webUrl: string
  try {
    webUrl = await deps.upload(id, file, fullPayload)
  } catch {
    return { link: null, message: 'Alterações salvas, mas o envio do arquivo falhou. Anexe de novo e salve para tentar outra vez.', uploadFailed: true }
  }
  if (webUrl) await deps.update(id, linkPatch(webUrl))
  return { link: webUrl || null, message: webUrl ? 'Alterações salvas e arquivo anexado.' : 'Alterações salvas; o envio do arquivo não devolveu o link.', uploadFailed: false }
}
```

- [ ] **Passo 4: rodar e ver passar.** Mesmo comando e `pnpm typecheck`. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/curriculos/data
git commit -m "Currículos: cadastro idempotente e salvamento com anexo" -m "submitNew cria o registro uma única vez, envia o arquivo e grava o link; se o upload ou a gravação do link falham, a pendência permite concluir no próximo Salvar sem novo registro, e sem o arquivo pede que ele seja anexado. saveExisting grava só o que mudou e trata o anexo do mesmo jeito. Testado com fontes falsas em node." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: hooks `useCurriculos` e `useBoardDrag`

**Arquivos:**
- Criar: `apps/shell/src/pages/curriculos/useCurriculos.ts`, `apps/shell/src/pages/curriculos/useBoardDrag.ts`

**Interfaces:**
- Consome: `Source` (Tarefa 4); `passedThreshold`, `resolveDrop` (Tarefa 2).
- Produz:
  - `useCurriculos(source)` → `{ list, choices, loading, error, reload, mutate, upsert }`, com `mutate(id, patch: Partial<Curriculo>, run: () => Promise<void>): Promise<void>` e `upsert(c)`;
  - `useBoardDrag(onDrop: (id: string, target: number) => boolean)` → `BoardDrag = { bind(id, from), pendingSettle }`;
  - `playSettle(el, x, y)`.

As regras puras já foram testadas nas Tarefas 2 e 5. O comportamento com pointer events é verificado no navegador na Tarefa 10, porque o repo não usa jsdom.

- [ ] **Passo 1: implementar**

```ts
// useCurriculos.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { ChoiceSet, Curriculo } from './domain/types'

type State = { list: Curriculo[]; choices: ChoiceSet | null; loading: boolean; error: string | null }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carga única (lista + choices), mudanças otimistas com rollback e upsert após salvar. */
export function useCurriculos(source: Source) {
  const [state, setState] = useState<State>({ list: [], choices: null, loading: true, error: null })
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Curriculo>>())
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [list, choices] = await Promise.all([source.load(), source.choices()])
      if (current !== token.current) return
      setState({ list, choices, loading: false, error: null })
      setOverrides(new Map())
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const mutate = useCallback(async (id: string, patch: Partial<Curriculo>, run: () => Promise<void>) => {
    setOverrides((map) => new Map(map).set(id, { ...map.get(id), ...patch }))
    try {
      await run()
      setState((s) => ({ ...s, list: s.list.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    } finally {
      setOverrides((map) => { const next = new Map(map); next.delete(id); return next })
    }
  }, [])

  const upsert = useCallback((c: Curriculo) => setState((s) => ({
    ...s,
    list: s.list.some((x) => x.id === c.id) ? s.list.map((x) => (x.id === c.id ? c : x)) : [c, ...s.list],
  })), [])

  const list = useMemo(
    () => (overrides.size ? state.list.map((c) => (overrides.has(c.id) ? { ...c, ...overrides.get(c.id) } : c)) : state.list),
    [state.list, overrides],
  )
  return { ...state, list, reload, mutate, upsert }
}
```

```ts
// useBoardDrag.ts
import { useCallback, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react'
import { passedThreshold, resolveDrop } from './domain/drag'

type Session = { id: string; from: number; el: HTMLElement; x: number; y: number; pointerId: number; dragging: boolean }
export type BoardDrag = ReturnType<typeof useBoardDrag>

const SETTLE = 'transform var(--bt-duration-normal) var(--bt-ease-out)'

function columnAt(x: number, y: number) {
  const column = document.elementsFromPoint(x, y).find((node): node is HTMLElement => node instanceof HTMLElement && node.matches('[data-stage]'))
  return column ? Number(column.dataset.stage) : null
}

/** Marca a coluna-alvo direto no DOM, sem re-render a cada movimento. */
function markOver(value: number | null) {
  document.querySelectorAll('[data-stage][data-over]').forEach((node) => node.removeAttribute('data-over'))
  if (value != null) document.querySelector(`[data-stage="${value}"]`)?.setAttribute('data-over', '')
}

/** Leva o elemento de um deslocamento até a posição natural em 200 ms (FLIP). */
export function playSettle(el: HTMLElement, x: number, y: number) {
  el.style.transition = 'none'
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  void el.offsetWidth // força o layout com o deslocamento antes de animar
  el.style.transition = SETTLE
  el.style.transform = ''
  el.addEventListener('transitionend', () => { el.style.transition = '' }, { once: true })
}

/**
 * Arrasto de cards entre colunas `[data-stage]` com pointer events e pointer capture.
 * Só mouse e caneta; toque usa o menu "Mover para…". `onDrop` devolve false quando a mudança espera confirmação.
 */
export function useBoardDrag(onDrop: (id: string, target: number) => boolean) {
  const session = useRef<Session | null>(null)
  const suppressClick = useRef(false)
  const pendingSettle = useRef<{ id: string; left: number; top: number } | null>(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  const finish = useCallback((event: PointerEvent<HTMLElement>, drop: boolean) => {
    const s = session.current
    if (!s || s.pointerId !== event.pointerId) return
    session.current = null
    if (!s.dragging) return
    suppressClick.current = true
    window.setTimeout(() => { suppressClick.current = false }, 0)
    markOver(null)
    s.el.classList.remove('is-dragging')
    const dx = event.clientX - s.x
    const dy = event.clientY - s.y
    const target = drop ? resolveDrop(s.from, columnAt(event.clientX, event.clientY)) : null
    if (target != null) {
      const rect = s.el.getBoundingClientRect()
      pendingSettle.current = { id: s.id, left: rect.left, top: rect.top }
      s.el.style.transform = ''
      if (dropRef.current(s.id, target)) return
      pendingSettle.current = null
    }
    playSettle(s.el, dx, dy)
  }, [])

  const bind = useCallback((id: string, from: number) => ({
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0 || event.pointerType === 'touch') return
      if ((event.target as HTMLElement).closest('[data-no-drag]')) return
      session.current = { id, from, el: event.currentTarget, x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragging: false }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const s = session.current
      if (!s || s.pointerId !== event.pointerId) return
      const dx = event.clientX - s.x
      const dy = event.clientY - s.y
      if (!s.dragging) {
        if (!passedThreshold(dx, dy)) return
        s.dragging = true
        s.el.setPointerCapture(event.pointerId)
        s.el.classList.add('is-dragging')
      }
      s.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      const over = columnAt(event.clientX, event.clientY)
      markOver(over === s.from ? null : over)
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!suppressClick.current) return
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
    },
  }), [finish])

  return useMemo(() => ({ bind, pendingSettle }), [bind])
}
```

- [ ] **Passo 2: verificar.** `pnpm typecheck`. Esperado: sem erros.

- [ ] **Passo 3: commit**

```bash
git add apps/shell/src/pages/curriculos/useCurriculos.ts apps/shell/src/pages/curriculos/useBoardDrag.ts
git commit -m "Currículos: hook de carga com otimismo e arrasto por pointer events" -m "useCurriculos carrega lista e choices juntas, descarta respostas antigas, aplica mudanças otimistas com rollback e faz upsert após salvar. useBoardDrag move o card com translate3d direto no elemento (sem re-render por movimento), marca a coluna-alvo no DOM, usa pointer capture, ignora toque e assenta o card em 200 ms ao soltar." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: filtros, card, funil e abas

**Arquivos:**
- Criar: `components/CurriculoFilters.tsx`, `components/CurriculoCard.tsx`, `components/FunnelBoard.tsx`, `components/FunnelTabs.tsx`, `curriculos.css`

**Interfaces:**
- Consome: domínio das Tarefas 1 e 2; `BoardDrag`, `playSettle` (Tarefa 6); de `@betinhos/ui`: `Button`, `Menu`, `PageToolbar`, `SearchBox`, `Select`, `SelectOption`, `Skeleton`, `StatusBadge`, `Tabs`.
- Produz:
  - `CurriculoFilters({ filters, onChange, cargos, choices })`;
  - `CurriculoCard({ c, stage, stages, choices, now, onOpen, onMove, drag })`;
  - `FunnelBoard({ stages, groups, choices, now, onOpen, onMove, drag, collapsed, onToggleCollapsed })` e `BoardSkeleton()`;
  - `FunnelTabs({ stages, groups, choices, now, onOpen, onMove, active, onActive })`.

Antes de compilar, confira em `Select.tsx` que `Select` repassa `className` e `aria-label` (estão em `SelectBase`) e em `PageToolbar.tsx` as props `start`, `end` e `label`.

- [ ] **Passo 1: `CurriculoFilters.tsx`**

```tsx
import { Button, PageToolbar, SearchBox, Select, type SelectOption } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import { X } from 'lucide-react'
import type { ChoiceSet } from '../domain/types'
import { EMPTY_FILTERS, hasFilters, type Filters } from '../domain/funnel'

type Props = { filters: Filters; onChange: (filters: Filters) => void; cargos: string[]; choices: ChoiceSet }

const NOTAS: SelectOption[] = Array.from({ length: 11 }, (_, n) => ({ value: String(n), label: `Nota ${n} ou mais` }))
const toOptions = (list: ChoiceOption[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))
const toNumber = (value: string | null) => (value == null ? null : Number(value))
const toText = (value: number | null) => (value == null ? null : String(value))

/** Busca e filtros do funil; cada um pode ser limpo, e "Limpar filtros" zera tudo. */
export function CurriculoFilters({ filters, onChange, cargos, choices }: Props) {
  return (
    <PageToolbar
      variant="filters"
      label="Filtros de currículos"
      start={<>
        <SearchBox className="cv-filters__search" value={filters.query} onChange={(query) => onChange({ ...filters, query })} placeholder="Buscar por nome, telefone ou cidade" aria-label="Buscar currículos" />
        <Select className="cv-filters__select" aria-label="Cargo" placeholder="Cargo" clearable options={cargos.map((cargo) => ({ value: cargo, label: cargo }))} value={filters.cargo} onChange={(cargo) => onChange({ ...filters, cargo })} />
        <Select className="cv-filters__select" aria-label="Categoria da CNH" placeholder="CNH" searchable={false} clearable options={toOptions(choices.cnh)} value={toText(filters.cnh)} onChange={(value) => onChange({ ...filters, cnh: toNumber(value) })} />
        <Select className="cv-filters__select" aria-label="Origem do currículo" placeholder="Origem" searchable={false} clearable options={toOptions(choices.origem)} value={toText(filters.origem)} onChange={(value) => onChange({ ...filters, origem: toNumber(value) })} />
        <Select className="cv-filters__select" aria-label="Nota mínima" placeholder="Nota mínima" searchable={false} clearable options={NOTAS} value={toText(filters.notaMin)} onChange={(value) => onChange({ ...filters, notaMin: toNumber(value) })} />
      </>}
      end={hasFilters(filters) ? <Button variant="ghost" icon={<X size={16} />} onClick={() => onChange(EMPTY_FILTERS)}>Limpar filtros</Button> : undefined}
    />
  )
}
```

- [ ] **Passo 2: `CurriculoCard.tsx`**

```tsx
import { useLayoutEffect, useRef } from 'react'
import { Button, Menu } from '@betinhos/ui'
import { EllipsisVertical } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { choiceLabel, type Stage } from '../domain/funnel'
import { daysAgo } from '../domain/text'
import { settleDelta } from '../domain/drag'
import { playSettle, type BoardDrag } from '../useBoardDrag'

type Props = {
  c: Curriculo
  stage: Stage
  stages: Stage[]
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  /** null no celular: sem arrasto, só o menu. */
  drag: BoardDrag | null
}

export function CurriculoCard({ c, stage, stages, choices, now, onOpen, onMove, drag }: Props) {
  const ref = useRef<HTMLElement>(null)

  // Card recém-solto em outra coluna: assenta da posição do soltar até a nova (FLIP).
  useLayoutEffect(() => {
    const settle = drag?.pendingSettle.current
    const el = ref.current
    if (!drag || !settle || settle.id !== c.id || !el) return
    drag.pendingSettle.current = null
    const delta = settleDelta(settle, el.getBoundingClientRect())
    playSettle(el, delta.x, delta.y)
  }, [drag, c.id, stage.value])

  const place = [c.cidade, c.estado].filter(Boolean).join('/')
  const cnh = choiceLabel(choices.cnh, c.cnh)
  return (
    <article ref={ref} className="cv-card" {...(drag ? drag.bind(c.id, stage.value) : {})}>
      <button type="button" className="cv-card__open" onClick={() => onOpen(c.id)}>
        <span className="cv-card__name">{c.nome || 'Sem nome'}</span>
        <span className="cv-card__role">{c.cargo || 'Cargo não informado'}</span>
        <span className="cv-card__meta">
          {place ? <span>{place}</span> : null}
          {cnh ? <span>CNH {cnh}</span> : null}
          {c.nota != null ? <span>Nota {c.nota}</span> : null}
        </span>
        {c.indicadoPor ? <span className="cv-card__meta">Indicado por {c.indicadoPor}</span> : null}
        <span className="cv-card__age">{daysAgo(c.criadoEm, now)}</span>
      </button>
      <div className="cv-card__menu" data-no-drag>
        <Menu
          trigger={(props) => <Button variant="ghost" size="compact" icon={<EllipsisVertical size={16} />} aria-label={`Mover ${c.nome} para outra etapa`} {...props} />}
          actions={stages.filter((s) => s.value !== stage.value).map((s) => ({ id: String(s.value), label: `Mover para ${s.short}`, onSelect: () => onMove(c, s) }))}
        />
      </div>
    </article>
  )
}
```

- [ ] **Passo 3: `FunnelBoard.tsx`**

```tsx
import { Button, Skeleton, StatusBadge } from '@betinhos/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { Stage } from '../domain/funnel'
import type { BoardDrag } from '../useBoardDrag'
import { CurriculoCard } from './CurriculoCard'

type Props = {
  stages: Stage[]
  groups: Map<number, Curriculo[]>
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  drag: BoardDrag
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Desktop: uma coluna por etapa; Reprovado pode ficar recolhida e continua aceitando o soltar. */
export function FunnelBoard({ stages, groups, choices, now, onOpen, onMove, drag, collapsed, onToggleCollapsed }: Props) {
  const isCollapsed = (stage: Stage) => stage.key === 'reprovado' && collapsed
  return (
    <div className="cv-board" style={{ gridTemplateColumns: stages.map((s) => (isCollapsed(s) ? 'var(--bt-control-height-prominent)' : 'minmax(0, 1fr)')).join(' ') }}>
      {stages.map((stage) => {
        const items = groups.get(stage.value) ?? []
        const titleId = `cv-col-${stage.value}`
        if (isCollapsed(stage)) {
          return (
            <section key={stage.value} className="cv-col cv-col--collapsed" data-stage={stage.value} aria-labelledby={titleId}>
              <button type="button" className="cv-col__expand" id={titleId} aria-expanded={false} aria-label={`Expandir ${stage.short}, ${items.length}`} onClick={onToggleCollapsed}>
                <ChevronLeft size={16} aria-hidden="true" />
                <span className="cv-col__vertical">{stage.short}</span>
                <span className="cv-col__count">{items.length}</span>
              </button>
            </section>
          )
        }
        return (
          <section key={stage.value} className="cv-col" data-stage={stage.value} aria-labelledby={titleId}>
            <header className="cv-col__head">
              <h2 className="cv-col__title" id={titleId} aria-label={`${stage.short}, ${items.length}`}>
                <StatusBadge tone={stage.tone}>{stage.short}</StatusBadge>
                <span className="cv-col__count">{items.length}</span>
              </h2>
              {stage.key === 'reprovado' ? <Button variant="ghost" size="compact" icon={<ChevronRight size={16} />} aria-label={`Recolher ${stage.short}`} aria-expanded onClick={onToggleCollapsed} /> : null}
            </header>
            <div className="cv-col__list">
              {items.length
                ? items.map((c) => <CurriculoCard key={c.id} c={c} stage={stage} stages={stages} choices={choices} now={now} onOpen={onOpen} onMove={onMove} drag={drag} />)
                : <p className="cv-col__empty">Nenhum candidato nesta etapa</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function BoardSkeleton() {
  return (
    <div className="cv-board cv-board--skeleton" aria-busy="true" aria-label="Carregando currículos">
      {Array.from({ length: 4 }, (_, column) => (
        <div key={column} className="cv-col">
          <Skeleton width="60%" height={24} />
          {Array.from({ length: 3 }, (_, row) => <Skeleton key={row} shape="rect" height={96} />)}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Passo 4: `FunnelTabs.tsx`**

```tsx
import { Tabs } from '@betinhos/ui'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { Stage } from '../domain/funnel'
import { CurriculoCard } from './CurriculoCard'

type Props = {
  stages: Stage[]
  groups: Map<number, Curriculo[]>
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  active: number | null
  onActive: (value: number) => void
}

/** Celular: uma aba por etapa com contador; mover é só pelo menu. */
export function FunnelTabs({ stages, groups, choices, now, onOpen, onMove, active, onActive }: Props) {
  const current = stages.find((s) => s.value === active) ?? stages[0]
  const items = groups.get(current.value) ?? []
  return (
    <Tabs
      aria-label="Etapas do funil"
      value={String(current.value)}
      onChange={(value) => onActive(Number(value))}
      tabs={stages.map((s) => ({ value: String(s.value), label: s.short, badge: (groups.get(s.value) ?? []).length }))}
    >
      <div className="cv-col__list">
        {items.length
          ? items.map((c) => <CurriculoCard key={c.id} c={c} stage={current} stages={stages} choices={choices} now={now} onOpen={onOpen} onMove={onMove} drag={null} />)
          : <p className="cv-col__empty">Nenhum candidato nesta etapa</p>}
      </div>
    </Tabs>
  )
}
```

- [ ] **Passo 5: `curriculos.css`**

```css
/* Currículos: funil, card, visão e formulário. Só tokens do Design System 1.4.0. */
.cv-meta { display: inline-flex; align-items: center; gap: var(--bt-space-2); font-size: var(--bt-font-size-13); color: var(--bt-color-text-secondary); }
.cv-filters__search { flex: 1 1 260px; min-width: 200px; max-width: 360px; }
.cv-filters__select { flex: 0 1 180px; min-width: 150px; }

/* Sem overflow nas colunas: o card arrastado nunca é cortado. */
.cv-board { display: grid; gap: var(--bt-space-3); align-items: start; }
.cv-board--skeleton { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cv-col { display: grid; align-content: start; gap: var(--bt-space-2); min-width: 0; padding: var(--bt-space-2); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-lg); background-color: var(--bt-color-surface-neutral); }
.cv-col[data-over] { border-color: var(--bt-focus-border); box-shadow: var(--bt-focus-ring); }
.cv-col__head { position: sticky; top: 0; z-index: var(--bt-z-index-content); display: flex; align-items: center; justify-content: space-between; gap: var(--bt-space-2); min-height: var(--bt-control-height-compact); background-color: var(--bt-color-surface-neutral); }
.cv-col__title { display: flex; align-items: center; gap: var(--bt-space-2); margin: 0; font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-extrabold); }
.cv-col__count { font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-secondary); font-variant-numeric: tabular-nums; }
.cv-col__list { display: grid; gap: var(--bt-space-2); }
.cv-col__empty { margin: 0; padding: var(--bt-space-3) var(--bt-space-1); font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.cv-col--collapsed { padding: 0; }
.cv-col__expand { display: flex; flex-direction: column; align-items: center; gap: var(--bt-space-2); width: 100%; min-height: 160px; padding: var(--bt-space-3) 0; border: 0; border-radius: var(--bt-radius-lg); background: transparent; color: var(--bt-color-text-primary); font: inherit; cursor: pointer; }
.cv-col__expand:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); }
.cv-col__vertical { writing-mode: vertical-rl; transform: rotate(180deg); font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-extrabold); }

.cv-card { position: relative; border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); user-select: none; transition: transform var(--bt-duration-fast) var(--bt-ease-out); }
.cv-card:active:not(.is-dragging) { transform: scale(0.97); }
.cv-card.is-dragging { z-index: var(--bt-z-index-floating-action); box-shadow: var(--bt-shadow-popover); cursor: grabbing; transition: none; }
.cv-card__open { display: grid; gap: var(--bt-space-1); width: 100%; min-height: var(--bt-control-height-touch); padding: var(--bt-space-2-5) var(--bt-space-10) var(--bt-space-2-5) var(--bt-space-3); border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.cv-card__open:focus-visible { outline: 0; box-shadow: 0 0 0 2px var(--bt-focus-border), var(--bt-focus-ring); }
.cv-card__name { font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); overflow-wrap: anywhere; }
.cv-card__role { font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-primary); }
.cv-card__meta { display: flex; flex-wrap: wrap; gap: var(--bt-space-1) var(--bt-space-2); font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.cv-card__age { font-size: var(--bt-font-size-11); color: var(--bt-color-text-secondary); }
.cv-card__menu { position: absolute; top: var(--bt-space-1); right: var(--bt-space-1); }

.cv-view { display: grid; gap: var(--bt-space-3); }
.cv-view__block { display: grid; gap: var(--bt-space-2); padding: var(--bt-space-3); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.cv-view__title, .cv-form__legend { margin: 0; padding: 0; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.8px; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.cv-view__list { display: grid; gap: var(--bt-space-1-5); margin: 0; }
.cv-view__row { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: var(--bt-space-2); font-size: var(--bt-font-size-13); }
.cv-view__row dt { font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-secondary); }
.cv-view__row dd { margin: 0; overflow-wrap: anywhere; }
.cv-view__actions { display: flex; flex-wrap: wrap; gap: var(--bt-space-2); }
.cv-view__text { margin: 0; white-space: pre-wrap; font-size: var(--bt-font-size-13); }
.cv-view__muted { margin: 0; font-size: var(--bt-font-size-13); color: var(--bt-color-text-secondary); }

.cv-form { display: grid; gap: var(--bt-space-4); }
.cv-form__section { display: grid; gap: var(--bt-space-3); min-width: 0; margin: 0; padding: var(--bt-space-3); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.cv-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--bt-space-3); }
.cv-form__wide { grid-column: 1 / -1; }
.cv-form__error { margin: 0; font-size: var(--bt-font-size-12); color: var(--bt-color-danger); }
.cv-drawer__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--bt-space-2); }

@media (hover: hover) and (pointer: fine) {
  .cv-card { cursor: grab; }
  .cv-card__open:hover { background-color: var(--bt-color-surface-soft); }
  .cv-col__expand:hover { background-color: var(--bt-color-surface-soft); }
}
@media (max-width: 820px) {
  .cv-board--skeleton { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .cv-form__grid { grid-template-columns: 1fr; }
  .cv-view__row { grid-template-columns: 1fr; gap: 0; }
  .cv-filters__search, .cv-filters__select { flex: 1 1 100%; max-width: none; }
}
```

- [ ] **Passo 6: verificar.** `pnpm typecheck`. Esperado: sem erros.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src/pages/curriculos/components apps/shell/src/pages/curriculos/curriculos.css
git commit -m "Currículos: filtros, card, funil em colunas e abas no celular" -m "Barra de filtros com busca, cargo, CNH, origem e nota mínima; card com nome, cargo, cidade/UF, CNH, nota, indicação e há N dias, mais o menu Mover para… como alternativa por teclado; funil em grade sem overflow (Reprovado recolhível e ainda alvo do soltar) e abas por etapa no celular. CSS só com tokens, com #FCFCFB nas colunas." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: visão, formulário e drawer do candidato

**Arquivos:**
- Criar: `components/CurriculoView.tsx`, `components/CurriculoForm.tsx`, `components/CurriculoDrawer.tsx`

**Interfaces:**
- Consome: Tarefas 1 a 6; `telHref`, `whatsappHref` de `../../operacional/domain/phone`; de `@betinhos/ui`: `Alert`, `Button`, `buttonClassName`, `Dialog`, `Drawer`, `EmptyState`, `Field`, `Input`, `InputProps`, `Menu`, `Select`, `Textarea`, `Upload`, `useToast`.
- Produz:
  - `CurriculoView({ c, choices })`;
  - `CurriculoForm({ formId, form, errors, onChange, onSubmit, choices, stages, file, onFile, fileError, uploadEnabled, duplicates, onSeeDuplicate, disabled })`;
  - `DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null`;
  - `CurriculoDrawer({ target, onTarget, list, choices, stages, source, onSaved, onMove })`.

O `Drawer` não muda: X, Esc e fundo chamam `onClose`, e o drawer só fecha quando a página muda `target`. Antes de compilar, confira em `Alert.tsx` a prop `action` e em `Button.tsx` que o `form` do HTML é repassado (o tipo estende `ButtonHTMLAttributes`).

- [ ] **Passo 1: `CurriculoView.tsx`**

```tsx
import type { ReactNode } from 'react'
import { buttonClassName } from '@betinhos/ui'
import { ExternalLink, MessageCircle, Phone } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { choiceLabel } from '../domain/funnel'
import { formatDate, formatMoney } from '../domain/text'
import { telHref, whatsappHref } from '../../operacional/domain/phone'

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null
  return <div className="cv-view__row"><dt>{label}</dt><dd>{children}</dd></div>
}

/** Visão somente leitura do candidato, em blocos (contato, perfil, origem, textos e arquivo). */
export function CurriculoView({ c, choices }: { c: Curriculo; choices: ChoiceSet }) {
  const tel = telHref(c.telefone)
  const wa = whatsappHref(c.whatsapp || c.telefone)
  const place = [c.cidade, c.estado].filter(Boolean).join('/')
  return (
    <div className="cv-view">
      <section className="cv-view__block">
        <h3 className="cv-view__title">Contato</h3>
        <dl className="cv-view__list">
          <Row label="Telefone">{c.telefone}</Row>
          <Row label="WhatsApp">{c.whatsapp}</Row>
          <Row label="E-mail">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : ''}</Row>
          <Row label="Cidade">{place}</Row>
          <Row label="CPF">{c.cpf}</Row>
        </dl>
        {tel || wa ? (
          <div className="cv-view__actions">
            {tel ? <a className={buttonClassName({ variant: 'secondary' })} href={tel}><Phone size={16} aria-hidden="true" />Ligar</a> : null}
            {wa ? <a className={buttonClassName({ variant: 'secondary' })} href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />Abrir WhatsApp</a> : null}
          </div>
        ) : null}
      </section>
      <section className="cv-view__block">
        <h3 className="cv-view__title">Perfil</h3>
        <dl className="cv-view__list">
          <Row label="Cargo de interesse">{c.cargo}</Row>
          <Row label="Último cargo">{c.ultimoCargo}</Row>
          <Row label="Última empresa">{c.ultimaEmpresa}</Row>
          <Row label="Pretensão">{c.pretensao != null ? formatMoney(c.pretensao) : ''}</Row>
          <Row label="Nota">{c.nota != null ? `${c.nota} de 10` : ''}</Row>
          <Row label="Disponibilidade">{choiceLabel(choices.disponibilidade, c.disponibilidade)}</Row>
          <Row label="CNH">{choiceLabel(choices.cnh, c.cnh)}</Row>
        </dl>
      </section>
      <section className="cv-view__block">
        <h3 className="cv-view__title">Origem</h3>
        <dl className="cv-view__list">
          <Row label="Origem">{choiceLabel(choices.origem, c.origem)}</Row>
          <Row label="Indicado por">{c.indicadoPor}</Row>
          <Row label="Cadastrado em">{c.criadoEm ? formatDate(c.criadoEm) : ''}</Row>
        </dl>
      </section>
      {c.experiencia ? <section className="cv-view__block"><h3 className="cv-view__title">Experiência</h3><p className="cv-view__text">{c.experiencia}</p></section> : null}
      {c.observacoes ? <section className="cv-view__block"><h3 className="cv-view__title">Observações internas</h3><p className="cv-view__text">{c.observacoes}</p></section> : null}
      <section className="cv-view__block">
        <h3 className="cv-view__title">Currículo</h3>
        {c.link
          ? <div className="cv-view__actions"><a className={buttonClassName({ variant: 'secondary' })} href={c.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Abrir currículo</a></div>
          : <p className="cv-view__muted">Sem arquivo anexado.</p>}
      </section>
    </div>
  )
}
```

- [ ] **Passo 2: `CurriculoForm.tsx`**

```tsx
import { Alert, Button, Field, Input, Select, Textarea, Upload, type InputProps, type SelectOption } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import type { ChoiceSet } from '../domain/types'
import { MAX_LENGTH, type CurriculoForm as FormValues, type FormErrors, type FormKey } from '../domain/form'
import { duplicateMessage, type Duplicate } from '../domain/duplicates'
import type { Stage } from '../domain/funnel'
import { maskCpf, maskNota, maskPhone, maskUf } from '../domain/text'
import { ACCEPT, MAX_FILE_SIZE } from '../data/upload'

type Props = {
  formId: string
  form: FormValues
  errors: FormErrors
  onChange: (form: FormValues) => void
  onSubmit: () => void
  choices: ChoiceSet
  stages: Stage[]
  file: File | null
  onFile: (file: File | null) => void
  fileError: string | null
  uploadEnabled: boolean
  duplicates: Duplicate[]
  onSeeDuplicate: (id: string) => void
  disabled: boolean
}

type TextOptions = Omit<InputProps, 'value' | 'onChange' | 'name'> & { name: FormKey; label: string; mask?: (value: string) => string; wide?: boolean; required?: boolean }

const toOptions = (list: ChoiceOption[]): SelectOption[] => list.map((o) => ({ value: String(o.value), label: o.label }))

/** Formulário do candidato em seções (cadastro e edição); controlado pelo drawer. */
export function CurriculoForm({ formId, form, errors, onChange, onSubmit, choices, stages, file, onFile, fileError, uploadEnabled, duplicates, onSeeDuplicate, disabled }: Props) {
  const set = (key: FormKey, value: string) => onChange({ ...form, [key]: value })

  // Funções que devolvem JSX (não componentes), para não remontar o input e perder o foco a cada tecla.
  function text({ name, label, mask, wide, required, ...input }: TextOptions) {
    return (
      <Field key={name} label={label} required={required} error={errors[name]} className={wide ? 'cv-form__wide' : undefined}>
        <Input name={name} value={form[name]} maxLength={MAX_LENGTH[name]} disabled={disabled} onChange={(event) => set(name, mask ? mask(event.target.value) : event.target.value)} {...input} />
      </Field>
    )
  }
  function choice(name: FormKey, label: string, options: SelectOption[], clearable = true) {
    return (
      <Field key={name} label={label}>
        <Select options={options} searchable={false} clearable={clearable} disabled={disabled} value={form[name] || null} onChange={(value) => set(name, value ?? '')} placeholder="Selecionar" />
      </Field>
    )
  }
  function area(name: FormKey, label: string) {
    return (
      <Field key={name} label={label} className="cv-form__wide">
        <Textarea name={name} rows={4} value={form[name]} disabled={disabled} onChange={(event) => set(name, event.target.value)} />
      </Field>
    )
  }

  return (
    <form id={formId} className="cv-form" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      {duplicates.map((d) => (
        <Alert key={d.kind} tone="warning" action={<Button variant="ghost" size="compact" onClick={() => onSeeDuplicate(d.id)}>Ver</Button>}>{duplicateMessage(d)}</Alert>
      ))}
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Dados pessoais</legend>
        <div className="cv-form__grid">
          {text({ name: 'nome', label: 'Nome completo', required: true, wide: true, autoComplete: 'name' })}
          {text({ name: 'cpf', label: 'CPF', mask: maskCpf, inputMode: 'numeric', autoComplete: 'off' })}
          {text({ name: 'telefone', label: 'Telefone', mask: maskPhone, type: 'tel', autoComplete: 'tel' })}
          {text({ name: 'whatsapp', label: 'WhatsApp', mask: maskPhone, type: 'tel' })}
          {text({ name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' })}
          {text({ name: 'cidade', label: 'Cidade', autoComplete: 'address-level2' })}
          {text({ name: 'estado', label: 'UF', mask: maskUf, autoComplete: 'address-level1' })}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Perfil profissional</legend>
        <div className="cv-form__grid">
          {text({ name: 'cargo', label: 'Cargo de interesse', required: true, wide: true })}
          {text({ name: 'ultimoCargo', label: 'Último cargo' })}
          {text({ name: 'ultimaEmpresa', label: 'Última empresa' })}
          {text({ name: 'pretensao', label: 'Pretensão salarial (R$)', inputMode: 'decimal', placeholder: '3500,00' })}
          {text({ name: 'nota', label: 'Nota (0 a 10)', mask: maskNota, inputMode: 'numeric' })}
          {choice('disponibilidade', 'Disponibilidade', toOptions(choices.disponibilidade))}
          {choice('cnh', 'Categoria da CNH', toOptions(choices.cnh))}
          {area('experiencia', 'Experiência')}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Origem e etapa</legend>
        <div className="cv-form__grid">
          {choice('origem', 'Origem do currículo', toOptions(choices.origem))}
          {text({ name: 'indicadoPor', label: 'Indicado por' })}
          {choice('status', 'Etapa', stages.map((s) => ({ value: String(s.value), label: s.label })), false)}
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Currículo</legend>
        <div className="cv-form__grid">
          {text({ name: 'link', label: 'Link do currículo', type: 'url', wide: true, placeholder: 'https://' })}
          <div className="cv-form__wide">
            <Upload
              files={file ? [{ name: file.name, size: file.size, type: file.type }] : []}
              onChange={(files, added) => onFile(added[0] ?? (files.length ? file : null))}
              accept={ACCEPT}
              maxSize={MAX_FILE_SIZE}
              maxFiles={1}
              disabled={disabled || !uploadEnabled}
              label="Arraste o currículo ou escolha o arquivo"
              hint={uploadEnabled ? 'PDF, DOC, DOCX, PNG ou JPG até 10 MB. Ao salvar, o link é preenchido.' : 'Envio de arquivo indisponível neste ambiente'}
              aria-label="Escolher arquivo do currículo"
            />
            {fileError ? <p className="cv-form__error" role="alert">{fileError}</p> : null}
          </div>
        </div>
      </fieldset>
      <fieldset className="cv-form__section">
        <legend className="cv-form__legend">Observações internas</legend>
        <div className="cv-form__grid">{area('observacoes', 'Observações')}</div>
      </fieldset>
    </form>
  )
}
```

- [ ] **Passo 3: `CurriculoDrawer.tsx`**

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { Alert, Button, Dialog, Drawer, EmptyState, Menu, useToast } from '@betinhos/ui'
import { ArrowRightLeft, Pencil, SearchX } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { FORM_KEYS, changePayload, createPayload, emptyForm, isDirty, toForm, validateForm, type CurriculoForm as FormValues, type FormErrors } from '../domain/form'
import { findDuplicates } from '../domain/duplicates'
import { stageFor, type Stage } from '../domain/funnel'
import { clearDraft, readDraft, writeDraft } from '../domain/submission'
import { mapCurriculo } from '../data/queries'
import { fileProblem } from '../data/upload'
import { saveExisting, submitNew } from '../data/submit'
import type { Source } from '../data/source'
import { CurriculoForm } from './CurriculoForm'
import { CurriculoView } from './CurriculoView'

export type DrawerTarget = { mode: 'view' | 'edit'; id: string } | { mode: 'create' } | null

type Props = {
  target: DrawerTarget
  onTarget: (target: DrawerTarget) => void
  list: Curriculo[]
  choices: ChoiceSet
  stages: Stage[]
  source: Source
  onSaved: (c: Curriculo) => void
  onMove: (c: Curriculo, stage: Stage) => void
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Visão, edição e cadastro no mesmo drawer largo; fechar com alteração pede confirmação e salvar trava o fechamento. */
export function CurriculoDrawer({ target, onTarget, list, choices, stages, source, onSaved, onMove }: Props) {
  const toast = useToast()
  const formId = useId()
  const current = target && target.mode !== 'create' ? list.find((c) => c.id === target.id) ?? null : null
  const editing = target?.mode === 'edit' || target?.mode === 'create'
  const editKey = target?.mode === 'edit' ? `edit:${target.id}` : target?.mode === 'create' ? 'create' : null
  const defaultStatus = stages[0]?.value ?? null

  const [ready, setReady] = useState<string | null>(null)
  const [base, setBase] = useState<FormValues>(() => emptyForm(defaultStatus))
  const [form, setForm] = useState<FormValues>(base)
  const [errors, setErrors] = useState<FormErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restored, setRestored] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [pendingExit, setPendingExit] = useState<{ next: DrawerTarget } | null>(null)

  // Prepara o formulário só ao entrar em edição ou cadastro (não a cada atualização da lista).
  useEffect(() => {
    if (!editKey) { setReady(null); return }
    const start = target?.mode === 'edit' && current ? toForm(current) : emptyForm(defaultStatus)
    const draft = target?.mode === 'create' ? readDraft(source.kv, start) : null
    setBase(start)
    setForm(draft ?? start)
    setRestored(draft != null)
    setErrors({})
    setFile(null)
    setFileError(null)
    setCreatedId(null)
    setReady(editKey)
  }, [editKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rascunho automático só do cadastro novo, depois que o formulário foi preparado.
  useEffect(() => {
    if (target?.mode !== 'create' || ready !== 'create') return
    if (isDirty(base, form)) writeDraft(source.kv, form)
    else clearDraft(source.kv)
  }, [form, base, ready, target?.mode, source.kv])

  const dirty = editing && ready === editKey && (isDirty(base, form) || file != null)
  const selfId = target?.mode === 'edit' ? target.id : createdId
  const duplicates = useMemo(() => (editing ? findDuplicates(form, list, selfId) : []), [editing, form, list, selfId])

  function requestClose(next: DrawerTarget) {
    if (saving) return
    if (dirty) { setPendingExit({ next }); return }
    onTarget(next)
  }

  function discard() {
    const next = pendingExit?.next ?? null
    setPendingExit(null)
    if (target?.mode === 'create') clearDraft(source.kv)
    setForm(base)
    setFile(null)
    onTarget(next)
  }

  function clearForm() {
    clearDraft(source.kv)
    setForm(base)
    setFile(null)
    setRestored(false)
  }

  function chooseFile(next: File | null) {
    if (!next) { setFile(null); setFileError(null); return }
    const problem = fileProblem(next)
    setFileError(problem)
    if (!problem) setFile(next)
  }

  async function save() {
    const found = validateForm(form)
    setErrors(found)
    const first = FORM_KEYS.find((key) => found[key])
    if (first) { document.querySelector<HTMLElement>(`.cv-form [name="${first}"]`)?.focus(); return }
    if (fileError) return
    setSaving(true)
    try {
      if (target?.mode === 'create') {
        const payload = createPayload(form)
        const result = await submitNew(source, payload, file)
        const saved = mapCurriculo({ ...payload, ...(result.link ? { new_linkcurriculo: result.link } : {}), new_curriculoid: result.recordId, createdon: new Date().toISOString() })
        onSaved(saved)
        if (result.uploadFailed) { setCreatedId(saved.id); toast({ tone: 'danger', message: result.message }); return }
        clearDraft(source.kv)
        toast({ tone: 'success', message: result.message })
        onTarget({ mode: 'view', id: saved.id })
      } else if (target?.mode === 'edit' && current) {
        const full = createPayload(form)
        const result = await saveExisting(source, current.id, changePayload(base, form), file, full)
        const saved: Curriculo = { ...mapCurriculo({ ...full, new_curriculoid: current.id }), criadoEm: current.criadoEm }
        if (result.link) saved.link = result.link
        onSaved(saved)
        if (result.uploadFailed) { setBase(form); toast({ tone: 'danger', message: result.message }); return }
        toast({ tone: 'success', message: result.message })
        onTarget({ mode: 'view', id: current.id })
      }
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível salvar. ${reasonText(reason)}` })
    } finally {
      setSaving(false)
    }
  }

  const stage = current ? stageFor(current, stages) : undefined
  const title = target?.mode === 'create' ? 'Novo currículo' : current?.nome || 'Currículo'
  const eyebrow = target?.mode === 'create' ? 'Cadastro' : target?.mode === 'edit' ? 'Editar currículo' : stage?.label

  let footer
  if (editing && target) {
    footer = (
      <div className="cv-drawer__actions">
        <Button variant="secondary" disabled={saving} onClick={() => requestClose(target.mode === 'edit' ? { mode: 'view', id: target.id } : null)}>Cancelar</Button>
        <Button type="submit" form={formId} loading={saving}>{target.mode === 'create' ? 'Salvar currículo' : 'Salvar alterações'}</Button>
      </div>
    )
  } else if (current && stage) {
    footer = (
      <div className="cv-drawer__actions">
        <Menu
          align="start"
          trigger={(props) => <Button variant="secondary" icon={<ArrowRightLeft size={16} />} {...props}>Mover para…</Button>}
          actions={stages.filter((s) => s.value !== stage.value).map((s) => ({ id: String(s.value), label: s.short, onSelect: () => onMove(current, s) }))}
        />
        <Button icon={<Pencil size={16} />} onClick={() => onTarget({ mode: 'edit', id: current.id })}>Editar</Button>
      </div>
    )
  }

  let body
  if (editing) {
    body = (
      <>
        {restored && target?.mode === 'create'
          ? <Alert tone="info" action={<Button variant="ghost" size="compact" onClick={clearForm}>Limpar formulário</Button>}>Rascunho restaurado.</Alert>
          : null}
        <CurriculoForm formId={formId} form={form} errors={errors} onChange={setForm} onSubmit={() => void save()} choices={choices} stages={stages}
          file={file} onFile={chooseFile} fileError={fileError} uploadEnabled={source.uploadEnabled} duplicates={duplicates}
          onSeeDuplicate={(id) => requestClose({ mode: 'view', id })} disabled={saving} />
      </>
    )
  } else if (current) {
    body = <CurriculoView c={current} choices={choices} />
  } else if (target) {
    body = <EmptyState align="start" icon={<SearchX size={36} />} title="Currículo não encontrado">Ele pode ter sido inativado. Atualize a página.</EmptyState>
  }

  return (
    <>
      <Drawer open={target != null} onClose={() => requestClose(null)} size="wide" title={title} eyebrow={eyebrow} footer={footer}>
        {body}
      </Drawer>
      <Dialog open={pendingExit != null} onClose={() => setPendingExit(null)} title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setPendingExit(null)}>Continuar editando</Button>
          <Button variant="danger" onClick={discard}>Descartar</Button>
        </>}>
        As alterações feitas neste currículo serão perdidas.
      </Dialog>
    </>
  )
}
```

O comentário `eslint-disable-line` só vale se o repo tiver ESLint com `react-hooks`; se não tiver, remova-o. Confira com `rg -n "react-hooks" -g "*.json" -g "*.js" -g "*.mjs"` na raiz.

- [ ] **Passo 4: verificar.** `pnpm typecheck`. Esperado: sem erros.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/curriculos/components
git commit -m "Currículos: visão, formulário em seções e drawer do candidato" -m "Drawer largo com a visão do candidato (contato com ligar e WhatsApp, perfil, origem, textos e arquivo), Mover para… e Editar. O mesmo formulário em seções serve ao cadastro e à edição, com máscaras, validação por campo, aviso de CPF ou telefone repetido com Ver, upload de 1 arquivo de até 10 MB e rascunho restaurável no cadastro. Fechar com alteração abre Descartar alterações?; durante o salvamento nada fecha. O Drawer de packages/ui não precisou mudar." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: página completa e rota no shell

**Arquivos:**
- Criar: `apps/shell/src/pages/curriculos/CurriculosPage.tsx`
- Modificar: `apps/shell/src/nav/menu.ts`, `apps/shell/src/app/RouteLayout.tsx`, `apps/shell/src/app/AppShell.tsx`

**Interfaces:**
- Consome: tudo das Tarefas 1 a 8; `PageLayout` de `../../app/PageLayout`; `useMedia` de `../operacional/useMedia`; `Host`.
- Produz: `CurriculosPage({ host })`; item de menu `{ kind: 'page', id: 'curriculos', label: 'Currículos', page: 'curriculos' }`.

- [ ] **Passo 1: `CurriculosPage.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, StatusBadge, ToastProvider, useToast } from '@betinhos/ui'
import { Plus, ScrollText, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { statusPatch } from './data/mutations'
import type { Curriculo } from './domain/types'
import { EMPTY_FILTERS, buildStages, cargoOptions, filterCurriculos, groupByStage, stageFor, type Filters, type Stage } from './domain/funnel'
import { useCurriculos } from './useCurriculos'
import { useBoardDrag } from './useBoardDrag'
import { CurriculoFilters } from './components/CurriculoFilters'
import { BoardSkeleton, FunnelBoard } from './components/FunnelBoard'
import { FunnelTabs } from './components/FunnelTabs'
import { CurriculoDrawer, type DrawerTarget } from './components/CurriculoDrawer'
import './curriculos.css'

export function CurriculosPage({ host }: { host: Host }) {
  return <ToastProvider><Curriculos host={host} /></ToastProvider>
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function Curriculos({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host, import.meta.env.VITE_CURRICULO_UPLOAD_URL), [host])
  const cv = useCurriculos(source)
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [target, setTarget] = useState<DrawerTarget>(null)
  const [confirm, setConfirm] = useState<{ c: Curriculo; stage: Stage } | null>(null)
  const [collapsed, setCollapsed] = useState(true)
  const [activeTab, setActiveTab] = useState<number | null>(null)

  const now = useMemo(() => new Date(), [cv.list])
  const stages = useMemo(() => buildStages(cv.choices?.status ?? []), [cv.choices])
  const visible = useMemo(() => filterCurriculos(cv.list, filters), [cv.list, filters])
  const groups = useMemo(() => groupByStage(visible, stages), [visible, stages])
  const cargos = useMemo(() => cargoOptions(cv.list), [cv.list])

  async function move(c: Curriculo, stage: Stage) {
    try {
      await cv.mutate(c.id, { status: stage.value }, () => source.update(c.id, statusPatch(stage.value)))
      toast({ tone: 'success', message: `${c.nome} movido para ${stage.short}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível mover ${c.nome}. ${reasonText(reason)} Tente de novo.` })
    }
  }

  function requestMove(c: Curriculo, stage: Stage) {
    if (stageFor(c, stages)?.value === stage.value) return
    if (stage.confirm) { setConfirm({ c, stage }); return }
    void move(c, stage)
  }

  const drag = useBoardDrag((id, value) => {
    const c = cv.list.find((item) => item.id === id)
    const stage = stages.find((s) => s.value === value)
    if (!c || !stage) return false
    if (stage.confirm) { setConfirm({ c, stage }); return false }
    void move(c, stage)
    return true
  })

  const openCreate = () => setTarget({ mode: 'create' })
  const openView = (id: string) => setTarget({ mode: 'view', id })

  let body
  if (cv.loading && !cv.choices) body = <BoardSkeleton />
  else if (cv.error && !cv.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar os currículos" action={<Button variant="secondary" onClick={() => void cv.reload()}>Tentar de novo</Button>}>{cv.error}</Alert>
  } else if (!stages.length) {
    body = <Alert tone="danger" title="Etapas do funil indisponíveis">A coluna de status do currículo não tem as opções esperadas. Avise a TI.</Alert>
  } else if (!cv.list.length) {
    body = <EmptyState className="surface" align="start" icon={<ScrollText size={36} />} title="Nenhum currículo cadastrado" action={<Button icon={<Plus size={16} />} onClick={openCreate}>Novo currículo</Button>}>Cadastre o primeiro candidato para começar o funil.</EmptyState>
  } else if (!visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum currículo encontrado para estes filtros" action={<Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>} />
  } else if (mobile) {
    body = <FunnelTabs stages={stages} groups={groups} choices={cv.choices!} now={now} onOpen={openView} onMove={requestMove} active={activeTab} onActive={setActiveTab} />
  } else {
    body = <FunnelBoard stages={stages} groups={groups} choices={cv.choices!} now={now} onOpen={openView} onMove={requestMove} drag={drag} collapsed={collapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} />
  }

  const reprovar = confirm?.stage.key === 'reprovado'
  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Currículos"
      meta={<span className="cv-meta">{cv.choices ? `${cv.list.length} candidatos` : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      actions={<Button icon={<Plus size={16} />} onClick={openCreate}>Novo currículo</Button>}
      toolbar={cv.choices && cv.list.length ? <CurriculoFilters filters={filters} onChange={setFilters} cargos={cargos} choices={cv.choices} /> : undefined}
    >
      {body}
      {cv.choices ? (
        <CurriculoDrawer target={target} onTarget={setTarget} list={cv.list} choices={cv.choices} stages={stages} source={source} onSaved={cv.upsert} onMove={requestMove} />
      ) : null}
      <Dialog open={confirm != null} onClose={() => setConfirm(null)} tone={reprovar ? 'danger' : 'neutral'} title={confirm ? `Mover ${confirm.c.nome} para ${confirm.stage.short}?` : ''}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Manter etapa</Button>
          <Button variant={reprovar ? 'danger' : 'primary'} onClick={() => { const next = confirm!; setConfirm(null); void move(next.c, next.stage) }}>
            {confirm ? `Mover para ${confirm.stage.short}` : 'Mover'}
          </Button>
        </>}>
        {reprovar ? 'O candidato sai do funil ativo, mas o cadastro continua disponível na coluna Reprovado.' : 'Use esta etapa só depois da admissão confirmada.'}
      </Dialog>
    </PageLayout>
  )
}
```

- [ ] **Passo 2: rota e menu.**
  - `apps/shell/src/nav/menu.ts`: no tipo `MenuItem`, troque `page: 'componentes' | 'operacional'` por `page: 'componentes' | 'operacional' | 'curriculos'`. No grupo `cadastros`, troque a linha `table('new_curriculo'),` por `{ kind: 'page', id: 'curriculos', label: 'Currículos', page: 'curriculos' },`.
  - `apps/shell/src/app/RouteLayout.tsx`: acrescente `import { CurriculosPage } from '../pages/curriculos/CurriculosPage'` e troque a linha `if (item.kind === 'page') return item.page === 'operacional' ? <OperacionalPage host={host} /> : <ComponentsPage />` por:

```tsx
  if (item.kind === 'page') {
    if (item.page === 'operacional') return <OperacionalPage host={host} />
    if (item.page === 'curriculos') return <CurriculosPage host={host} />
    return <ComponentsPage />
  }
```

  - `apps/shell/src/app/AppShell.tsx`: em `ITEM_ICONS`, acrescente `curriculos: <ScrollText />,` (o `ScrollText` já é importado; mantenha a entrada `new_curriculo`).
  - Rode `rg -n "new_curriculo" apps/shell/src` e ajuste testes do menu que contem itens ou procurem `new_curriculo`, se houver.

- [ ] **Passo 3: verificar.** `pnpm test`, `pnpm typecheck` e `pnpm --filter @betinhos/shell exec vite build` (só para conferir que compila; **não** use `pnpm build`, que incrementa a versão). Esperado: tudo passa. Descarte o `dist` gerado (é ignorado pelo git).

- [ ] **Passo 4: commit**

```bash
git add apps/shell/src
git commit -m "Currículos: página do funil na rota #/curriculos no lugar da lista nativa" -m "Troca no menu o item table('new_curriculo') pela rota React. A página junta cabeçalho com Novo currículo e total, filtros, funil (colunas no desktop, abas no celular), drawer do candidato e confirmação para Contratado e Reprovado. Mudança de etapa otimista com rollback e toast; selo Dados de exemplo no mock." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: verificação no navegador (dados de exemplo)

**Arquivos:** só ajustes de CSS ou componentes que a verificação apontar.

- [ ] **Passo 1:** iniciar o shell com `preview_start` (configuração do `pnpm dev` em `.claude/launch.json`, porta 36472; crie a configuração se não existir) e navegar para `http://localhost:36472/#/curriculos`.
- [ ] **Passo 2: desktop, 1280 × 800.**
  - Skeleton, depois 5 colunas com contadores; Reprovado recolhida; selo "Dados de exemplo"; "12 candidatos".
  - Busca "joao", "santo andre" e "3333"; cada filtro e "Limpar filtros"; filtro sem resultado mostra o EmptyState.
  - Arrastar com o mouse de Novo para Em análise: o card segue o ponteiro com sombra, a coluna-alvo ganha contorno, ao soltar assenta em ~200 ms, toast de sucesso e contadores atualizados. Console sem re-render por movimento (confira no React DevTools ou pela fluidez).
  - Soltar fora de coluna ou na mesma coluna: volta à origem.
  - Soltar em Contratado e em Reprovado (recolhida): volta ao lugar e abre a confirmação; "Manter etapa" não muda; "Mover para…" muda.
  - Menu "⋯" → "Mover para…" pelo teclado (Tab, Enter, setas).
  - Clique simples no card abre o drawer (720 px); "Editar" mostra as seções; alterar um campo e tentar fechar por X, Esc e fundo abre "Descartar alterações?"; "Continuar editando" mantém; "Descartar" fecha.
  - Salvar edição: botão em loading, o drawer não fecha durante o salvamento, toast "Alterações salvas.".
  - "Novo currículo": digitar nome e CPF `123.456.789-01` mostra o aviso de duplicidade com "Ver"; fechar, recarregar e reabrir mostra "Rascunho restaurado"; "Limpar formulário" zera.
  - Salvar sem nome e cargo foca o primeiro erro; com arquivo `.exe` ou acima de 10 MB mostra a recusa; com PDF válido, o upload simulado preenche o link e o card aparece no topo de Novo.
- [ ] **Passo 3: celular, 375 × 812.** Abas com contadores, troca de aba, menu "Mover para…", drawer em largura total e cadastro utilizável. Sem rolagem horizontal da página.
- [ ] **Passo 4: redução de movimento.** Emule `prefers-reduced-motion`: drawer só com opacidade, assentamento imediato.
- [ ] **Passo 5: sem URL do Flow.** Para simular o ambiente sem upload fora do mock, confira pela leitura do código que `uploadEnabled` é `false` quando `VITE_CURRICULO_UPLOAD_URL` está vazia e que o `Upload` mostra "Envio de arquivo indisponível neste ambiente".
- [ ] **Passo 6:** console sem erros (`read_console_messages`). Tire screenshots do desktop (funil e drawer) e do celular e envie ao usuário.
- [ ] **Passo 7: commit dos ajustes**

```bash
git add apps/shell
git commit -m "Currículos: ajustes da verificação no navegador" -m "Correções de layout e interação encontradas ao testar desktop 1280 px e celular 375 px com dados de exemplo: arrasto, confirmação, drawer, descarte, rascunho, duplicidade e upload simulado." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: publicação em DEV (só com o ok do Renan)

- [ ] **Passo 1:** apresente ao Renan as screenshots e o resultado da Tarefa 10 e **pare aqui** até o ok explícito para publicar em DEV.
- [ ] **Passo 2:** peça ao Renan a URL do Flow de upload de **DEV** e grave-a só no `.env` local da raiz (`VITE_CURRICULO_UPLOAD_URL=`). Nunca a escreva em arquivo versionado, commit, PR ou resposta.
- [ ] **Passo 3:** `git status`, `git diff main --stat` e `pnpm test`. Confira que não há `.env`, URL assinada ou lockfile alterado fora do escopo (`rg -n "sig=" apps packages docs` deve voltar vazio).
- [ ] **Passo 4:** `pnpm push`. Isso incrementa o PATCH em `apps/shell/package.json`, compila e publica `cr40f_SistemaBetinhos.html` em DEV.
- [ ] **Passo 5:** abra o Sistema Betinhos em DEV no navegador interno e entre em `#/curriculos`. Confira:
  - os 45 registros reais carregam, sem selo "Dados de exemplo", e as colunas batem com a contagem por status;
  - as opções de CNH, origem, disponibilidade e etapa vêm da metadata;
  - num registro de teste combinado com o Renan: mudar a etapa grava e persiste após recarregar; editar um campo grava; cadastrar um candidato de teste com PDF cria um único registro e preenche `new_linkcurriculo`.

  Não altere currículos reais sem o Renan indicar qual registro usar.
- [ ] **Passo 6:** commit `Build v0.0.X publicado em DEV`, push da branch e PR para a `main` com as screenshots e a versão publicada (`v0.0.X · dd/mm/aaaa HH:mm`). Informe a versão ao Renan para conferir no dispositivo.
