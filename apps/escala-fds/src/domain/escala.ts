/** Regras puras da escala de fim de semana: datas, padrão fixo, exceções, compromissos e rodízio. */

/** Plantão = dia de trabalho escalado; Trabalha = se colocou disponível (sem hora extra). */
export type Situacao = 'plantao' | 'trabalha' | 'folga'
export type Motivo = 'medico' | 'pessoal' | 'ferias' | 'outro'

export type Padrao = { sab: Situacao | null; dom: Situacao | null }
/** Só motoristas com status Ativo; `terceiro` = vínculo Terceiro (cr40f_tipodevinculo = 1). */
export type Motorista = { id: string; nome: string; padrao: Padrao; terceiro: boolean }

/** Exceção de um dia (linha de cr40f_escalafds): sobrescreve o padrão do motorista naquela data. */
export type Excecao = { id: string | null; motoristaId: string; data: string; situacao: Situacao }

/** Compromisso (cr40f_compromissofds). `inicio`/`fim` em horário local `aaaa-mm-ddTHH:mm`. */
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

export const SITUACAO_LABEL: Record<Situacao, string> = { plantao: 'Plantão', trabalha: 'Trabalha', folga: 'Folga' }
export const MOTIVO_LABEL: Record<Motivo, string> = { medico: 'Médico', pessoal: 'Pessoal', ferias: 'Férias', outro: 'Outro' }

/** Valores das choices no Dataverse (schema/provision-escala-fds.ps1). Indisponível (100000003) existe no choice, mas não é mais usado. */
export const SITUACAO_VALUE: Record<Situacao, number> = { trabalha: 100000000, plantao: 100000001, folga: 100000002 }
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
export const isWeekend = (key: string) => { const day = fromKey(key).getDay(); return day === 0 || day === 6 }

/** Sábado do fim de semana a que `date` pertence (domingo volta um dia) ou o próximo sábado. */
export function weekendOf(date: Date) {
  const day = date.getDay()
  return addDays(toKey(date), day === 6 ? 0 : day === 0 ? -1 : 6 - day)
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const longFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
export const formatDay = (key: string) => dayFormat.format(fromKey(key))
export const formatDate = (key: string) => longFormat.format(fromKey(key))
export const formatWeekday = (key: string) => weekdayFormat.format(fromKey(key)).replace('.', '')
export const weekendLabel = (saturday: string) => `${formatDay(saturday)} e ${formatDay(addDays(saturday, 1))}`
/** Segunda a sexta da semana que termina no fim de semana de `sabado`. */
export const diasUteis = (sabado: string) => [-5, -4, -3, -2, -1].map((d) => addDays(sabado, d))
const hora = (hhmm: string) => (hhmm.endsWith(':00') ? `${Number(hhmm.slice(0, 2))}h` : hhmm.replace(':', 'h'))

export const recordKey = (motoristaId: string, data: string) => `${motoristaId}|${data}`

/** Situação efetiva: exceção do dia, senão o padrão do motorista para sábado/domingo. */
export function situacaoDoDia(motorista: Motorista, data: string, excecoes: Map<string, Excecao>) {
  const excecao = excecoes.get(recordKey(motorista.id, data))
  if (excecao) return { situacao: excecao.situacao, origem: 'excecao' as const }
  const day = fromKey(data).getDay()
  const padrao = day === 6 ? motorista.padrao.sab : day === 0 ? motorista.padrao.dom : null
  return padrao ? { situacao: padrao, origem: 'padrao' as const } : { situacao: null, origem: null }
}

/** Compromissos que ocupam alguma parte do dia `data`, com o texto do trecho ("Indisponível até 12h"). */
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

/** Alterações ainda não gravadas (o salvamento automático as grava em seguida). Exceção `null` = volta ao padrão. */
export type Pendencias = {
  excecoes: Map<string, Situacao | null>
  padroes: Map<string, Padrao>
  novos: Compromisso[]
  excluidos: Set<string>
}
export const semPendencias = (): Pendencias => ({ excecoes: new Map(), padroes: new Map(), novos: [], excluidos: new Set() })
export const totalPendencias = (p: Pendencias) => p.excecoes.size + p.padroes.size + p.novos.length + p.excluidos.size
export const clonarPendencias = (p: Pendencias): Pendencias => ({ excecoes: new Map(p.excecoes), padroes: new Map(p.padroes), novos: [...p.novos], excluidos: new Set(p.excluidos) })

export type Dados = { motoristas: Motorista[]; excecoes: Excecao[]; compromissos: Compromisso[] }

/** Dados como a tela deve exibir: salvos + pendências. */
export function aplicarPendencias(dados: Dados, p: Pendencias) {
  const motoristas = dados.motoristas.map((m) => (p.padroes.has(m.id) ? { ...m, padrao: p.padroes.get(m.id)! } : m))
  const excecoes = new Map(dados.excecoes.map((e) => [recordKey(e.motoristaId, e.data), e]))
  for (const [key, situacao] of p.excecoes) {
    if (situacao === null) { excecoes.delete(key); continue }
    const [motoristaId, data] = key.split('|')
    excecoes.set(key, { id: excecoes.get(key)?.id ?? null, motoristaId, data, situacao })
  }
  const compromissos = [...dados.compromissos.filter((c) => !c.id || !p.excluidos.has(c.id)), ...p.novos]
  return { motoristas, excecoes, compromissos }
}

export type Operacao =
  | { tipo: 'criarExcecao'; excecao: Excecao }
  | { tipo: 'atualizarExcecao'; excecao: Excecao & { id: string } }
  | { tipo: 'excluirExcecao'; id: string }
  | { tipo: 'criarCompromisso'; compromisso: Compromisso }
  | { tipo: 'excluirCompromisso'; id: string }
  | { tipo: 'padrao'; motoristaId: string; padrao: Padrao }

/** Converte pendências em operações, nesta ordem: exceções, compromissos, padrões. Ignora o que não muda nada. */
export function planSave(dados: Dados, p: Pendencias): Operacao[] {
  const salvas = new Map(dados.excecoes.map((e) => [recordKey(e.motoristaId, e.data), e]))
  const ops: Operacao[] = []
  for (const [key, situacao] of p.excecoes) {
    const antes = salvas.get(key)
    const [motoristaId, data] = key.split('|')
    if (situacao === null) { if (antes?.id) ops.push({ tipo: 'excluirExcecao', id: antes.id }); continue }
    if (!antes?.id) ops.push({ tipo: 'criarExcecao', excecao: { id: null, motoristaId, data, situacao } })
    else if (antes.situacao !== situacao) ops.push({ tipo: 'atualizarExcecao', excecao: { ...antes, id: antes.id, situacao } })
  }
  for (const c of p.novos) ops.push({ tipo: 'criarCompromisso', compromisso: c })
  for (const id of p.excluidos) ops.push({ tipo: 'excluirCompromisso', id })
  const atuais = new Map(dados.motoristas.map((m) => [m.id, m.padrao]))
  for (const [motoristaId, padrao] of p.padroes) {
    const antes = atuais.get(motoristaId)
    if (!antes || antes.sab !== padrao.sab || antes.dom !== padrao.dom) ops.push({ tipo: 'padrao', motoristaId, padrao })
  }
  return ops
}

/**
 * Tira de `atual` o que o `lote` gravou. Só sai a pendência que continua igual à do lote: o que mudou
 * durante a gravação fica para o próximo lote. `feitas` = operações concluídas (falha no meio); sem ela, o lote inteiro.
 */
export function descontarSalvas(atual: Pendencias, lote: Pendencias, dados: Dados, feitas?: Operacao[]): Pendencias {
  const next = clonarPendencias(atual)
  const chaveDoId = new Map(dados.excecoes.flatMap((e) => (e.id ? [[e.id, recordKey(e.motoristaId, e.data)] as const] : [])))
  const excecoes = feitas && new Set(feitas.flatMap((o) => (o.tipo === 'criarExcecao' || o.tipo === 'atualizarExcecao' ? [recordKey(o.excecao.motoristaId, o.excecao.data)]
    : o.tipo === 'excluirExcecao' ? [chaveDoId.get(o.id) ?? ''] : [])))
  const padroes = feitas && new Set(feitas.flatMap((o) => (o.tipo === 'padrao' ? [o.motoristaId] : [])))
  const novos = new Set(feitas ? feitas.flatMap((o) => (o.tipo === 'criarCompromisso' ? [o.compromisso] : [])) : lote.novos)
  const excluidos = feitas ? feitas.flatMap((o) => (o.tipo === 'excluirCompromisso' ? [o.id] : [])) : [...lote.excluidos]
  for (const [key, situacao] of lote.excecoes) if ((!excecoes || excecoes.has(key)) && next.excecoes.has(key) && next.excecoes.get(key) === situacao) next.excecoes.delete(key)
  for (const [id, padrao] of lote.padroes) if ((!padroes || padroes.has(id)) && next.padroes.get(id) === padrao) next.padroes.delete(id)
  next.novos = next.novos.filter((c) => !novos.has(c))
  for (const id of excluidos) next.excluidos.delete(id)
  return next
}

export type View = ReturnType<typeof aplicarPendencias>

/** Dias de `inicio` a `fim` (inclusive); limitado a 62 dias para evitar lote acidental. */
export function dateRange(inicio: string, fim: string) {
  const days: string[] = []
  for (let key = inicio; key <= fim && days.length < 62; key = addDays(key, 1)) days.push(key)
  return days
}
