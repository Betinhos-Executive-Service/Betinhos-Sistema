import { Skeleton } from '@betinhos/ui'
import { Sparkline } from '../charts/Charts'
import type { CorToken } from '../charts/tokens'
import type { Kpi, KpiId } from '../domain/types'
import { Chips } from './KpiChip'

/** Cor de cada indicador: borda superior, linha da sparkline e área no tom suave do mesmo papel. */
const TOM: Record<KpiId, { classe: string; linha: CorToken; area: CorToken }> = {
  faturamento: { classe: 'action', linha: 'action', area: 'actionSoft' },
  servicos: { classe: 'brand', linha: 'brand', area: 'border' },
  ticket: { classe: 'action', linha: 'action', area: 'actionSoft' },
  aReceber: { classe: 'success', linha: 'success', area: 'successSoft' },
  cpPendente: { classe: 'warning', linha: 'warning', area: 'warningSoft' },
  recebimento: { classe: 'success', linha: 'success', area: 'successSoft' },
}
const ROTULOS: [KpiId, string][] = [['faturamento', 'Faturamento'], ['servicos', 'Serviços'], ['ticket', 'Ticket médio'], ['aReceber', 'A receber'], ['cpPendente', 'CP pendente'], ['recebimento', 'Recebimento']]
/** Cards vazios para o skeleton da primeira carga. */
export const KPI_PLACEHOLDER: Kpi[] = ROTULOS.map(([id, rotulo]) => ({ id, rotulo, valor: '—', chips: [], apoio: [], serie: [] }))

/** Seis KPIs executivos: borda superior na cor do indicador, valor, chips sempre visíveis e sparkline na base. */
export function KpiGrid({ kpis, carregando }: { kpis: Kpi[]; carregando: boolean }) {
  return (
    <section className="dash-kpis" aria-label="Indicadores executivos" aria-busy={carregando || undefined}>
      {kpis.map((k) => (
        <article key={k.id} className={`dash-kpi dash-kpi--${TOM[k.id].classe}`} aria-label={k.rotulo}>
          <span className="dash-kpi__rotulo">{k.rotulo}</span>
          {carregando ? <>
            <Skeleton height={26} width="62%" />
            <Skeleton height={22} width="84%" />
            <span className="dash-sr">Carregando</span>
            <Skeleton className="dash-spark" shape="rect" width="auto" />
          </> : <>
            <strong className="dash-kpi__valor">{k.valor}</strong>
            {k.chips.length || k.apoio.length ? <div className="dash-kpi__extras"><Chips chips={k.chips} apoio={k.apoio} /></div> : null}
            {k.serie.length ? <Sparkline dados={k.serie} linha={TOM[k.id].linha} area={TOM[k.id].area} /> : null}
          </>}
        </article>
      ))}
    </section>
  )
}
