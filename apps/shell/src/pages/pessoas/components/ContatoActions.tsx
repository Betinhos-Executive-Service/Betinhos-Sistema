import type { ReactNode } from 'react'
import { Button, buttonClassName, useToast, type ButtonSize } from '@betinhos/ui'
import { Copy, Mail, MessageCircle, Phone } from 'lucide-react'
import { telHref, whatsappHref } from '../../operacional/domain/phone'
import { copyText } from '../../pagantes/components/QuickActions'
import { emailKey } from '../domain/duplicates'
import type { Pessoa } from '../domain/types'

/** Texto do contato para colar em mensagem ou planilha. */
export function contatoTexto(p: Pick<Pessoa, 'nome' | 'cliente' | 'telefone' | 'email'>) {
  return [p.nome, p.cliente, p.telefone, p.email].filter(Boolean).join(' · ')
}

type Props = { p: Pessoa; size?: ButtonSize; labels?: boolean; compact?: boolean }

/** Ligar, WhatsApp, e-mail e copiar contato; indisponíveis ficam desabilitados com o motivo. */
export function ContatoActions({ p, size = 'compact', labels = false, compact = false }: Props) {
  const toast = useToast()
  const tel = telHref(p.telefone)
  const wa = whatsappHref(p.telefone)
  const email = emailKey(p.email)
  const link = (href: string | null, icon: ReactNode, label: string, text: string, why: string, external = false) =>
    href ? (
      <a className={buttonClassName({ variant: 'secondary', size, iconOnly: !labels })} href={href} aria-label={labels ? undefined : `${label} ${p.nome}`} title={`${label} ${p.nome}`}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {icon}{labels ? <span className="bt-button__label">{text}</span> : null}
      </a>
    ) : (
      <Button variant="secondary" size={size} icon={icon} disabled aria-label={labels ? undefined : `${text} indisponível: ${why}`} title={why}>{labels ? text : undefined}</Button>
    )

  async function copiar() {
    try {
      await copyText(contatoTexto(p))
      toast({ tone: 'success', message: `Contato de ${p.nome} copiado.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível copiar. ${reason instanceof Error ? reason.message : ''}` })
    }
  }

  return (
    <span className="ps-actions">
      {link(wa, <MessageCircle size={16} aria-hidden="true" />, 'Enviar WhatsApp para', 'WhatsApp', 'sem celular cadastrado', true)}
      {compact ? null : link(tel, <Phone size={16} aria-hidden="true" />, 'Ligar para', 'Ligar', 'sem celular cadastrado')}
      {compact ? null : link(email ? `mailto:${encodeURIComponent(email)}` : null, <Mail size={16} aria-hidden="true" />, 'Enviar e-mail para', 'E-mail', 'sem e-mail válido')}
      <Button variant="secondary" size={size} icon={<Copy size={16} />} onClick={() => void copiar()} aria-label={labels ? undefined : `Copiar contato de ${p.nome}`} title="Copiar contato">{labels ? 'Copiar contato' : undefined}</Button>
    </span>
  )
}
