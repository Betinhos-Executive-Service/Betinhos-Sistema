import { Check } from 'lucide-react'

export type Passo = 'conferir' | 'lancar' | 'enviar'
const PASSOS: { id: Passo; rotulo: string }[] = [{ id: 'conferir', rotulo: 'Conferir' }, { id: 'lancar', rotulo: 'Lançar' }, { id: 'enviar', rotulo: 'Enviar à contabilidade' }]

/** Barra dos 3 passos da folha; o concluído ganha ✓. */
export function PassosFolha({ passo, concluidos, onChange }: { passo: Passo; concluidos: Passo[]; onChange: (p: Passo) => void }) {
  return (
    <nav className="rh-passos" aria-label="Passos da folha">
      {PASSOS.map((p, i) => {
        const feito = concluidos.includes(p.id)
        return (
          <button key={p.id} type="button" className="rh-passo" data-feito={feito || undefined} aria-current={p.id === passo ? 'step' : undefined} onClick={() => onChange(p.id)}>
            <span className="rh-passo__num" aria-hidden="true">{feito ? <Check size={14} /> : i + 1}</span>
            <span>{p.rotulo}</span>
            {feito ? <span className="rh-sr">(concluído)</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
