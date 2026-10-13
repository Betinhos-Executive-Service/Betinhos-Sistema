import { useId } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cor, type CorToken } from './tokens'

/** Cores de série com classe de legenda correspondente no CSS. */
export type CorSerie = Extract<CorToken, 'action' | 'brand' | 'secondary'>
export type Serie = { chave: string; nome: string; cor: CorSerie; tracejada?: boolean }
type Ponto = Record<string, string | number | null>
type Base = { dados: Ponto[]; formatar: (v: number) => string; descricao: string; larguraEixo?: number }

const texto = () => ({ fill: cor('secondary'), fontSize: 11 })
const eixoX = () => ({ dataKey: 'rotulo', tick: texto(), stroke: cor('border'), tickLine: false, tickMargin: 8, minTickGap: 8 })
const eixoY = (formatar: (v: number) => string, largura: number) => ({ tick: texto(), axisLine: false, tickLine: false, width: largura, tickFormatter: (v: unknown) => formatar(Number(v)) })
/** Dica no padrão de popover do DS: superfície branca, borda, raio 10 e sombra de popover. */
const dica = (formatar: (v: number) => string) => ({
  formatter: (v: unknown) => (v == null ? '—' : formatar(Number(v))),
  contentStyle: { backgroundColor: 'var(--bt-color-surface)', border: '1px solid var(--bt-color-border)', borderRadius: 'var(--bt-radius-md)', boxShadow: 'var(--bt-shadow-popover)', fontSize: 12, padding: '8px 10px' },
  labelStyle: { color: 'var(--bt-color-text-secondary)', fontWeight: 800, marginBottom: 4 },
  itemStyle: { padding: 0, fontWeight: 700 },
})

/** Legenda em HTML: traço da cor da série (tracejado quando a série é tracejada) e nome. */
export function Legenda({ series }: { series: Serie[] }) {
  return (
    <ul className="dash-legenda">
      {series.map((s) => (
        <li key={s.chave}><span className={`dash-legenda__traco dash-legenda__traco--${s.cor}${s.tracejada ? ' dash-legenda__traco--tracejada' : ''}`} aria-hidden="true" />{s.nome}</li>
      ))}
    </ul>
  )
}

/** Linhas com grade horizontal, tooltip e legenda; sem animação (recarga a cada 60 s). Ocupa a altura que o card der, com mínimo de 240 px. */
export function LinhaChart({ dados, series, formatar, descricao, larguraEixo = 64 }: Base & { series: Serie[] }) {
  const poucos = dados.length <= 2
  return (
    <div className="dash-grafico">
      {series.length > 1 ? <Legenda series={series} /> : null}
      <figure className="dash-chart" role="img" aria-label={descricao}>
        <div className="dash-chart__area">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={cor('border')} vertical={false} />
              <XAxis {...eixoX()} />
              <YAxis {...eixoY(formatar, larguraEixo)} />
              <Tooltip {...dica(formatar)} cursor={{ stroke: cor('border') }} />
              {series.map((s) => (
                <Line
                  key={s.chave} type="monotone" dataKey={s.chave} name={s.nome} stroke={cor(s.cor)} strokeWidth={2}
                  strokeDasharray={s.tracejada ? '5 4' : undefined} dot={poucos ? { r: 3, strokeWidth: 0, fill: cor(s.cor) } : false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: cor('surface') }} isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}

export function BarraChart({ dados, formatar, descricao, nome, larguraEixo = 64 }: Base & { nome: string }) {
  return (
    <div className="dash-grafico">
      <figure className="dash-chart" role="img" aria-label={descricao}>
        <div className="dash-chart__area">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={cor('border')} vertical={false} />
              <XAxis {...eixoX()} />
              <YAxis {...eixoY(formatar, larguraEixo)} />
              <Tooltip {...dica(formatar)} cursor={{ fill: cor('surfaceSoft') }} />
              <Bar dataKey="valor" name={nome} fill={cor('action')} radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  )
}

/** Padrão de preenchimento: a série se distingue pela forma, além da cor. */
export type Padrao = 'solido' | 'listras' | 'pontos'
export type SerieBarra = { chave: string; nome: string; cor: CorSerie; padrao?: Padrao }

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
  const prefixo = `dash-leg-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <ul className="dash-legenda">
      {series.map((s) => (
        <li key={s.chave}>
          <svg className="dash-legenda__amostra" width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
            <Padroes prefixo={prefixo} series={[s]} />
            <rect x={0.5} y={0.5} width={11} height={11} rx={2} fill={preenchimento(prefixo, s)} stroke={cor(s.cor)} />
          </svg>
          {s.nome}
        </li>
      ))}
    </ul>
  )
}

type BarrasProps = { dados: Ponto[]; series: SerieBarra[]; formatar: (v: number) => string; descricao: string; empilhado?: boolean; larguraEixo?: number; dominioMax?: number }

/** Barras agrupadas ou empilhadas com legenda; cada série tem cor e padrão próprios. Sem animação (recarga a cada 60 s). */
export function BarrasChart({ dados, series, formatar, descricao, empilhado = false, larguraEixo = 48, dominioMax }: BarrasProps) {
  const prefixo = `dash-pad-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <div className="dash-grafico">
      <LegendaBarras series={series} />
      <figure className="dash-chart" role="img" aria-label={descricao}>
        <div className="dash-chart__area">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <Padroes prefixo={prefixo} series={series} />
              <CartesianGrid stroke={cor('border')} vertical={false} />
              <XAxis {...eixoX()} />
              <YAxis {...eixoY(formatar, larguraEixo)} domain={dominioMax ? [0, dominioMax] : undefined} allowDecimals={false} />
              <Tooltip {...dica(formatar)} cursor={{ fill: cor('surfaceSoft') }} />
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

/** Faixa abaixo do ponto mais baixo, para a área não encostar a linha na base do card. */
const dominioSpark = ([min, max]: readonly [number, number]): [number, number] => [min - ((max - min) || Math.abs(max) || 1) * 0.35, max]

/** Tendência dos últimos meses na base do card de KPI: linha na cor do indicador e área no tom suave. Decorativa; o valor está no card. */
export function Sparkline({ dados, linha, area }: { dados: Ponto[]; linha: CorToken; area: CorToken }) {
  return (
    <div className="dash-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart accessibilityLayer={false} data={dados} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={dominioSpark} />
          <Area type="monotone" dataKey="valor" stroke={cor(linha)} strokeWidth={1.5} fill={cor(area)} fillOpacity={1} baseValue="dataMin" dot={false} activeDot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
