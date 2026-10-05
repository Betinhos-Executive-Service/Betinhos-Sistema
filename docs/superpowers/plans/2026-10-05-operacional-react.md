# Resumo Operacional em React — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** substituir o WebResource `new_TelaOperacional` pela rota React `#/operacional` do shell. O foco é o despacho no celular: fila "Precisa de você", agenda densa por hora, sheet de ações e atualização automática.

**Arquitetura:**
- O domínio são funções puras testadas com Vitest (`apps/shell/src/pages/operacional/domain`).
- A camada de dados é uma `Source` com duas implementações: Dataverse e mock em memória para o `pnpm dev`.
- O hook `useOperacional` faz a carga, a atualização a cada 60 s com a aba visível e as mutações otimistas.
- A UI usa `packages/ui`, mais o componente novo `Sheet`.

**Stack:** React 19, TypeScript, Vite 7, Vitest 3 (ambiente node, sem jsdom, como o resto do repo), lucide-react, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-05-operacional-react-design.md`. Leia antes de começar.

## Restrições globais

- Fuso: `America/Sao_Paulo`, offset fixo `-03:00` (o Brasil não tem horário de verão desde 2019). Datas em `dd/MM`, horas em `HH:mm`.
- Visual:
  - só tokens `--bt-*` do Design System 1.3.0: **nenhuma cor nova, nenhum gradiente, sem dark mode**;
  - listas, campos e cabeçalhos neutros usam `var(--bt-color-surface-neutral)` (`#FCFCFB`);
  - azul só em foco, seleção, status, ícones e ações.
- Motion:
  - anima só `transform` e `opacity`, nunca `transition: all`;
  - hover só em `@media (hover: hover) and (pointer: fine)`;
  - pressionar = `scale(.97)` em 150 ms;
  - `prefers-reduced-motion` já é tratado globalmente pelos tokens.
- Status nunca é comunicado só por cor. Alvos touch de 44 px.
- Textos em pt-BR com acentos. Botões começam com verbo.
- Não escrever entity set nem nome de navegação fixo sem confirmar na metadata. Os entity sets vêm de `host.metadata.entities()`.
- PROD é somente leitura. A escrita só acontece em DEV, depois da Tarefa 11.
- Commits em português, detalhados, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Todos os comandos rodam na raiz da worktree `C:\Users\mendo\Desktop\vscode\Sistema Betinhos\.claude\worktrees\operacional-react`. Rode `pnpm install` uma vez antes da Tarefa 1.

## Mapa de arquivos

```
apps/shell/src/pages/operacional/
  domain/types.ts            tipos Reserva, Motorista, PassageiroServico, OperacionalData
  domain/time.ts             fuso, chave do dia, rótulos, durações
  domain/serviceState.ts     estado derivado + normalizeStatus + isOpenStatus + statusTone
  domain/conflicts.ts        saídas < 30 min do mesmo motorista
  domain/alerts.ts           fila "Precisa de você"
  domain/bands.ts            agrupamento por hora e concluídos
  domain/passengers.ts       lista canônica de passageiros
  domain/phone.ts            tel: e wa.me
  domain/refresh.ts          frescor, linhas alteradas, overrides otimistas
  domain/*.test.ts
  data/queries.ts            consultas + mapeamento + modo seguro
  data/mutations.ts          payloads de PATCH
  data/mock.ts               dados de exemplo relativos a "agora"
  data/source.ts             Source (dataverse | mock)
  data/*.test.ts
  useOperacional.ts          carga, polling, otimismo
  useMedia.ts                media queries reativas
  components/DayHeader.tsx   dia, setas, swipe, frescor, filtros
  components/AttentionList.tsx  "Precisa de você"
  components/Agenda.tsx      grupos por hora + ServiceRow + concluídos
  components/ServiceDetail.tsx  detalhe + ações (sheet e painel desktop)
  components/LandscapeTable.tsx paisagem compacta
  OperacionalPage.tsx        composição responsiva
  operacional.css
packages/ui/src/components/Sheet.tsx, sheet.css, sheetGesture.ts, Sheet.test.ts   (novo)
packages/dataverse/src/metadata.ts   + choices()
apps/shell/src/nav/menu.ts, app/RouteLayout.tsx    rota nova
```

---

### Tarefa 1: tipos, tempo e estado do serviço

**Arquivos:**
- Criar: `apps/shell/src/pages/operacional/domain/types.ts`
- Criar: `apps/shell/src/pages/operacional/domain/time.ts`
- Criar: `apps/shell/src/pages/operacional/domain/serviceState.ts`
- Teste: `apps/shell/src/pages/operacional/domain/serviceState.test.ts`

**Interfaces:**
- Produz:
  - `Reserva`, `Motorista`, `PassageiroServico`, `OperacionalData`;
  - `TZ`, `formatHour(d)`, `dateKey(d)`, `dayRange(key)`, `addDays(key, n)`, `dayLabel(key, today)`, `minutesBetween(from, to)`, `formatDuration(min)`;
  - `normalizeStatus(s)`, `isOpenStatus(s)`, `isCancelled(s)`, `serviceState(r, now)`, `statusTone(s)`, os tipos `ServiceKind` e `ServiceState`.

- [ ] **Passo 1: escrever os tipos**

```ts
// domain/types.ts
export type Reserva = {
  id: string
  codigo: string
  statusValue: number | null
  status: string
  faturamento: string
  tipoServico: string
  tipoVeiculo: string
  saida: Date | null
  retorno: Date | null
  destino: string
  enderecoSaida: string
  trajeto: string
  obsOperacao: string
  obsInterna: string
  motoristaId: string | null
  motorista: string
  veiculo: string
  cliente: string
  solicitante: string
  passageirosLookup: { id: string; nome: string }[]
  /** Campo VIEW gerado por flow; só é fonte de último recurso. */
  passageirosTexto: string
}

export type Motorista = { id: string; nome: string; apelido: string; celular: string }

export type PassageiroServico = { id: string; ordem: number; nome: string; enderecoSaida: string }

export type OperacionalData = {
  reservas: Reserva[]
  motoristas: Motorista[]
  /** Por id de reserva, já em ordem de seleção. */
  passageiros: Record<string, PassageiroServico[]>
  queryMode: 'full' | 'safe'
}
```

- [ ] **Passo 2: escrever o teste que falha**

```ts
// domain/serviceState.test.ts
import { describe, expect, it } from 'vitest'
import { addDays, dateKey, dayLabel, dayRange, formatDuration, formatHour } from './time'
import { isOpenStatus, normalizeStatus, serviceState, statusTone } from './serviceState'

const at = (iso: string) => new Date(iso)
const now = at('2026-10-05T11:00:00-03:00')

describe('time', () => {
  it('usa o dia de São Paulo', () => {
    expect(dateKey(at('2026-10-06T02:30:00Z'))).toBe('2026-10-05')
    expect(dayRange('2026-10-05').start.toISOString()).toBe('2026-10-05T03:00:00.000Z')
    expect(dayRange('2026-10-05').end.toISOString()).toBe('2026-10-06T03:00:00.000Z')
    expect(addDays('2026-10-05', 1)).toBe('2026-10-06')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })
  it('formata hora, duração e rótulo do dia', () => {
    expect(formatHour(at('2026-10-05T08:05:00-03:00'))).toBe('08:05')
    expect(formatDuration(-12)).toBe('12 min')
    expect(formatDuration(95)).toBe('1h35')
    expect(dayLabel('2026-10-05', '2026-10-05')).toBe('Hoje · seg 05/10')
    expect(dayLabel('2026-10-06', '2026-10-05')).toBe('Amanhã · ter 06/10')
    expect(dayLabel('2026-10-09', '2026-10-05')).toBe('sex 09/10')
  })
})

describe('serviceState', () => {
  const r = (status: string, saida: string | null) => ({ status, saida: saida ? at(saida) : null })

  it('normaliza acento e soft hyphen', () => {
    expect(normalizeStatus('Conclu\u00ADído ')).toBe('concluido')
    expect(isOpenStatus('Pré-reserva')).toBe(true)
    expect(isOpenStatus('Confirmado')).toBe(false)
  })
  it('sem horário vem antes de tudo', () => {
    expect(serviceState(r('Concluído', null), now).kind).toBe('unknown')
  })
  it('concluído e cancelado', () => {
    expect(serviceState(r('Concluído', '2026-10-05T09:00:00-03:00'), now)).toMatchObject({ kind: 'concluded', label: 'Concluído' })
    expect(serviceState(r('Cancelado', '2026-10-05T13:00:00-03:00'), now)).toMatchObject({ kind: 'concluded', label: 'Cancelado' })
  })
  it('próximo: atenção até 30 min, info depois', () => {
    expect(serviceState(r('Confirmado', '2026-10-05T11:30:00-03:00'), now)).toMatchObject({ kind: 'upcoming', minutes: 30, tone: 'warning', label: 'Em 30 min' })
    expect(serviceState(r('Confirmado', '2026-10-05T11:31:00-03:00'), now)).toMatchObject({ kind: 'upcoming', tone: 'info' })
    expect(serviceState(r('Confirmado', '2026-10-05T11:00:00-03:00'), now).label).toBe('Saindo agora')
  })
  it('passou do horário: agendado vira em curso, aberto vira atrasado', () => {
    expect(serviceState(r('Programado', '2026-10-05T10:40:00-03:00'), now)).toMatchObject({ kind: 'in_progress', label: 'Saiu há 20 min, sem conclusão' })
    expect(serviceState(r('Solicitado', '2026-10-05T10:48:00-03:00'), now)).toMatchObject({ kind: 'delayed', tone: 'danger', label: 'Atrasado 12 min' })
  })
  it('mapeia status para os cinco tons', () => {
    expect(statusTone('Confirmado')).toBe('success')
    expect(statusTone('Concluído')).toBe('success')
    expect(statusTone('Requer Análise')).toBe('warning')
    expect(statusTone('Cancelado')).toBe('danger')
    expect(statusTone('Programado')).toBe('info')
    expect(statusTone('Solicitado')).toBe('neutral')
    expect(statusTone('Pré-reserva')).toBe('neutral')
    expect(statusTone('')).toBe('neutral')
  })
})
```

- [ ] **Passo 3: rodar e ver falhar**

Rodar: `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional/domain/serviceState.test.ts`
Esperado: FAIL, módulos `./time` e `./serviceState` não encontrados.

- [ ] **Passo 4: implementar**

```ts
// domain/time.ts
export const TZ = 'America/Sao_Paulo'
const DAY = 86_400_000

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const labelFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })

export const formatHour = (date: Date) => hourFormat.format(date)
/** `YYYY-MM-DD` do dia em São Paulo. */
export const dateKey = (date: Date) => keyFormat.format(date)

/** Início (inclusive) e fim (exclusivo) do dia em São Paulo; sem horário de verão desde 2019. */
export function dayRange(key: string) {
  const start = new Date(`${key}T00:00:00-03:00`)
  return { start, end: new Date(start.getTime() + DAY) }
}

export function addDays(key: string, days: number) {
  return dateKey(new Date(dayRange(key).start.getTime() + days * DAY + DAY / 2))
}

/** "Hoje · seg 05/10", "Amanhã · ter 06/10" ou só "sex 09/10". */
export function dayLabel(key: string, today: string) {
  const base = labelFormat.format(new Date(`${key}T12:00:00-03:00`)).replace(/\./g, '').replace(',', '')
  const relative = key === today ? 'Hoje' : key === addDays(today, 1) ? 'Amanhã' : key === addDays(today, -1) ? 'Ontem' : null
  return relative ? `${relative} · ${base}` : base
}

export const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000)

export function formatDuration(minutes: number) {
  const total = Math.abs(minutes)
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`
}
```

```ts
// domain/serviceState.ts
import type { StatusTone } from '@betinhos/ui'
import type { Reserva } from './types'
import { formatDuration, minutesBetween } from './time'

export type ServiceKind = 'unknown' | 'concluded' | 'in_progress' | 'upcoming' | 'delayed'
export type ServiceState = { kind: ServiceKind; minutes: number | null; tone: StatusTone; label: string }

/** Minúsculas, sem acento e sem soft hyphen (o legado tinha um escondido em "Concluído"). */
export function normalizeStatus(status: string) {
  return status.normalize('NFD').replace(/[\u0300-\u036f\u00ad]/g, '').toLowerCase().trim()
}

const CONCLUDED = /conclu|cancel|finaliz/
const RUNNING = /andamento|operacao|execucao/
const SCHEDULED = /confirm|programad|reagend/
const OPEN = /abert|solicitad|pre-?\s?reserva|requer analise/

export const isOpenStatus = (status: string) => OPEN.test(normalizeStatus(status))
export const isCancelled = (status: string) => normalizeStatus(status).startsWith('cancel')

/** Estado derivado do horário e do status, na mesma ordem de decisão do legado. */
export function serviceState(reserva: Pick<Reserva, 'saida' | 'status'>, now: Date): ServiceState {
  if (!reserva.saida) return { kind: 'unknown', minutes: null, tone: 'neutral', label: 'Sem horário' }
  const status = normalizeStatus(reserva.status)
  if (CONCLUDED.test(status)) return { kind: 'concluded', minutes: null, tone: 'neutral', label: status.startsWith('cancel') ? 'Cancelado' : 'Concluído' }
  if (RUNNING.test(status)) return { kind: 'in_progress', minutes: null, tone: 'info', label: 'Em curso' }
  const delta = minutesBetween(now, reserva.saida)
  if (delta >= 0) return { kind: 'upcoming', minutes: delta, tone: delta <= 30 ? 'warning' : 'info', label: delta === 0 ? 'Saindo agora' : `Em ${formatDuration(delta)}` }
  if (SCHEDULED.test(status)) return { kind: 'in_progress', minutes: -delta, tone: 'info', label: `Saiu há ${formatDuration(delta)}, sem conclusão` }
  return { kind: 'delayed', minutes: -delta, tone: 'danger', label: `Atrasado ${formatDuration(delta)}` }
}

/** Status do Dataverse → um dos cinco tons do design system. */
export function statusTone(status: string): StatusTone {
  const value = normalizeStatus(status)
  if (/confirm|conclu|finaliz/.test(value)) return 'success'
  if (/requer analise/.test(value)) return 'warning'
  if (/cancel/.test(value)) return 'danger'
  if (/programad|reagend|andamento|operacao|execucao/.test(value)) return 'info'
  return 'neutral'
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar o mesmo comando do passo 3. Esperado: PASS (todos os testes).

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/operacional/domain
git commit -m "Operacional: tipos, fuso de São Paulo e estado derivado do serviço" -m "Porta getServiceState do legado com a mesma ordem de decisão, normaliza status sem acento e sem soft hyphen e mapeia status para os cinco tons do design system." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: conflitos, fila de atenção e agrupamento por hora

**Arquivos:**
- Criar: `domain/conflicts.ts`, `domain/alerts.ts`, `domain/bands.ts`
- Teste: `domain/alerts.test.ts`

(caminhos relativos a `apps/shell/src/pages/operacional/`)

**Interfaces:**
- Consome: `Reserva`, `serviceState`, `isOpenStatus`, `isCancelled`, `formatHour`, `minutesBetween`.
- Produz:
  - `Conflict`, `findConflicts(reservas)` e `conflictFor(reservas, motoristaId, saida, ignoreId)`;
  - `AttentionItem`, `AttentionAction` e `buildAttention(reservas, now)`;
  - `HourGroup` e `groupByHour(reservas, now)`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// domain/alerts.test.ts
import { describe, expect, it } from 'vitest'
import type { Reserva } from './types'
import { conflictFor, findConflicts } from './conflicts'
import { buildAttention } from './alerts'
import { groupByHour } from './bands'

const now = new Date('2026-10-05T11:00:00-03:00')
let seq = 0
export function reserva(partial: Partial<Reserva> & { hora?: string }): Reserva {
  const { hora, ...rest } = partial
  seq += 1
  return {
    id: `r${seq}`, codigo: String(1000 + seq), statusValue: null, status: 'Confirmado', faturamento: '', tipoServico: 'Transfer', tipoVeiculo: '',
    saida: hora ? new Date(`2026-10-05T${hora}:00-03:00`) : null, retorno: null, destino: '', enderecoSaida: '', trajeto: '', obsOperacao: '', obsInterna: '',
    motoristaId: 'm1', motorista: 'Carlos', veiculo: '', cliente: '', solicitante: '', passageirosLookup: [], passageirosTexto: '',
    ...rest,
  }
}

describe('conflitos', () => {
  it('saídas consecutivas do mesmo motorista com menos de 30 min', () => {
    const a = reserva({ hora: '08:00' }), b = reserva({ hora: '08:29' }), c = reserva({ hora: '08:59' }), d = reserva({ hora: '08:10', motoristaId: 'm2' })
    expect(findConflicts([a, b, c, d])).toEqual([{ motoristaId: 'm1', firstId: a.id, secondId: b.id, gap: 29 }])
  })
  it('ignora cancelados e sem horário', () => {
    expect(findConflicts([reserva({ hora: '08:00' }), reserva({ hora: '08:10', status: 'Cancelado' }), reserva({})])).toEqual([])
  })
  it('acha o serviço conflitante para um motorista candidato', () => {
    const a = reserva({ hora: '08:20', motoristaId: 'm2' })
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:00:00-03:00'), 'x')?.id).toBe(a.id)
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:50:00-03:00'), 'x')).toBeNull()
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:00:00-03:00'), a.id)).toBeNull()
  })
})

describe('fila de atenção', () => {
  it('prioriza sem motorista, depois atraso/aberto, depois conflito, sem repetir serviço', () => {
    const semMotorista = reserva({ hora: '11:20', motoristaId: null, motorista: '' })
    const atrasado = reserva({ hora: '10:48', status: 'Solicitado', motoristaId: 'm3' })
    const aberto = reserva({ hora: '11:15', status: 'Pré-reserva', motoristaId: 'm4' })
    const c1 = reserva({ hora: '14:00', motoristaId: 'm5' }), c2 = reserva({ hora: '14:20', motoristaId: 'm5' })
    const tranquilo = reserva({ hora: '16:00', motoristaId: 'm6' })
    const items = buildAttention([semMotorista, atrasado, aberto, c1, c2, tranquilo], now)
    expect(items.map((i) => [i.reservaId, i.priority, i.action, i.reason])).toEqual([
      [semMotorista.id, 1, 'atribuir', 'Sem motorista'],
      [atrasado.id, 2, 'ligar', 'Atrasado 12 min'],
      [aberto.id, 2, 'ligar', 'Ainda não confirmado'],
      [c2.id, 3, 'ver', 'Saídas com 20 min de intervalo'],
    ])
  })
  it('atrasado sem motorista pede atribuição', () => {
    const r = reserva({ hora: '10:00', status: 'Solicitado', motoristaId: null })
    expect(buildAttention([r], now)[0]).toMatchObject({ priority: 2, action: 'atribuir' })
  })
})

describe('agrupamento por hora', () => {
  it('agrupa por hora cheia, separa concluídos e deixa sem horário no fim', () => {
    const a = reserva({ hora: '08:30' }), b = reserva({ hora: '08:05' }), c = reserva({ hora: '09:10' }), d = reserva({}), e = reserva({ hora: '07:00', status: 'Concluído' })
    const { groups, concluded } = groupByHour([a, b, c, d, e], now)
    expect(groups.map((g) => [g.label, g.items.map((r) => r.id)])).toEqual([
      ['08:00', [b.id, a.id]], ['09:00', [c.id]], ['Sem horário', [d.id]],
    ])
    expect(concluded.map((r) => r.id)).toEqual([e.id])
  })
})
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional/domain/alerts.test.ts`. Esperado: FAIL (módulos ausentes).

- [ ] **Passo 3: implementar**

```ts
// domain/conflicts.ts
import type { Reserva } from './types'
import { isCancelled } from './serviceState'
import { minutesBetween } from './time'

export type Conflict = { motoristaId: string; firstId: string; secondId: string; gap: number }

const LIMIT = 30
const comparable = (r: Reserva) => Boolean(r.motoristaId && r.saida && !isCancelled(r.status))
const bySaida = (a: Reserva, b: Reserva) => a.saida!.getTime() - b.saida!.getTime()

/** Pares de saídas consecutivas do mesmo motorista com intervalo >= 0 e < 30 min (saída com saída, como no legado). */
export function findConflicts(reservas: Reserva[]): Conflict[] {
  const byDriver = new Map<string, Reserva[]>()
  for (const r of reservas.filter(comparable)) byDriver.set(r.motoristaId!, [...(byDriver.get(r.motoristaId!) ?? []), r])
  const conflicts: Conflict[] = []
  for (const [motoristaId, list] of byDriver) {
    const sorted = [...list].sort(bySaida)
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = minutesBetween(sorted[i - 1].saida!, sorted[i].saida!)
      if (gap >= 0 && gap < LIMIT) conflicts.push({ motoristaId, firstId: sorted[i - 1].id, secondId: sorted[i].id, gap })
    }
  }
  return conflicts
}

/** Serviço do motorista com saída a menos de 30 min de `saida`; usado para avisar na troca de motorista. */
export function conflictFor(reservas: Reserva[], motoristaId: string, saida: Date | null, ignoreId: string): Reserva | null {
  if (!saida) return null
  return reservas.find((r) => r.id !== ignoreId && r.motoristaId === motoristaId && comparable(r) && Math.abs(minutesBetween(saida, r.saida!)) < LIMIT) ?? null
}
```

```ts
// domain/alerts.ts
import type { Reserva } from './types'
import { findConflicts } from './conflicts'
import { isOpenStatus, serviceState } from './serviceState'

export type AttentionAction = 'atribuir' | 'ligar' | 'ver'
export type AttentionItem = { reservaId: string; priority: 1 | 2 | 3; reason: string; action: AttentionAction }

/** P1 sem motorista em até 30 min; P2 atrasado ou ainda aberto em até 30 min; P3 conflito. Um item por serviço. */
export function buildAttention(reservas: Reserva[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = []
  const seen = new Set<string>()
  const add = (item: AttentionItem) => { if (!seen.has(item.reservaId)) { seen.add(item.reservaId); items.push(item) } }

  for (const r of reservas) {
    const state = serviceState(r, now)
    const soon = state.kind === 'upcoming' && state.minutes! <= 30
    if (!r.motoristaId && soon) add({ reservaId: r.id, priority: 1, reason: 'Sem motorista', action: 'atribuir' })
    else if (state.kind === 'delayed' || (soon && isOpenStatus(r.status))) {
      add({ reservaId: r.id, priority: 2, reason: state.kind === 'delayed' ? state.label : 'Ainda não confirmado', action: r.motoristaId ? 'ligar' : 'atribuir' })
    }
  }
  for (const conflict of findConflicts(reservas)) {
    add({ reservaId: conflict.secondId, priority: 3, reason: `Saídas com ${conflict.gap} min de intervalo`, action: 'ver' })
  }

  const saida = new Map(reservas.map((r) => [r.id, r.saida?.getTime() ?? Infinity]))
  return items.sort((a, b) => a.priority - b.priority || saida.get(a.reservaId)! - saida.get(b.reservaId)!)
}
```

```ts
// domain/bands.ts
import type { Reserva } from './types'
import { serviceState } from './serviceState'
import { formatHour } from './time'

export type HourGroup = { key: string; label: string; items: Reserva[] }

/** Agenda por hora cheia, em ordem de saída; concluídos/cancelados à parte; sem horário no fim. */
export function groupByHour(reservas: Reserva[], now: Date) {
  const sorted = [...reservas].sort((a, b) => (a.saida?.getTime() ?? Infinity) - (b.saida?.getTime() ?? Infinity))
  const groups: HourGroup[] = []
  const concluded: Reserva[] = []
  for (const r of sorted) {
    if (serviceState(r, now).kind === 'concluded') { concluded.push(r); continue }
    const label = r.saida ? `${formatHour(r.saida).slice(0, 2)}:00` : 'Sem horário'
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(r)
    else groups.push({ key: label, label, items: [r] })
  }
  return { groups, concluded }
}
```

- [ ] **Passo 4: rodar e ver passar.** Mesmo comando. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add apps/shell/src/pages/operacional/domain
git commit -m "Operacional: conflitos, fila Precisa de você e agenda por hora" -m "Porta closeIntervals e buildSnapshot do legado como funções puras: P1 sem motorista, P2 atrasado ou aberto em até 30 min, P3 saídas com menos de 30 min; agrupa a agenda por hora cheia e separa concluídos." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: passageiros, telefone e frescor/otimismo

**Arquivos:**
- Criar: `domain/passengers.ts`, `domain/phone.ts`, `domain/refresh.ts`
- Teste: `domain/passengers.test.ts`
- Referência: `C:\Users\mendo\Desktop\vscode\Tela Operacional\Operacional.html`, perto da linha 3882 (`parsePaxList` e `getPassageirosList`).

**Interfaces:**
- Produz:
  - `Passageiro`, `parsePassengerText(text)` e `passengerList(reserva, filhos?)`;
  - `phoneDigits(raw)`, `telHref(raw)` e `whatsappHref(raw)`;
  - `freshnessLabel(last, now)`, `changedIds(prev, next)` e `applyOverrides(reservas, overrides)`.

- [ ] **Passo 1: conferir o formato real do texto livre.** Leia `parsePaxList` no legado (perto de :3882). Se o separador ou o formato diferirem de "um passageiro por linha ou por `;`, com o telefone no meio do texto", ajuste o teste do passo 2 para o formato real antes de implementar.

- [ ] **Passo 2: escrever o teste que falha**

```ts
// domain/passengers.test.ts
import { describe, expect, it } from 'vitest'
import { reserva } from './alerts.test'
import { parsePassengerText, passengerList } from './passengers'
import { phoneDigits, telHref, whatsappHref } from './phone'
import { applyOverrides, changedIds, freshnessLabel } from './refresh'

describe('passageiros', () => {
  it('interpreta o texto livre', () => {
    expect(parsePassengerText('Ana Souza - (11) 98888-7777\nBruno; Carla Dias: +55 21 3333-4444')).toEqual([
      { nome: 'Ana Souza', telefone: '(11) 98888-7777' },
      { nome: 'Bruno', telefone: '' },
      { nome: 'Carla Dias', telefone: '+55 21 3333-4444' },
    ])
  })
  it('prefere filhos, depois lookups, depois texto; telefone vem do texto pelo nome', () => {
    const r = reserva({ passageirosTexto: 'Ana Souza - 11988887777', passageirosLookup: [{ id: 'p9', nome: 'Zé' }] })
    expect(passengerList(r, [{ id: 's1', ordem: 1, nome: 'Ana  Souza', enderecoSaida: 'Rua A, 10' }])).toEqual([
      { key: 's1', nome: 'Ana  Souza', telefone: '11988887777', endereco: 'Rua A, 10', origem: 'servico' },
    ])
    expect(passengerList(r, [])[0]).toMatchObject({ key: 'p9', nome: 'Zé', origem: 'lookup' })
    expect(passengerList({ ...r, passageirosLookup: [] })[0]).toMatchObject({ nome: 'Ana Souza', origem: 'texto' })
  })
})

describe('telefone', () => {
  it('normaliza para DDI 55', () => {
    expect(phoneDigits('(11) 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('+55 21 3333-4444')).toBe('552133334444')
    expect(phoneDigits('011 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('123')).toBeNull()
    expect(telHref('11 98888-7777')).toBe('tel:+5511988887777')
    expect(whatsappHref('11 98888-7777')).toBe('https://wa.me/5511988887777')
    expect(whatsappHref('')).toBeNull()
  })
})

describe('frescor e otimismo', () => {
  const t = new Date('2026-10-05T11:00:00-03:00')
  it('rótulo de frescor', () => {
    expect(freshnessLabel(null, t)).toBe('Carregando…')
    expect(freshnessLabel(new Date(t.getTime() - 30_000), t)).toBe('Atualizado agora')
    expect(freshnessLabel(new Date(t.getTime() - 125_000), t)).toBe('Atualizado há 2 min')
  })
  it('marca linhas novas ou alteradas, mas não na primeira carga', () => {
    const a = reserva({ hora: '08:00' }), b = reserva({ hora: '09:00' })
    expect(changedIds([], [a, b]).size).toBe(0)
    expect([...changedIds([a], [{ ...a, status: 'Concluído', statusValue: 1 }, b])]).toEqual([a.id, b.id])
    expect(changedIds([a], [a]).size).toBe(0)
  })
  it('aplica overrides otimistas sem mutar a lista', () => {
    const a = reserva({ hora: '08:00' })
    const list = [a]
    const result = applyOverrides(list, new Map([[a.id, { status: 'Concluído' }]]))
    expect(result[0].status).toBe('Concluído')
    expect(list[0].status).toBe('Confirmado')
    expect(applyOverrides(list, new Map())).toBe(list)
  })
})
```

- [ ] **Passo 3: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional/domain/passengers.test.ts`. Esperado: FAIL.

- [ ] **Passo 4: implementar**

```ts
// domain/passengers.ts
import type { PassageiroServico, Reserva } from './types'
import { normalizeStatus as normalize } from './serviceState'

export type Passageiro = { key: string; nome: string; telefone: string; endereco: string; origem: 'servico' | 'lookup' | 'texto' }

const PHONE = /\+?\d[\d\s().-]{7,}\d/

/** Texto livre do campo VIEW: um passageiro por linha ou por ";", telefone em qualquer posição. */
export function parsePassengerText(text: string) {
  return text.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const telefone = line.match(PHONE)?.[0].trim() ?? ''
    const nome = line.replace(telefone, '').replace(/^[\s\-–:|,]+|[\s\-–:|,]+$/g, '').trim()
    return { nome, telefone }
  })
}

const sameName = (a: string, b: string) => normalize(a).replace(/\s+/g, ' ') === normalize(b).replace(/\s+/g, ' ')

/** Ordem canônica: filhos (cr40f_servicosporpassageiro) > lookups passageiro1..4 > texto livre. */
export function passengerList(reserva: Reserva, filhos: PassageiroServico[] = []): Passageiro[] {
  const parsed = parsePassengerText(reserva.passageirosTexto)
  const phoneFor = (nome: string) => parsed.find((p) => sameName(p.nome, nome))?.telefone ?? ''
  if (filhos.length) return filhos.map((f) => ({ key: f.id, nome: f.nome, telefone: phoneFor(f.nome), endereco: f.enderecoSaida, origem: 'servico' }))
  if (reserva.passageirosLookup.length) return reserva.passageirosLookup.map((p) => ({ key: p.id, nome: p.nome, telefone: phoneFor(p.nome), endereco: '', origem: 'lookup' }))
  return parsed.map((p, index) => ({ key: `texto-${index}`, nome: p.nome, telefone: p.telefone, endereco: '', origem: 'texto' }))
}
```

```ts
// domain/phone.ts
/** Só dígitos com DDI 55; null quando não parece telefone brasileiro. */
export function phoneDigits(raw: string): string | null {
  let digits = raw.replace(/\D/g, '').replace(/^0+/, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length === 12 || digits.length === 13 ? digits : null
}

export function telHref(raw: string) {
  const digits = phoneDigits(raw)
  return digits ? `tel:+${digits}` : null
}

export function whatsappHref(raw: string) {
  const digits = phoneDigits(raw)
  return digits ? `https://wa.me/${digits}` : null
}
```

```ts
// domain/refresh.ts
import type { Reserva } from './types'

export function freshnessLabel(last: Date | null, now: Date) {
  if (!last) return 'Carregando…'
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60_000)
  return minutes < 1 ? 'Atualizado agora' : `Atualizado há ${minutes} min`
}

const signature = (r: Reserva) => `${r.statusValue}|${r.status}|${r.motoristaId}|${r.saida?.getTime() ?? ''}`

/** Linhas que mudaram desde a carga anterior (para o realce); vazio na primeira carga. */
export function changedIds(previous: Reserva[], next: Reserva[]) {
  if (!previous.length) return new Set<string>()
  const before = new Map(previous.map((r) => [r.id, signature(r)]))
  return new Set(next.filter((r) => before.get(r.id) !== signature(r)).map((r) => r.id))
}

export function applyOverrides(reservas: Reserva[], overrides: Map<string, Partial<Reserva>>) {
  if (!overrides.size) return reservas
  return reservas.map((r) => (overrides.has(r.id) ? { ...r, ...overrides.get(r.id) } : r))
}
```

- [ ] **Passo 5: rodar e ver passar.** Esperado: PASS. Depois rode `pnpm --filter @betinhos/shell test` e confira que nada mais quebrou.

- [ ] **Passo 6: commit**

```bash
git add apps/shell/src/pages/operacional/domain
git commit -m "Operacional: passageiros na ordem canônica, telefone para tel/WhatsApp e frescor" -m "Lista passageiros priorizando cr40f_servicosporpassageiro, depois lookups e por último o campo VIEW; normaliza telefone com DDI 55; calcula o rótulo de frescor, as linhas alteradas entre cargas e os overrides otimistas." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: `metadata.choices()` no pacote dataverse

**Arquivos:**
- Modificar: `packages/dataverse/src/metadata.ts`
- Modificar: `packages/dataverse/src/index.ts` (exportar `ChoiceOption`)
- Teste: `packages/dataverse/src/dataverse.test.ts` (acrescentar no fim)

**Interfaces:**
- Produz: `createMetadata(client).choices(entity: string, attribute: string): Promise<ChoiceOption[]>`, com `ChoiceOption = { value: number; label: string }`.

- [ ] **Passo 1: escrever o teste que falha.** Acrescente no fim de `dataverse.test.ts` (ajuste o import da primeira linha para incluir `createMetadata`):

```ts
describe('metadata.choices', () => {
  it('lê as opções reais da coluna e guarda em cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      OptionSet: { Options: [
        { Value: 202410001, Label: { UserLocalizedLabel: { Label: 'Confirmado' } } },
        { Value: 202410008, Label: { UserLocalizedLabel: null } },
      ] },
    }))
    const metadata = createMetadata(createClient('https://org.example', fetchMock))
    const options = await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(options).toEqual([{ value: 202410001, label: 'Confirmado' }, { value: 202410008, label: '202410008' }])
    await metadata.choices('cr40f_reservadeveculos', 'cr40f_status')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("https://org.example/api/data/v9.2/EntityDefinitions(LogicalName='cr40f_reservadeveculos')/Attributes(LogicalName='cr40f_status')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)")
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/dataverse test`. Esperado: FAIL, porque `choices` não é função.

- [ ] **Passo 3: implementar.** Em `metadata.ts`, acrescente acima de `createMetadata`:

```ts
export type ChoiceOption = { value: number; label: string }

type PicklistDefinition = {
  OptionSet?: { Options: { Value: number; Label?: { UserLocalizedLabel?: { Label?: string } | null } }[] }
}
```

Dentro de `createMetadata`, antes do `return`:

```ts
  const choiceCache = new Map<string, Promise<ChoiceOption[]>>()

  /** Opções reais de uma coluna choice (nunca valores fixos no código), com cache por cliente. */
  function choices(entityName: string, attribute: string) {
    const key = `${entityName}.${attribute}`
    let options = choiceCache.get(key)
    if (!options) {
      const path = `EntityDefinitions(LogicalName='${odataString(entityName)}')/Attributes(LogicalName='${odataString(attribute)}')`
        + '/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)'
      options = client.request<PicklistDefinition>(path).then((definition) => (definition.OptionSet?.Options ?? []).map((option) => ({
        value: option.Value,
        label: option.Label?.UserLocalizedLabel?.Label || String(option.Value),
      })))
      options.catch(() => choiceCache.delete(key))
      choiceCache.set(key, options)
    }
    return options
  }
```

Troque o retorno por `return { entity, entities, choices }`. Em `index.ts`: `export { createMetadata, type ChoiceOption, type EntityInfo } from './metadata'`.

- [ ] **Passo 4: rodar e ver passar.** `pnpm --filter @betinhos/dataverse test`. Esperado: PASS.

- [ ] **Passo 5: commit**

```bash
git add packages/dataverse/src
git commit -m "Dataverse: lê as opções reais de colunas choice pela metadata" -m "Adiciona metadata.choices(entidade, coluna) via PicklistAttributeMetadata, com cache por cliente e rótulo de reserva quando a opção não tem tradução. Usado pelo seletor de status do Resumo Operacional." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 5: consultas, mutações, mock e Source

**Arquivos:**
- Criar: `data/queries.ts`, `data/mutations.ts`, `data/mock.ts`, `data/source.ts`
- Teste: `data/data.test.ts`

(caminhos relativos a `apps/shell/src/pages/operacional/`)

**Interfaces:**
- Consome:
  - de `@betinhos/dataverse`: `DataverseClient`, `Row`, `chunk`, `formatted`, `cleanId`, `createMetadata`, `ChoiceOption`, `getHostXrm`;
  - `Host` de `apps/shell/src/host.ts`;
  - os tipos e funções das Tarefas 1 a 3.
- Produz:
  - `ENTITIES`, `EntitySets`, `SAFE_MODE_ERROR`, `reservasPath(set, key, mode)`, `mapReserva(row)`, `mapMotorista(row)`, `loadOperacional(client, sets, key)`;
  - `NAV_MOTORISTA`, `statusPatch(value)`, `motoristaPatch(funcionarioSet, motoristaId)`;
  - `createMockData(now)`;
  - `Source` e `createSource(host)`.

- [ ] **Passo 1: confirmar a metadata em DEV (somente leitura).** Use o MCP `Dataverse_DEV`: `describe('tables/cr40f_reservadeveculos')`. Anote três coisas:
  1. o nome da propriedade de navegação do lookup `cr40f_motorista` (esperado `cr40f_Motorista`; o nome é sensível a maiúsculas);
  2. os entity sets de `cr40f_reservadeveculos`, `cr40f_funcionarios` e `cr40f_servicosporpassageiro`;
  3. se `_cr40f_geral_value` e `_cr40f_bancodedados_value` existem em `cr40f_servicosporpassageiro`.

  Se a navegação tiver outro nome, use o nome real em `NAV_MOTORISTA` e no teste abaixo.

- [ ] **Passo 2: escrever o teste que falha**

```ts
// data/data.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createClient } from '@betinhos/dataverse'
import { SAFE_MODE_ERROR, loadOperacional, mapReserva, reservasPath } from './queries'
import { motoristaPatch, statusPatch } from './mutations'
import { createMockData } from './mock'
import { buildAttention } from '../domain/alerts'
import { findConflicts } from '../domain/conflicts'

const F = '@OData.Community.Display.V1.FormattedValue'
const sets = { reserva: 'cr40f_reservadeveculoses', funcionario: 'cr40f_funcionarioses', passageiro: 'cr40f_servicosporpassageiros' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('consultas', () => {
  it('monta o filtro do dia em UTC e só pede extras no modo completo', () => {
    const full = decodeURIComponent(reservasPath('cr40f_reservadeveculoses', '2026-10-05', 'full'))
    expect(full).toContain('cr40f_dataehorriodesada ge 2026-10-05T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-06T03:00:00.000Z and statecode eq 0')
    expect(full).toContain('_cr40f_motorista_value')
    expect(full).toContain('$orderby=cr40f_dataehorriodesada asc')
    expect(decodeURIComponent(reservasPath('x', '2026-10-05', 'safe'))).not.toContain('_cr40f_motorista_value')
  })
  it('reconhece os erros de coluna que ativam o modo seguro', () => {
    expect(SAFE_MODE_ERROR.test("Could not find a property named 'cr40f_x'")).toBe(true)
    expect(SAFE_MODE_ERROR.test('Timeout')).toBe(false)
  })
  it('mapeia a linha com valores formatados', () => {
    const r = mapReserva({
      cr40f_reservadeveculosid: 'ABC', cr40f_idnovo: 'R-77', cr40f_id: '77', cr40f_status: 202410001, [`cr40f_status${F}`]: 'Confirmado',
      cr40f_dataehorriodesada: '2026-10-05T11:30:00Z', _cr40f_motorista_value: 'M1', [`_cr40f_motorista_value${F}`]: 'Carlos',
      _cr40f_passageiro1_value: 'P1', [`_cr40f_passageiro1_value${F}`]: 'Ana',
    })
    expect(r).toMatchObject({ id: 'abc', codigo: 'R-77', statusValue: 202410001, status: 'Confirmado', motoristaId: 'm1', motorista: 'Carlos', tipoServico: 'Outros', passageirosLookup: [{ id: 'p1', nome: 'Ana' }] })
    expect(r.saida?.toISOString()).toBe('2026-10-05T11:30:00.000Z')
  })
  it('cai no modo seguro e deriva motoristas das reservas quando a lista falha', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('cr40f_reservadeveculoses') && url.includes('_cr40f_motorista_value')) return json({ error: { message: 'Could not find a property named _cr40f_x' } }, 400)
      if (url.includes('cr40f_reservadeveculoses')) return json({ value: [{ cr40f_reservadeveculosid: 'A', cr40f_dataehorriodesada: '2026-10-05T11:30:00Z' }] })
      if (url.includes('cr40f_funcionarioses')) return json({ error: { message: 'falhou' } }, 500)
      return json({ value: [{ cr40f_servicosporpassageiroid: 'S1', cr40f_ordemdeselecao: 1, _cr40f_geral_value: 'A', [`_cr40f_bancodedados_value${F}`]: 'Ana' }] })
    })
    const data = await loadOperacional(createClient('https://org.example', fetchMock as typeof fetch), sets, '2026-10-05')
    expect(data.queryMode).toBe('safe')
    expect(data.reservas).toHaveLength(1)
    expect(data.motoristas).toEqual([])
    expect(data.passageiros.a[0]).toMatchObject({ nome: 'Ana', ordem: 1 })
  })
})

describe('mutações', () => {
  it('monta os payloads de PATCH', () => {
    expect(statusPatch(202410008)).toEqual({ cr40f_status: 202410008 })
    expect(motoristaPatch('cr40f_funcionarioses', '{ABC}')).toEqual({ 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(abc)' })
    expect(motoristaPatch('cr40f_funcionarioses', null)).toEqual({ 'cr40f_Motorista@odata.bind': null })
  })
})

describe('mock', () => {
  it('cobre os casos da fila de atenção', () => {
    const now = new Date('2026-10-05T11:00:00-03:00')
    const data = createMockData(now)
    const reasons = buildAttention(data.reservas, now).map((i) => i.priority)
    expect(reasons).toContain(1)
    expect(reasons).toContain(2)
    expect(findConflicts(data.reservas).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Passo 3: rodar e ver falhar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional/data`. Esperado: FAIL.

- [ ] **Passo 4: implementar `queries.ts`**

```ts
// data/queries.ts
import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import type { Motorista, OperacionalData, PassageiroServico, Reserva } from '../domain/types'
import { dayRange } from '../domain/time'

export const ENTITIES = { reserva: 'cr40f_reservadeveculos', funcionario: 'cr40f_funcionarios', passageiro: 'cr40f_servicosporpassageiro' } as const
export type EntitySets = { reserva: string; funcionario: string; passageiro: string }

const BASE = [
  'cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_idnovo', 'cr40f_status', 'cr40f_statusdefaturamento', 'cr40f_tipodoservico', 'cr40f_tipodeveiculo',
  'cr40f_dataehorriodesada', 'cr40f_horrioprevistoderetorno', 'cr40f_destino', 'cr40f_endereodesada', 'cr40f_passageirosetelefonedecontato',
  'cr40f_trajeto', 'cr40f_obsdeoperao', 'cr40f_observaointerna', '_cr40f_solicitante_value',
]
const PASSAGEIRO_LOOKUPS = ['_cr40f_passageiro1_value', '_cr40f_passageiro2_value', '_cr40f_passageiro3_value', '_cr40f_passageiro4_value']
const EXTRA = ['_cr40f_motorista_value', '_cr40f_veiculo_value', '_cr40f_cliente_value', ...PASSAGEIRO_LOOKUPS]

/** Erros de coluna inexistente que fazem o legado repetir a consulta só com os campos base. */
export const SAFE_MODE_ERROR = /column metadata is not available|could not find a property named|does not contain a definition/i

export function reservasPath(entitySet: string, key: string, mode: 'full' | 'safe') {
  const { start, end } = dayRange(key)
  const select = mode === 'full' ? [...BASE, ...EXTRA] : BASE
  const filter = `cr40f_dataehorriodesada ge ${start.toISOString()} and cr40f_dataehorriodesada lt ${end.toISOString()} and statecode eq 0`
  return `${entitySet}?$select=${select.join(',')}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent('cr40f_dataehorriodesada asc')}`
}

const id = (value: unknown) => (typeof value === 'string' && value ? cleanId(value) : null)
const date = (value: unknown) => (typeof value === 'string' && value ? new Date(value) : null)
const text = (row: Row, field: string) => formatted(row, field).trim()

export function mapReserva(row: Row): Reserva {
  return {
    id: id(row.cr40f_reservadeveculosid) ?? '',
    codigo: text(row, 'cr40f_idnovo') || text(row, 'cr40f_id'),
    statusValue: typeof row.cr40f_status === 'number' ? row.cr40f_status : null,
    status: text(row, 'cr40f_status'),
    faturamento: text(row, 'cr40f_statusdefaturamento'),
    tipoServico: text(row, 'cr40f_tipodoservico') || 'Outros',
    tipoVeiculo: text(row, 'cr40f_tipodeveiculo'),
    saida: date(row.cr40f_dataehorriodesada),
    retorno: date(row.cr40f_horrioprevistoderetorno),
    destino: text(row, 'cr40f_destino'),
    enderecoSaida: text(row, 'cr40f_endereodesada'),
    trajeto: text(row, 'cr40f_trajeto'),
    obsOperacao: text(row, 'cr40f_obsdeoperao'),
    obsInterna: text(row, 'cr40f_observaointerna'),
    motoristaId: id(row._cr40f_motorista_value),
    motorista: text(row, '_cr40f_motorista_value'),
    veiculo: text(row, '_cr40f_veiculo_value'),
    cliente: text(row, '_cr40f_cliente_value'),
    solicitante: text(row, '_cr40f_solicitante_value'),
    passageirosLookup: PASSAGEIRO_LOOKUPS.flatMap((field) => (id(row[field]) ? [{ id: id(row[field])!, nome: text(row, field) }] : [])),
    passageirosTexto: text(row, 'cr40f_passageirosetelefonedecontato'),
  }
}

export function mapMotorista(row: Row): Motorista {
  return { id: id(row.cr40f_funcionariosid) ?? '', nome: text(row, 'cr40f_nomecompleto'), apelido: text(row, 'new_apelido'), celular: text(row, 'cr40f_celular') }
}

async function loadReservas(client: DataverseClient, entitySet: string, key: string) {
  try {
    return { rows: await client.getAll(reservasPath(entitySet, key, 'full')), queryMode: 'full' as const }
  } catch (error) {
    if (!(error instanceof Error) || !SAFE_MODE_ERROR.test(error.message)) throw error
    return { rows: await client.getAll(reservasPath(entitySet, key, 'safe')), queryMode: 'safe' as const }
  }
}

async function loadMotoristas(client: DataverseClient, entitySet: string, reservas: Reserva[]) {
  try {
    const rows = await client.getAll(`${entitySet}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido,cr40f_funcao,cr40f_status,cr40f_celular&$filter=statecode eq 0&$orderby=cr40f_nomecompleto asc`)
    const motoristas = rows.filter((row) => /motorista/i.test(formatted(row, 'cr40f_funcao'))).map(mapMotorista)
    if (motoristas.length) return motoristas
  } catch { /* cai no derivado, como o legado */ }
  const derived = new Map<string, Motorista>()
  for (const r of reservas) if (r.motoristaId && !derived.has(r.motoristaId)) derived.set(r.motoristaId, { id: r.motoristaId, nome: r.motorista, apelido: '', celular: '' })
  return [...derived.values()]
}

async function loadPassageiros(client: DataverseClient, entitySet: string, reservaIds: string[]) {
  const result: Record<string, PassageiroServico[]> = {}
  try {
    for (const ids of chunk(reservaIds, 10)) {
      const filter = ids.map((value) => `_cr40f_geral_value eq ${value}`).join(' or ')
      const rows = await client.getAll(`${entitySet}?$select=cr40f_servicosporpassageiroid,cr40f_ordemdeselecao,new_enderecodesaidacolunaservicosporpassageiro,_cr40f_geral_value,_cr40f_bancodedados_value&$filter=${encodeURIComponent(filter)}&$orderby=cr40f_ordemdeselecao asc`)
      for (const row of rows) {
        const reservaId = id(row._cr40f_geral_value)
        if (!reservaId) continue
        ;(result[reservaId] ??= []).push({
          id: id(row.cr40f_servicosporpassageiroid) ?? '',
          ordem: Number(row.cr40f_ordemdeselecao ?? 0),
          nome: text(row, '_cr40f_bancodedados_value'),
          enderecoSaida: text(row, 'new_enderecodesaidacolunaservicosporpassageiro'),
        })
      }
    }
  } catch { return {} }
  return result
}

/** Dia inteiro (sem filtro de motorista no servidor: o filtro é local para manter conflitos e a troca de motorista corretos). */
export async function loadOperacional(client: DataverseClient, sets: EntitySets, key: string): Promise<OperacionalData> {
  const { rows, queryMode } = await loadReservas(client, sets.reserva, key)
  const reservas = rows.map(mapReserva)
  const [passageiros, motoristas] = await Promise.all([
    loadPassageiros(client, sets.passageiro, reservas.map((r) => r.id)),
    loadMotoristas(client, sets.funcionario, reservas),
  ])
  return { reservas, motoristas, passageiros, queryMode }
}
```

- [ ] **Passo 5: implementar `mutations.ts`**

```ts
// data/mutations.ts
import { cleanId } from '@betinhos/dataverse'

/** Navegação do lookup cr40f_motorista (confirmada na metadata de DEV na Tarefa 5, passo 1). */
export const NAV_MOTORISTA = 'cr40f_Motorista'

export const statusPatch = (value: number) => ({ cr40f_status: value })

export function motoristaPatch(funcionarioSet: string, motoristaId: string | null) {
  return { [`${NAV_MOTORISTA}@odata.bind`]: motoristaId ? `/${funcionarioSet}(${cleanId(motoristaId)})` : null }
}
```

- [ ] **Passo 6: implementar `mock.ts`.** Os horários são relativos a `now`, para os alertas aparecerem em qualquer hora do dia.

```ts
// data/mock.ts
import type { OperacionalData, Reserva } from '../domain/types'

const MOTORISTAS = [
  { id: 'm-carlos', nome: 'Carlos Henrique Lima', apelido: 'Carlão', celular: '(11) 98888-1001' },
  { id: 'm-marina', nome: 'Marina Lopes', apelido: '', celular: '(11) 98888-1002' },
  { id: 'm-joao', nome: 'João Pedro de Araújo', apelido: 'JP', celular: '' },
  { id: 'm-rita', nome: 'Rita Fernandes', apelido: '', celular: '(11) 98888-1004' },
]

export const MOCK_STATUS = [
  { value: 202410000, label: 'Pré-reserva' }, { value: 202410004, label: 'Solicitado' }, { value: 202410001, label: 'Confirmado' },
  { value: 202410005, label: 'Programado' }, { value: 100000001, label: 'Requer Análise' }, { value: 202410008, label: 'Concluído' },
  { value: 202410002, label: 'Cancelado' },
]

/** Dia de exemplo em torno de `now`: sem motorista, atrasado, aberto, conflito, concluído e tranquilos. */
export function createMockData(now: Date): OperacionalData {
  const at = (minutes: number) => new Date(Math.floor(now.getTime() / 60_000) * 60_000 + minutes * 60_000)
  const status = (label: string) => MOCK_STATUS.find((s) => s.label === label)!
  let seq = 0
  const make = (minutes: number, label: string, motorista: (typeof MOTORISTAS)[number] | null, extra: Partial<Reserva> = {}): Reserva => {
    seq += 1
    return {
      id: `mock-${seq}`, codigo: String(4200 + seq), statusValue: status(label).value, status: label, faturamento: 'A faturar',
      tipoServico: ['Transfer', 'Aeroporto', 'Disposição', 'City Tour'][seq % 4], tipoVeiculo: seq % 2 ? 'Sedan executivo' : 'Van executiva',
      saida: at(minutes), retorno: at(minutes + 120), destino: 'Av. Brigadeiro Faria Lima, 3477', enderecoSaida: 'Aeroporto de Guarulhos, Terminal 3',
      trajeto: seq % 2 ? 'GRU → Faria Lima' : 'Congonhas → Paulista', obsOperacao: seq === 2 ? 'Placa de recepção com o nome do cliente.' : '', obsInterna: '',
      motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '', veiculo: motorista ? `Placa ABC-${1000 + seq}` : '',
      cliente: 'Cliente Exemplo S.A.', solicitante: 'Paula Martins', passageirosLookup: [],
      passageirosTexto: 'Ana Souza - (11) 97777-0001\nBruno Teixeira - (21) 97777-0002', ...extra,
    }
  }
  const [carlos, marina, joao, rita] = MOTORISTAS
  const reservas = [
    make(-180, 'Concluído', marina),
    make(-15, 'Solicitado', joao),
    make(-40, 'Programado', rita),
    make(18, 'Confirmado', null),
    make(25, 'Pré-reserva', marina),
    make(70, 'Confirmado', carlos),
    make(90, 'Programado', carlos),
    make(200, 'Requer Análise', rita),
    make(420, 'Confirmado', joao),
    make(480, 'Cancelado', marina),
  ].sort((a, b) => a.saida!.getTime() - b.saida!.getTime())
  const first = reservas.find((r) => r.motoristaId === carlos.id)!
  return {
    reservas,
    motoristas: MOTORISTAS,
    passageiros: { [first.id]: [{ id: 'sp-1', ordem: 1, nome: 'Ana Souza', enderecoSaida: 'Rua Haddock Lobo, 595' }] },
    queryMode: 'full',
  }
}
```

- [ ] **Passo 7: implementar `source.ts`**

```ts
// data/source.ts
import { createMetadata, getHostXrm, type ChoiceOption } from '@betinhos/dataverse'
import type { Host } from '../../../host'
import type { OperacionalData } from '../domain/types'
import { MOCK_STATUS, createMockData } from './mock'
import { ENTITIES, loadOperacional, type EntitySets } from './queries'
import { motoristaPatch, statusPatch } from './mutations'

/** Tudo que a tela precisa do mundo externo; dataverse em produção, memória no pnpm dev. */
export type Source = {
  mock: boolean
  load: (key: string) => Promise<OperacionalData>
  statusOptions: () => Promise<ChoiceOption[]>
  setStatus: (reservaId: string, value: number) => Promise<void>
  setMotorista: (reservaId: string, motoristaId: string | null) => Promise<void>
  openReserva: (reservaId: string) => void
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  let data: OperacionalData | null = null
  return {
    mock: true,
    async load() {
      await wait(350)
      data ??= createMockData(new Date())
      return structuredClone(data)
    },
    statusOptions: async () => MOCK_STATUS,
    async setStatus(reservaId, value) {
      await wait(400)
      const r = data?.reservas.find((item) => item.id === reservaId)
      if (r) Object.assign(r, { statusValue: value, status: MOCK_STATUS.find((s) => s.value === value)?.label ?? r.status })
    },
    async setMotorista(reservaId, motoristaId) {
      await wait(400)
      const r = data?.reservas.find((item) => item.id === reservaId)
      const m = data?.motoristas.find((item) => item.id === motoristaId)
      if (r) Object.assign(r, { motoristaId: m?.id ?? null, motorista: m?.nome ?? '' })
    },
    openReserva() { /* fora do Dataverse não há formulário para abrir */ },
  }
}

export function createSource(host: Host): Source {
  if (host.mode === 'mock') return createMockSource()
  const metadata = createMetadata(host.client)
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= metadata.entities(Object.values(ENTITIES)).then((info) => {
    const set = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada na metadata.`)
      return value
    }
    return { reserva: set(ENTITIES.reserva), funcionario: set(ENTITIES.funcionario), passageiro: set(ENTITIES.passageiro) }
  }).catch((error) => { sets = null; throw error }))

  return {
    mock: false,
    load: async (key) => loadOperacional(host.client, await entitySets(), key),
    statusOptions: () => metadata.choices(ENTITIES.reserva, 'cr40f_status'),
    setStatus: async (reservaId, value) => host.client.update((await entitySets()).reserva, reservaId, statusPatch(value)),
    setMotorista: async (reservaId, motoristaId) => {
      const s = await entitySets()
      await host.client.update(s.reserva, reservaId, motoristaPatch(s.funcionario, motoristaId))
    },
    openReserva(reservaId) {
      const navigation = getHostXrm()?.Navigation as { openForm?: (options: { entityName: string; entityId: string }) => unknown } | undefined
      if (host.insideModelDriven && navigation?.openForm) navigation.openForm({ entityName: ENTITIES.reserva, entityId: reservaId })
      else window.open(`${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${ENTITIES.reserva}&id=${reservaId}`, '_blank', 'noopener')
    },
  }
}
```

Antes do passo 8, confira o tipo `XrmHost` em `packages/dataverse/src/xrm.ts`. Se ele já tipar `Navigation`, remova o cast acima. Se não tiver `Navigation`, mantenha o cast.

- [ ] **Passo 8: rodar e ver passar.** `pnpm --filter @betinhos/shell exec vitest run src/pages/operacional` e `pnpm typecheck`. Esperado: PASS e nenhum erro de tipo.

- [ ] **Passo 9: commit**

```bash
git add apps/shell/src/pages/operacional/data
git commit -m "Operacional: consultas, mutações, dados de exemplo e Source" -m "Porta as três consultas do legado (reservas do dia em UTC a partir do fuso de São Paulo, motoristas com fallback derivado e passageiros em lotes de 10) com o modo seguro; monta os PATCH de status e motorista; resolve entity sets pela metadata; oferece uma Source em memória para o pnpm dev com casos de alerta e conflito." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: componente `Sheet` em `packages/ui`

**Arquivos:**
- Criar: `packages/ui/src/components/sheetGesture.ts`, `Sheet.tsx`, `sheet.css`
- Teste: `packages/ui/src/components/Sheet.test.ts`
- Modificar: `packages/ui/src/index.ts` e o arquivo que agrega os CSS dos componentes. Confira em `packages/ui/src/styles.css` como os outros `*.css` são importados e siga o mesmo padrão.

**Interfaces:**
- Produz:
  - `Sheet` com `SheetProps = { open: boolean; onClose: () => void; title: ReactNode; eyebrow?: ReactNode; footer?: ReactNode; children: ReactNode; expandLabel?: string }`;
  - `SheetLevel = 'half' | 'full'`;
  - as funções puras `resolveSnap` e `dampen`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// packages/ui/src/components/Sheet.test.ts
import { describe, expect, it } from 'vitest'
import { dampen, resolveSnap } from './sheetGesture'

const height = 800
describe('gesto do sheet', () => {
  it('fecha a partir da metade por distância ou por gesto rápido', () => {
    expect(resolveSnap({ dy: 210, ms: 600, level: 'half', height })).toBe('close')
    expect(resolveSnap({ dy: 60, ms: 200, level: 'half', height })).toBe('half')
    expect(resolveSnap({ dy: 40, ms: 120, level: 'half', height })).toBe('close')
  })
  it('do cheio volta para a metade', () => {
    expect(resolveSnap({ dy: 300, ms: 600, level: 'full', height })).toBe('half')
    expect(resolveSnap({ dy: 30, ms: 600, level: 'full', height })).toBe('full')
  })
  it('para cima expande', () => {
    expect(resolveSnap({ dy: -130, ms: 600, level: 'half', height })).toBe('full')
    expect(resolveSnap({ dy: -50, ms: 200, level: 'half', height })).toBe('full')
    expect(resolveSnap({ dy: -20, ms: 600, level: 'half', height })).toBe('half')
  })
  it('amortece o arrasto para cima', () => {
    expect(dampen(120)).toBe(120)
    expect(dampen(-100)).toBeGreaterThan(-100)
    expect(dampen(-400)).toBeLessThan(dampen(-100))
  })
})
```

- [ ] **Passo 2: rodar e ver falhar.** `pnpm --filter @betinhos/ui test`. Esperado: FAIL.

- [ ] **Passo 3: implementar o gesto**

```ts
// packages/ui/src/components/sheetGesture.ts
export type SheetLevel = 'half' | 'full'

/** Velocidade (px/ms) acima da qual um gesto curto já conta, como no Sonner/Vaul. */
const FLICK = 0.11

/** Decide o destino ao soltar o arrasto: distância (25% para baixo, 15% para cima) ou velocidade. */
export function resolveSnap({ dy, ms, level, height }: { dy: number; ms: number; level: SheetLevel; height: number }): SheetLevel | 'close' {
  const fast = Math.abs(dy) / Math.max(ms, 1) > FLICK
  if (dy > 0 && (dy > height * 0.25 || fast)) return level === 'full' ? 'half' : 'close'
  if (dy < 0 && level === 'half' && (-dy > height * 0.15 || fast)) return 'full'
  return level
}

/** Fricção crescente ao puxar para cima: nada de parede invisível. */
export function dampen(dy: number) {
  return dy >= 0 ? dy : -8 * Math.sqrt(-dy)
}
```

- [ ] **Passo 4: implementar o componente**

```tsx
// packages/ui/src/components/Sheet.tsx
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { dampen, resolveSnap, type SheetLevel } from './sheetGesture'

export type SheetProps = {
  open: boolean
  /** Chamado depois da animação de saída (X, Esc, fundo ou arrasto). */
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  /** Ações fixas ao alcance do polegar. */
  footer?: ReactNode
  /** Rótulo do botão que expande para a altura cheia. */
  expandLabel?: string
  children: ReactNode
}

const EXIT_MS = 160

/** Bottom sheet modal em dois níveis (metade e cheio), arrastável pela alça/cabeçalho; <dialog> nativo para foco e Esc. */
export function Sheet({ open, onClose, title, eyebrow, footer, expandLabel = 'Ver detalhes completos', children }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; pointer: number } | null>(null)
  const [level, setLevel] = useState<SheetLevel>('half')
  const [closing, setClosing] = useState(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) { setLevel('half'); setClosing(false); dialog.showModal() }
    if (!open && dialog.open) dialog.close()
  }, [open])

  function requestClose() {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, EXIT_MS)
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (drag.current || (event.target as HTMLElement).closest('button')) return // ignora segundo dedo e botões
    drag.current = { y: event.clientY, t: performance.now(), pointer: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    panelRef.current?.setAttribute('data-dragging', '')
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const start = drag.current
    if (!start || start.pointer !== event.pointerId || !panelRef.current) return
    // Transform direto no painel: não recalcula estilo dos filhos.
    panelRef.current.style.transform = `translateY(calc(var(--bt-sheet-offset) + ${dampen(event.clientY - start.y)}px))`
  }
  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = drag.current
    if (!start || start.pointer !== event.pointerId || !panelRef.current) return
    drag.current = null
    panelRef.current.removeAttribute('data-dragging')
    panelRef.current.style.transform = ''
    const next = resolveSnap({ dy: event.clientY - start.y, ms: performance.now() - start.t, level, height: panelRef.current.offsetHeight })
    if (next === 'close') requestClose()
    else setLevel(next)
  }

  return (
    <dialog
      ref={dialogRef}
      className="bt-sheet"
      data-level={level}
      data-closing={closing ? '' : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); requestClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) requestClose() }}
    >
      <div ref={panelRef} className="bt-sheet__panel">
        <header className="bt-sheet__head" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="bt-sheet__handle" aria-hidden="true" />
          <div className="bt-sheet__heading">
            {eyebrow != null ? <span className="bt-sheet__eyebrow">{eyebrow}</span> : null}
            <h2 className="bt-sheet__title" id={titleId}>{title}</h2>
          </div>
          <button type="button" className="bt-sheet__close" aria-label="Fechar" onClick={requestClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </header>
        <div className="bt-sheet__body">
          {children}
          {level === 'half' ? <button type="button" className="bt-sheet__expand" onClick={() => setLevel('full')}>{expandLabel}</button> : null}
        </div>
        {footer != null ? <footer className="bt-sheet__foot">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
```

- [ ] **Passo 5: implementar o CSS**

```css
/* packages/ui/src/components/sheet.css */
.bt-sheet {
  --bt-sheet-height: 92dvh;
  --bt-sheet-offset: 37dvh; /* metade: mostra ~55% da tela */
  position: fixed; inset: 0; width: 100%; max-width: none; height: 100%; max-height: none;
  margin: 0; padding: 0; border: 0; background: transparent; overflow: hidden;
}
.bt-sheet[data-level='full'] { --bt-sheet-offset: 0px; }
.bt-sheet::backdrop {
  background-color: var(--bt-color-brand);
  opacity: var(--bt-opacity-backdrop);
  transition: opacity var(--bt-duration-normal) var(--bt-ease-out);
}
@starting-style { .bt-sheet[open]::backdrop { opacity: 0; } }
.bt-sheet[data-closing]::backdrop { opacity: 0; transition-duration: 150ms; }

.bt-sheet__panel {
  position: absolute; inset: auto 0 0 0; height: var(--bt-sheet-height);
  display: flex; flex-direction: column;
  background-color: var(--bt-color-surface-soft);
  border-radius: var(--bt-radius-xl) var(--bt-radius-xl) 0 0;
  box-shadow: var(--bt-shadow-toast);
  transform: translateY(var(--bt-sheet-offset));
  transition: transform var(--bt-drawer-duration-enter) var(--bt-ease-drawer);
}
@starting-style { .bt-sheet[open] .bt-sheet__panel { transform: translateY(100%); } }
.bt-sheet[data-closing] .bt-sheet__panel { transform: translateY(100%); transition-duration: 160ms; transition-timing-function: var(--bt-ease-out); }
.bt-sheet__panel[data-dragging] { transition: none; }

.bt-sheet__head {
  position: relative; display: flex; align-items: flex-start; gap: var(--bt-space-3);
  padding: var(--bt-space-5) var(--bt-space-4) var(--bt-space-3);
  background-color: var(--bt-color-surface); border-bottom: 1px solid var(--bt-color-border);
  border-radius: var(--bt-radius-xl) var(--bt-radius-xl) 0 0;
  touch-action: none; cursor: grab;
}
.bt-sheet__handle { position: absolute; top: var(--bt-space-2); left: 50%; width: 40px; height: 4px; margin-left: -20px; border-radius: var(--bt-radius-full); background-color: var(--bt-color-border); }
.bt-sheet__heading { flex: 1; min-width: 0; }
.bt-sheet__eyebrow { display: block; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.8px; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.bt-sheet__title { margin: 2px 0 0; font-size: var(--bt-typography-heading-detail-font-size); font-weight: var(--bt-font-weight-extrabold); line-height: var(--bt-typography-heading-detail-line-height); color: var(--bt-color-text-primary); }
.bt-sheet__close {
  display: grid; place-items: center; width: var(--bt-control-height-touch); height: var(--bt-control-height-touch); flex: none;
  border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); color: var(--bt-color-text-secondary);
  transition: transform var(--bt-duration-fast) var(--bt-ease-out);
}
.bt-sheet__close:active { transform: scale(.97); }
.bt-sheet__close:focus-visible, .bt-sheet__expand:focus-visible { outline: 0; border-color: var(--bt-focus-border); box-shadow: var(--bt-focus-ring); }

.bt-sheet__body { flex: 1; overflow: hidden; padding: var(--bt-space-4); padding-bottom: calc(var(--bt-sheet-offset) + 96px); }
.bt-sheet[data-level='full'] .bt-sheet__body { overflow-y: auto; overscroll-behavior: contain; padding-bottom: var(--bt-space-4); }
.bt-sheet__expand { width: 100%; min-height: var(--bt-control-height-touch); margin-top: var(--bt-space-3); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); color: var(--bt-color-action); font: inherit; font-weight: var(--bt-font-weight-bold); }

/* Rodapé acompanha a borda visível: na metade, sobe o mesmo deslocamento do painel. */
.bt-sheet__foot {
  padding: var(--bt-space-3) var(--bt-space-4) calc(var(--bt-space-3) + env(safe-area-inset-bottom));
  background-color: var(--bt-color-surface); border-top: 1px solid var(--bt-color-border);
  transform: translateY(calc(-1 * var(--bt-sheet-offset)));
  transition: transform var(--bt-drawer-duration-enter) var(--bt-ease-drawer);
}
.bt-sheet__panel[data-dragging] .bt-sheet__foot { transition: none; }

@media (hover: hover) and (pointer: fine) {
  .bt-sheet__close:hover { border-color: #c7d2e2; color: var(--bt-color-text-primary); }
}
@media (prefers-reduced-motion: reduce) {
  .bt-sheet__panel, .bt-sheet__foot { transition-property: opacity; }
  @starting-style { .bt-sheet[open] .bt-sheet__panel { transform: translateY(var(--bt-sheet-offset)); opacity: 0; } }
}
```

Observação: `#c7d2e2` é a cor de hover de borda definida no item 6.2 do DESIGN_SYSTEM.md. Se outro componente de `packages/ui` já tiver uma variável para ela, use essa variável no lugar do valor fixo.

- [ ] **Passo 6: exportar.** Em `packages/ui/src/index.ts`, acrescente `export { Sheet, type SheetProps } from './components/Sheet'` e `export { resolveSnap, dampen, type SheetLevel } from './components/sheetGesture'`. Importe `sheet.css` no mesmo ponto em que os outros CSS de componente são importados.

- [ ] **Passo 7: vitrine.** Em `apps/shell/src/pages/ComponentsPage.tsx`, acrescente uma seção "Sheet" com um botão "Abrir sheet" que abre um `Sheet` de exemplo (eyebrow "Serviço #4205", rodapé com dois `Button`). Siga o padrão da seção existente do `Drawer`.

- [ ] **Passo 8: rodar.** `pnpm test` e `pnpm typecheck`. Esperado: PASS.

- [ ] **Passo 9: commit**

```bash
git add packages/ui apps/shell/src/pages/ComponentsPage.tsx
git commit -m "UI: componente Sheet (bottom sheet arrastável em dois níveis)" -m "Bottom sheet modal sobre <dialog> nativo: metade e cheio, arrasto pela alça com pointer capture, fecha por distância ou gesto rápido, fricção ao puxar para cima, rodapé de ações sempre visível, entrada de 220 ms em ease-drawer e saída de 160 ms; só transform e opacity. Inclui exemplo na vitrine." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 7: hook `useOperacional` e `useMedia`

**Arquivos:**
- Criar: `apps/shell/src/pages/operacional/useOperacional.ts`, `apps/shell/src/pages/operacional/useMedia.ts`

**Interfaces:**
- Consome: `Source` e as funções `applyOverrides`/`changedIds` (Tarefa 3).
- Produz:
  - `useOperacional(source, key)`, que retorna `{ data, reservas, loading, error, refreshing, refreshFailed, lastUpdated, changed, refresh, mutate }`;
  - `mutate(reservaId: string, patch: Partial<Reserva>, run: () => Promise<void>): Promise<void>`;
  - `useMedia(query: string): boolean`.

As regras puras do hook já foram testadas na Tarefa 3. O comportamento com timer e visibilidade é verificado no navegador na Tarefa 10, porque o repo não usa jsdom.

- [ ] **Passo 1: implementar**

```ts
// useOperacional.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { OperacionalData, Reserva } from './domain/types'
import { applyOverrides, changedIds } from './domain/refresh'

const REFRESH_MS = 60_000
type State = {
  data: OperacionalData | null
  loading: boolean
  error: string | null
  refreshing: boolean
  refreshFailed: boolean
  lastUpdated: Date | null
  changed: Set<string>
}
const initial: State = { data: null, loading: true, error: null, refreshing: false, refreshFailed: false, lastUpdated: null, changed: new Set() }
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Carrega o dia, atualiza a cada 60 s só com a aba visível e aplica mutações otimistas com rollback. */
export function useOperacional(source: Source, key: string) {
  const [state, setState] = useState<State>(initial)
  const [overrides, setOverrides] = useState(() => new Map<string, Partial<Reserva>>())
  const token = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const data = await source.load(key)
      if (current !== token.current) return // resposta de um dia que já não está na tela
      setState((s) => ({ data, loading: false, error: null, refreshing: false, refreshFailed: false, lastUpdated: new Date(), changed: changedIds(s.data?.reservas ?? [], data.reservas) }))
      setOverrides(new Map())
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, refreshing: false, refreshFailed: true, error: s.data ? null : message(reason) }))
    }
  }, [source, key])

  useEffect(() => { setState(initial); void refresh() }, [refresh])

  useEffect(() => {
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const timer = window.setInterval(whenVisible, REFRESH_MS)
    document.addEventListener('visibilitychange', whenVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', whenVisible) }
  }, [refresh])

  const mutate = useCallback(async (reservaId: string, patch: Partial<Reserva>, run: () => Promise<void>) => {
    setOverrides((map) => new Map(map).set(reservaId, { ...map.get(reservaId), ...patch }))
    try {
      await run()
    } catch (reason) {
      setOverrides((map) => { const next = new Map(map); next.delete(reservaId); return next })
      throw reason
    }
  }, [])

  const reservas = useMemo(() => (state.data ? applyOverrides(state.data.reservas, overrides) : []), [state.data, overrides])
  return { ...state, reservas, refresh, mutate }
}
```

```ts
// useMedia.ts
import { useSyncExternalStore } from 'react'

/** Media query reativa (ex.: '(min-width: 860px)'). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => { const list = window.matchMedia(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify) },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
```

- [ ] **Passo 2: verificar.** `pnpm typecheck`. Esperado: sem erros.

- [ ] **Passo 3: commit**

```bash
git add apps/shell/src/pages/operacional/useOperacional.ts apps/shell/src/pages/operacional/useMedia.ts
git commit -m "Operacional: hook de carga com atualização automática e otimismo" -m "Atualiza a cada 60 s e ao voltar para a aba, só com a aba visível; descarta respostas de outro dia; mantém os dados antigos quando a atualização falha; aplica mudanças otimistas e desfaz em caso de erro." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: lista (cabeçalho do dia, Precisa de você, agenda, paisagem)

**Arquivos:**
- Criar: `components/DayHeader.tsx`, `components/AttentionList.tsx`, `components/Agenda.tsx`, `components/LandscapeTable.tsx`, `operacional.css`

(caminhos relativos a `apps/shell/src/pages/operacional/`)

**Interfaces:**
- Consome: o domínio das Tarefas 1 a 3 e, de `@betinhos/ui`, `Button`, `StatusBadge`, `Select`, `Switch`, `EmptyState`, `Skeleton` e `Table`.
- Produz:
  - `DayHeader({ dayKey, today, onChangeDay, freshness, freshnessWarning, refreshing, onRefresh, total, motoristas, motoristaId, onMotorista, showConcluded, onShowConcluded, mock })`;
  - `AttentionList({ items, byId, onOpen, onAction })`;
  - `Agenda({ groups, concluded, showConcluded, now, selectedId, changed, onSelect })`;
  - `ServiceRow` (interno do Agenda) e `LandscapeTable({ reservas, now, onSelect })`;
  - `AgendaSkeleton()`.

- [ ] **Passo 1: `DayHeader.tsx`**

```tsx
import { useRef, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Select, StatusBadge, Switch } from '@betinhos/ui'
import type { Motorista } from '../domain/types'
import { addDays, dayLabel } from '../domain/time'

type Props = {
  dayKey: string; today: string; onChangeDay: (key: string) => void
  freshness: string; freshnessWarning: boolean; refreshing: boolean; onRefresh: () => void; total: number
  motoristas: Motorista[]; motoristaId: string | null; onMotorista: (id: string | null) => void
  showConcluded: boolean; onShowConcluded: (value: boolean) => void; mock: boolean
}

/** Cabeçalho fixo: dia (setas e swipe), frescor sempre visível e filtros. Troca de dia sem animação: é ação repetitiva. */
export function DayHeader(props: Props) {
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const { dayKey, onChangeDay } = props
  const go = (days: number) => onChangeDay(addDays(dayKey, days))

  const onDown = (e: PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = e.clientX - start.x, dy = Math.abs(e.clientY - start.y)
    if (Math.abs(dx) > 60 && dy < 40) go(dx < 0 ? 1 : -1)
  }

  return (
    <header className="op-day" onPointerDown={onDown} onPointerUp={onUp}>
      <div className="op-day__row">
        <button type="button" className="op-icon" aria-label="Dia anterior" onClick={() => go(-1)}><ChevronLeft size={20} /></button>
        <h2 className="op-day__label">{dayLabel(dayKey, props.today)}</h2>
        <button type="button" className="op-icon" aria-label="Próximo dia" onClick={() => go(1)}><ChevronRight size={20} /></button>
        <button type="button" className="op-icon op-day__refresh" aria-label="Atualizar agora" aria-busy={props.refreshing} onClick={props.onRefresh} data-spinning={props.refreshing || undefined}><RefreshCw size={18} /></button>
      </div>
      <p className="op-day__fresh" role="status" aria-live="polite" data-warning={props.freshnessWarning || undefined}>
        {props.freshness} · {props.total} {props.total === 1 ? 'serviço' : 'serviços'}
        {props.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </p>
      <div className="op-day__filters">
        <Select
          aria-label="Filtrar por motorista" placeholder="Todos os motoristas" searchable clearable size="compact"
          options={props.motoristas.map((m) => ({ value: m.id, label: m.nome, subtitle: m.apelido || undefined, search: m.apelido }))}
          value={props.motoristaId} onChange={props.onMotorista}
        />
        <Switch checked={props.showConcluded} onChange={(event) => props.onShowConcluded(event.currentTarget.checked)}>Mostrar concluídos</Switch>
      </div>
    </header>
  )
}
```

Antes de seguir, confira as props reais de `Switch` em `packages/ui/src/components/Choice.tsx` (o rótulo pode ser `label` ou `children`; `onChange` pode receber evento ou booleano) e ajuste a chamada. O mesmo vale para `size` do `Select` (`ControlSize` em `Field.tsx`): use o valor compacto que existir.

- [ ] **Passo 2: `AttentionList.tsx`**

```tsx
import { Eye, Phone, UserPlus } from 'lucide-react'
import type { AttentionItem } from '../domain/alerts'
import type { Reserva } from '../domain/types'
import { formatHour } from '../domain/time'

const ACTION = { atribuir: { label: 'Atribuir', icon: UserPlus }, ligar: { label: 'Ligar', icon: Phone }, ver: { label: 'Ver', icon: Eye } } as const

/** "Precisa de você": só o que exige intervenção, com a ação direta ao lado. Some quando vazia. */
export function AttentionList({ items, byId, onOpen, onAction }: {
  items: AttentionItem[]; byId: Map<string, Reserva>
  onOpen: (reservaId: string) => void; onAction: (item: AttentionItem) => void
}) {
  if (!items.length) return null
  return (
    <section className="op-attention" aria-labelledby="op-attention-title">
      <h2 className="op-section-title" id="op-attention-title">Precisa de você <span className="op-count">{items.length}</span></h2>
      <ul className="op-attention__list">
        {items.map((item) => {
          const r = byId.get(item.reservaId)
          if (!r) return null
          const { label, icon: Icon } = ACTION[item.action]
          return (
            <li key={item.reservaId} className="op-attention__item" data-priority={item.priority}>
              <button type="button" className="op-attention__main op-press" onClick={() => onOpen(r.id)}>
                <span className="op-attention__time">{r.saida ? formatHour(r.saida) : '--:--'}</span>
                <span className="op-attention__text">
                  <strong>#{r.codigo} · {item.reason}</strong>
                  <span>{r.motorista || 'Sem motorista'} · {r.trajeto || r.destino || r.tipoServico}</span>
                </span>
              </button>
              <button type="button" className="op-attention__action op-press" onClick={() => onAction(item)}><Icon size={16} aria-hidden="true" />{label}</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Passo 3: `Agenda.tsx`**

```tsx
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, Skeleton, StatusBadge } from '@betinhos/ui'
import type { HourGroup } from '../domain/bands'
import type { Reserva } from '../domain/types'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'

function ServiceRow({ reserva, now, selected, changed, onSelect }: { reserva: Reserva; now: Date; selected: boolean; changed: boolean; onSelect: (id: string) => void }) {
  const state = serviceState(reserva, now)
  const edge = state.kind === 'delayed' ? 'danger' : state.kind === 'upcoming' && state.tone === 'warning' ? 'warning' : undefined
  return (
    <li>
      <button type="button" className="op-row op-press" data-edge={edge} data-changed={changed || undefined} aria-current={selected || undefined} onClick={() => onSelect(reserva.id)}>
        <span className="op-row__time">{reserva.saida ? formatHour(reserva.saida) : '--:--'}</span>
        <span className="op-row__main">
          <span className="op-row__line"><strong>#{reserva.codigo}</strong> {reserva.motorista || <em>Sem motorista</em>} · {reserva.tipoServico}</span>
          <span className="op-row__line op-row__muted">{reserva.trajeto || reserva.destino || 'Trajeto não informado'}</span>
          {edge ? <span className={`op-row__state op-row__state--${edge}`}>{state.label}</span> : null}
        </span>
        <StatusBadge className="op-row__badge" tone={statusTone(reserva.status)} dot>{reserva.status || 'Sem status'}</StatusBadge>
      </button>
    </li>
  )
}

export function AgendaSkeleton() {
  return (
    <ul className="op-agenda__list" aria-busy="true" aria-label="Carregando serviços">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="op-row op-row--skeleton"><Skeleton width={42} /><span className="op-row__main"><Skeleton width="70%" /><Skeleton width="45%" /></span><Skeleton width={72} height={22} /></li>
      ))}
    </ul>
  )
}

type Props = {
  groups: HourGroup[]; concluded: Reserva[]; showConcluded: boolean; now: Date
  selectedId: string | null; changed: Set<string>; onSelect: (id: string) => void
}

/** Agenda do dia por hora cheia; cabeçalhos de hora fixos ao rolar; concluídos recolhidos. */
export function Agenda({ groups, concluded, showConcluded, now, selectedId, changed, onSelect }: Props) {
  const [concludedOpen, setConcludedOpen] = useState(false)
  const row = (r: Reserva) => <ServiceRow key={r.id} reserva={r} now={now} selected={r.id === selectedId} changed={changed.has(r.id)} onSelect={onSelect} />
  return (
    <section className="op-agenda" aria-label="Agenda do dia">
      {groups.map((group) => (
        <div key={group.key} className="op-agenda__group">
          <h3 className="op-agenda__hour">{group.label}</h3>
          <ul className="op-agenda__list">{group.items.map(row)}</ul>
        </div>
      ))}
      {showConcluded && concluded.length ? (
        <div className="op-agenda__group">
          <button type="button" className="op-agenda__toggle" aria-expanded={concludedOpen} onClick={() => setConcludedOpen((v) => !v)}>
            <ChevronDown size={16} aria-hidden="true" data-open={concludedOpen || undefined} /> Concluídos e cancelados ({concluded.length})
          </button>
          {concludedOpen ? <ul className="op-agenda__list">{concluded.map(row)}</ul> : null}
        </div>
      ) : null}
      {!groups.length && !(showConcluded && concluded.length) ? (
        <EmptyState align="start" title="Nada pendente na agenda">Todos os serviços deste filtro já foram concluídos ou cancelados.</EmptyState>
      ) : null}
    </section>
  )
}
```

Confira se `StatusBadge` aceita `className`: as props estendem `HTMLAttributes<HTMLSpanElement>`, então aceita.

- [ ] **Passo 4: `LandscapeTable.tsx`**

```tsx
import type { PassageiroServico, Reserva } from '../domain/types'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'
import { passengerList } from '../domain/passengers'
import { StatusBadge } from '@betinhos/ui'

/** Paisagem compacta (altura ≤ 560): tabela densa somente leitura; tocar na linha abre o sheet. */
export function LandscapeTable({ reservas, now, passageiros, onSelect }: {
  reservas: Reserva[]; now: Date; passageiros: Record<string, PassageiroServico[]>; onSelect: (id: string) => void
}) {
  return (
    <table className="op-landscape">
      <thead><tr><th>Saída</th><th>Motorista</th><th>Veículo</th><th>Trajeto</th><th>Solicitante</th><th>Passageiros</th><th>Status</th></tr></thead>
      <tbody>
        {reservas.map((r) => {
          const state = serviceState(r, now)
          return (
            <tr key={r.id} data-edge={state.kind === 'delayed' ? 'danger' : undefined}>
              <td><button type="button" className="op-landscape__open" onClick={() => onSelect(r.id)}>{r.saida ? formatHour(r.saida) : '--:--'} <span>#{r.codigo}</span></button></td>
              <td>{r.motorista || 'Sem motorista'}</td>
              <td>{r.veiculo || r.tipoVeiculo}</td>
              <td>{r.trajeto || r.destino}</td>
              <td>{r.solicitante}</td>
              <td>{passengerList(r, passageiros[r.id]).map((p) => p.nome).join(', ')}</td>
              <td><StatusBadge tone={statusTone(r.status)} dot>{r.status || 'Sem status'}</StatusBadge></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Passo 5: `operacional.css`** (todas as classes com prefixo `op-`, somente tokens)

```css
.op { display: grid; gap: var(--bt-space-3); }
.op-split { display: grid; gap: var(--bt-space-4); }
@media (min-width: 860px) {
  .op-split { grid-template-columns: minmax(0, 1fr) minmax(340px, 420px); align-items: start; }
  .op-split__detail { position: sticky; top: var(--bt-space-4); max-height: calc(100dvh - 32px); overflow-y: auto; }
}

.op-day { position: sticky; top: 0; z-index: var(--bt-z-index-sticky-header); display: grid; gap: var(--bt-space-2); padding: var(--bt-space-3); background-color: var(--bt-color-surface-neutral); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-lg); touch-action: pan-y; }
.op-day__row { display: flex; align-items: center; gap: var(--bt-space-1); }
.op-day__label { flex: 1; margin: 0; text-align: center; font-size: var(--bt-font-size-17); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-text-primary); }
.op-day__fresh { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-2); margin: 0; font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-day__fresh[data-warning] { color: var(--bt-color-warning); font-weight: var(--bt-font-weight-bold); }
.op-day__filters { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--bt-space-2); }
.op-day__refresh[data-spinning] svg { animation: op-spin 800ms linear infinite; }
@keyframes op-spin { to { transform: rotate(360deg); } }

.op-icon { display: grid; place-items: center; width: var(--bt-control-height-touch); height: var(--bt-control-height-touch); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); color: var(--bt-color-text-secondary); }
.op-press { transition: transform var(--bt-duration-fast) var(--bt-ease-out), background-color var(--bt-duration-fast) ease; }
.op-press:active, .op-icon:active { transform: scale(.97); }
.op-icon:focus-visible, .op-press:focus-visible, .op-agenda__toggle:focus-visible, .op-landscape__open:focus-visible { outline: 0; border-color: var(--bt-focus-border); box-shadow: var(--bt-focus-ring); }

.op-section-title { display: flex; align-items: center; gap: var(--bt-space-2); margin: 0 0 var(--bt-space-2); font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.8px; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.op-count { min-width: 22px; padding: 1px 7px; border-radius: var(--bt-radius-full); background-color: var(--bt-color-danger-soft); color: var(--bt-color-danger); text-align: center; letter-spacing: 0; }

.op-attention__list, .op-agenda__list { display: grid; gap: var(--bt-space-1-5); margin: 0; padding: 0; list-style: none; }
.op-attention__item { display: flex; align-items: stretch; gap: var(--bt-space-1-5); border: 1px solid var(--bt-color-border); border-left: var(--bt-border-width-severity) solid var(--bt-color-warning); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface); }
.op-attention__item[data-priority='1'], .op-attention__item[data-priority='2'] { border-left-color: var(--bt-color-danger); }
.op-attention__main { flex: 1; display: flex; gap: var(--bt-space-3); min-width: 0; padding: var(--bt-space-2) var(--bt-space-3); border: 0; background: transparent; text-align: left; font: inherit; color: inherit; }
.op-attention__time { font-weight: var(--bt-font-weight-extrabold); font-variant-numeric: tabular-nums; color: var(--bt-color-brand); }
.op-attention__text { display: grid; min-width: 0; font-size: var(--bt-font-size-13); }
.op-attention__text > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-attention__action { display: inline-flex; align-items: center; gap: var(--bt-space-1); min-height: var(--bt-control-height-touch); margin: var(--bt-space-1-5); padding: 0 var(--bt-space-3); border: 0; border-radius: var(--bt-radius-sm); background-color: var(--bt-color-action); color: var(--bt-color-white); font: inherit; font-weight: var(--bt-font-weight-bold); }

.op-agenda { display: grid; gap: var(--bt-space-3); }
.op-agenda__hour { position: sticky; top: 132px; z-index: var(--bt-z-index-content); margin: 0 0 var(--bt-space-1-5); padding: var(--bt-space-1) 0; background-color: var(--bt-color-canvas); font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: 0.8px; color: var(--bt-color-text-secondary); }
.op-row { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--bt-space-3); width: 100%; min-height: 56px; padding: var(--bt-space-2) var(--bt-space-3); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface-neutral); text-align: left; font: inherit; color: inherit; }
.op-row[data-edge]::before { content: ''; position: absolute; inset: 6px auto 6px 0; width: var(--bt-border-width-severity); border-radius: var(--bt-radius-full); }
.op-row[data-edge='danger']::before { background-color: var(--bt-color-danger); }
.op-row[data-edge='warning']::before { background-color: var(--bt-color-warning); }
.op-row[aria-current] { border-color: var(--bt-focus-border); background-color: var(--bt-color-action-soft); }
.op-row::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background-color: var(--bt-color-action-soft); opacity: 0; pointer-events: none; }
.op-row[data-changed]::after { animation: op-flash 600ms var(--bt-ease-out); }
@keyframes op-flash { from { opacity: 1; } to { opacity: 0; } }
.op-row__time { font-weight: var(--bt-font-weight-extrabold); font-variant-numeric: tabular-nums; color: var(--bt-color-brand); }
.op-row__main { display: grid; min-width: 0; gap: 1px; }
.op-row__line { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--bt-font-size-13); }
.op-row__muted { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-row__state { font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); }
.op-row__state--danger { color: var(--bt-color-danger); }
.op-row__state--warning { color: var(--bt-color-warning); }
.op-row__badge { transition: opacity var(--bt-duration-fast) ease; }
.op-row--skeleton { pointer-events: none; }
.op-agenda__toggle { display: inline-flex; align-items: center; gap: var(--bt-space-1); min-height: var(--bt-control-height-touch); border: 0; background: transparent; font: inherit; font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-secondary); }
.op-agenda__toggle svg { transition: transform var(--bt-duration-fast) var(--bt-ease-out); }
.op-agenda__toggle svg[data-open] { transform: rotate(180deg); }

.op-landscape { width: 100%; border-collapse: collapse; font-size: var(--bt-font-size-12); background-color: var(--bt-color-surface); }
.op-landscape th { position: sticky; top: 0; padding: var(--bt-space-1-5) var(--bt-space-2); background-color: var(--bt-color-surface-neutral); font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); text-align: left; text-transform: uppercase; color: var(--bt-color-text-secondary); }
.op-landscape td { padding: var(--bt-space-1-5) var(--bt-space-2); border-top: 1px solid var(--bt-color-border); vertical-align: top; }
.op-landscape tr[data-edge='danger'] td:first-child { box-shadow: inset var(--bt-border-width-severity) 0 0 var(--bt-color-danger); }
.op-landscape__open { min-height: 32px; border: 0; background: transparent; font: inherit; font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); }

@media (hover: hover) and (pointer: fine) {
  .op-row:hover { background-color: var(--bt-color-surface-soft); }
  .op-icon:hover { color: var(--bt-color-text-primary); }
}
```

O `top: 132px` do cabeçalho de hora é a altura aproximada do `op-day`. Ajuste o valor medindo no navegador na Tarefa 10.

- [ ] **Passo 6: verificar.** `pnpm typecheck`. Esperado: sem erros.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src/pages/operacional/components apps/shell/src/pages/operacional/operacional.css
git commit -m "Operacional: cabeçalho do dia, Precisa de você, agenda densa e tabela de paisagem" -m "Linhas de ~56 px agrupadas por hora com cabeçalho fixo, barra lateral e rótulo para atraso e saída em até 30 min, realce de 600 ms nas linhas alteradas, concluídos recolhidos; faixa de atenção com ação direta; troca de dia por setas e swipe sem animação." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 9: detalhe com ações e página completa na rota

**Arquivos:**
- Criar: `apps/shell/src/pages/operacional/components/ServiceDetail.tsx`, `apps/shell/src/pages/operacional/OperacionalPage.tsx`
- Modificar: `apps/shell/src/nav/menu.ts`, `apps/shell/src/nav/menu.test.ts`, `apps/shell/src/app/RouteLayout.tsx`

**Interfaces:**
- Consome: tudo das tarefas anteriores.
- Produz:
  - `ServiceDetail({ reserva, filhos, motoristas, reservas, now, statusOptions, busy, onStatus, onMotorista, onOpenReserva })`;
  - `ServiceActions` (rodapé);
  - `OperacionalPage({ host })`;
  - o item de menu `{ kind: 'page', id: 'operacional', page: 'operacional' }`.

- [ ] **Passo 1: teste do menu (falha).** Em `menu.test.ts`, acrescente:

```ts
it('Resumo Operacional é rota React do shell', () => {
  expect(findItem('operacional')?.item).toMatchObject({ kind: 'page', page: 'operacional', label: 'Resumo Operacional' })
  expect(findItem('new_telaoperacional')).toBeNull()
})
```

Rode `pnpm --filter @betinhos/shell exec vitest run src/nav`. Esperado: FAIL.

- [ ] **Passo 2: menu e rota.** Em `menu.ts`, troque o tipo `page: 'componentes'` por `page: 'componentes' | 'operacional'` e substitua `wr('Resumo Operacional', 'new_TelaOperacional')` por `{ kind: 'page', id: 'operacional', label: 'Resumo Operacional', page: 'operacional' }`. Se o shell mantiver um mapa de ícones por id (veja `apps/shell/src/app/AppShell.tsx`, que mudou no PR #3), mapeie `operacional` para o mesmo ícone que `new_telaoperacional` usava. Em `RouteLayout.tsx`:

```tsx
import { OperacionalPage } from '../pages/operacional/OperacionalPage'
// ...
if (item.kind === 'page') return item.page === 'operacional' ? <OperacionalPage host={host} /> : <ComponentsPage />
```

Rode os testes de `src/nav`. Esperado: PASS.

- [ ] **Passo 3: `ServiceDetail.tsx`**

```tsx
import type { ReactNode } from 'react'
import { ExternalLink, MessageCircle, Phone } from 'lucide-react'
import { Avatar, Button, Select, StatusBadge, buttonClassName } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import type { Motorista, PassageiroServico, Reserva } from '../domain/types'
import { conflictFor } from '../domain/conflicts'
import { passengerList } from '../domain/passengers'
import { telHref, whatsappHref } from '../domain/phone'
import { serviceState, statusTone } from '../domain/serviceState'
import { formatHour } from '../domain/time'

function ContactLinks({ phone, name }: { phone: string; name: string }) {
  const tel = telHref(phone), wa = whatsappHref(phone)
  if (!tel) return <span className="op-detail__nophone">Sem telefone cadastrado</span>
  return (
    <span className="op-detail__contact">
      <a className={buttonClassName({ variant: 'secondary', size: 'compact' })} href={tel} aria-label={`Ligar para ${name}`}><Phone size={16} aria-hidden="true" />Ligar</a>
      <a className={buttonClassName({ variant: 'secondary', size: 'compact' })} href={wa!} target="_blank" rel="noopener" aria-label={`WhatsApp para ${name}`}><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>
    </span>
  )
}

const Info = ({ label, children }: { label: string; children: ReactNode }) =>
  children ? <div className="op-detail__info"><dt>{label}</dt><dd>{children}</dd></div> : null

type Props = {
  reserva: Reserva; filhos: PassageiroServico[]; motoristas: Motorista[]; reservas: Reserva[]; now: Date
  statusOptions: ChoiceOption[]; busy: boolean
  onStatus: (option: ChoiceOption) => void; onMotorista: (motorista: Motorista | null) => void; onOpenReserva: () => void
}

/** Resumo + ações no topo (cabe na metade do sheet); detalhe completo abaixo. */
export function ServiceDetail({ reserva, filhos, motoristas, reservas, now, statusOptions, busy, onStatus, onMotorista, onOpenReserva }: Props) {
  const state = serviceState(reserva, now)
  const nextOf = (m: Motorista) => reservas.find((r) => r.motoristaId === m.id && r.id !== reserva.id && r.saida && r.saida > now)
  const motoristaOptions = motoristas.map((m) => {
    const conflict = conflictFor(reservas, m.id, reserva.saida, reserva.id)
    const next = nextOf(m)
    return {
      value: m.id, label: m.nome, search: m.apelido,
      subtitle: conflict?.saida ? `Conflito: saída às ${formatHour(conflict.saida)}` : next?.saida ? `Próximo às ${formatHour(next.saida)}` : 'Livre',
    }
  })

  return (
    <div className="op-detail">
      <div className="op-detail__summary">
        <StatusBadge tone={statusTone(reserva.status)} dot>{reserva.status || 'Sem status'}</StatusBadge>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        <span className="op-detail__meta">{reserva.tipoServico}{reserva.faturamento ? ` · ${reserva.faturamento}` : ''}</span>
      </div>
      <p className="op-detail__route"><strong>{reserva.saida ? formatHour(reserva.saida) : '--:--'}</strong> {reserva.trajeto || reserva.destino || 'Trajeto não informado'}</p>

      <div className="op-detail__controls">
        <label className="op-detail__control"><span>Status</span>
          <Select aria-label="Status do serviço" disabled={busy} options={statusOptions.map((o) => ({ value: String(o.value), label: o.label }))}
            value={reserva.statusValue == null ? null : String(reserva.statusValue)}
            onChange={(value) => { const option = statusOptions.find((o) => String(o.value) === value); if (option) onStatus(option) }} />
        </label>
        <label className="op-detail__control"><span>Motorista</span>
          <Select aria-label="Motorista do serviço" disabled={busy} searchable clearable placeholder="Sem motorista" options={motoristaOptions}
            value={reserva.motoristaId} onChange={(value) => onMotorista(motoristas.find((m) => m.id === value) ?? null)} />
        </label>
      </div>

      <dl className="op-detail__grid">
        <Info label="Motorista">{reserva.motorista ? <><Avatar name={reserva.motorista} size="sm" /> {reserva.motorista}</> : null}</Info>
        <Info label="Veículo">{reserva.veiculo || reserva.tipoVeiculo}</Info>
        <Info label="Cliente">{reserva.cliente}</Info>
        <Info label="Solicitante">{reserva.solicitante}</Info>
        <Info label="Endereço de saída">{reserva.enderecoSaida}</Info>
        <Info label="Destino">{reserva.destino}</Info>
        <Info label="Retorno previsto">{reserva.retorno ? formatHour(reserva.retorno) : ''}</Info>
      </dl>

      <section className="op-detail__pax" aria-label="Passageiros">
        <h3 className="op-section-title">Passageiros</h3>
        {passengerList(reserva, filhos).map((p) => (
          <div key={p.key} className="op-detail__paxrow">
            <Avatar name={p.nome || '?'} size="sm" />
            <div className="op-detail__paxinfo"><strong>{p.nome || 'Sem nome'}</strong>{p.endereco ? <span>{p.endereco}</span> : null}</div>
            <ContactLinks phone={p.telefone} name={p.nome} />
          </div>
        ))}
      </section>

      {reserva.obsOperacao ? <section><h3 className="op-section-title">Obs. de operação</h3><p className="op-detail__note">{reserva.obsOperacao}</p></section> : null}
      {reserva.obsInterna ? <section><h3 className="op-section-title">Observação interna</h3><p className="op-detail__note">{reserva.obsInterna}</p></section> : null}

      <Button variant="secondary" onClick={onOpenReserva}><ExternalLink size={16} aria-hidden="true" />Abrir reserva completa</Button>
    </div>
  )
}

/** Rodapé do sheet: contato com o motorista ao alcance do polegar. */
export function ServiceActions({ motorista }: { motorista: Motorista | undefined }) {
  return motorista ? <ContactLinks phone={motorista.celular} name={motorista.nome} /> : <span className="op-detail__nophone">Atribua um motorista para poder ligar</span>
}
```

Antes de compilar, confira em `Button.tsx` os nomes das variantes e dos tamanhos de `buttonClassName` (`secondary` e `compact`) e se `Button` aceita `variant`.

- [ ] **Passo 4: `OperacionalPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Sheet, Surface, ToastProvider, useToast } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import { CalendarX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { createSource } from './data/source'
import type { Motorista } from './domain/types'
import { buildAttention, type AttentionItem } from './domain/alerts'
import { groupByHour } from './domain/bands'
import { freshnessLabel } from './domain/refresh'
import { isCancelled } from './domain/serviceState'
import { addDays, dateKey, formatHour } from './domain/time'
import { telHref } from './domain/phone'
import { useOperacional } from './useOperacional'
import { useMedia } from './useMedia'
import { DayHeader } from './components/DayHeader'
import { AttentionList } from './components/AttentionList'
import { Agenda, AgendaSkeleton } from './components/Agenda'
import { LandscapeTable } from './components/LandscapeTable'
import { ServiceActions, ServiceDetail } from './components/ServiceDetail'
import './operacional.css'

export function OperacionalPage({ host }: { host: Host }) {
  return <ToastProvider><Operacional host={host} /></ToastProvider>
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(t) }, [])
  return now
}

function Operacional({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const now = useNow()
  const today = dateKey(now)
  const [dayKey, setDayKey] = useState(today)
  const [motoristaId, setMotoristaId] = useState<string | null>(null)
  const [showConcluded, setShowConcluded] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusOptions, setStatusOptions] = useState<ChoiceOption[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState<ChoiceOption | null>(null)
  const wide = useMedia('(min-width: 860px)')
  const landscape = useMedia('(orientation: landscape) and (max-height: 560px)')
  const op = useOperacional(source, dayKey)

  useEffect(() => { source.statusOptions().then(setStatusOptions).catch(() => setStatusOptions([])) }, [source])

  // Setas do teclado trocam o dia quando nada está aberto e o foco não está num campo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (selectedId && !wide) return
      if ((event.target as HTMLElement).closest('input, textarea, select, [role="listbox"], [contenteditable]')) return
      if (event.key === 'ArrowLeft') setDayKey((k) => addDays(k, -1))
      if (event.key === 'ArrowRight') setDayKey((k) => addDays(k, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, wide])

  const visible = useMemo(() => (motoristaId ? op.reservas.filter((r) => r.motoristaId === motoristaId) : op.reservas), [op.reservas, motoristaId])
  const attention = useMemo(() => buildAttention(visible, now), [visible, now])
  const { groups, concluded } = useMemo(() => groupByHour(visible, now), [visible, now])
  const byId = useMemo(() => new Map(op.reservas.map((r) => [r.id, r])), [op.reservas])
  const motoristas = op.data?.motoristas ?? []
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  // Desktop: painel sempre preenchido com o primeiro serviço, como no legado.
  const detailed = selected ?? (wide && !landscape ? visible[0] ?? null : null)

  async function changeStatus(option: ChoiceOption, confirmed = false) {
    if (!detailed) return
    if (isCancelled(option.label) && !confirmed) { setConfirmCancel(option); return }
    setBusy(true)
    try {
      await op.mutate(detailed.id, { statusValue: option.value, status: option.label }, () => source.setStatus(detailed.id, option.value))
      toast({ tone: 'success', message: `Status alterado para ${option.label}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível alterar o status. ${reason instanceof Error ? reason.message : ''} Tente de novo.` })
    } finally { setBusy(false) }
  }

  async function changeMotorista(motorista: Motorista | null) {
    if (!detailed) return
    setBusy(true)
    try {
      await op.mutate(detailed.id, { motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '' }, () => source.setMotorista(detailed.id, motorista?.id ?? null))
      toast({ tone: 'success', message: motorista ? `${motorista.nome} atribuído ao serviço #${detailed.codigo}.` : `Motorista removido do serviço #${detailed.codigo}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível trocar o motorista. ${reason instanceof Error ? reason.message : ''} Tente de novo.` })
    } finally { setBusy(false) }
  }

  function onAttentionAction(item: AttentionItem) {
    const r = byId.get(item.reservaId)
    const phone = r && motoristas.find((m) => m.id === r.motoristaId)?.celular
    if (item.action === 'ligar' && phone && telHref(phone)) { window.location.href = telHref(phone)!; return }
    setSelectedId(item.reservaId) // atribuir e ver abrem o detalhe, onde ficam o seletor e o contexto
  }

  const freshness = op.refreshFailed && op.lastUpdated
    ? `Não foi possível atualizar · última atualização ${formatHour(op.lastUpdated)}`
    : freshnessLabel(op.lastUpdated, now)

  const detail = detailed ? (
    <ServiceDetail reserva={detailed} filhos={op.data?.passageiros[detailed.id] ?? []} motoristas={motoristas} reservas={op.reservas} now={now}
      statusOptions={statusOptions} busy={busy} onStatus={(o) => void changeStatus(o)} onMotorista={(m) => void changeMotorista(m)} onOpenReserva={() => source.openReserva(detailed.id)} />
  ) : null

  let body
  if (op.loading && !op.data) body = <AgendaSkeleton />
  else if (op.error) body = <Alert tone="danger" title="Não foi possível carregar os serviços">{op.error} <Button variant="secondary" onClick={() => void op.refresh()}>Tentar de novo</Button></Alert>
  else if (!op.reservas.length) body = <EmptyState align="start" icon={<CalendarX size={36} />} title="Nenhum serviço para este dia" action={dayKey !== today ? <Button onClick={() => setDayKey(today)}>Ir para hoje</Button> : undefined}>Use as setas para ver outro dia.</EmptyState>
  else if (!visible.length) body = <EmptyState align="start" title="Nenhum serviço deste motorista neste dia" action={<Button variant="secondary" onClick={() => setMotoristaId(null)}>Limpar filtro</Button>} />
  else if (landscape) body = <LandscapeTable reservas={visible} now={now} passageiros={op.data?.passageiros ?? {}} onSelect={setSelectedId} />
  else body = (
    <>
      <AttentionList items={attention} byId={byId} onOpen={setSelectedId} onAction={onAttentionAction} />
      <Agenda groups={groups} concluded={concluded} showConcluded={showConcluded} now={now} selectedId={detailed?.id ?? null} changed={op.changed} onSelect={setSelectedId} />
    </>
  )

  return (
    <PageLayout eyebrow="Operacional" title="Resumo Operacional">
      <div className="op">
        <DayHeader dayKey={dayKey} today={today} onChangeDay={(k) => { setDayKey(k); setSelectedId(null) }}
          freshness={freshness} freshnessWarning={op.refreshFailed} refreshing={op.refreshing} onRefresh={() => void op.refresh()} total={visible.length}
          motoristas={motoristas} motoristaId={motoristaId} onMotorista={setMotoristaId} showConcluded={showConcluded} onShowConcluded={setShowConcluded} mock={source.mock} />
        {op.data?.queryMode === 'safe' ? <Alert tone="info">Alguns campos não estão disponíveis; mostrando a versão reduzida.</Alert> : null}
        <div className="op-split">
          <div>{body}</div>
          {wide && !landscape && detail ? <Surface className="op-split__detail">{detail}</Surface> : null}
        </div>
      </div>

      {!wide || landscape ? (
        <Sheet open={Boolean(selected)} onClose={() => setSelectedId(null)} eyebrow={selected ? `Serviço #${selected.codigo}` : undefined}
          title={selected ? (selected.motorista || 'Sem motorista') : ''} footer={selected ? <ServiceActions motorista={motoristas.find((m) => m.id === selected.motoristaId)} /> : undefined}>
          {detail}
        </Sheet>
      ) : null}

      <Dialog open={Boolean(confirmCancel)} onClose={() => setConfirmCancel(null)} tone="danger" title={`Cancelar o serviço #${detailed?.codigo ?? ''}?`}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmCancel(null)}>Manter serviço</Button>
          <Button variant="danger" onClick={() => { const option = confirmCancel!; setConfirmCancel(null); void changeStatus(option, true) }}>Cancelar serviço</Button>
        </>}>
        O motorista e o cliente podem já estar contando com este serviço.
      </Dialog>
    </PageLayout>
  )
}
```

Antes de compilar, confira em `Alert.tsx` as props reais de `Alert` (`tone`, `title`) e as de `EmptyState`.

- [ ] **Passo 5: CSS do detalhe.** Acrescente em `operacional.css`:

```css
.op-detail { display: grid; gap: var(--bt-space-3); }
.op-detail__summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--bt-space-1-5); }
.op-detail__meta { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-detail__route { margin: 0; font-size: var(--bt-font-size-14); }
.op-detail__controls { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bt-space-2); }
.op-detail__control { display: grid; gap: var(--bt-space-1); font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-text-secondary); }
.op-detail__grid { display: grid; gap: var(--bt-space-2); margin: 0; }
.op-detail__info { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--bt-space-2); padding: var(--bt-space-2); border-radius: var(--bt-radius-sm); background-color: var(--bt-color-surface-neutral); font-size: var(--bt-font-size-13); }
.op-detail__info dt { font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); text-transform: uppercase; color: var(--bt-color-text-secondary); }
.op-detail__info dd { display: flex; align-items: center; gap: var(--bt-space-1-5); margin: 0; overflow-wrap: anywhere; }
.op-detail__pax { display: grid; gap: var(--bt-space-1-5); }
.op-detail__paxrow { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--bt-space-2); padding: var(--bt-space-2); border: 1px solid var(--bt-color-border); border-radius: var(--bt-radius-md); background-color: var(--bt-color-surface-neutral); }
.op-detail__paxrow > .op-detail__contact, .op-detail__paxrow > .op-detail__nophone { grid-column: 1 / -1; }
.op-detail__paxinfo { display: grid; min-width: 0; font-size: var(--bt-font-size-13); }
.op-detail__paxinfo span { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-detail__contact { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bt-space-2); }
.op-detail__contact a { justify-content: center; min-height: var(--bt-control-height-touch); }
.op-detail__nophone { font-size: var(--bt-font-size-12); color: var(--bt-color-text-secondary); }
.op-detail__note { margin: 0; white-space: pre-wrap; font-size: var(--bt-font-size-13); }
@media (max-width: 380px) { .op-detail__controls { grid-template-columns: 1fr; } .op-detail__info { grid-template-columns: 1fr; } }
```

- [ ] **Passo 6: verificar.** `pnpm test` e `pnpm typecheck`. Esperado: PASS e nenhum erro.

- [ ] **Passo 7: commit**

```bash
git add apps/shell/src
git commit -m "Operacional: detalhe com ações e rota React no lugar do new_TelaOperacional" -m "Troca o item do menu pela rota #/operacional. Detalhe com status (opções reais da metadata, confirmação ao cancelar), troca de motorista com aviso de conflito, ligar e WhatsApp para motorista e passageiros e abrir a reserva completa; sheet no celular e painel fixo no desktop; toasts de sucesso e erro com rollback." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: verificação no navegador (dados de exemplo)

**Arquivos:** só ajustes de CSS ou componentes que a verificação apontar.

- [ ] **Passo 1:** iniciar o shell com `preview_start` (configuração do `pnpm dev` em `.claude/launch.json`, porta 36472; crie a configuração se não existir) e navegar para `http://localhost:36472/#/operacional`.
- [ ] **Passo 2: celular, 375 × 812.**
  - Faixa "Precisa de você" com itens P1, P2 e P3.
  - Linhas de ~56 px.
  - Cabeçalho de hora fixo logo abaixo do `op-day`; corrija o `top` se ele sobrepuser o cabeçalho.
  - Toque numa linha abre o sheet na metade, com o rodapé de contato visível.
  - Arrastar para cima expande o sheet.
  - Arrasto rápido para baixo fecha o sheet, e o foco volta para a linha.
  - Status otimista seguido de toast.
  - Trocar para Cancelado abre o Dialog.
  - O motorista mostra "Conflito: saída às…".
  - Setas trocam o dia sem animação; um dia vazio mostra o EmptyState com "Ir para hoje".
- [ ] **Passo 3: desktop, 1280 × 800.**
  - Painel de detalhe fixo à direita, já preenchido.
  - Teclas ← e → trocam o dia.
  - Hover só com mouse.
  - Foco visível em todos os controles.
- [ ] **Passo 4: paisagem, 812 × 375.** Tabela compacta; tocar numa linha abre o sheet.
- [ ] **Passo 5: atualização.** Clicar em Atualizar gira o ícone e muda o frescor para "Atualizado agora". Para conferir o realce, altere um status pelo sheet e atualize.
- [ ] **Passo 6: redução de movimento.** Emule `prefers-reduced-motion`: o sheet entra só com opacidade.
- [ ] **Passo 7:** console sem erros (`read_console_messages`). Tire screenshots de celular, desktop e paisagem e envie ao usuário.
- [ ] **Passo 8: commit dos ajustes**

```bash
git add apps/shell packages/ui
git commit -m "Operacional: ajustes da verificação no navegador" -m "Correções de layout e interação encontradas ao testar retrato 375 px, desktop 1280 px e paisagem 812×375 com dados de exemplo." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: levantamento dos flows (DEV, somente leitura)

- [ ] **Passo 1:** com o MCP `Dataverse_DEV`, liste os flows de nuvem que disparam em `cr40f_reservadeveculos`. Consulte `workflow` com `category eq 5`, lendo `name`, `clientdata` e `statecode`, e filtre no resultado os `clientdata` que contenham `cr40f_reservadeveculos`.
- [ ] **Passo 2:** em cada flow ativo com gatilho de atualização, anote se ele filtra por `cr40f_status` ou `cr40f_motorista` (`filteringattributes` no `clientdata`) e o que faz: e-mail, WhatsApp, faturamento, voucher, gravação em outra tabela.
- [ ] **Passo 3:** registre a tabela "flow → gatilho → efeito" no texto da PR e apresente ao usuário. **Pare aqui** e peça o ok explícito para publicar em DEV. Se algum efeito for indesejado numa mudança feita pela tela (por exemplo, aviso duplicado ao motorista), reporte antes de seguir.

---

### Tarefa 12: publicação em DEV (só com o ok da Tarefa 11)

- [ ] **Passo 1:** `git status`, `git diff main --stat` e `pnpm test`. Confira que não há `.env`, segredos ou lockfile alterado fora do escopo.
- [ ] **Passo 2:** `pnpm push`. Isso incrementa o PATCH em `apps/shell/package.json`, compila e publica `cr40f_SistemaBetinhos.html` em DEV.
- [ ] **Passo 3:** abra o Sistema Betinhos em DEV no navegador interno e entre em `#/operacional`. Confira três coisas:
  - os dados reais carregam (sem selo "Dados de exemplo");
  - as opções de status vêm da metadata;
  - uma mudança de status num registro de teste combinado com o usuário grava e aparece após "Atualizar".

  Não altere reservas reais sem o usuário indicar qual registro usar.
- [ ] **Passo 4:** commit `Build v0.0.X publicado em DEV`, push da branch e PR para a `main` com a tabela de flows, as screenshots e a versão publicada (`v0.0.X · dd/mm/aaaa HH:mm`). Informe a versão ao usuário para conferir no celular.
