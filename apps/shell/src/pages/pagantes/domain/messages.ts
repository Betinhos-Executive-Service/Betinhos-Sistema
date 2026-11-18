import { phoneDigits } from '../../operacional/domain/phone'
import { formatDate, formatDateTime, formatMoney } from '../../../app/format'
import { STATUS, isPaid } from './status'
import type { Contato, Pagante } from './types'

export { formatDate, formatDateTime, formatMoney }

export type SharedLink = { kind: 'pagamento' | 'recibo'; url: string }

/** Só http(s): um `javascript:` gravado no Dataverse nunca vira link clicável. */
export function safeUrl(raw: string) {
  try {
    const url = new URL(raw.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * Link que faz sentido mandar agora: recibo depois de pago; antes, o de pagamento
 * e, sem ele (Pix ou pedido de compra), o recibo já emitido. Cancelado não tem link.
 */
export function linkToShare(p: Pagante): SharedLink | null {
  if (p.status === STATUS.cancelado) return null
  const pagamento = safeUrl(p.linkPagamento)
  const recibo = safeUrl(p.linkRecibo)
  if (isPaid(p)) return recibo ? { kind: 'recibo', url: recibo } : null
  if (pagamento) return { kind: 'pagamento', url: pagamento }
  return recibo ? { kind: 'recibo', url: recibo } : null
}

const firstName = (nome: string) => nome.trim().split(/\s+/)[0] ?? ''

export function whatsappText(p: Pagante, contato?: Contato) {
  const nome = firstName(contato?.nome || p.pessoa)
  const saudacao = nome ? `Olá, ${nome}!` : 'Olá!'
  const link = linkToShare(p)
  const ref = [p.codigo, formatMoney(p.valor)].filter((x) => x && x !== '—').join(', ')
  if (link?.kind === 'pagamento') {
    return `${saudacao} Aqui é da Betinhos Executive Service.\n\nSegue o link para o pagamento do seu serviço (${ref}):\n${link.url}\n\nQualquer dúvida, estamos à disposição.`
  }
  if (link?.kind === 'recibo') {
    const abertura = isPaid(p) ? `Obrigado pelo pagamento (${ref}). Segue o seu recibo:` : `Segue o recibo do seu serviço (${ref}):`
    return `${saudacao} Aqui é da Betinhos Executive Service.\n\n${abertura}\n${link.url}`
  }
  return `${saudacao} Aqui é da Betinhos Executive Service.`
}

/** Conversa no WhatsApp com a mensagem pronta; null sem telefone brasileiro válido. */
export function whatsappUrl(p: Pagante, contato?: Contato) {
  const digits = contato?.telefone ? phoneDigits(contato.telefone) : null
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappText(p, contato))}` : null
}
