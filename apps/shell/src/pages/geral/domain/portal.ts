import type { StatusValidacao } from '../../validacao-cliente/domain/types'
import type { Column } from './types'

/** `new_status` da composição de preços (metadata do DEV, 28/10/2026): 100000000 Pendente, 100000001 Concluído. */
export const COMPOSICAO_CONCLUIDA = 100000001
/** `cr40f_status` da reserva. */
export const RESERVA_CANCELADA = 202410002

// Status, prazo da tácita e rótulos vêm da tela #/validacao-cliente: uma regra só para quem libera.
export { STATUS_VALOR as STATUS_VALIDACAO, prazoTacita, situacaoLabel as rotuloStatus, situacaoTone as tomStatus, statusDoValor } from '../../validacao-cliente/domain/regras'
export type { StatusValidacao } from '../../validacao-cliente/domain/types'

/** O que a liberação precisa saber de cada reserva selecionada. */
export type Candidato = {
  id: string
  codigo: string
  cliente: { id: string; nome: string } | null
  portalHabilitado: boolean
  composicaoConcluida: boolean
  valor: number | null
  cancelado: boolean
  /** Validação existente (uma por reserva); `retirado` pode ser liberada de novo. */
  validacao: { id: string; status: StatusValidacao } | null
}

export type Motivo = 'cancelado' | 'ja_liberado' | 'sem_cliente' | 'sem_portal' | 'composicao'
const ROTULO_MOTIVO: Record<Motivo, string> = {
  cancelado: 'Serviço cancelado',
  ja_liberado: 'Já liberado',
  sem_cliente: 'Sem cliente',
  sem_portal: 'Cliente sem portal',
  composicao: 'Composição não concluída',
}
export const rotuloMotivo = (m: Motivo) => ROTULO_MOTIVO[m]

/** `null` = pronto para liberar; senão, o primeiro motivo que impede. */
export function motivoBloqueio(c: Candidato): Motivo | null {
  if (c.cancelado) return 'cancelado'
  if (c.validacao && c.validacao.status !== 'retirado') return 'ja_liberado'
  if (!c.cliente) return 'sem_cliente'
  if (!c.portalHabilitado) return 'sem_portal'
  if (!c.composicaoConcluida) return 'composicao'
  return null
}

export type Classificacao = { prontos: Candidato[]; bloqueados: { candidato: Candidato; motivo: Motivo }[]; total: number }

export function classificar(candidatos: Candidato[]): Classificacao {
  const prontos: Candidato[] = []
  const bloqueados: Classificacao['bloqueados'] = []
  for (const c of candidatos) {
    const motivo = motivoBloqueio(c)
    if (motivo) bloqueados.push({ candidato: c, motivo })
    else prontos.push(c)
  }
  // Soma em centavos: evita 0,1 + 0,2.
  const total = prontos.reduce((acc, c) => acc + Math.round((c.valor ?? 0) * 100), 0) / 100
  return { prontos, bloqueados, total }
}

/** Coluna virtual "Portal" (status da validação): fica no painel de colunas, oculta por padrão, sem ordenação nem filtro. */
export const PORTAL_KEY = 'portal'
export const PORTAL_COLUMN: Column = { key: PORTAL_KEY, attribute: PORTAL_KEY, alias: null, entity: null, width: 170, label: 'Portal' }
