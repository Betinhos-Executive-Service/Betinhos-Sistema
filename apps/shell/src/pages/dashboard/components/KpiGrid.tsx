import { useId, type KeyboardEvent } from 'react'
import { ProgressRing, StatCard, Surface } from '@betinhos/ui'
import { tomRecebimento } from '../domain/kpis'
import type { Kpi, KpiId } from '../domain/types'
import { ID_KPI } from '../domain/indicadores'
import { extrasKpi } from './KpiExtras'
import { fraseComparativo, separarComparativo, seloComparativo } from './KpiChip'
import { tendencia, tomKpi } from './KpiLinha'

const ROTULO = 'Indicadores executivos'
/** Ordem de leitura e de foco: a mesma do bento (herói, anel, os quatro compactos). */
const ORDEM: KpiId[] = ['faturamento', 'recebimento', 'servicos', 'ticket', 'aReceber', 'cpPendente']

function KpiCard({ kpi, onOpen }: { kpi: Kpi; onOpen?: () => void }) {
  const { principal, outros } = separarComparativo(kpi.chips)
  const atencao = kpi.id === 'cpPendente' && kpi.apoio.some((a) => a.atencao)
  const serie = tendencia(kpi.serie)
  // O herói mostra o primeiro e o último mês do gráfico (CSS lê os data-*).
  const { dados: _dados, ...extras } = extrasKpi({ chips: outros, apoio: kpi.apoio })
  const eixo = kpi.id === 'faturamento' && serie ? { 'data-inicio': kpi.serie[0].rotulo, 'data-fim': kpi.serie[kpi.serie.length - 1].rotulo } : {}
  return (
    <StatCard
      data-origem={onOpen ? ID_KPI[kpi.id] : undefined} className={`dash-bento__${kpi.id}`} label={kpi.rotulo} value={kpi.valor} {...tomKpi(atencao ? 'warning' : 'info')} {...eixo}
      delta={principal && seloComparativo(principal)} deltaPlacement="top" hint={principal && fraseComparativo(principal)}
      {...extras} trend={serie} onOpen={onOpen}
    />
  )
}

/** Recebimento: anel com a porcentagem recebida no centro e "R$ X de R$ Y" embaixo. */
function RecebimentoCard({ kpi, onOpen }: { kpi: Kpi; onOpen?: () => void }) {
  const id = useId()
  const { razao, recebido, base } = kpi.anel ?? { razao: 0, recebido: '', base: '' }
  const teclado = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }
  const aberto = onOpen ? { role: 'button', tabIndex: 0, 'aria-label': `Ampliar ${kpi.rotulo}`, onClick: onOpen, onKeyDown: teclado } : {}
  return (
    <Surface className="dash-card dash-bento__recebimento" aria-labelledby={id} data-origem={onOpen ? ID_KPI.recebimento : undefined}>
      <h2 className="dash-card__titulo" id={id}>{kpi.rotulo}</h2>
      <div className={onOpen ? 'dash-anel__abre dash-card--abre' : 'dash-anel__abre'} {...aberto}>
        <div className="dash-anel">
          <ProgressRing value={razao} tone={tomRecebimento(razao)} size={136} label={kpi.valor} caption="recebido" />
        </div>
        {kpi.anel ? <p className="dash-anel__valores"><strong>{recebido}</strong> de {base}</p> : null}
      </div>
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
      {ordenados.map((k) => (k.id === 'recebimento' ? <RecebimentoCard key={k.id} kpi={k} onOpen={abrir[k.id]} /> : <KpiCard key={k.id} kpi={k} onOpen={abrir[k.id]} />))}
    </section>
  )
}
