import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
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
      <span className="copy-text__feedback" aria-live="polite">{copied ? <><Check size={11} strokeWidth={3} aria-hidden="true" />Copiado</> : ''}</span>
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

/** Item da grade de dados do cartão: rótulo pequeno em cima, valor copiável embaixo. */
function Meta({ label, text, wide }: { label: string; text: string; wide?: boolean }) {
  return <span className={`route-card__meta-item${wide ? ' route-card__meta-item--wide' : ''}`}><span className="route-card__label">{label}</span><CopyText text={text} /></span>
}

/** Cartão do serviço relacionado no hover do trajeto: sempre mostra saída e destino completos. */
export function RouteCard({ item, date }: { item: Composition; date: string }) {
  const stops = [['Saída', item.departureAddress], ['Destino', item.destination]].filter(([, text]) => text)
  return (
    <span className="lookup-preview__card route-card" role="tooltip" {...cardEventGuard}>
      <span className="route-card__header">
        <span className="route-card__eyebrow">Serviço relacionado</span>
        {item.serviceStatus && <span className="route-card__status">{item.serviceStatus}</span>}
      </span>
      <span className="route-card__title"><CopyText text={item.route} /></span>
      {stops.length > 0 && (
        <span className="route-card__stops">
          {stops.map(([label, text]) => (
            <span key={label} className={`route-card__stop route-card__stop--${label === 'Saída' ? 'from' : 'to'}`}>
              <span className="route-card__dot" aria-hidden="true" />
              <span className="route-card__label">{label}</span>
              <CopyText text={text} />
            </span>
          ))}
        </span>
      )}
      <span className="route-card__meta">
        <Meta label="Cliente" text={item.client} wide />
        {date && <Meta label="Data" text={date} />}
        {item.serviceType && <Meta label="Tipo" text={item.serviceType} />}
        {item.vehicleType && <Meta label="Veículo" text={item.vehicleType} />}
        {item.passengers.length > 0 && <Meta label="Passageiros" text={item.passengers.join(', ')} wide />}
      </span>
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
