import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cor, type CorToken } from './tokens'

export type Serie = { chave: string; nome: string; cor: CorToken; tracejada?: boolean }
type Ponto = Record<string, string | number | null>
type Base = { dados: Ponto[]; formatar: (v: number) => string; altura?: number; descricao: string }

const eixo = () => ({ tick: { fill: cor('secondary'), fontSize: 11 }, stroke: cor('border'), tickLine: false })
const dica = () => ({ contentStyle: { backgroundColor: cor('surface'), border: `1px solid ${cor('border')}`, fontSize: 12 }, labelStyle: { color: cor('secondary') } })

/** Linhas com grade horizontal, tooltip e legenda; sem animação (recarga a cada 60 s). */
export function LinhaChart({ dados, series, formatar, altura = 240, descricao }: Base & { series: Serie[] }) {
  return (
    <figure className="dash-chart" style={{ height: altura }} role="img" aria-label={descricao}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={cor('border')} vertical={false} />
          <XAxis dataKey="rotulo" {...eixo()} />
          <YAxis {...eixo()} width={72} tickFormatter={(v) => formatar(Number(v))} />
          <Tooltip {...dica()} formatter={(v) => formatar(Number(v))} />
          {series.length > 1 ? <Legend /> : null}
          {series.map((s) => (
            <Line key={s.chave} type="monotone" dataKey={s.chave} name={s.nome} stroke={cor(s.cor)} strokeWidth={2} strokeDasharray={s.tracejada ? '4 3' : undefined} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}

export function BarraChart({ dados, formatar, altura = 240, descricao, nome }: Base & { nome: string }) {
  return (
    <figure className="dash-chart" style={{ height: altura }} role="img" aria-label={descricao}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={cor('border')} vertical={false} />
          <XAxis dataKey="rotulo" {...eixo()} />
          <YAxis {...eixo()} width={72} tickFormatter={(v) => formatar(Number(v))} />
          <Tooltip {...dica()} formatter={(v) => formatar(Number(v))} />
          <Bar dataKey="valor" name={nome} fill={cor('action')} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

/** Tendência dos últimos meses no card de KPI; decorativa, o valor está no card. */
export function Sparkline({ dados }: { dados: Ponto[] }) {
  return (
    <div className="dash-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={dados} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="valor" stroke={cor('action')} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
