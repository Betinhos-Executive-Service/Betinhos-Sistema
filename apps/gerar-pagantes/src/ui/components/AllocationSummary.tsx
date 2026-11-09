import { CheckCircle2, CircleAlert } from 'lucide-react'
import { formatCurrency } from '../../money'

/** Uma faixa só: valor da OP, rateado e a diferença. A cor acompanha o texto do estado. */
export function AllocationSummary({ totalCents, allocatedCents, remainingCents }: { totalCents: number; allocatedCents: number; remainingCents: number }) {
  const balanced = remainingCents === 0
  return <section className={`allocation ${balanced ? 'is-balanced' : 'is-pending'}`} aria-label="Resumo do rateio" aria-live="polite">
    <div><span>Valor da OP</span><strong>{formatCurrency(totalCents)}</strong></div>
    <div><span>Rateado</span><strong>{formatCurrency(allocatedCents)}</strong></div>
    <div className="allocation__state">{balanced ? <CheckCircle2 size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}<span>{balanced ? 'Total conferido' : remainingCents > 0 ? 'Falta ratear' : 'Excede em'}</span><strong>{balanced ? 'Exato' : formatCurrency(Math.abs(remainingCents))}</strong></div>
  </section>
}
