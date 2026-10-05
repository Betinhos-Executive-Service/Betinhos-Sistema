/** Regras puras da escala de fim de semana: datas, edição pendente e rodízio. */

export type Status = 'trabalha' | 'plantao' | 'folga' | 'indisponivel'
export type Motivo = 'medico' | 'pessoal' | 'ferias' | 'outro'

export type Motorista = { id: string; nome: string }

/** Uma linha de cr40f_escalafds: um motorista em uma data (`aaaa-mm-dd`). */
export type Registro = {
  id: string | null
  motoristaId: string
  data: string
  status: Status
  motivo: Motivo | null
  observacao: string
}

export const STATUS_LABEL: Record<Status, string> = { trabalha: 'Trabalha', plantao: 'Plantão', folga: 'Folga', indisponivel: 'Indisponível' }
export const MOTIVO_LABEL: Record<Motivo, string> = { medico: 'Médico', pessoal: 'Pessoal', ferias: 'Férias', outro: 'Outro' }

/** Valores das choices no Dataverse (schema/provision-escala-fds.ps1). */
export const STATUS_VALUE: Record<Status, number> = { trabalha: 100000000, plantao: 100000001, folga: 100000002, indisponivel: 100000003 }
export const MOTIVO_VALUE: Record<Motivo, number> = { medico: 100000000, pessoal: 100000001, ferias: 100000002, outro: 100000003 }

const invert = <K extends string>(map: Record<K, number>) => new Map(Object.entries(map).map(([key, value]) => [value as number, key as K]))
export const statusFromValue = (value: unknown) => (typeof value === 'number' ? invert(STATUS_VALUE).get(value) ?? null : null)
export const motivoFromValue = (value: unknown) => (typeof value === 'number' ? invert(MOTIVO_VALUE).get(value) ?? null : null)

// Datas como `aaaa-mm-dd` em calendário local (America/Sao_Paulo no uso real), sem horário.
const pad = (n: number) => String(n).padStart(2, '0')
export const toKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const fromKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (key: string, days: number) => { const date = fromKey(key); date.setDate(date.getDate() + days); return toKey(date) }

/** Sábado do fim de semana a que `date` pertence (domingo volta um dia) ou o próximo sábado. */
export function weekendOf(date: Date) {
  const day = date.getDay()
  const offset = day === 6 ? 0 : day === 0 ? -1 : 6 - day
  return addDays(toKey(date), offset)
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const longFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
export const formatDay = (key: string) => dayFormat.format(fromKey(key))
export const formatDate = (key: string) => longFormat.format(fromKey(key))
export const formatWeekday = (key: string) => weekdayFormat.format(fromKey(key)).replace('.', '')
export const weekendLabel = (saturday: string) => `${formatDay(saturday)} e ${formatDay(addDays(saturday, 1))}`

export const recordKey = (motoristaId: string, data: string) => `${motoristaId}|${data}`

/** Edição local: `null` remove a definição do dia. */
export type Edicao = { status: Status; motivo: Motivo | null; observacao: string } | null

/** Junta registros salvos e edições pendentes, como a tela deve exibir. */
export function mergeEdits(registros: Registro[], edits: Map<string, Edicao>) {
  const result = new Map(registros.map((r) => [recordKey(r.motoristaId, r.data), r]))
  for (const [key, edit] of edits) {
    if (edit === null) { result.delete(key); continue }
    const [motoristaId, data] = key.split('|')
    result.set(key, { id: result.get(key)?.id ?? null, motoristaId, data, ...edit, motivo: edit.status === 'indisponivel' ? edit.motivo : null })
  }
  return result
}

export type Operacao =
  | { tipo: 'criar'; registro: Registro }
  | { tipo: 'atualizar'; registro: Registro & { id: string } }
  | { tipo: 'excluir'; id: string }

/** Converte as edições pendentes em operações; ignora as que não mudam nada. */
export function planSave(registros: Registro[], edits: Map<string, Edicao>): Operacao[] {
  const saved = new Map(registros.map((r) => [recordKey(r.motoristaId, r.data), r]))
  const merged = mergeEdits(registros, edits)
  const ops: Operacao[] = []
  for (const key of edits.keys()) {
    const before = saved.get(key)
    const after = merged.get(key)
    if (!after) { if (before?.id) ops.push({ tipo: 'excluir', id: before.id }); continue }
    if (!before?.id) { ops.push({ tipo: 'criar', registro: after }); continue }
    if (before.status !== after.status || before.motivo !== after.motivo || before.observacao !== after.observacao) ops.push({ tipo: 'atualizar', registro: { ...after, id: before.id } })
  }
  return ops
}

/** Dias de `inicio` a `fim` (inclusive); limitado a 62 dias para evitar lote acidental. */
export function dateRange(inicio: string, fim: string) {
  const days: string[] = []
  for (let key = inicio; key <= fim && days.length < 62; key = addDays(key, 1)) days.push(key)
  return days
}

export type LinhaRodizio = { motorista: Motorista; ultimas8: number; ano: number; acimaDaMedia: boolean }

/**
 * Fins de semana trabalhados (Trabalha ou Plantão em sábado ou domingo contam uma vez por fim de semana),
 * nas 8 semanas que terminam no fim de semana de referência e no ano dele até a referência.
 */
export function rodizio(motoristas: Motorista[], registros: Iterable<Registro>, referencia: string): LinhaRodizio[] {
  const fim = addDays(referencia, 1)
  const inicio8 = addDays(referencia, -7 * 7)
  const inicioAno = `${referencia.slice(0, 4)}-01-01`
  const semanas = new Map<string, { ultimas8: Set<string>; ano: Set<string> }>()
  for (const r of registros) {
    if (r.status !== 'trabalha' && r.status !== 'plantao') continue
    const day = fromKey(r.data).getDay()
    if ((day !== 6 && day !== 0) || r.data > fim) continue
    const sabado = weekendOf(fromKey(r.data))
    const entry = semanas.get(r.motoristaId) ?? { ultimas8: new Set(), ano: new Set() }
    if (sabado >= inicio8) entry.ultimas8.add(sabado)
    if (r.data >= inicioAno) entry.ano.add(sabado)
    semanas.set(r.motoristaId, entry)
  }
  const linhas = motoristas.map((motorista) => ({ motorista, ultimas8: semanas.get(motorista.id)?.ultimas8.size ?? 0, ano: semanas.get(motorista.id)?.ano.size ?? 0 }))
  const media = linhas.length ? linhas.reduce((sum, l) => sum + l.ultimas8, 0) / linhas.length : 0
  return linhas
    .map((l) => ({ ...l, acimaDaMedia: l.ultimas8 > media + 0.5 }))
    .sort((a, b) => a.ultimas8 - b.ultimas8 || a.ano - b.ano || a.motorista.nome.localeCompare(b.motorista.nome, 'pt-BR'))
}
