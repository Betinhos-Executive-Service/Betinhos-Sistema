import type { Row } from '@betinhos/dataverse'
import { MOTIVO, OPERACIONAL } from './status'
import type { Despesa } from './types'

/** O que o gestor pode fazer com uma despesa que a IA não fechou. Não existe "Recusar": a despesa já aconteceu. */
export type Decisao = 'validar' | 'devolver' | 'cancelar'

/** Devolver e cancelar exigem motivo; validar não. */
export const motivoValido = (motivo: string) => motivo.trim().length >= MOTIVO.min

/** Só despesa ainda em andamento aceita decisão; Validado e Cancelado são finais, mesmo com a flag do gestor esquecida. */
export const decidivel = (d: Pick<Despesa, 'statusOperacional'>) =>
  d.statusOperacional === OPERACIONAL.enviado || d.statusOperacional === OPERACIONAL.corrigir

/** Colunas gravadas no PATCH (`cr40f_despesaoperacional`). Zera `aguardandogestor` em toda decisão. */
export function patchDecisao(tipo: Decisao, motivo: string): Row {
  const texto = motivo.trim()
  switch (tipo) {
    case 'validar': return { cr40f_statusoperacional: OPERACIONAL.validado, new_aguardandogestor: false }
    // A justificativa foi lida pelo gestor: sai, para a próxima rodada do motorista começar limpa.
    case 'devolver': return { cr40f_statusoperacional: OPERACIONAL.corrigir, new_motivodevolucao: texto, new_aguardandogestor: false, new_justificativamotorista: null }
    case 'cancelar': return { cr40f_statusoperacional: OPERACIONAL.cancelado, new_motivodevolucao: texto, new_aguardandogestor: false }
  }
}

/** A mesma decisão na despesa em memória, para a lista refletir a gravação sem recarregar. */
export function aplicarDecisao(d: Despesa, tipo: Decisao, motivo: string, agora = new Date()): Despesa {
  const texto = motivo.trim()
  const base = { ...d, aguardandoGestor: false, alteradoEm: agora }
  switch (tipo) {
    case 'validar': return { ...base, statusOperacional: OPERACIONAL.validado }
    case 'devolver': return { ...base, statusOperacional: OPERACIONAL.corrigir, motivoDevolucao: texto, justificativaMotorista: '' }
    case 'cancelar': return { ...base, statusOperacional: OPERACIONAL.cancelado, motivoDevolucao: texto }
  }
}

export const MENSAGEM_DECISAO: Record<Decisao, string> = { validar: 'Despesa validada.', devolver: 'Despesa devolvida ao motorista.', cancelar: 'Despesa cancelada.' }

/**
 * Próxima despesa esperando o gestor na ordem da lista: a que vem depois da atual; no fim, volta ao começo.
 * A atual fica de fora (acabou de ser decidida). Sem mais nenhuma, null.
 */
export function proximaEsperando(list: Despesa[], atualId: string): string | null {
  const posicao = list.findIndex((d) => d.id === atualId)
  let primeira: string | null = null
  for (let i = 0; i < list.length; i++) {
    const d = list[i]
    if (!d.aguardandoGestor || d.id === atualId) continue
    if (i > posicao) return d.id
    primeira ??= d.id
  }
  return primeira
}
