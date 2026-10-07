import { Button, buttonClassName, topModalDialog, useToast, type ButtonSize } from '@betinhos/ui'
import { Copy, MessageCircle } from 'lucide-react'
import { linkToShare, whatsappUrl } from '../domain/messages'
import type { Contato, Pagante } from '../domain/types'

/** Clipboard API com recuo para `execCommand`, que ainda funciona em iframe sem permissão. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch { /* sem permissão de clipboard no iframe */ }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  // Com a ficha aberta (modal), o resto da página fica inerte: o campo precisa nascer dentro dela.
  ;(topModalDialog() ?? document.body).append(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('O navegador bloqueou a cópia.')
}

export function useCopyLink() {
  const toast = useToast()
  return async (p: Pagante) => {
    const link = linkToShare(p)
    if (!link) return
    try {
      await copyText(link.url)
      toast({ tone: 'success', message: link.kind === 'recibo' ? `Link do recibo de ${p.pessoa} copiado.` : `Link de pagamento de ${p.pessoa} copiado.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível copiar o link. ${reason instanceof Error ? reason.message : ''}` })
    }
  }
}

/** `contatoLoading`: o contato ainda está chegando; o WhatsApp não pode dizer "sem celular" antes da hora. */
type Props = { p: Pagante; contato?: Contato; size?: ButtonSize; labels?: boolean; contatoLoading?: boolean }

/** WhatsApp com a mensagem pronta e cópia do link; desabilitados explicam o motivo. */
export function QuickActions({ p, contato, size = 'compact', labels = false, contatoLoading = false }: Props) {
  const copy = useCopyLink()
  const wa = whatsappUrl(p, contato)
  const link = linkToShare(p)
  const waLabel = `Enviar WhatsApp para ${p.pessoa}`
  const copyLabel = link?.kind === 'recibo' ? 'Copiar link do recibo' : 'Copiar link de pagamento'
  const noLink = p.status != null && link == null ? 'Sem link para copiar' : copyLabel
  return (
    <span className="pg-actions">
      {wa ? (
        <a className={buttonClassName({ variant: 'secondary', size, iconOnly: !labels })} href={wa} target="_blank" rel="noopener noreferrer" aria-label={labels ? undefined : waLabel} title={waLabel}>
          <MessageCircle size={16} aria-hidden="true" />{labels ? <span className="bt-button__label">WhatsApp</span> : null}
        </a>
      ) : (
        <Button variant="secondary" size={size} icon={<MessageCircle size={16} />} disabled aria-busy={contatoLoading || undefined}
          aria-label={labels ? undefined : contatoLoading ? 'WhatsApp: carregando contato' : 'WhatsApp indisponível: pagante sem celular'}
          title={contatoLoading ? 'Carregando contato…' : 'Pagante sem celular cadastrado'}>{labels ? 'WhatsApp' : undefined}</Button>
      )}
      <Button variant="secondary" size={size} icon={<Copy size={16} />} disabled={!link} onClick={() => void copy(p)} aria-label={labels ? undefined : noLink} title={noLink}>{labels ? (link?.kind === 'recibo' ? 'Copiar recibo' : 'Copiar link') : undefined}</Button>
    </span>
  )
}
