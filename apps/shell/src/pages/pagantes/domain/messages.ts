import { phoneDigits } from '../../operacional/domain/phone'
import { isPaid } from './status'
import type { Contato, Pagante } from './types'

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatMoney = (value: number | null) => (value == null ? '—' : money.format(value))
export const formatDateTime = (value: Date | null) => (value ? dateTime.format(value).replace(',', '') : '—')
export const formatDate = (value: Date | null) => (value ? dateOnly.format(value) : '—')

export type SharedLink = { kind: 'pagamento' | 'recibo'; url: string }

/** Link que faz sentido mandar agora: recibo depois de pago, pagamento antes. */
export function linkToShare(p: Pagante): SharedLink | null {
  if (isPaid(p)) return p.linkRecibo ? { kind: 'recibo', url: p.linkRecibo } : null
  return p.linkPagamento ? { kind: 'pagamento', url: p.linkPagamento } : null
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
    return `${saudacao} Aqui é da Betinhos Executive Service.\n\nObrigado pelo pagamento (${ref}). Segue o seu recibo:\n${link.url}`
  }
  return `${saudacao} Aqui é da Betinhos Executive Service.`
}

/** Conversa no WhatsApp com a mensagem pronta; null sem telefone brasileiro válido. */
export function whatsappUrl(p: Pagante, contato?: Contato) {
  const digits = contato?.telefone ? phoneDigits(contato.telefone) : null
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(whatsappText(p, contato))}` : null
}
