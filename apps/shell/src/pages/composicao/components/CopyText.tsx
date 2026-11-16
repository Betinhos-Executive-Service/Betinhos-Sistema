import { useEffect, useRef, useState, type ReactNode } from 'react'
import { copiarTexto } from '../../dashboard/components/Copiar'
import type { Composition } from '../data/compositions'

const COPIED_MS = 1200

/** Texto de popup que copia com um clique: sublinha no hover e avisa "Copiado" na hora. Arrastar para selecionar não copia. */
export function CopyText({ text, children, className }: { text: string; children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const copy = () => {
    // Feedback antes da área de transferência responder: o clique tem resposta imediata.
    setCopied(true)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
    void copiarTexto(text).then((ok) => { if (!ok) setCopied(false) })
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className={`copy-text${className ? ` ${className}` : ''}`}
      data-copied={copied || undefined}
      title="Clique para copiar"
      onClick={() => { if (!window.getSelection()?.toString()) copy() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy() } }}
    >
      <span className="copy-text__value">{children ?? text}</span>
      <span className="copy-text__feedback" aria-live="polite">{copied ? 'Copiado' : ''}</span>
    </span>
  )
}

/** Linha "Rótulo  valor" do cartão, com o valor copiável. */
export function CopyDetail({ label, text }: { label: string; text: string }) {
  return <span className="lookup-preview__detail"><span>{label}</span><CopyText text={text} /></span>
}

/** Eventos do cartão não chegam à célula: ela não toma o foco, não impede a seleção de texto nem abre a edição. */
export const cardEventGuard = {
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onDoubleClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
}

/** Cartão do serviço relacionado no hover do trajeto: sempre mostra saída e destino completos. */
export function RouteCard({ item, date }: { item: Composition; date: string }) {
  return (
    <span className="lookup-preview__card" role="tooltip" {...cardEventGuard}>
      <strong>Serviço relacionado</strong>
      <CopyText text={item.route} />
      {item.departureAddress && <CopyDetail label="Saída" text={item.departureAddress} />}
      {item.destination && <CopyDetail label="Destino" text={item.destination} />}
      <CopyDetail label="Cliente" text={item.client} />
      {date && <CopyDetail label="Data" text={date} />}
      {item.serviceStatus && <CopyDetail label="Status" text={item.serviceStatus} />}
      {item.serviceType && <CopyDetail label="Tipo" text={item.serviceType} />}
      {item.vehicleType && <CopyDetail label="Veículo" text={item.vehicleType} />}
      {item.passengers.length > 0 && <CopyDetail label="Pax" text={item.passengers.join(', ')} />}
    </span>
  )
}

/** Cartão do cliente no hover da coluna Cliente. */
export function ClientCard({ item }: { item: Composition }) {
  return (
    <span className="lookup-preview__card" role="tooltip" {...cardEventGuard}>
      <strong><CopyText text={item.client} /></strong>
      {item.clientRegistration && <CopyDetail label="Registro" text={item.clientRegistration} />}
      {item.clientAddress && <CopyDetail label="Endereço" text={item.clientAddress} />}
    </span>
  )
}
