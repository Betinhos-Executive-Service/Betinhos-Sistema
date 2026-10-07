import type { ChoiceSet } from './types'
import { RECIBO, STATUS } from './status'

/**
 * Rótulos lidos da metadata de DEV em 07/10/2026. Usados só se a metadata não responder,
 * para a lista não travar por causa de um rótulo; os valores são os mesmos das regras.
 */
export const FALLBACK_CHOICES: ChoiceSet = {
  status: [
    { value: STATUS.pendente, label: 'Pendente' }, { value: STATUS.pago, label: 'Pago' }, { value: STATUS.cancelado, label: 'Cancelado' },
    { value: STATUS.negado, label: 'Negado' }, { value: STATUS.expirado, label: 'Expirado' }, { value: STATUS.naoFinalizado, label: 'Não Finalizado' },
    { value: STATUS.autorizado, label: 'Autorizado' }, { value: STATUS.aguardandoFacial, label: 'Aguardando Facial' },
  ],
  forma: [{ value: 202410000, label: 'Cartão de crédito' }, { value: 202410001, label: 'Pedido de compra' }, { value: 202410002, label: 'Pix' }],
  recibo: [{ value: RECIBO.pendente, label: 'Pendente' }, { value: RECIBO.gerado, label: 'Recibo Gerado' }, { value: RECIBO.enviado, label: 'Recibo Enviado' }],
}

/** Metadata vazia ou parcial cai no rótulo conhecido, opção por opção. */
export function withFallback(choices: Partial<ChoiceSet>): ChoiceSet {
  const pick = (key: keyof ChoiceSet) => (choices[key]?.length ? choices[key]! : FALLBACK_CHOICES[key])
  return { status: pick('status'), forma: pick('forma'), recibo: pick('recibo') }
}
