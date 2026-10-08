import type { ReactNode } from 'react'
import { MetricCard } from '@betinhos/ui'
import { Calculator, CarFront, CircleCheck, Clock, Receipt, Wallet } from 'lucide-react'
import { Sparkline } from '../charts/Charts'
import type { Kpi, KpiId } from '../domain/types'
import { ApoioTexto, KpiChip } from './KpiChip'

const ICONES: Record<KpiId, ReactNode> = {
  faturamento: <Wallet size={20} />, servicos: <CarFront size={20} />, ticket: <Receipt size={20} />,
  aReceber: <Clock size={20} />, cpPendente: <Calculator size={20} />, recebimento: <CircleCheck size={20} />,
}
const ROTULOS: [KpiId, string][] = [['faturamento', 'Faturamento'], ['servicos', 'Serviços'], ['ticket', 'Ticket médio'], ['aReceber', 'A receber'], ['cpPendente', 'CP pendente'], ['recebimento', 'Recebimento']]
/** Cards vazios para o skeleton da primeira carga. */
export const KPI_PLACEHOLDER: Kpi[] = ROTULOS.map(([id, rotulo]) => ({ id, rotulo, valor: '—', chips: [], apoio: [], serie: [] }))

export function KpiGrid({ kpis, carregando }: { kpis: Kpi[]; carregando: boolean }) {
  return (
    <section className="dash-kpis" aria-label="Indicadores executivos">
      {kpis.map((k) => (
        <div key={k.id} className="dash-kpi">
          <MetricCard
            icon={ICONES[k.id]}
            label={k.rotulo}
            value={k.valor}
            loading={carregando}
            hint={<span className="dash-kpi__hint">{k.chips.map((c) => <KpiChip key={c.rotulo} chip={c} />)}{k.apoio.map((a) => <ApoioTexto key={a.rotulo} apoio={a} />)}</span>}
          />
          {!carregando && k.serie.length ? <Sparkline dados={k.serie} /> : null}
        </div>
      ))}
    </section>
  )
}
