import { useId } from 'react'
import { DeltaBadge, ProgressRing, StatCard, Surface } from '@betinhos/ui'
import { dec } from '../domain/format'
import { tomRecebimento } from '../domain/kpis'
import type { Chip, Kpi, KpiId } from '../domain/types'
import { extrasKpi } from './KpiExtras'
import { tendencia, tomKpi } from './KpiLinha'

const ROTULO = 'Indicadores executivos'
/** Ordem de leitura e de foco: a mesma do bento (herói, anel, os quatro compactos). */
const ORDEM: KpiId[] = ['faturamento', 'recebimento', 'servicos', 'ticket', 'aReceber', 'cpPendente']
const FRASE: Record<string, string> = { LY: 'no ano anterior', LM: 'no mês anterior' }
type ChipValor = Extract<Chip, { tipo: 'valor' }>

/** O comparativo que vira selo no topo do card: o do ano anterior; sem ele, o do mês anterior. Os demais seguem como chip. */
function separarComparativo(chips: Chip[]) {
  const valores = chips.filter((c): c is ChipValor => c.tipo === 'valor')
  const principal = valores.find((c) => c.rotulo === 'LY') ?? valores[0]
  return { principal, outros: chips.filter((c) => c !== principal) }
}

function KpiCard({ kpi, onOpen }: { kpi: Kpi; onOpen?: () => void }) {
  const { principal, outros } = separarComparativo(kpi.chips)
  const sobe = (principal?.variacao ?? 0) >= 0
  const atencao = kpi.id === 'cpPendente' && kpi.apoio.some((a) => a.atencao)
  const serie = tendencia(kpi.serie)
  // O herói mostra o primeiro e o último mês do gráfico (CSS lê os data-*).
  const eixo = kpi.id === 'faturamento' && serie ? { 'data-inicio': kpi.serie[0].rotulo, 'data-fim': kpi.serie[kpi.serie.length - 1].rotulo } : {}
  return (
    <StatCard
      className={`dash-bento__${kpi.id}`} label={kpi.rotulo} value={kpi.valor} {...tomKpi(atencao ? 'warning' : 'info')} {...eixo}
      delta={principal ? <DeltaBadge trend={sobe ? 'up' : 'down'}>{sobe ? '+' : '−'}{dec(Math.abs(principal.variacao), 1)}%</DeltaBadge> : undefined} deltaPlacement="top"
      hint={principal ? `vs ${principal.anterior} ${FRASE[principal.rotulo] ?? 'no período anterior'}` : undefined}
      {...extrasKpi({ chips: outros, apoio: kpi.apoio })} trend={serie} onOpen={onOpen}
    />
  )
}

/** Recebimento: anel com a porcentagem recebida no centro e "R$ X de R$ Y" embaixo. */
function RecebimentoCard({ kpi }: { kpi: Kpi }) {
  const id = useId()
  const { razao, recebido, base } = kpi.anel ?? { razao: 0, recebido: '', base: '' }
  return (
    <Surface className="dash-card dash-bento__recebimento" aria-labelledby={id}>
      <h2 className="dash-card__titulo" id={id}>{kpi.rotulo}</h2>
      <div className="dash-anel">
        <ProgressRing value={razao} tone={tomRecebimento(razao)} size={136} label={kpi.valor} caption="recebido" />
      </div>
      {kpi.anel ? <p className="dash-anel__valores"><strong>{recebido}</strong> de {base}</p> : null}
    </Surface>
  )
}

/**
 * Seis KPIs executivos do Resumo em bento: Faturamento é o herói (gráfico do período), Recebimento o anel alto e os outros quatro
 * compactos 2 × 2. Com drill-down opcional por KPI (`abrir`). Tom neutro, menos o CP pendente com algum pendente (pede ação).
 */
export function KpiGrid({ kpis, abrir = {} }: { kpis: Kpi[]; abrir?: Partial<Record<KpiId, () => void>> }) {
  const ordenados = [...kpis].sort((a, b) => ORDEM.indexOf(a.id) - ORDEM.indexOf(b.id))
  return (
    <section className="dash-bento" aria-label={ROTULO}>
      {ordenados.map((k) => (k.id === 'recebimento' ? <RecebimentoCard key={k.id} kpi={k} /> : <KpiCard key={k.id} kpi={k} onOpen={abrir[k.id]} />))}
    </section>
  )
}
