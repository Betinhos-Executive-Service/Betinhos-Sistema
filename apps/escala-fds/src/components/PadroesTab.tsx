import { Select, StatusBadge } from '@betinhos/ui'
import type { Padrao, Situacao, View } from '../domain/escala'

type Props = { view: View; onPadrao: (motoristaId: string, padrao: Padrao) => void }

const OPCOES = [{ value: 'plantao', label: 'Plantão' }, { value: 'trabalha', label: 'Trabalha' }]

/** Padrão fixo opcional: vale para todos os fins de semana; exceções da aba Escala o sobrescrevem. */
export function PadroesTab({ view, onPadrao }: Props) {
  return (
    <div className="escala__tab">
      <p className="escala__summary">Só para quem tem dia fixo. Quem fica sem padrão é escalado fim de semana a fim de semana.</p>
      <ul className="escala__list">
        {view.motoristas.map((m) => (
          <li key={m.id} className="escala__row escala__pattern">
            <span className="escala__name">{m.nome}{m.terceiro ? <StatusBadge tone="neutral">Terceiro</StatusBadge> : null}</span>
            <Select size="compact" aria-label={`Padrão de sábado de ${m.nome}`} searchable={false} placeholder="Sáb: sem padrão" options={OPCOES.map((o) => ({ ...o, label: `Sáb: ${o.label}` }))}
              value={m.padrao.sab} onChange={(sab) => onPadrao(m.id, { ...m.padrao, sab: sab as Situacao | null })} />
            <Select size="compact" aria-label={`Padrão de domingo de ${m.nome}`} searchable={false} placeholder="Dom: sem padrão" options={OPCOES.map((o) => ({ ...o, label: `Dom: ${o.label}` }))}
              value={m.padrao.dom} onChange={(dom) => onPadrao(m.id, { ...m.padrao, dom: dom as Situacao | null })} />
          </li>
        ))}
      </ul>
    </div>
  )
}
