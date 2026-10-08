import { useId, type ReactNode } from 'react'
import { EmptyState, Skeleton } from '@betinhos/ui'
import { Inbox } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sparkline } from '../../charts/Charts'
import { cor, type CorToken } from '../../charts/tokens'
import type { PontoSerie } from '../../domain/types'

/* Peças compartilhadas pelas abas Despesas e Frota: card de KPI genérico, s/dado e barras com séries por padrão. */

export type TomKpi = 'action' | 'brand' | 'success' | 'warning'
const SPARK: Record<TomKpi, { linha: CorToken; area: CorToken }> = {
  action: { linha: 'action', area: 'actionSoft' },
  brand: { linha: 'brand', area: 'border' },
  success: { linha: 'success', area: 'successSoft' },
  warning: { linha: 'warning', area: 'warningSoft' },
}

/** Card de KPI no formato do Resumo (`.dash-kpi`): borda superior na cor do indicador, valor, extras e sparkline. */
export function KpiCartao({ rotulo, valor, tom, serie = [], children }: { rotulo: string; valor: string; tom: TomKpi; serie?: PontoSerie[]; children?: ReactNode }) {
  return (
    <article className={`dash-kpi dash-kpi--${tom}`} aria-label={rotulo}>
      <span className="dash-kpi__rotulo">{rotulo}</span>
      <strong className="dash-kpi__valor">{valor}</strong>
      {children ? <div className="dash-kpi__extras">{children}</div> : null}
      {serie.length > 1 ? <Sparkline dados={serie} linha={SPARK[tom].linha} area={SPARK[tom].area} /> : null}
    </article>
  )
}

/** Primeira carga: os cards no formato final, ocupados e sem números. */
export function KpisCarregando({ rotulos, className }: { rotulos: string[]; className: string }) {
  return (
    <section className={className} aria-label="Indicadores" aria-busy="true">
      {rotulos.map((r) => (
        <article key={r} className="dash-kpi" aria-label={r}>
          <span className="dash-kpi__rotulo">{r}</span>
          <Skeleton height={26} width="62%" />
          <Skeleton height={22} width="84%" />
          <span className="dash-sr">Carregando</span>
        </article>
      ))}
    </section>
  )
}

/** Marca de conjunto que não respondeu: texto "s/dado", nunca número provisório. */
export const SemDado = () => <span className="dash-chip dash-chip--neutro"><span className="dash-chip__texto">s/dado</span></span>

/** Bloco sem números: tabela indisponível ou recorte vazio, com o motivo em texto. */
export const Vazio = ({ titulo, children }: { titulo: string; children?: ReactNode }) => <EmptyState compact icon={<Inbox />} title={titulo}>{children}</EmptyState>

/** Padrão de preenchimento: a série se distingue pela forma, além da cor. */
export type Padrao = 'solido' | 'listras' | 'pontos'
export type SerieBarra = { chave: string; nome: string; cor: Extract<CorToken, 'action' | 'brand' | 'secondary'>; padrao?: Padrao }

function Padroes({ prefixo, series }: { prefixo: string; series: SerieBarra[] }) {
  return (
    <defs>
      {series.filter((s) => s.padrao && s.padrao !== 'solido').map((s) => (
        <pattern key={s.chave} id={`${prefixo}-${s.chave}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform={s.padrao === 'listras' ? 'rotate(45)' : undefined}>
          <rect width={6} height={6} fill={cor('surface')} />
          {s.padrao === 'listras' ? <rect width={3} height={6} fill={cor(s.cor)} /> : <circle cx={3} cy={3} r={1.6} fill={cor(s.cor)} />}
        </pattern>
      ))}
    </defs>
  )
}
const preenchimento = (prefixo: string, s: SerieBarra) => (s.padrao && s.padrao !== 'solido' ? `url(#${prefixo}-${s.chave})` : cor(s.cor))

/** Legenda das barras: amostra quadrada com o mesmo padrão da série e o nome. */
export function LegendaBarras({ series }: { series: SerieBarra[] }) {
  const prefixo = `dash-fr-leg-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <ul className="dash-legenda">
      {series.map((s) => (
        <li key={s.chave}>
          <svg className="dash-fr-amostra" width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
            <Padroes prefixo={prefixo} series={[s]} />
            <rect x={0.5} y={0.5} width={11} height={11} rx={2} fill={preenchimento(prefixo, s)} stroke={cor(s.cor)} />
          </svg>
          {s.nome}
        </li>
      ))}
    </ul>
  )
}

type Ponto = Record<string, string | number | null>
type BarrasProps = { dados: Ponto[]; series: SerieBarra[]; formatar: (v: number) => string; descricao: string; empilhado?: boolean; larguraEixo?: number; dominioMax?: number }

/** Barras agrupadas ou empilhadas com legenda; cada série tem cor e padrão próprios. Sem animação (recarga a cada 60 s). */
export function BarrasChart({ dados, series, formatar, descricao, empilhado = false, larguraEixo = 48, dominioMax }: BarrasProps) {
  const prefixo = `dash-fr-pad-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const texto = { fill: cor('secondary'), fontSize: 11 }
  return (
    <div className="dash-grafico">
      <LegendaBarras series={series} />
      <figure className="dash-chart" role="img" aria-label={descricao}>
        <div className="dash-chart__area">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <Padroes prefixo={prefixo} series={series} />
              <CartesianGrid stroke={cor('border')} vertical={false} />
              <XAxis dataKey="rotulo" tick={texto} stroke={cor('border')} tickLine={false} tickMargin={8} minTickGap={8} />
              <YAxis tick={texto} axisLine={false} tickLine={false} width={larguraEixo} tickFormatter={(v: unknown) => formatar(Number(v))} domain={dominioMax ? [0, dominioMax] : undefined} allowDecimals={false} />
              <Tooltip
                formatter={(v: unknown) => (v == null ? '—' : formatar(Number(v)))}
                cursor={{ fill: cor('surfaceSoft') }}
                contentStyle={{ backgroundColor: 'var(--bt-color-surface)', border: '1px solid var(--bt-color-border)', borderRadius: 'var(--bt-radius-md)', boxShadow: 'var(--bt-shadow-popover)', fontSize: 12, padding: '8px 10px' }}
                labelStyle={{ color: 'var(--bt-color-text-secondary)', fontWeight: 800, marginBottom: 4 }}
                itemStyle={{ padding: 0, fontWeight: 700 }}
              />
              {series.map((s, i) => (
                <Bar
                  key={s.chave} dataKey={s.chave} name={s.nome} stackId={empilhado ? 'pilha' : undefined} fill={preenchimento(prefixo, s)}
                  stroke={cor(s.cor)} strokeWidth={s.padrao && s.padrao !== 'solido' ? 1 : 0}
                  radius={!empilhado || i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={empilhado ? 32 : 20} isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}
