import { formatMoney } from '../../geral/domain/format'
import { mesAbreviado, mesPorExtenso } from '../domain/descontos'

export type TotalMes = { lancado: number; aLancar: number; atrasada: number }

/** Faixa dos meses: minibarra (lançado × a lançar), mês abreviado e total; o mês da folha fica em destaque. */
export function FaixaMeses({ meses, mes, totais, onChange }: { meses: string[]; mes: string; totais: Map<string, TotalMes>; onChange: (m: string) => void }) {
  return (
    <div className="rh-faixa" role="group" aria-label="Meses da folha">
      {meses.map((m, i) => {
        const t = totais.get(m) ?? { lancado: 0, aLancar: 0, atrasada: 0 }
        const total = t.lancado + t.aLancar + t.atrasada
        const pct = (v: number) => (total ? `${(v / total) * 100}%` : '0%')
        return (
          <button key={m} type="button" className="rh-mes" data-atrasada={t.atrasada > 0 || undefined} aria-pressed={m === mes} aria-label={`${mesPorExtenso(m)}, ${formatMoney(total)}`} onClick={() => onChange(m)}>
            <span className="rh-mes__barra" aria-hidden="true">
              <span className="rh-mes__lancado" style={{ width: pct(t.lancado) }} />
              <span className="rh-mes__alancar" style={{ width: pct(t.aLancar + t.atrasada) }} />
            </span>
            <span className="rh-mes__nome">{mesAbreviado(m)}{i === 0 || m.endsWith('-01') ? ` ${m.slice(2, 4)}` : ''}</span>
            <span className="rh-mes__total">{total ? formatMoney(total) : '—'}</span>
          </button>
        )
      })}
    </div>
  )
}
