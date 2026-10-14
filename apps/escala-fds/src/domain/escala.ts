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
  const dias = [...new Set(a.dias.filter(Boolean))].sort()
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
