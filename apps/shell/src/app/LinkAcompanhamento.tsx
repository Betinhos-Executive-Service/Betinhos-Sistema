import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { Alert, Button, buttonClassName } from '@betinhos/ui'
import { copyText } from '../pages/pagantes/components/QuickActions'
import './LinkAcompanhamento.css'

const TZ = 'America/Sao_Paulo'
const validade = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const COPIED_MS = 2000

/** "Válido até 15/10, 18:30" (São Paulo); `null` quando a data não vem ou é inválida. */
export function validadeLabel(expiraEm: string | Date | null | undefined, now = new Date()): string | null {
  const date = expiraEm instanceof Date ? expiraEm : typeof expiraEm === 'string' && expiraEm ? new Date(expiraEm) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date <= now ? 'Link expirado' : `Válido até ${validade.format(date).replace(',', '')}`
}

/** Mensagem de configuração do plugin: só o TI resolve, então o aviso diz isso em vez de parecer falha passageira. */
export const NAO_CONFIGURADO = /não configurad/i

export function descreverErroLink(erro: string) {
  if (NAO_CONFIGURADO.test(erro)) {
    return { title: 'Link de acompanhamento não configurado neste ambiente', body: 'A Custom API do link está sem URL e segredo do Worker. Peça ao TI para registrar a configuração segura do plugin neste ambiente.' }
  }
  return { title: 'Não foi possível gerar o link', body: erro }
}

type Props = {
  link: string
  expiraEm?: string | Date | null
  now?: Date
  /** Texto pronto para o WhatsApp (motorista, carro, link); habilita "Copiar mensagem". */
  mensagem?: string | null
  onCopied?: (what: 'link' | 'mensagem') => void
  onCopyFailed?: (reason: unknown) => void
}

/** Link de acompanhamento gerado: endereço clicável, validade e cópia num toque. */
export function LinkAcompanhamento({ link, expiraEm, now, mensagem, onCopied, onCopyFailed }: Props) {
  const [copied, setCopied] = useState<'link' | 'mensagem' | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  useEffect(() => { setCopied(null) }, [link])

  const copy = async (what: 'link' | 'mensagem') => {
    try {
      await copyText(what === 'link' ? link : mensagem ?? link)
      setCopied(what)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(null), COPIED_MS)
      onCopied?.(what)
    } catch (reason) {
      onCopyFailed?.(reason)
    }
  }

  const label = validadeLabel(expiraEm, now)
  return (
    <div className="bt-link" role="group" aria-label="Link de acompanhamento">
      <a className="bt-link__url" href={link} target="_blank" rel="noopener" title={link}>
        <ExternalLink size={14} aria-hidden="true" />
        <span>{link.replace(/^https?:\/\//, '')}</span>
      </a>
      {label ? <span className={`bt-link__meta${label === 'Link expirado' ? ' bt-link__meta--expired' : ''}`}>{label}</span> : null}
      <div className="bt-link__actions">
        <Button variant="action" size="compact" icon={copied === 'link' ? <Check size={16} /> : <Copy size={16} />} onClick={() => { void copy('link') }} aria-live="polite">
          {copied === 'link' ? 'Link copiado' : 'Copiar link'}
        </Button>
        {mensagem ? (
          <Button variant="secondary" size="compact" icon={copied === 'mensagem' ? <Check size={16} /> : <MessageCircle size={16} />} onClick={() => { void copy('mensagem') }} aria-live="polite">
            {copied === 'mensagem' ? 'Mensagem copiada' : 'Copiar mensagem'}
          </Button>
        ) : null}
        <a className={buttonClassName({ variant: 'secondary', size: 'compact' })} href={link} target="_blank" rel="noopener" aria-label="Abrir link de acompanhamento (abre em nova aba)">
          <ExternalLink size={16} aria-hidden="true" />Abrir
        </a>
      </div>
    </div>
  )
}

/** Erro devolvido pela Custom API, com orientação quando é falta de configuração. */
export function LinkErro({ erro, onDismiss }: { erro: string; onDismiss?: () => void }) {
  const { title, body } = descreverErroLink(erro)
  return <Alert tone="danger" title={title} onDismiss={onDismiss}>{body}</Alert>
}
