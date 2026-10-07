import { phoneDigits } from '../../operacional/domain/phone'
import { STATUS, isPaid } from './status'
import type { Contato, Pagante } from './types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatMoney = (value: number | null) => (value == null ? '—' : money.format(value))
export const formatDateTime = (value: Date | null) => (value ? dateTime.format(value).replace(',', '') : '—')
export const formatDate = (value: Date | null) => (value ? dateOnly.format(value) : '—')

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
