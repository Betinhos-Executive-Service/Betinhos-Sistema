# Escala FDS simplificada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as 4 abas da Escala FDS por uma tela única: motoristas com Plantão/Trabalha no sábado e domingo e ausências em chips, com formulário curto.

**Architecture:** React 19 + Vite, WebResource standalone (`cr40f_EscalaFDS.html`). Regras puras em `src/domain/escala.ts` (testadas com vitest), acesso ao Dataverse em `src/data/source.ts` (com fonte de exemplo em localhost), UI em `src/App.tsx` + dois componentes. Salvamento automático por lote de pendências, como hoje.

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, Vitest 3, `@betinhos/ui`, `@betinhos/dataverse`, lucide-react, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-escala-fds-simples-design.md`

## Global Constraints

- Diretório de trabalho: `C:\Users\mendo\Desktop\vscode\Sistema Betinhos\.worktrees\escala-fds-semana`, branch `feat/escala-fds-simples`. Comandos `pnpm` rodam em `apps/escala-fds`.
- Design System Betinhos (`C:\Users\mendo\Desktop\vscode\DESIGN_SYSTEM.md`): só tokens `--bt-*`; sem gradiente; tema claro; listas/campos em `#FCFCFB` (`--bt-color-surface-neutral`); azul só em foco, seleção, status, ícones e ações; ícones Lucide; texto mínimo 11 px; alvos de toque 44 px nos botões de situação.
- Sem mudança de schema; não editar `schema/provision-escala-fds.ps1`, `public/WebResources/cr40f_escalafds_commands.js` nem `packages/ui`.
- Valores Dataverse: `cr40f_escalafds.cr40f_status` Trabalha = 100000000, Plantão = 100000001 (Folga 100000002 e Indisponível 100000003 = desmarcado); `cr40f_compromissofds.cr40f_motivo` Médico 100000000, Pessoal 100000001, Férias 100000002, Outro 100000003.
- Textos da UI em pt-BR com acentos. Copy: "Ausência", "Registrar ausência", "Outro período", "Dia todo", "Excluir esta ausência?", "Excluir o período inteiro?".
- Mensagens de commit em português, detalhadas, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `pnpm typecheck` só volta a passar ao fim da Task 5 (as tasks 1–2 mudam tipos usados pelos componentes antigos). Até lá, a verificação de cada task é `pnpm test`.
- Publicação (`pnpm push`) só com OK explícito do Renan.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/domain/escala.ts` (reescrito) | tipos, semana, situação, ausências, textos de chip, pendências e plano de gravação |
| `src/domain/escala.test.ts` (reescrito) | testes das regras puras |
| `src/data/source.ts` (alterado) | janela da semana, leitura/gravação Dataverse, fonte de exemplo |
| `src/data/source.test.ts` (novo) | `janelaPara`, `mapMarcacao`, payload de marcação |
| `src/components/AusenciaForm.tsx` (novo) | formulário curto de ausência |
| `src/components/EscalaLista.tsx` (novo) | linhas de motorista, botões Sáb/Dom, chips e exclusão |
| `src/App.tsx` (reescrito) | cabeçalho da semana, carga, salvamento automático |
| `src/styles.css` (alterado) | estilos da tela única |
| Removidos | `EscalaTab.tsx`, `SemanaTab.tsx`, `AgendaTab.tsx`, `PadroesTab.tsx`, `CompromissoForm.tsx` |

---

### Task 1: Regras puras (domínio)

**Files:**
- Modify (reescrever): `apps/escala-fds/src/domain/escala.ts`
- Test (reescrever): `apps/escala-fds/src/domain/escala.test.ts`

**Interfaces:**
- Produces (usados pelas tasks 2–5):
  - `type Situacao = 'plantao' | 'trabalha'`; `type Motivo = 'medico' | 'pessoal' | 'ferias' | 'outro'`
  - `type Motorista = { id: string; nome: string }`
  - `type Marcacao = { id: string | null; motoristaId: string; data: string; situacao: Situacao | null }`
  - `type Compromisso = { id: string | null; motoristaId: string; inicio: string; fim: string; diaInteiro: boolean; motivo: Motivo; observacao: string; registradoEm: string | null }`
  - `type Dados = { motoristas: Motorista[]; marcacoes: Marcacao[]; compromissos: Compromisso[] }`
  - `type Pendencias = { marcacoes: Map<string, Situacao | null>; novos: Compromisso[]; excluidos: Set<string> }`
  - `type Operacao` com `tipo`: `'criarMarcacao' | 'atualizarMarcacao' | 'excluirMarcacao' | 'criarCompromisso' | 'excluirCompromisso'`
  - `type View = { motoristas: Motorista[]; marcacoes: Map<string, Marcacao>; compromissos: Compromisso[] }`
  - Constantes: `SITUACAO_LABEL`, `MOTIVO_LABEL`, `SITUACAO_VALUE`, `MOTIVO_VALUE`; funções `situacaoFromValue`, `motivoFromValue`
  - Datas: `toKey`, `toLocal`, `fromKey`, `addDays`, `formatDay`, `formatDate`, `formatWeekday`, `diaCurto`, `semanaDe`, `diasDaSemana`, `semanaLabel`, `dateRange`, `recordKey`
  - Regras: `situacaoDoDia(motoristaId, data, marcacoes)`, `compromissosDoDia`, `ausenciasDaSemana`, `chipAusencia`, `ultrapassaSemana`, `ausenciasDosDias(a: NovaAusencia)`
  - Pendências: `semPendencias`, `totalPendencias`, `clonarPendencias`, `aplicarPendencias`, `planSave`, `descontarSalvas`

- [ ] **Step 1: Escrever os testes (substituir o arquivo inteiro)**

`apps/escala-fds/src/domain/escala.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  aplicarPendencias, ausenciasDaSemana, ausenciasDosDias, chipAusencia, compromissosDoDia, descontarSalvas, diasDaSemana,
  planSave, recordKey, semPendencias, semanaDe, semanaLabel, situacaoDoDia, ultrapassaSemana,
  type Compromisso, type Dados, type Marcacao,
} from './escala'

const marc = (motoristaId: string, data: string, situacao: Marcacao['situacao']): Marcacao => ({ id: `${motoristaId}-${data}`, motoristaId, data, situacao })
const mapa = (list: Marcacao[]) => new Map(list.map((m) => [recordKey(m.motoristaId, m.data), m]))
const comp = (inicio: string, fim: string, diaInteiro = false, motivo: Compromisso['motivo'] = 'medico'): Compromisso =>
  ({ id: null, motoristaId: 'd', inicio, fim, diaInteiro, motivo, observacao: '', registradoEm: null })
const nova = { motoristaId: 'd', horaInicio: '08:00', horaFim: '12:00', motivo: 'medico' as const, observacao: '  Exame  ' }

describe('semana', () => {
  it('começa na segunda; domingo pertence à semana da segunda anterior', () => {
    expect(semanaDe(new Date(2026, 9, 13))).toBe('2026-10-12') // terça
    expect(semanaDe(new Date(2026, 9, 12))).toBe('2026-10-12') // segunda
    expect(semanaDe(new Date(2026, 9, 18))).toBe('2026-10-12') // domingo
  })

  it('lista os 7 dias e atravessa a virada de mês', () => {
    expect(diasDaSemana('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(semanaLabel('2026-10-12')).toBe('12/10 a 18/10')
  })
})

describe('situacaoDoDia', () => {
  it('usa a marcação do dia; Folga legada (null) e sem registro ficam desmarcados', () => {
    const marcacoes = mapa([marc('d', '2026-10-17', 'plantao'), marc('d', '2026-10-18', null)])
    expect(situacaoDoDia('d', '2026-10-17', marcacoes)).toBe('plantao')
    expect(situacaoDoDia('d', '2026-10-18', marcacoes)).toBeNull()
    expect(situacaoDoDia('b', '2026-10-17', marcacoes)).toBeNull()
  })
})

describe('compromissosDoDia', () => {
  it('descreve o trecho do dia ocupado', () => {
    const textos = (c: Compromisso, data: string) => compromissosDoDia([c], data).map((r) => r.texto)
    expect(textos(comp('2026-10-10T00:00', '2026-10-10T12:00'), '2026-10-10')).toEqual(['Indisponível até 12h'])
    expect(textos(comp('2026-10-10T14:30', '2026-10-10T23:59'), '2026-10-10')).toEqual(['Indisponível a partir das 14h30'])
    expect(textos(comp('2026-10-07T10:00', '2026-10-07T12:00'), '2026-10-07')).toEqual(['Indisponível das 10h às 12h'])
    expect(textos(comp('2026-10-07T00:00', '2026-10-07T23:59', true), '2026-10-08')).toEqual([])
  })
})

describe('ausenciasDosDias', () => {
  it('dia todo junta dias seguidos e separa os soltos, em ordem', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-10-16', '2026-10-12', '2026-10-13', '2026-10-14'], diaInteiro: true })
    expect(lista.map((c) => [c.inicio, c.fim])).toEqual([['2026-10-12T00:00', '2026-10-14T23:59'], ['2026-10-16T00:00', '2026-10-16T23:59']])
    expect(lista[0]).toMatchObject({ id: null, motoristaId: 'd', diaInteiro: true, motivo: 'medico', observacao: 'Exame', registradoEm: null })
  })

  it('dia todo junta dias seguidos na virada do mês', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-09-30', '2026-10-01'], diaInteiro: true })
    expect(lista.map((c) => [c.inicio, c.fim])).toEqual([['2026-09-30T00:00', '2026-10-01T23:59']])
  })

  it('com horário, um registro por dia', () => {
    const lista = ausenciasDosDias({ ...nova, dias: ['2026-10-12', '2026-10-13'], diaInteiro: false })
    expect(lista.map((c) => [c.inicio, c.fim, c.diaInteiro])).toEqual([['2026-10-12T08:00', '2026-10-12T12:00', false], ['2026-10-13T08:00', '2026-10-13T12:00', false]])
  })
})

describe('chips da semana', () => {
  const segunda = '2026-10-12'

  it('filtra o que toca a semana, em ordem de início', () => {
    const antes = comp('2026-10-05T00:00', '2026-10-05T23:59', true)
    const ferias = comp('2026-10-09T00:00', '2026-10-13T23:59', true, 'ferias')
    const sabado = comp('2026-10-17T00:00', '2026-10-17T12:00')
    expect(ausenciasDaSemana([sabado, antes, ferias], segunda)).toEqual([ferias, sabado])
  })

  it('texto curto do chip', () => {
    expect(chipAusencia(comp('2026-10-13T00:00', '2026-10-13T23:59', true), segunda)).toBe('Ter · dia todo · Médico')
    expect(chipAusencia(comp('2026-10-17T00:00', '2026-10-17T12:00', false, 'pessoal'), segunda)).toBe('Sáb · até 12h · Pessoal')
    expect(chipAusencia(comp('2026-10-13T00:00', '2026-10-15T23:59', true), segunda)).toBe('Ter a Qui · Médico')
    expect(chipAusencia(comp('2026-10-16T00:00', '2026-10-25T23:59', true, 'ferias'), segunda)).toBe('Férias · 16/10 a 25/10')
  })

  it('avisa quando o registro passa da semana', () => {
    expect(ultrapassaSemana(comp('2026-10-16T00:00', '2026-10-25T23:59', true), segunda)).toBe(true)
    expect(ultrapassaSemana(comp('2026-10-13T00:00', '2026-10-13T23:59', true), segunda)).toBe(false)
  })
})

describe('pendências', () => {
  const dados: Dados = {
    motoristas: [{ id: 'd', nome: 'Danilo' }, { id: 'b', nome: 'Bruno' }],
    marcacoes: [marc('b', '2026-10-17', 'trabalha'), marc('d', '2026-10-18', null)],
    compromissos: [{ ...comp('2026-10-17T00:00', '2026-10-17T12:00'), id: 'c1' }],
  }

  it('aplica marcações e ausências para exibição', () => {
    const p = semPendencias()
    p.marcacoes.set('b|2026-10-17', null)
    p.marcacoes.set('d|2026-10-17', 'plantao')
    p.excluidos.add('c1')
    const view = aplicarPendencias(dados, p)
    expect(situacaoDoDia('b', '2026-10-17', view.marcacoes)).toBeNull()
    expect(situacaoDoDia('d', '2026-10-17', view.marcacoes)).toBe('plantao')
    expect(view.compromissos).toEqual([])
  })

  it('gera operações: criar, atualizar Folga legada, excluir ao desmarcar; ignora o que não muda', () => {
    const p = semPendencias()
    p.marcacoes.set('d|2026-10-17', 'plantao') // sem registro: cria
    p.marcacoes.set('d|2026-10-18', 'trabalha') // Folga legada: atualiza o mesmo registro
    p.marcacoes.set('b|2026-10-17', null) // desmarcar: exclui
    p.marcacoes.set('b|2026-10-18', null) // nada salvo: ignora
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    p.excluidos.add('c1')
    const ops = planSave(dados, p)
    expect(ops.map((o) => o.tipo)).toEqual(['criarMarcacao', 'atualizarMarcacao', 'excluirMarcacao', 'criarCompromisso', 'excluirCompromisso'])
    expect(ops[1]).toMatchObject({ marcacao: { id: 'd-2026-10-18', situacao: 'trabalha' } })
    expect(ops[2]).toEqual({ tipo: 'excluirMarcacao', id: 'b-2026-10-17' })
  })
})

describe('descontarSalvas', () => {
  const dados: Dados = { motoristas: [], marcacoes: [marc('b', '2026-10-17', 'trabalha')], compromissos: [] }
  const lote = () => {
    const p = semPendencias()
    p.marcacoes.set('d|2026-10-17', 'plantao')
    p.novos.push(comp('2026-10-14T09:00', '2026-10-14T11:00'))
    return p
  }

  it('tira o lote gravado e preserva o que mudou durante a gravação', () => {
    const salvo = lote()
    const atual = descontarSalvas(salvo, salvo, dados)
    expect(atual.marcacoes.size + atual.novos.length).toBe(0)
    const mudou = lote()
    const durante = { ...mudou, marcacoes: new Map([['d|2026-10-17', 'trabalha' as const]]) }
    expect([...descontarSalvas(durante, mudou, dados).marcacoes]).toEqual([['d|2026-10-17', 'trabalha']])
  })

  it('na falha, mantém só o que não foi gravado', () => {
    const p = lote()
    const ops = planSave(dados, p)
    const atual = descontarSalvas(p, p, dados, ops.slice(0, 1))
    expect(atual.marcacoes.size).toBe(0)
    expect(atual.novos).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test` (em `apps/escala-fds`)
Expected: FAIL — `semanaDe`, `ausenciasDosDias`, `chipAusencia` etc. não existem.

- [ ] **Step 3: Reescrever `apps/escala-fds/src/domain/escala.ts` (arquivo inteiro)**

```ts
/** Regras puras da escala: semana, situação de sábado/domingo e ausências. */

/** Plantão = dia de trabalho escalado; Trabalha = se colocou disponível (sem hora extra). Sem marcação = folga. */
export type Situacao = 'plantao' | 'trabalha'
export type Motivo = 'medico' | 'pessoal' | 'ferias' | 'outro'

/** Só motoristas com status Ativo. */
export type Motorista = { id: string; nome: string }

/** Linha de cr40f_escalafds. `situacao: null` = registro antigo de Folga/Indisponível, exibido desmarcado. */
export type Marcacao = { id: string | null; motoristaId: string; data: string; situacao: Situacao | null }

/** Ausência (cr40f_compromissofds). `inicio`/`fim` em horário local `aaaa-mm-ddTHH:mm`. */
export type Compromisso = {
  id: string | null
  motoristaId: string
  inicio: string
  fim: string
  diaInteiro: boolean
  motivo: Motivo
  observacao: string
  registradoEm: string | null
}

export const SITUACAO_LABEL: Record<Situacao, string> = { plantao: 'Plantão', trabalha: 'Trabalha' }
export const MOTIVO_LABEL: Record<Motivo, string> = { medico: 'Médico', pessoal: 'Pessoal', ferias: 'Férias', outro: 'Outro' }

/** Valores das choices no Dataverse. Folga (100000002) e Indisponível (100000003) existem no choice, mas não são mais gravados. */
export const SITUACAO_VALUE: Record<Situacao, number> = { trabalha: 100000000, plantao: 100000001 }
export const MOTIVO_VALUE: Record<Motivo, number> = { medico: 100000000, pessoal: 100000001, ferias: 100000002, outro: 100000003 }

const invert = <K extends string>(map: Record<K, number>) => new Map(Object.entries(map).map(([key, value]) => [value as number, key as K]))
const SITUACAO_BY_VALUE = invert(SITUACAO_VALUE)
const MOTIVO_BY_VALUE = invert(MOTIVO_VALUE)
export const situacaoFromValue = (value: unknown) => (typeof value === 'number' ? SITUACAO_BY_VALUE.get(value) ?? null : null)
export const motivoFromValue = (value: unknown) => (typeof value === 'number' ? MOTIVO_BY_VALUE.get(value) ?? null : null)

// Datas `aaaa-mm-dd` no calendário local (America/Sao_Paulo no uso real).
const pad = (n: number) => String(n).padStart(2, '0')
export const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const toLocal = (date: Date) => `${toKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
export const fromKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (key: string, days: number) => { const date = fromKey(key); date.setDate(date.getDate() + days); return toKey(date) }

const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const longFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
export const formatDay = (key: string) => dayFormat.format(fromKey(key))
export const formatDate = (key: string) => longFormat.format(fromKey(key))
export const formatWeekday = (key: string) => weekdayFormat.format(fromKey(key)).replace('.', '')
/** "Seg", "Ter", "Sáb". */
export const diaCurto = (key: string) => { const w = formatWeekday(key); return `${w.charAt(0).toUpperCase()}${w.slice(1)}` }
const hora = (hhmm: string) => (hhmm.endsWith(':00') ? `${Number(hhmm.slice(0, 2))}h` : hhmm.replace(':', 'h'))

/** Segunda-feira da semana de `date`; domingo pertence à semana que começou na segunda anterior. */
export function semanaDe(date: Date) {
  const day = date.getDay()
  return addDays(toKey(date), day === 0 ? -6 : 1 - day)
}
export const diasDaSemana = (segunda: string) => [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(segunda, d))
export const semanaLabel = (segunda: string) => `${formatDay(segunda)} a ${formatDay(addDays(segunda, 6))}`

/** Dias de `inicio` a `fim` (inclusive); limitado a 62 dias para evitar lote acidental. */
export function dateRange(inicio: string, fim: string) {
  const days: string[] = []
  for (let key = inicio; key <= fim && days.length < 62; key = addDays(key, 1)) days.push(key)
  return days
}

export const recordKey = (motoristaId: string, data: string) => `${motoristaId}|${data}`

export const situacaoDoDia = (motoristaId: string, data: string, marcacoes: Map<string, Marcacao>) =>
  marcacoes.get(recordKey(motoristaId, data))?.situacao ?? null

/** Ausências que ocupam alguma parte do dia `data`, com o texto do trecho ("Indisponível até 12h"). */
export function compromissosDoDia(compromissos: Iterable<Compromisso>, data: string) {
  const result: { compromisso: Compromisso; texto: string; diaTodo: boolean }[] = []
  for (const c of compromissos) {
    const inicioDia = c.inicio.slice(0, 10)
    const fimDia = c.fim.slice(0, 10)
    if (data < inicioDia || data > fimDia) continue
    const de = c.diaInteiro || inicioDia < data ? '00:00' : c.inicio.slice(11, 16)
    const ate = c.diaInteiro || fimDia > data ? '24:00' : c.fim.slice(11, 16)
    const diaTodo = de === '00:00' && (ate === '24:00' || ate === '23:59')
    const texto = diaTodo ? 'Indisponível o dia todo'
      : de === '00:00' ? `Indisponível até ${hora(ate)}`
        : ate === '24:00' || ate === '23:59' ? `Indisponível a partir das ${hora(de)}`
          : `Indisponível das ${hora(de)} às ${hora(ate)}`
    result.push({ compromisso: c, texto, diaTodo })
  }
  return result.sort((a, b) => Number(b.diaTodo) - Number(a.diaTodo) || a.compromisso.inicio.localeCompare(b.compromisso.inicio))
}

/** Ausências que tocam a semana de `segunda`, em ordem de início. */
export function ausenciasDaSemana(compromissos: Compromisso[], segunda: string) {
  const domingo = addDays(segunda, 6)
  return compromissos.filter((c) => c.inicio.slice(0, 10) <= domingo && c.fim.slice(0, 10) >= segunda).sort((a, b) => a.inicio.localeCompare(b.inicio))
}

export const ultrapassaSemana = (c: Compromisso, segunda: string) => c.inicio.slice(0, 10) < segunda || c.fim.slice(0, 10) > addDays(segunda, 6)

/** Texto do chip: "Ter · dia todo · Médico", "Sáb · até 12h · Pessoal", "Ter a Qui · Médico", "Férias · 16/10 a 25/10". */
export function chipAusencia(c: Compromisso, segunda: string) {
  const de = c.inicio.slice(0, 10)
  const ate = c.fim.slice(0, 10)
  const motivo = MOTIVO_LABEL[c.motivo]
  if (ultrapassaSemana(c, segunda)) return `${motivo} · ${formatDay(de)} a ${formatDay(ate)}`
  if (de === ate) {
    const [trecho] = compromissosDoDia([c], de)
    return `${diaCurto(de)} · ${trecho.diaTodo ? 'dia todo' : trecho.texto.replace('Indisponível ', '')} · ${motivo}`
  }
  return c.diaInteiro ? `${diaCurto(de)} a ${diaCurto(ate)} · ${motivo}`
    : `${diaCurto(de)} ${c.inicio.slice(11, 16)} a ${diaCurto(ate)} ${c.fim.slice(11, 16)} · ${motivo}`
}

export type NovaAusencia = { motoristaId: string; dias: string[]; diaInteiro: boolean; horaInicio: string; horaFim: string; motivo: Motivo; observacao: string }

/** Registros a gravar: dia todo junta dias seguidos num registro; com horário, um registro por dia. */
export function ausenciasDosDias(a: NovaAusencia): Compromisso[] {
  const dias = [...new Set(a.dias)].sort()
  const base = { id: null, motoristaId: a.motoristaId, diaInteiro: a.diaInteiro, motivo: a.motivo, observacao: a.observacao.trim(), registradoEm: null }
  if (!a.diaInteiro) return dias.map((d) => ({ ...base, inicio: `${d}T${a.horaInicio}`, fim: `${d}T${a.horaFim}` }))
  const blocos: string[][] = []
  for (const d of dias) {
    const ultimo = blocos[blocos.length - 1]
    if (ultimo && addDays(ultimo[ultimo.length - 1], 1) === d) ultimo.push(d)
    else blocos.push([d])
  }
  return blocos.map((b) => ({ ...base, inicio: `${b[0]}T00:00`, fim: `${b[b.length - 1]}T23:59` }))
}

/** Alterações ainda não gravadas (o salvamento automático as grava em seguida). Marcação `null` = desmarcar. */
export type Pendencias = { marcacoes: Map<string, Situacao | null>; novos: Compromisso[]; excluidos: Set<string> }
export const semPendencias = (): Pendencias => ({ marcacoes: new Map(), novos: [], excluidos: new Set() })
export const totalPendencias = (p: Pendencias) => p.marcacoes.size + p.novos.length + p.excluidos.size
export const clonarPendencias = (p: Pendencias): Pendencias => ({ marcacoes: new Map(p.marcacoes), novos: [...p.novos], excluidos: new Set(p.excluidos) })

export type Dados = { motoristas: Motorista[]; marcacoes: Marcacao[]; compromissos: Compromisso[] }

/** Dados como a tela deve exibir: salvos + pendências. */
export function aplicarPendencias(dados: Dados, p: Pendencias) {
  const marcacoes = new Map(dados.marcacoes.map((m) => [recordKey(m.motoristaId, m.data), m]))
  for (const [key, situacao] of p.marcacoes) {
    if (situacao === null) { marcacoes.delete(key); continue }
    const [motoristaId, data] = key.split('|')
    marcacoes.set(key, { id: marcacoes.get(key)?.id ?? null, motoristaId, data, situacao })
  }
  const compromissos = [...dados.compromissos.filter((c) => !c.id || !p.excluidos.has(c.id)), ...p.novos]
  return { motoristas: dados.motoristas, marcacoes, compromissos }
}

export type View = ReturnType<typeof aplicarPendencias>

type MarcacaoGravavel = Marcacao & { situacao: Situacao }
export type Operacao =
  | { tipo: 'criarMarcacao'; marcacao: MarcacaoGravavel }
  | { tipo: 'atualizarMarcacao'; marcacao: MarcacaoGravavel & { id: string } }
  | { tipo: 'excluirMarcacao'; id: string }
  | { tipo: 'criarCompromisso'; compromisso: Compromisso }
  | { tipo: 'excluirCompromisso'; id: string }

/** Converte pendências em operações, nesta ordem: marcações, ausências novas, ausências excluídas. Ignora o que não muda nada. */
export function planSave(dados: Dados, p: Pendencias): Operacao[] {
  const salvas = new Map(dados.marcacoes.map((m) => [recordKey(m.motoristaId, m.data), m]))
  const ops: Operacao[] = []
  for (const [key, situacao] of p.marcacoes) {
    const antes = salvas.get(key)
    const [motoristaId, data] = key.split('|')
    if (situacao === null) { if (antes?.id) ops.push({ tipo: 'excluirMarcacao', id: antes.id }); continue }
    if (!antes?.id) ops.push({ tipo: 'criarMarcacao', marcacao: { id: null, motoristaId, data, situacao } })
    else if (antes.situacao !== situacao) ops.push({ tipo: 'atualizarMarcacao', marcacao: { ...antes, id: antes.id, situacao } })
  }
  for (const c of p.novos) ops.push({ tipo: 'criarCompromisso', compromisso: c })
  for (const id of p.excluidos) ops.push({ tipo: 'excluirCompromisso', id })
  return ops
}

/**
 * Tira de `atual` o que o `lote` gravou. Só sai a pendência que continua igual à do lote: o que mudou
 * durante a gravação fica para o próximo lote. `feitas` = operações concluídas (falha no meio); sem ela, o lote inteiro.
 */
export function descontarSalvas(atual: Pendencias, lote: Pendencias, dados: Dados, feitas?: Operacao[]): Pendencias {
  const next = clonarPendencias(atual)
  const chaveDoId = new Map(dados.marcacoes.flatMap((m) => (m.id ? [[m.id, recordKey(m.motoristaId, m.data)] as const] : [])))
  const marcacoes = feitas && new Set(feitas.flatMap((o) => (o.tipo === 'criarMarcacao' || o.tipo === 'atualizarMarcacao' ? [recordKey(o.marcacao.motoristaId, o.marcacao.data)]
    : o.tipo === 'excluirMarcacao' ? [chaveDoId.get(o.id) ?? ''] : [])))
  const novos = new Set(feitas ? feitas.flatMap((o) => (o.tipo === 'criarCompromisso' ? [o.compromisso] : [])) : lote.novos)
  const excluidos = feitas ? feitas.flatMap((o) => (o.tipo === 'excluirCompromisso' ? [o.id] : [])) : [...lote.excluidos]
  for (const [key, situacao] of lote.marcacoes) if ((!marcacoes || marcacoes.has(key)) && next.marcacoes.has(key) && next.marcacoes.get(key) === situacao) next.marcacoes.delete(key)
  next.novos = next.novos.filter((c) => !novos.has(c))
  for (const id of excluidos) next.excluidos.delete(id)
  return next
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test`
Expected: PASS em `src/domain/escala.test.ts` (todos os `describe`).

- [ ] **Step 5: Commit**

```bash
git add apps/escala-fds/src/domain/escala.ts apps/escala-fds/src/domain/escala.test.ts
git commit -m "Escala FDS: domínio simplificado (semana, Plantão/Trabalha e ausências por dias)" -m "Situação só Plantão e Trabalha; Folga legada vira desmarcada e o registro é reaproveitado. Remove padrões. Novas regras puras semanaDe, diasDaSemana, ausenciasDosDias (junta dias seguidos de dia todo; com horário, um por dia), chipAusencia e ultrapassaSemana, com testes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fonte de dados por semana

**Files:**
- Modify: `apps/escala-fds/src/data/source.ts` (arquivo inteiro abaixo)
- Create: `apps/escala-fds/src/data/source.test.ts`

**Interfaces:**
- Consumes: tipos e funções da Task 1 (`Marcacao`, `Compromisso`, `Dados`, `Operacao`, `Motorista`, `SITUACAO_VALUE`, `MOTIVO_VALUE`, `situacaoFromValue`, `motivoFromValue`, `addDays`, `semanaDe`, `toKey`, `toLocal`).
- Produces: `type Janela = { inicio: string; fim: string }`; `janelaPara(segunda: string): Janela`; `mapMarcacao(row)`; `mapCompromisso(row)`; `marcacaoPayload(m, funcionarioSet, nome)`; `compromissoPayload(c, funcionarioSet, nome)`; `type Source = { mock: boolean; load(janela): Promise<Dados>; save(ops): Promise<void> }`; `createSource(): Source`.

- [ ] **Step 1: Escrever o teste**

`apps/escala-fds/src/data/source.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { janelaPara, mapMarcacao, marcacaoPayload } from './source'

describe('source', () => {
  it('janela = segunda a domingo', () => {
    expect(janelaPara('2026-10-12')).toEqual({ inicio: '2026-10-12', fim: '2026-10-18' })
  })

  it('Folga/Indisponível legados chegam desmarcados, com o id preservado', () => {
    const row = { cr40f_escalafdsid: 'AAA-1', _cr40f_motorista_value: 'm1', cr40f_data: '2026-10-18', cr40f_status: 100000002 }
    expect(mapMarcacao(row)).toEqual({ id: 'aaa-1', motoristaId: 'm1', data: '2026-10-18', situacao: null })
    expect(mapMarcacao({ ...row, cr40f_status: 100000001 })?.situacao).toBe('plantao')
    expect(mapMarcacao({ ...row, _cr40f_motorista_value: null })).toBeNull()
  })

  it('payload de marcação grava o valor do choice e o lookup do motorista', () => {
    expect(marcacaoPayload({ id: null, motoristaId: 'm1', data: '2026-10-17', situacao: 'trabalha' }, 'cr40f_funcionarioses', 'Danilo')).toEqual({
      cr40f_name: 'Danilo · 17/10/2026',
      cr40f_data: '2026-10-17',
      cr40f_status: 100000000,
      'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(m1)',
    })
  })
})
```

Nota: `cleanId` (`packages/dataverse/src/client.ts`) tira as chaves e põe em minúsculas; por isso `'AAA-1'` vira `'aaa-1'`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test`
Expected: FAIL — `mapMarcacao`/`marcacaoPayload` não exportados; `janelaPara` devolve outra janela.

- [ ] **Step 3: Reescrever `apps/escala-fds/src/data/source.ts` (arquivo inteiro)**

```ts
import { cleanId, createClient, createMetadata, getHostXrm, isLocalHost, type Row } from '@betinhos/dataverse'
import {
  MOTIVO_VALUE, SITUACAO_VALUE, addDays, motivoFromValue, semanaDe, situacaoFromValue, toKey, toLocal,
  type Compromisso, type Dados, type Marcacao, type Motorista, type Operacao, type Situacao,
} from '../domain/escala'

export const ENTITIES = { escala: 'cr40f_escalafds', compromisso: 'cr40f_compromissofds', funcionario: 'cr40f_funcionarios' } as const
/** Navegação dos lookups cr40f_motorista criados por schema/provision-escala-fds.ps1. */
const NAV_MOTORISTA = 'cr40f_Motorista'

/** Semana carregada: segunda a domingo. */
export type Janela = { inicio: string; fim: string }

export type Source = {
  mock: boolean
  load: (janela: Janela) => Promise<Dados>
  save: (ops: Operacao[]) => Promise<void>
}

export const janelaPara = (segunda: string): Janela => ({ inicio: segunda, fim: addDays(segunda, 6) })

const text = (row: Row, field: string) => String(row[`${field}@OData.Community.Display.V1.FormattedValue`] ?? row[field] ?? '').trim()
const lookupId = (value: unknown) => (typeof value === 'string' && value ? cleanId(value) : '')
const local = (iso: unknown) => (typeof iso === 'string' && iso ? toLocal(new Date(iso)) : '')

/** Folga e Indisponível (legado) chegam com `situacao: null`: aparecem desmarcados e o registro é reaproveitado ao marcar. */
export function mapMarcacao(row: Row): Marcacao | null {
  const motoristaId = lookupId(row._cr40f_motorista_value)
  const data = typeof row.cr40f_data === 'string' ? row.cr40f_data.slice(0, 10) : ''
  if (!motoristaId || !data) return null
  return { id: cleanId(String(row.cr40f_escalafdsid)), motoristaId, data, situacao: situacaoFromValue(row.cr40f_status) }
}

export function mapCompromisso(row: Row): Compromisso | null {
  const motoristaId = lookupId(row._cr40f_motorista_value)
  const inicio = local(row.cr40f_inicio)
  const fim = local(row.cr40f_fim)
  if (!motoristaId || !inicio || !fim) return null
  return {
    id: cleanId(String(row.cr40f_compromissofdsid)), motoristaId, inicio, fim,
    diaInteiro: row.cr40f_diainteiro === true, motivo: motivoFromValue(row.cr40f_motivo) ?? 'outro',
    observacao: String(row.cr40f_observacao ?? ''), registradoEm: typeof row.createdon === 'string' ? toKey(new Date(row.createdon)) : null,
  }
}

const bind = (funcionarioSet: string, motoristaId: string) => ({ [`${NAV_MOTORISTA}@odata.bind`]: `/${funcionarioSet}(${cleanId(motoristaId)})` })
const dataBr = (key: string) => key.split('-').reverse().join('/')

export function marcacaoPayload(m: Marcacao & { situacao: Situacao }, funcionarioSet: string, nome: string) {
  return { cr40f_name: `${nome} · ${dataBr(m.data)}`.slice(0, 100), cr40f_data: m.data, cr40f_status: SITUACAO_VALUE[m.situacao], ...bind(funcionarioSet, m.motoristaId) }
}

export function compromissoPayload(c: Compromisso, funcionarioSet: string, nome: string) {
  return {
    cr40f_name: `${nome} · ${dataBr(c.inicio.slice(0, 10))}`.slice(0, 100),
    cr40f_inicio: new Date(c.inicio).toISOString(),
    cr40f_fim: new Date(c.fim).toISOString(),
    cr40f_diainteiro: c.diaInteiro,
    cr40f_motivo: MOTIVO_VALUE[c.motivo],
    cr40f_observacao: c.observacao || null,
    ...bind(funcionarioSet, c.motoristaId),
  }
}

function createDataverseSource(): Source {
  const hostXrm = getHostXrm()
  const clientUrl = (hostXrm?.Utility?.getGlobalContext().getClientUrl() ?? location.origin).replace(/\/+$/, '')
  const client = createClient(clientUrl)
  const metadata = createMetadata(client)
  let sets: Promise<Record<keyof typeof ENTITIES, string>> | null = null
  const entitySets = () => (sets ??= metadata.entities(Object.values(ENTITIES)).then((info) => {
    const set = (name: string) => {
      const value = info.get(name)?.entitySetName
      if (!value) throw new Error(`Tabela ${name} não encontrada. Rode o provisionamento do schema.`)
      return value
    }
    return { escala: set(ENTITIES.escala), compromisso: set(ENTITIES.compromisso), funcionario: set(ENTITIES.funcionario) }
  }).catch((error) => { sets = null; throw error }))
  const nomes = new Map<string, string>()

  return {
    mock: false,
    async load({ inicio, fim }) {
      const s = await entitySets()
      const escalaFilter = `cr40f_data ge ${inicio} and cr40f_data le ${fim} and statecode eq 0`
      // Ausências que cruzam a semana (inclui férias que começaram antes).
      const compromissoFilter = `cr40f_inicio le ${fim}T23:59:59Z and cr40f_fim ge ${inicio}T00:00:00Z and statecode eq 0`
      const [funcionarios, marcacoes, compromissos] = await Promise.all([
        // Motoristas (função 202410000) com status Ativo (0).
        client.getAll(`${s.funcionario}?$select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido&$filter=${encodeURIComponent('statecode eq 0 and cr40f_funcao eq 202410000 and cr40f_status eq 0')}&$orderby=new_apelido asc`),
        client.getAll(`${s.escala}?$select=cr40f_escalafdsid,_cr40f_motorista_value,cr40f_data,cr40f_status&$filter=${encodeURIComponent(escalaFilter)}`),
        client.getAll(`${s.compromisso}?$select=cr40f_compromissofdsid,_cr40f_motorista_value,cr40f_inicio,cr40f_fim,cr40f_diainteiro,cr40f_motivo,cr40f_observacao,createdon&$filter=${encodeURIComponent(compromissoFilter)}&$orderby=cr40f_inicio asc`),
      ])
      const motoristas: Motorista[] = funcionarios.map((row) => ({
        id: cleanId(String(row.cr40f_funcionariosid)),
        nome: text(row, 'new_apelido') || text(row, 'cr40f_nomecompleto'),
      }))
      for (const m of motoristas) nomes.set(m.id, m.nome)
      return {
        motoristas,
        marcacoes: marcacoes.map(mapMarcacao).filter((m): m is Marcacao => m !== null),
        compromissos: compromissos.map(mapCompromisso).filter((c): c is Compromisso => c !== null),
      }
    },
    async save(ops) {
      const s = await entitySets()
      const nome = (id: string) => nomes.get(id) ?? ''
      // Sequencial: a falha aponta o que parou; o que já foi gravado aparece no recarregamento.
      for (const op of ops) {
        if (op.tipo === 'criarMarcacao') await client.create(s.escala, marcacaoPayload(op.marcacao, s.funcionario, nome(op.marcacao.motoristaId)))
        else if (op.tipo === 'atualizarMarcacao') await client.update(s.escala, op.marcacao.id, marcacaoPayload(op.marcacao, s.funcionario, nome(op.marcacao.motoristaId)))
        else if (op.tipo === 'excluirMarcacao') await client.remove(s.escala, op.id)
        else if (op.tipo === 'criarCompromisso') await client.create(s.compromisso, compromissoPayload(op.compromisso, s.funcionario, nome(op.compromisso.motoristaId)))
        else await client.remove(s.compromisso, op.id)
      }
    },
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function createMockSource(): Source {
  const nomes = ['Danilo', 'Adriano', 'Bruno Lima', 'Carlos Souza', 'Diego', 'Edson Ramos', 'Fábio', 'Gilberto']
  const motoristas: Motorista[] = nomes.map((nome, i) => ({ id: `m${i + 1}`, nome }))
  const hoje = toKey(new Date())
  const segunda = semanaDe(new Date())
  const sab = addDays(segunda, 5)
  const dom = addDays(segunda, 6)
  let seq = 0
  const marcacoes: Marcacao[] = [
    { id: `e${++seq}`, motoristaId: 'm1', data: sab, situacao: 'plantao' },
    { id: `e${++seq}`, motoristaId: 'm1', data: dom, situacao: 'plantao' },
    { id: `e${++seq}`, motoristaId: 'm2', data: sab, situacao: 'trabalha' },
    { id: `e${++seq}`, motoristaId: 'm3', data: dom, situacao: null }, // Folga legada: aparece desmarcada
  ]
  const compromissos: Compromisso[] = []
  const c = (motoristaId: string, inicio: string, fim: string, diaInteiro: boolean, motivo: Compromisso['motivo'], observacao: string) =>
    compromissos.push({ id: `c${++seq}`, motoristaId, inicio, fim, diaInteiro, motivo, observacao, registradoEm: hoje })
  c('m1', `${sab}T00:00`, `${sab}T12:00`, false, 'pessoal', 'Livre de manhã')
  c('m4', `${dom}T00:00`, `${dom}T23:59`, true, 'medico', 'Exame')
  c('m5', `${addDays(hoje, 2)}T10:00`, `${addDays(hoje, 2)}T12:00`, false, 'medico', 'Consulta')
  c('m3', `${addDays(segunda, 1)}T00:00`, `${addDays(segunda, 1)}T23:59`, true, 'pessoal', 'Mudança')
  c('m6', `${addDays(segunda, 4)}T00:00`, `${addDays(segunda, 12)}T23:59`, true, 'ferias', 'Férias')

  return {
    mock: true,
    async load({ inicio, fim }) {
      await wait(300)
      return structuredClone({
        motoristas,
        marcacoes: marcacoes.filter((m) => m.data >= inicio && m.data <= fim),
        compromissos: compromissos.filter((x) => x.inicio.slice(0, 10) <= fim && x.fim.slice(0, 10) >= inicio),
      })
    },
    async save(ops) {
      await wait(500)
      for (const op of ops) {
        if (op.tipo === 'criarMarcacao') marcacoes.push({ ...op.marcacao, id: `e${++seq}` })
        else if (op.tipo === 'atualizarMarcacao') Object.assign(marcacoes.find((m) => m.id === op.marcacao.id) ?? {}, op.marcacao)
        else if (op.tipo === 'excluirMarcacao') marcacoes.splice(marcacoes.findIndex((m) => m.id === op.id), 1)
        else if (op.tipo === 'criarCompromisso') compromissos.push({ ...op.compromisso, id: `c${++seq}`, registradoEm: toKey(new Date()) })
        else compromissos.splice(compromissos.findIndex((x) => x.id === op.id), 1)
      }
    },
  }
}

export const createSource = (): Source => (isLocalHost() ? createMockSource() : createDataverseSource())
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test`
Expected: PASS em `src/domain/escala.test.ts` e `src/data/source.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/escala-fds/src/data/source.ts apps/escala-fds/src/data/source.test.ts
git commit -m "Escala FDS: carga só da semana e gravação sem padrões" -m "janelaPara passa a ser segunda a domingo; motoristas sem campos de padrão e vínculo; marcações Folga/Indisponível chegam desmarcadas preservando o id; operações de marcação e ausência; dados de exemplo da semana atual com Folga legada, ausência em dia útil e férias atravessando a semana." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Formulário de ausência

**Files:**
- Create: `apps/escala-fds/src/components/AusenciaForm.tsx`

**Interfaces:**
- Consumes: `MOTIVO_LABEL`, `ausenciasDosDias`, `dateRange`, `diaCurto`, `diasDaSemana`, `formatDay`, `type Compromisso`, `type Motivo` (Task 1); `Button`, `Checkbox`, `Field`, `Input`, `SegmentedControl` de `@betinhos/ui`.
- Produces: `AusenciaForm(props: { hoje: string; segunda: string; motoristaId: string; onCancel: () => void; onAdd: (lista: Compromisso[]) => void })`. Usa as classes CSS `escala__form`, `escala__form-row`, `escala__form-actions`, `escala__form-error`, `escala__day-chips`, `escala__toggle` (definidas na Task 5).

- [ ] **Step 1: Criar o componente**

```tsx
import { useState } from 'react'
import { Button, Checkbox, Field, Input, SegmentedControl } from '@betinhos/ui'
import { MOTIVO_LABEL, ausenciasDosDias, dateRange, diaCurto, diasDaSemana, formatDay, type Compromisso, type Motivo } from '../domain/escala'

type Props = {
  hoje: string
  segunda: string
  motoristaId: string
  onCancel: () => void
  onAdd: (lista: Compromisso[]) => void
}

const MOTIVOS = (Object.keys(MOTIVO_LABEL) as Motivo[]).map((value) => ({ value, label: MOTIVO_LABEL[value] }))

/** Ausência em poucos toques: dias da semana, dia todo ou horário, motivo. "Outro período" (sempre dia todo) cobre férias longas. */
export function AusenciaForm({ hoje, segunda, motoristaId, onCancel, onAdd }: Props) {
  const semana = diasDaSemana(segunda)
  const inicial = semana.includes(hoje) ? hoje : segunda
  const [dias, setDias] = useState<string[]>(() => (semana.includes(hoje) ? [hoje] : []))
  const [outro, setOutro] = useState(false)
  const [de, setDe] = useState(inicial)
  const [ate, setAte] = useState(inicial)
  const [diaInteiro, setDiaInteiro] = useState(true)
  const [horaInicio, setHoraInicio] = useState('00:00')
  const [horaFim, setHoraFim] = useState('12:00')
  const [motivo, setMotivo] = useState<Motivo>('medico')
  const [observacao, setObservacao] = useState('')

  const escolhidos = outro ? dateRange(de, ate) : dias
  const erro = outro && ate < de ? 'A data final deve ser igual ou posterior à inicial.'
    : outro && escolhidos.length >= 62 ? 'Registre no máximo 62 dias por vez.'
      : !outro && !diaInteiro && horaFim <= horaInicio ? 'O horário final deve ser depois do inicial.' : null

  const alternarDia = (d: string) => setDias((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d]))
  const registrar = () => {
    if (!escolhidos.length || erro) return
    onAdd(ausenciasDosDias({ motoristaId, dias: escolhidos, diaInteiro: outro || diaInteiro, horaInicio, horaFim, motivo, observacao }))
  }

  return (
    <section className="escala__form" aria-label="Nova ausência">
      {outro ? (
        <div className="escala__form-row">
          <Field label="De" required><Input type="date" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value) }} /></Field>
          <Field label="Até" required><Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></Field>
        </div>
      ) : (
        <div className="escala__day-chips" role="group" aria-label="Dias da ausência">
          {semana.map((d) => (
            <button key={d} type="button" className="escala__toggle" aria-pressed={dias.includes(d)} onClick={() => alternarDia(d)}>
              {diaCurto(d)}<small>{formatDay(d)}</small>
            </button>
          ))}
        </div>
      )}
      <div>
        <Button variant="ghost" size="compact" onClick={() => setOutro(!outro)}>{outro ? 'Escolher dias desta semana' : 'Outro período'}</Button>
      </div>
      {outro ? null : <Checkbox label="Dia todo" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />}
      {outro || diaInteiro ? null : (
        <div className="escala__form-row">
          <Field label="Indisponível a partir de"><Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></Field>
          <Field label="Até" error={erro}><Input type="time" value={horaFim} invalid={Boolean(erro)} onChange={(e) => setHoraFim(e.target.value)} /></Field>
        </div>
      )}
      {outro && erro ? <p className="escala__form-error" role="alert">{erro}</p> : null}
      <SegmentedControl<Motivo> aria-label="Motivo" fullWidth size="compact" value={motivo} onChange={setMotivo} options={MOTIVOS} />
      <Field label="Observação"><Input value={observacao} maxLength={2000} placeholder="Ex.: consulta com retorno às 12h" onChange={(e) => setObservacao(e.target.value)} /></Field>
      <div className="escala__form-actions">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" disabled={!escolhidos.length || Boolean(erro)} onClick={registrar}>Registrar ausência</Button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Conferir que os testes continuam passando**

Run: `pnpm test`
Expected: PASS (o componente ainda não é usado; `pnpm typecheck` ainda falha nos componentes antigos até a Task 5).

- [ ] **Step 3: Commit**

```bash
git add apps/escala-fds/src/components/AusenciaForm.tsx
git commit -m "Escala FDS: formulário curto de ausência" -m "Chips Seg a Dom com seleção múltipla (hoje pré-marcado na semana atual), Dia todo marcado por padrão com horário opcional, motivo em botões com Médico pré-selecionado, observação opcional e link Outro período (De/Até, sempre dia todo, até 62 dias). Gera os registros com ausenciasDosDias." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lista de motoristas

**Files:**
- Create: `apps/escala-fds/src/components/EscalaLista.tsx`

**Interfaces:**
- Consumes: `SITUACAO_LABEL`, `addDays`, `ausenciasDaSemana`, `chipAusencia`, `compromissosDoDia`, `situacaoDoDia`, `ultrapassaSemana`, `type Compromisso`, `type Situacao`, `type View` (Task 1); `AusenciaForm` (Task 3); `Button`, `EmptyState` de `@betinhos/ui`.
- Produces: `EscalaLista(props: { hoje: string; segunda: string; view: View; onMarcar: (motoristaId: string, data: string, situacao: Situacao | null) => void; onAddAusencias: (lista: Compromisso[]) => void; onRemoveAusencia: (c: Compromisso) => void })`. Usa as classes `escala__list`, `escala__row`, `is-unavailable`, `escala__row-main`, `escala__name`, `escala__days`, `escala__day-group`, `escala__day-label`, `escala__toggle`, `escala__chips`, `escala__chip`, `escala__chip-confirm` (Task 5).

- [ ] **Step 1: Criar o componente**

```tsx
import { useState } from 'react'
import { CalendarPlus, Users } from 'lucide-react'
import { Button, EmptyState } from '@betinhos/ui'
import {
  SITUACAO_LABEL, addDays, ausenciasDaSemana, chipAusencia, compromissosDoDia, situacaoDoDia, ultrapassaSemana,
  type Compromisso, type Situacao, type View,
} from '../domain/escala'
import { AusenciaForm } from './AusenciaForm'

type Props = {
  hoje: string
  segunda: string
  view: View
  onMarcar: (motoristaId: string, data: string, situacao: Situacao | null) => void
  onAddAusencias: (lista: Compromisso[]) => void
  onRemoveAusencia: (c: Compromisso) => void
}

const SITUACOES: Situacao[] = ['plantao', 'trabalha']

/** Uma linha por motorista: Plantão/Trabalha no sábado e domingo, ausências da semana em chips e o formulário de ausência. */
export function EscalaLista({ hoje, segunda, view, onMarcar, onAddAusencias, onRemoveAusencia }: Props) {
  const [formPara, setFormPara] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<Compromisso | null>(null)
  const { motoristas, marcacoes, compromissos } = view
  const fds = [{ data: addDays(segunda, 5), curto: 'Sáb', longo: 'Sábado' }, { data: addDays(segunda, 6), curto: 'Dom', longo: 'Domingo' }]

  if (!motoristas.length) return <EmptyState icon={<Users size={32} />} title="Nenhum motorista ativo encontrado.">Confira a função dos funcionários no cadastro.</EmptyState>

  return (
    <ul className="escala__list">
      {motoristas.map((m) => {
        const doMotorista = compromissos.filter((c) => c.motoristaId === m.id)
        const ausencias = ausenciasDaSemana(doMotorista, segunda)
        const ausenteNoFds = fds.some(({ data }) => compromissosDoDia(doMotorista, data).some((x) => x.diaTodo))
        return (
          <li key={m.id} className={ausenteNoFds ? 'escala__row is-unavailable' : 'escala__row'}>
            <div className="escala__row-main">
              <span className="escala__name">{m.nome}</span>
              <Button variant="ghost" size="compact" icon={<CalendarPlus size={16} />} aria-expanded={formPara === m.id} onClick={() => setFormPara(formPara === m.id ? null : m.id)}>Ausência</Button>
            </div>
            <div className="escala__days">
              {fds.map(({ data, curto, longo }) => {
                const atual = situacaoDoDia(m.id, data, marcacoes)
                return (
                  <div key={data} className="escala__day-group" role="group" aria-label={`${longo} de ${m.nome}`}>
                    <span className="escala__day-label" aria-hidden="true">{curto}</span>
                    {SITUACOES.map((s) => (
                      <button key={s} type="button" className="escala__toggle" aria-pressed={atual === s} onClick={() => onMarcar(m.id, data, atual === s ? null : s)}>
                        {SITUACAO_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
            {ausencias.length ? (
              <ul className="escala__chips" aria-label={`Ausências de ${m.nome}`}>
                {ausencias.map((c) => (
                  <li key={c.id ?? `${c.inicio}-${c.fim}`}>
                    {excluindo === c ? (
                      <span className="escala__chip-confirm">
                        {ultrapassaSemana(c, segunda) ? 'Excluir o período inteiro?' : 'Excluir esta ausência?'}
                        <Button variant="ghost" size="compact" onClick={() => setExcluindo(null)}>Cancelar</Button>
                        <Button variant="danger" size="compact" onClick={() => { setExcluindo(null); onRemoveAusencia(c) }}>Excluir</Button>
                      </span>
                    ) : (
                      <button type="button" className="escala__chip" title={c.observacao || undefined} onClick={() => setExcluindo(c)}>
                        {chipAusencia(c, segunda)}{c.id ? '' : ' · salvando…'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {formPara === m.id ? (
              <AusenciaForm key={`${m.id}-${segunda}`} hoje={hoje} segunda={segunda} motoristaId={m.id} onCancel={() => setFormPara(null)} onAdd={(lista) => { onAddAusencias(lista); setFormPara(null) }} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: Conferir que os testes continuam passando**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/escala-fds/src/components/EscalaLista.tsx
git commit -m "Escala FDS: lista de motoristas com Sáb/Dom e chips de ausência" -m "Cada linha tem nome e botão Ausência, botões Plantão/Trabalha (aria-pressed; tocar no ativo desmarca) para sábado e domingo, chips das ausências da semana com confirmação de exclusão (avisa quando apaga o período inteiro) e o formulário abaixo da linha. Fundo de atenção quando há ausência de dia todo no fim de semana." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tela única (App, estilos e remoção das abas)

**Files:**
- Modify (reescrever): `apps/escala-fds/src/App.tsx`
- Modify: `apps/escala-fds/src/styles.css` (arquivo inteiro abaixo)
- Delete: `apps/escala-fds/src/components/EscalaTab.tsx`, `SemanaTab.tsx`, `AgendaTab.tsx`, `PadroesTab.tsx`, `CompromissoForm.tsx`

**Interfaces:**
- Consumes: Task 1 (`addDays`, `aplicarPendencias`, `clonarPendencias`, `descontarSalvas`, `planSave`, `recordKey`, `semPendencias`, `semanaDe`, `semanaLabel`, `toKey`, `totalPendencias`, tipos), Task 2 (`createSource`, `janelaPara`), Task 4 (`EscalaLista`).
- Produces: a tela final.

- [ ] **Step 1: Apagar os componentes antigos**

```bash
git rm apps/escala-fds/src/components/EscalaTab.tsx apps/escala-fds/src/components/SemanaTab.tsx apps/escala-fds/src/components/AgendaTab.tsx apps/escala-fds/src/components/PadroesTab.tsx apps/escala-fds/src/components/CompromissoForm.tsx
```

- [ ] **Step 2: Reescrever `apps/escala-fds/src/App.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react'
import { Alert, BuildBadge, Button, Skeleton, useToast } from '@betinhos/ui'
import {
  addDays, aplicarPendencias, clonarPendencias, descontarSalvas, planSave, recordKey, semPendencias, semanaDe, semanaLabel, toKey, totalPendencias,
  type Compromisso, type Dados, type Pendencias, type Situacao,
} from './domain/escala'
import { createSource, janelaPara, type Janela } from './data/source'
import { EscalaLista } from './components/EscalaLista'

/** Espera após a última alteração antes de gravar, para juntar toques seguidos num lote só. */
const AUTOSAVE_MS = 700

const horaAgora = () => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date())

export function App() {
  const source = useMemo(createSource, [])
  const toast = useToast()
  const [segunda, setSegunda] = useState(() => semanaDe(new Date()))
  const janela = useMemo(() => janelaPara(segunda), [segunda])
  const [dados, setDados] = useState<Dados | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvarErro, setSalvarErro] = useState(false)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)
  const [pend, setPend] = useState<Pendencias>(semPendencias)
  const total = totalPendencias(pend)

  // O salvamento roda fora do ciclo de render: lê sempre o estado mais recente.
  const ref = useRef({ dados, pend, janela, saving })
  ref.current = { dados, pend, janela, saving: ref.current.saving }

  const load = useCallback(async (target: Janela) => {
    setLoading(true)
    setError(null)
    try { setDados(await source.load(target)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [source])

  useEffect(() => { void load(janela) }, [load, janela])

  const dirty = total > 0 || saving
  useEffect(() => {
    // O overlay do botão (cr40f_escalafds_commands.js) usa isto para pedir "Descartar alterações?" ao fechar.
    if (window.parent !== window) window.parent.postMessage({ type: 'escala-fds:dirty', dirty }, '*')
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const salvar = useCallback(async () => {
    const { dados: base, pend: lote, janela: alvo } = ref.current
    if (!base || ref.current.saving) return
    const ops = planSave(base, lote)
    if (!ops.length) { setPend((p) => descontarSalvas(p, lote, base)); return }
    ref.current.saving = true
    setSaving(true)
    let feitas = 0
    let falha: unknown = null
    try {
      // Uma operação por vez: na falha, só o que não foi gravado continua pendente.
      for (const op of ops) { await source.save([op]); feitas++ }
    } catch (reason) { falha = reason }
    try {
      // Recarrega para obter os IDs criados; alterações feitas durante a gravação continuam pendentes.
      const novos = await source.load(alvo)
      setDados(novos)
      setPend((p) => descontarSalvas(p, lote, base, falha ? ops.slice(0, feitas) : undefined))
    } catch (reason) {
      setPend((p) => descontarSalvas(p, lote, base, ops.slice(0, feitas)))
      setError(reason instanceof Error ? reason.message : String(reason))
    }
    if (falha) {
      setSalvarErro(true)
      toast({ tone: 'danger', message: `Não foi possível salvar. ${falha instanceof Error ? falha.message : ''}`.trim() })
    } else setSalvoEm(horaAgora())
    ref.current.saving = false
    setSaving(false)
  }, [source, toast])

  useEffect(() => {
    if (!total || saving || salvarErro) return
    const timer = setTimeout(() => void salvar(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [pend, total, saving, salvarErro, salvar])

  const view = useMemo(() => (dados ? aplicarPendencias(dados, pend) : null), [dados, pend])

  const update = (fn: (p: Pendencias) => void) => {
    setSalvarErro(false) // Nova alteração tenta gravar de novo, junto com o que falhou.
    setPend((current) => { const next = clonarPendencias(current); fn(next); return next })
  }
  const marcar = (motoristaId: string, data: string, situacao: Situacao | null) => update((p) => {
    const key = recordKey(motoristaId, data)
    const salva = dados?.marcacoes.find((m) => recordKey(m.motoristaId, m.data) === key)
    if ((salva?.situacao ?? null) === situacao) p.marcacoes.delete(key)
    else p.marcacoes.set(key, situacao)
  })
  const addAusencias = (lista: Compromisso[]) => update((p) => { p.novos.push(...lista) })
  const removeAusencia = (c: Compromisso) => update((p) => {
    if (c.id) p.excluidos.add(c.id)
    else p.novos = p.novos.filter((n) => n !== c)
  })

  const hoje = toKey(new Date())
  // Trocar de semana só com tudo gravado: o plano de gravação compara com os dados da semana carregada.
  const travado = loading || dirty

  return (
    <div className="escala">
      <header className="escala__head">
        <div className="escala__week">
          <Button variant="secondary" size="compact" aria-label="Semana anterior" icon={<ChevronLeft size={16} />} disabled={travado} onClick={() => setSegunda(addDays(segunda, -7))} />
          <div className="escala__week-label">
            <span className="escala__eyebrow">{segunda === semanaDe(new Date()) ? 'Esta semana' : 'Semana'}</span>
            <strong>{semanaLabel(segunda)}</strong>
          </div>
          <Button variant="secondary" size="compact" aria-label="Próxima semana" icon={<ChevronRight size={16} />} disabled={travado} onClick={() => setSegunda(addDays(segunda, 7))} />
        </div>
        <div className="escala__head-end">
          <span className={salvarErro ? 'escala__save is-error' : 'escala__save'} aria-live="polite">
            {salvarErro ? (
              <><CircleAlert size={14} aria-hidden="true" />Não salvo<Button variant="ghost" size="compact" onClick={() => setSalvarErro(false)}>Tentar de novo</Button></>
            ) : dirty ? (
              <><LoaderCircle size={14} className="escala__spin" aria-hidden="true" />Salvando…</>
            ) : salvoEm ? (
              <><Check size={14} aria-hidden="true" />Salvo às {salvoEm}</>
            ) : null}
          </span>
          <Button variant="ghost" size="compact" icon={<RefreshCw size={16} />} onClick={() => void load(janela)} disabled={travado}>Atualizar</Button>
        </div>
      </header>

      <main className="escala__body" aria-busy={loading}>
        {error ? (
          <Alert tone="danger" title="Não foi possível carregar a escala." action={<Button size="compact" variant="secondary" onClick={() => void load(janela)}>Tentar de novo</Button>}>{error}</Alert>
        ) : !view || loading ? (
          <div className="escala__skeleton">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={88} />)}</div>
        ) : (
          <EscalaLista hoje={hoje} segunda={segunda} view={view} onMarcar={marcar} onAddAusencias={addAusencias} onRemoveAusencia={removeAusencia} />
        )}
      </main>

      {source.mock ? <p className="escala__mock">Dados de exemplo (fora do Dataverse)</p> : null}
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `apps/escala-fds/src/styles.css`**

```css
/* Escala de fim de semana: painel lateral (520px) aberto pela grade de Reservas. Valores só de tokens --bt-*. */

html, body, #root { height: 100%; margin: 0; }
body { background-color: var(--bt-color-canvas); font-family: var(--bt-font-family-sans); color: var(--bt-color-text-primary); }

.escala { display: flex; flex-direction: column; height: 100%; max-width: 720px; margin: 0 auto; background-color: var(--bt-color-canvas); }

.escala__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--bt-space-2); padding: var(--bt-space-3) var(--bt-space-4); background-color: var(--bt-color-surface); border-bottom: var(--bt-border-width-default) solid var(--bt-color-border); }
.escala__week { display: flex; align-items: center; gap: var(--bt-space-2); }
.escala__week-label { display: grid; min-width: 128px; text-align: center; }
.escala__week-label strong { font-size: var(--bt-font-size-17); font-weight: var(--bt-font-weight-extrabold); color: var(--bt-color-brand); }
.escala__head-end { display: flex; align-items: center; gap: var(--bt-space-2); }
.escala__save { display: inline-flex; align-items: center; gap: var(--bt-space-1-5); font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-semibold); color: var(--bt-color-text-secondary); }
.escala__save.is-error { color: var(--bt-color-danger); }
.escala__save svg:not(.escala__spin) { flex: none; }
.escala__spin { animation: escala-spin 800ms linear infinite; }
@keyframes escala-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .escala__spin { animation: none; } }
.escala__eyebrow { font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: .08em; text-transform: uppercase; color: var(--bt-color-text-secondary); }

.escala__body { flex: 1; overflow-y: auto; padding: var(--bt-space-3) var(--bt-space-4) var(--bt-space-8); }
.escala__skeleton { display: grid; gap: var(--bt-space-2); }

.escala__list { display: grid; gap: var(--bt-space-2); margin: 0; padding: 0; list-style: none; }
.escala__row { display: grid; gap: var(--bt-space-2); padding: var(--bt-space-2-5) var(--bt-space-3); background-color: var(--bt-color-surface-neutral); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-md); }
.escala__row.is-unavailable { background-color: var(--bt-color-warning-soft); }
.escala__row-main { display: flex; align-items: center; justify-content: space-between; gap: var(--bt-space-2); }
.escala__name { font-size: var(--bt-font-size-13); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-primary); }

.escala__days { display: flex; flex-wrap: wrap; gap: var(--bt-space-2) var(--bt-space-4); }
.escala__day-group { display: inline-flex; align-items: center; gap: var(--bt-space-1); }
.escala__day-label { min-width: 28px; font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-extrabold); letter-spacing: .08em; text-transform: uppercase; color: var(--bt-color-text-secondary); }

/* Botão alternável (situação e dias da ausência): ativo em navy, inativo off-white com borda. */
.escala__toggle {
  min-height: var(--bt-control-height-touch); padding: 0 var(--bt-space-2-5);
  border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-sm);
  background-color: var(--bt-color-surface-neutral); color: var(--bt-color-text-secondary);
  font: inherit; font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-extrabold); cursor: pointer;
  transition: background-color var(--bt-duration-fast) var(--bt-ease-out), color var(--bt-duration-fast) var(--bt-ease-out), transform var(--bt-duration-fast) var(--bt-ease-out);
}
.escala__toggle[aria-pressed="true"] { background-color: var(--bt-color-brand); border-color: var(--bt-color-brand); color: var(--bt-color-white); }
.escala__toggle:active { transform: scale(.97); }
.escala__toggle:focus-visible { outline: 0; border-color: var(--bt-focus-border); box-shadow: var(--bt-focus-ring); }
.escala__toggle[aria-pressed="true"]:focus-visible { box-shadow: 0 0 0 2px var(--bt-color-white), 0 0 0 5px var(--bt-focus-border); }
@media (hover: hover) and (pointer: fine) { .escala__toggle[aria-pressed="false"]:hover { background-color: var(--bt-color-surface-soft); } }

.escala__chips { display: flex; flex-wrap: wrap; gap: var(--bt-space-1-5); margin: 0; padding: 0; list-style: none; }
.escala__chip { min-height: 32px; padding: var(--bt-space-1) var(--bt-space-2); border: 0; border-radius: var(--bt-radius-sm); background-color: var(--bt-color-warning-soft); color: var(--bt-color-warning); font: inherit; font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-semibold); text-align: left; cursor: pointer; }
.escala__row.is-unavailable .escala__chip { background-color: var(--bt-color-surface); }
.escala__chip:focus-visible { outline: 0; box-shadow: var(--bt-focus-ring); }
.escala__chip-confirm { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--bt-space-1); font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-text-primary); }

.escala__form { display: grid; gap: var(--bt-space-3); padding: var(--bt-space-4); background-color: var(--bt-color-surface); border: var(--bt-border-width-default) solid var(--bt-color-border); border-radius: var(--bt-radius-lg); }
.escala__form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--bt-space-2); }
.escala__form-actions { display: flex; justify-content: flex-end; gap: var(--bt-space-2); }
.escala__form-error { margin: 0; font-size: var(--bt-font-size-12); font-weight: var(--bt-font-weight-bold); color: var(--bt-color-danger); }
.escala__day-chips { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--bt-space-1); }
.escala__day-chips .escala__toggle { display: grid; align-content: center; padding: var(--bt-space-1) 0; line-height: 1.2; }
.escala__day-chips small { font-size: var(--bt-font-size-11); font-weight: var(--bt-font-weight-semibold); }

.escala__mock { margin: 0; padding: var(--bt-space-1) var(--bt-space-4); font-size: var(--bt-font-size-11); color: var(--bt-color-text-secondary); }

@media (max-width: 420px) {
  .escala__form-row { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Typecheck e testes**

Run: `pnpm typecheck` e depois `pnpm test`
Expected: `tsc --noEmit` sem erros; vitest PASS. Se `tsc` acusar referência a `weekendOf`, `diasUteis`, `Padrao`, `Excecao` ou `excecoes` em algum arquivo, esse uso é resto da versão antiga: troque pela API da Task 1 (não recrie as funções antigas).

- [ ] **Step 5: Conferir que não sobrou referência antiga**

Run: `rg -n "weekendOf|diasUteis|Padrao|padroes|Excecao|excecoes|folga|Tabs" apps/escala-fds/src`
Expected: só a palavra "Folga" em comentários de `escala.ts`/`source.ts`; nenhuma outra ocorrência.

- [ ] **Step 6: Commit**

```bash
git add -A apps/escala-fds/src
git commit -m "Escala FDS: tela única sem abas" -m "App passa a ter só o cabeçalho da semana (segunda a domingo, navegação travada enquanto há gravação pendente), estado do salvamento e a lista de motoristas. Remove as abas Escala, Semana, Agenda e Padrões e o formulário antigo. Estilos refeitos com tokens --bt-*: botões alternáveis de 44 px, chips de ausência e formulário." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificação no navegador, build e publicação

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-escala-fds-simples-design.md` (só se algo divergir do implementado)
- Build gera `apps/escala-fds/dist/*` e incrementa `apps/escala-fds/package.json`.

- [ ] **Step 1: Subir o dev server com dados de exemplo**

Run (em `apps/escala-fds`): `pnpm dev` (porta 36481; em sessão Claude, use `preview_start` com a configuração `escala-fds-semana` do `.claude/launch.json` da Tela Gestão FDS). Abra `http://localhost:36481`.
Expected: "Esta semana" com segunda a domingo da semana atual, 8 motoristas, "Dados de exemplo (fora do Dataverse)".

- [ ] **Step 2: Roteiro em 520 × 900 e 360 × 800**

Conferir, em cada largura:
1. Danilo com Plantão ativo no Sáb e Dom; Adriano com Trabalha no Sáb; Bruno Lima com Dom desmarcado (Folga legada).
2. Tocar em Trabalha no Dom do Bruno → ativo; "Salvando…" e depois "Salvo às HH:mm"; tocar de novo → desmarca e salva.
3. Chips: Bruno "Ter · dia todo · Pessoal"; Carlos Souza com fundo de atenção e "Dom · dia todo · Médico"; Edson Ramos "Férias · dd/mm a dd/mm"; Danilo "Sáb · até 12h · Pessoal".
4. Ausência do Diego: marcar Seg, Ter, Qua e Sex, Dia todo, motivo Médico, Registrar → chips "Seg a Qua · Médico" e "Sex · dia todo · Médico".
5. Ausência com horário (desmarcar Dia todo, 08:00–12:00) em dois dias → dois chips "das 8h às 12h".
6. "Outro período" com até menor que de → erro; com 10 dias → um chip de período.
7. Tocar no chip de férias → "Excluir o período inteiro?"; Cancelar mantém; Excluir remove e salva.
8. Navegar para a próxima semana e voltar (botões desabilitados durante "Salvando…").
9. Sem rolagem horizontal: `document.documentElement.scrollWidth === innerWidth`.
10. Console sem erros; foco visível com Tab nos botões de situação e chips.

- [ ] **Step 3: Build**

Run (em `apps/escala-fds`): `pnpm wr`
Expected: `dist/webresource.html gerado com CSS e JavaScript inline`; `package.json` vai para a próxima versão (v0.0.19 se partir de 0.0.18).
Depois, desfaça o incremento antes de publicar, para a publicação não pular versão: `git checkout -- apps/escala-fds/package.json`.

- [ ] **Step 4: Publicar no DEV (só com OK do Renan)**

Pré-requisito: `.env` copiado pelo Renan para a raiz da worktree (já feito em 13/10/2026).
Run (em `apps/escala-fds`): `pnpm push`
Expected: `SCHEMA OK` e `PUSH CONCLUIDO: v0.0.19 - cr40f_EscalaFDS.html, cr40f_escalafds_commands.js validados em AppBetinhos`.

- [ ] **Step 5: Commit da versão e cópia de teste**

```bash
git add apps/escala-fds/package.json
git commit -m "Escala FDS: versão de build v0.0.19 publicada no DEV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Depois, copiar `apps/escala-fds/dist/webresource.html` para `Tela Gestão FDS/.claude/worktrees/driver-absence-tracking-26cfaa/index.html` e `apps/escala-fds/dist/WebResources/cr40f_escalafds_commands.js` para a mesma pasta, e commitar lá: `Atualiza a cópia de teste para a Escala FDS v0.0.19 (tela única)`.

- [ ] **Step 6: Informar o Renan**

Versão publicada (v0.0.19), o que conferir no DEV (marcar/desmarcar, ausência de vários dias, excluir chip, Atualizar) e o que ainda não foi validado com o usuário autenticado.
