import { Button } from '@betinhos/ui'
import { ChevronRight } from 'lucide-react'

/** Drill-down do card: chevron no canto; o ::after estica o clique pelo card inteiro. */
export function BotaoAbrir({ texto, rotulo, onAbrir }: { texto: string; rotulo: string; onAbrir: () => void }) {
  return (
    <Button
      className="dash-abre"
      variant="ghost"
      size="compact"
      icon={<ChevronRight size={16} aria-hidden="true" />}
      aria-label={`${rotulo}: ${texto}`}
      title={texto}
      onClick={onAbrir}
    />
  )
}
