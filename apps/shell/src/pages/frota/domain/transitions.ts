import { toDataverseDate, type DateBehavior } from '../data/dates'
import { COLISAO, MANUT, MULTA, MULTA_CAMPO, STATUS_FIELD } from '../data/schema'
import { FlowIncertoError, type DataSource, type FlowId, type FlowResult } from '../data/source'
import type { Kind } from '../data/types'

export type FieldSpec = { key: string; label: string; type: 'text' | 'textarea' | 'date' | 'datetime' | 'money'; required: boolean; maxLength?: number }
export type Requisito = 'veiculo' | 'motorista'

export type Transition = {
  id: string
  to: number
  label: string
  fields: FieldSpec[]
  danger?: boolean
  /** Quando presente, o status é gravado pelo Flow, não pela tela. */
  flow?: FlowId
  /** Dado que o registro precisa ter antes da ação (mesma exigência do botão nativo). */
  requires?: Requisito
  /** Campos fixos gravados junto com o status. */
  set?: Record<string, unknown>
}

export type RegistroStatus = { id: string; status: number | null; temVeiculo: boolean; temMotorista: boolean }

const agendarPara: FieldSpec = { key: 'cr40f_agendarpara', label: 'Agendar para', type: 'date', required: true }
const comentario = (required: boolean): FieldSpec => ({ key: 'cr40f_comentariosdoaprovador', label: 'Comentário do aprovador', type: 'text', required, maxLength: 100 })

const concluir: Transition = {
  id: 'concluir', to: MANUT.REALIZADO, label: 'Concluir',
  fields: [
    { key: 'cr40f_datamanutencao', label: 'Data e hora da manutenção', type: 'datetime', required: true },
    { key: 'cr40f_valor', label: 'Valor (R$)', type: 'money', required: true },
    { key: 'cr40f_estabelecimento', label: 'Estabelecimento', type: 'text', required: true, maxLength: 100 },
    { key: 'cr40f_servicorealizado', label: 'Serviço realizado', type: 'textarea', required: true, maxLength: 100 },
  ],
}
const cancelarManutencao: Transition = { id: 'cancelar', to: MANUT.CANCELADO, label: 'Cancelar manutenção', fields: [], danger: true }
const cancelarColisao: Transition = { id: 'cancelar', to: COLISAO.CANCELADO, label: 'Cancelar colisão', fields: [], danger: true }
const desfechosMulta: Transition[] = [
  { id: 'recurso', to: MULTA.RECURSO, label: 'Entrar com recurso', fields: [], set: { [MULTA_CAMPO.recursoPendente]: true } },
  { id: 'descontado', to: MULTA.DESCONTADO, label: 'Marcar como descontado', fields: [] },
  { id: 'pago', to: MULTA.PAGO, label: 'Marcar como pago', fields: [] },
]
const finalizar: Transition = { id: 'finalizar', to: MULTA.FINALIZADO, label: 'Finalizar', fields: [] }

const RULES: Record<Kind, Record<number, Transition[]>> = {
  manutencao: {
    [MANUT.SOLICITADO]: [
      { id: 'aprovar', to: MANUT.APROVADO, label: 'Aprovar e agendar', fields: [agendarPara, comentario(false)], flow: 'aprovarManutencao', requires: 'veiculo' },
      // Não grava cr40f_datadaaprovacao: a regra de negócio "Aprovado" troca o status para Aprovado quando essa data é gravada.
      { id: 'reprovar', to: MANUT.REPROVADO, label: 'Reprovar', fields: [comentario(true)], danger: true },
      cancelarManutencao,
    ],
    [MANUT.APROVADO]: [{ id: 'programar', to: MANUT.PROGRAMADO, label: 'Programar', fields: [agendarPara] }, concluir, cancelarManutencao],
    [MANUT.PROGRAMADO]: [concluir, cancelarManutencao],
  },
  multa: {
    [MULTA.NOTIFICAR]: [{ id: 'notificado', to: MULTA.NOTIFICADO, label: 'Notificar condutor', fields: [], flow: 'notificarCondutor', requires: 'motorista' }],
    [MULTA.NOTIFICADO]: [{ id: 'indicar', to: MULTA.INDICADA, label: 'Gerar contrato de indicação', fields: [], flow: 'gerarContrato', requires: 'motorista' }, ...desfechosMulta],
    [MULTA.INDICADA]: desfechosMulta,
    [MULTA.DESCONTADO]: [finalizar],
    [MULTA.PAGO]: [finalizar],
  },
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

/** Campos que a tela grava. Em transição com Flow o status fica de fora: quem grava é o Flow. */
export function buildPatch(kind: Kind, transition: Transition, values: Record<string, string>, ctx: { now: Date; dateBehaviors: Record<string, DateBehavior> }) {
  const patch: Record<string, unknown> = transition.flow ? {} : { [STATUS_FIELD[kind]]: transition.to, ...transition.set }
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

/** Registros (`${kind}:${id}`) com uma chamada de Flow executando agora. */
const flowsEmCurso = new Set<string>()
/** Registros cuja última chamada de Flow terminou sem resposta (tempo esgotado ou rede): resultado desconhecido. */
const flowsIncertos = new Set<string>()

/** Uma recarga mostra o status real, então um resultado incerto pode ser tentado de novo; uma chamada ainda em execução continua bloqueada até terminar. */
export function liberarFlows(): void {
  flowsIncertos.clear()
}

export class StaleError extends Error {
  constructor() {
    super('Este registro foi alterado por outra pessoa. A tela foi recarregada')
    this.name = 'StaleError'
  }
}

/**
 * Relê o status no servidor e só age se ele ainda for o que a tela mostrava.
 * Transição direta: grava o status. Transição com Flow: grava os campos da etapa e chama o Flow.
 */
export async function applyTransition(source: DataSource, kind: Kind, record: RegistroStatus, transition: Transition, values: Record<string, string>, now = new Date()): Promise<FlowResult | null> {
  if (!transitionsFor(kind, record.status).includes(transition)) throw new Error('Esta ação não está disponível para o status atual do registro')
  const motivo = bloqueio(transition, record)
  if (motivo) throw new Error(motivo)
  const erros = validate(transition, values)
  if (Object.keys(erros).length > 0) throw new Error('Preencha os campos obrigatórios antes de confirmar')
  const flow = transition.flow
  const chave = `${kind}:${record.id}`
  if (!flow) {
    const current = await source.currentStatus(kind, record.id)
    if (current !== record.status) throw new StaleError()
    const dateBehaviors = transition.fields.some((field) => field.type === 'date') ? await source.dateBehaviors(kind) : {}
    await source.update(kind, record.id, buildPatch(kind, transition, values, { now, dateBehaviors }))
    return null
  }
  // Verifica e reserva a chave de forma síncrona, antes de qualquer await: duas chamadas simultâneas não passam juntas.
  if (flowsEmCurso.has(chave) || flowsIncertos.has(chave)) throw new Error('Já há uma ação em andamento para este registro. Aguarde e recarregue a tela')
  flowsEmCurso.add(chave)
  try {
    const current = await source.currentStatus(kind, record.id)
    if (current !== record.status) throw new StaleError()
    // Resolve a URL do Flow antes de gravar qualquer campo: se ela não estiver disponível, nada é alterado.
    await source.prepareFlow(flow)
    const dateBehaviors = transition.fields.some((field) => field.type === 'date') ? await source.dateBehaviors(kind) : {}
    const patch = buildPatch(kind, transition, values, { now, dateBehaviors })
    if (Object.keys(patch).length > 0) await source.update(kind, record.id, patch)
    try {
      return await source.runFlow(flow, record.id)
    } catch (reason) {
      // Resultado incerto (tempo esgotado, rede): o Flow pode ainda estar rodando, então o bloqueio fica até recarregar.
      // Entra em "incertos" antes de sair de "em curso" (finally): a chave nunca fica fora dos dois conjuntos.
      if (reason instanceof FlowIncertoError) flowsIncertos.add(chave)
      throw reason
    }
  } finally {
    flowsEmCurso.delete(chave)
  }
}
