import { StatusBadge, Surface, type StatusTone } from '@betinhos/ui'
import type { AlertaItem, Tom } from '../domain/types'

const TOM: Record<Tom, { tone: StatusTone; texto: string }> = { ok: { tone: 'success', texto: 'OK' }, warn: { tone: 'warning', texto: 'Atenção' }, danger: { tone: 'danger', texto: 'Atenção' }, neutral: { tone: 'neutral', texto: 's/dado' } }

export function AlertList({ titulo, itens }: { titulo: string; itens: AlertaItem[] }) {
  return (
    <Surface title={titulo} compact className="dash-alertas">
      <ul className="dash-alertas__lista">
        {itens.map((a) => (
          <li key={a.id} className="dash-alerta">
            <strong className="dash-alerta__valor">{a.valor}</strong>
            <span className="dash-alerta__texto"><span className="dash-alerta__rotulo">{a.rotulo}</span><span className="dash-alerta__status">{a.status}</span></span>
            <StatusBadge tone={TOM[a.tom].tone}>{TOM[a.tom].texto}</StatusBadge>
          </li>
        ))}
      </ul>
    </Surface>
  )
}
