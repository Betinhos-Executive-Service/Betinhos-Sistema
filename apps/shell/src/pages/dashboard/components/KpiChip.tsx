import { StatusBadge } from '@betinhos/ui'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { dec } from '../domain/format'
import type { Apoio, Chip } from '../domain/types'

/** Comparativo LM/LY: seta + sinal + texto, nunca só cor. */
export function KpiChip({ chip }: { chip: Chip }) {
  if (chip.tipo === 'sem-dado') return <StatusBadge tone="neutral">{chip.rotulo} s/dado</StatusBadge>
  const sobe = chip.variacao >= 0
  return (
    <StatusBadge tone={sobe ? 'success' : 'danger'} icon={sobe ? <TrendingUp size={14} /> : <TrendingDown size={14} />}>
      {chip.rotulo} {chip.anterior} {sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%
    </StatusBadge>
  )
}

export function ApoioTexto({ apoio }: { apoio: Apoio }) {
  return (
    <span className={apoio.atencao ? 'dash-apoio dash-apoio--atencao' : 'dash-apoio'}>
      <span className="dash-apoio__rotulo">{apoio.rotulo}</span> {apoio.texto}
    </span>
  )
}
