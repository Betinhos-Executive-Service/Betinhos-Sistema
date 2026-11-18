import { toDataverseDate, type DateBehavior } from '../data/dates'
import { COLISAO, MANUT, STATUS_FIELD } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Kind } from '../data/types'
import { rawErrorMessage } from '../data/xrm'

export type FieldSpec = { key: string; label: string; type: 'text' | 'textarea' | 'date' | 'datetime' | 'money'; required: boolean; maxLength?: number }
export type Requisito = 'veiculo' | 'motorista'

export type Transition = {
  id: string
  to: number
  label: string
  fields: FieldSpec[]
  danger?: boolean
  /** Dado que o registro precisa ter antes da ação (mesma exigência do botão nativo). */
  requires?: Requisito
  /** Campos fixos gravados junto com o status. */
  set?: Record<string, unknown>
}

export type RegistroStatus = { id: string; status: number | null; temVeiculo: boolean; temMotorista: boolean }

const cancelarColisao: Transition = { id: 'cancelar', to: COLISAO.CANCELADO, label: 'Cancelar colisão', fields: [], danger: true }
const RULES: Record<Kind, Record<number, Transition[]>> = {
  // Manutenção não passa pelo StatusPanel: as ações dela são Custom APIs (acoesManutencao / executarAcaoManutencao, abaixo).
  manutencao: {},
  // Multa anda pelo passo a passo (MultaPassoAPasso → cr40f_PassoMulta); não tem transição de status aqui.
  multa: {},
  colisao: {
    [COLISAO.ENVIADO]: [{ id: 'analisar', to: COLISAO.ANALISE, label: 'Colocar em análise', fields: [] }, cancelarColisao],
    [COLISAO.ANALISE]: [{ id: 'resolver', to: COLISAO.RESOLVIDO, label: 'Marcar como resolvido', fields: [] }, cancelarColisao],
  },
}

export function transitionsFor(kind: Kind, status: number | null): Transition[] {
  return status === null ? [] : RULES[kind][status] ?? []
}

/** Motivo pelo qual a ação não pode ser feita neste registro, ou null. */
export function bloqueio(transition: Transition, record: RegistroStatus): string | null {
  if (transition.requires === 'veiculo' && !record.temVeiculo) return 'Informe o veículo no formulário antes desta ação'
  if (transition.requires === 'motorista' && !record.temMotorista) return 'Informe o motorista no formulário antes desta ação'
  return null
}

export function validate(transition: Transition, values: Record<string, string>) {
  const errors: Record<string, string> = {}
  for (const field of transition.fields) {
    const raw = (values[field.key] ?? '').trim()
    if (!raw) {
      if (field.required) errors[field.key] = 'Obrigatório'
      continue
    }
    if (field.maxLength && raw.length > field.maxLength) errors[field.key] = `Máximo de ${field.maxLength} caracteres`
    if (field.type === 'money' && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) errors[field.key] = 'Informe um valor válido'
    if (field.type === 'datetime' && Number.isNaN(new Date(`${raw}:00-03:00`).getTime())) errors[field.key] = 'Data inválida'
  }
  return errors
}

/** Campos que a tela grava: o status novo, os campos fixos e os preenchidos. */
export function buildPatch(kind: Kind, transition: Transition, values: Record<string, string>, ctx: { now: Date; dateBehaviors: Record<string, DateBehavior> }) {
  const patch: Record<string, unknown> = { [STATUS_FIELD[kind]]: transition.to, ...transition.set }
  for (const field of transition.fields) {
    const raw = (values[field.key] ?? '').trim()
    if (!raw) continue
    if (field.type === 'date') {
      const behavior = ctx.dateBehaviors[field.key]
      if (!behavior) throw new Error(`Metadata de data indisponível para ${field.key}`)
      patch[field.key] = toDataverseDate(raw, behavior)
    } else if (field.type === 'datetime') {
      // O campo datetime-local é preenchido no horário de São Paulo (UTC-3, sem horário de verão).
      patch[field.key] = new Date(`${raw}:00-03:00`).toISOString()
    } else if (field.type === 'money') {
      patch[field.key] = Number(raw)
    } else {
      patch[field.key] = raw
    }
  }
  return patch
}

export class StaleError extends Error {
  constructor() {
    super('Este registro foi alterado por outra pessoa. A tela foi recarregada')
    this.name = 'StaleError'
  }
}

/**
 * Relê o status no servidor e, só se ainda for o que a tela mostrava, grava o status e os campos da etapa.
 */
export async function applyTransition(source: DataSource, kind: Kind, record: RegistroStatus, transition: Transition, values: Record<string, string>, now = new Date()): Promise<void> {
  if (!transitionsFor(kind, record.status).includes(transition)) throw new Error('Esta ação não está disponível para o status atual do registro')
  const motivo = bloqueio(transition, record)
  if (motivo) throw new Error(motivo)
  const erros = validate(transition, values)
  if (Object.keys(erros).length > 0) throw new Error('Preencha os campos obrigatórios antes de confirmar')
  const current = await source.currentStatus(kind, record.id)
  if (current !== record.status) throw new StaleError()
  const dateBehaviors = transition.fields.some((field) => field.type === 'date') ? await source.dateBehaviors(kind) : {}
  await source.update(kind, record.id, buildPatch(kind, transition, values, { now, dateBehaviors }))
}

// ---------- Manutenção (Custom APIs cr40f_Manutencao*, plano 1 das manutenções v2) ----------

export type AcaoManutencao = 'encaixar' | 'reprovar' | 'cancelar' | 'concluir' | 'programar'

/** Ciclo novo (spec 2026-11-16-manutencoes-v2): encaixar é aprovar; reprovar só antes do encaixe; concluir também lança depois do fato. */
const ACOES_MANUTENCAO: Partial<Record<number, AcaoManutencao[]>> = {
  [MANUT.SOLICITADO]: ['encaixar', 'reprovar', 'cancelar', 'concluir'],
  [MANUT.AGENDADO]: ['encaixar', 'programar', 'cancelar', 'concluir'],
  [MANUT.PROGRAMADO]: ['encaixar', 'cancelar', 'concluir'],
}

export function acoesManutencao(status: number | null): AcaoManutencao[] {
  return status === null ? [] : ACOES_MANUTENCAO[status] ?? []
}

const ROTULO_ACAO: Record<Exclude<AcaoManutencao, 'encaixar'>, string> = { reprovar: 'Reprovar', cancelar: 'Cancelar manutenção', concluir: 'Concluir', programar: 'Programar' }

export function rotuloAcao(acao: AcaoManutencao, status: number | null): string {
  if (acao === 'encaixar') return status === MANUT.SOLICITADO ? 'Encaixar' : 'Reagendar'
  return ROTULO_ACAO[acao]
}

/** Manutenções com uma ação em execução agora (uma por vez). */
const acoesEmCurso = new Set<string>()

/**
 * Relê o status no servidor e só executa se ele ainda for o que a tela mostrava (senão, StaleError). A reserva da vez é
 * síncrona, antes de qualquer await: dois cliques seguidos não disparam duas chamadas.
 */
export async function executarAcaoManutencao<T>(source: Pick<DataSource, 'currentStatus'>, record: { id: string; status: number | null }, acao: AcaoManutencao, executar: () => Promise<T>): Promise<T> {
  if (!acoesManutencao(record.status).includes(acao)) throw new Error('Esta ação não está disponível para o status atual da manutenção')
  const chave = `manutencao:${record.id}`
  if (acoesEmCurso.has(chave)) throw new Error('Já há uma ação em andamento para esta manutenção. Aguarde')
  acoesEmCurso.add(chave)
  try {
    const atual = await source.currentStatus('manutencao', record.id)
    if (atual !== record.status) throw new StaleError()
    return await executar()
  } finally {
    acoesEmCurso.delete(chave)
  }
}

/** O que a gaveta faz com o resultado de uma ação da manutenção: seguir, recarregar (StaleError) ou mostrar a falha. */
export type DesfechoAcao<T> = { tipo: 'feito'; valor: T } | { tipo: 'desatualizada' } | { tipo: 'falha'; mensagem: string }

/** Único ponto que separa "outra pessoa mudou a manutenção" de falha comum (a mensagem do servidor chega como veio, com o ponto final). As gavetas só decidem o que mostrar. */
export async function desfechoDaAcao<T>(executar: () => Promise<T>): Promise<DesfechoAcao<T>> {
  try {
    return { tipo: 'feito', valor: await executar() }
  } catch (reason) {
    return reason instanceof StaleError ? { tipo: 'desatualizada' } : { tipo: 'falha', mensagem: rawErrorMessage(reason) }
  }
}
