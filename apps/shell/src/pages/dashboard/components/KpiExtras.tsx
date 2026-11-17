import { Fragment, type ReactNode } from 'react'
import { DeltaBadge, type DeltaTone, type StatCardProps } from '@betinhos/ui'
import type { ChipAnterior } from '../domain/comparar'
import { dec } from '../domain/format'
import type { Apoio, Chip } from '../domain/types'
import { ApoioTexto, COMPARATIVO } from './KpiChip'

type Comparativo = { delta?: ReactNode; texto: string }

/**
 * Comparativo vira `<DeltaBadge>` (seta, sinal e %) mais uma frase "vs R$ 2,0k no mês anterior". A cor segue o que é favorável:
 * `favoravel` do chip "ANT." (definido por indicador no domínio); nos chips LM/LY, subir é favorável.
 */
function comparativo(chip: Chip | ChipAnterior): Comparativo {
  const c = COMPARATIVO[chip.rotulo] ?? { periodo: chip.rotulo, longo: chip.rotulo }
  if (chip.tipo === 'sem-dado') return { texto: `${c.periodo[0].toUpperCase()}${c.periodo.slice(1)}: s/dado` }
  const texto = `vs ${chip.anterior} no ${c.periodo}`
  // Anterior zero: mostra o valor, sem variação em % (não existe a partir de zero).
  if (chip.tipo === 'base-zero') return { texto, delta: <DeltaBadge tone="neutral" title={`${c.longo}: sem variação em %`}>—<span className="dash-sr">, sem variação em %</span></DeltaBadge> }
  const sobe = chip.variacao >= 0
  const tone: DeltaTone | undefined = 'favoravel' in chip ? (chip.favoravel ? 'positive' : 'negative') : undefined
  return { texto, delta: <DeltaBadge trend={sobe ? 'up' : 'down'} tone={tone} title={c.longo}>{sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%</DeltaBadge> }
}

type Entrada = {
  /** Comparativos do KPI (LM, LY, ANT.); o primeiro vira o selo e a frase do card, os demais viram linhas extras. */
  chips?: (Chip | ChipAnterior | null | undefined)[]
  /** Apoios rotulados (linha "Rótulo texto", com aviso de atenção) ou uma frase simples. */
  apoio?: Apoio[] | string
  /** Extras próprios da aba, depois dos demais (ex.: faixa da hospedagem). */
  extra?: ReactNode
}

/** Props do `StatCard` que carregam comparativos e apoios: `<StatCard {...extrasKpi({ chips, apoio })} />`. */
export function extrasKpi({ chips = [], apoio = [], extra }: Entrada): Pick<StatCardProps, 'delta' | 'hint' | 'children'> {
  const [primeiro, ...resto] = chips.filter((c): c is Chip | ChipAnterior => c != null).map(comparativo)
  const frase = typeof apoio === 'string' ? apoio : ''
  const rotulados = typeof apoio === 'string' ? [] : apoio
  // Sem comparativo, a frase de apoio é o próprio `hint` do card; com comparativo, vira linha abaixo dele.
  const linhas = [
    ...resto.map((c, i) => <span key={`c${i}`} className="dash-apoio dash-comp">{c.texto}{c.delta}</span>),
    primeiro && frase ? <span key="frase" className="dash-apoio">{frase}</span> : null,
    ...rotulados.map((a) => <ApoioTexto key={a.rotulo} apoio={a} />),
    extra != null ? <Fragment key="extra">{extra}</Fragment> : null,
  ].filter((l) => l != null)
  return { delta: primeiro?.delta, hint: primeiro?.texto ?? (frase || undefined), children: linhas }
}
