import type { ReactNode } from 'react'
import type { StatCardProps } from '@betinhos/ui'
import type { ChipAnterior } from '../domain/comparar'
import type { Apoio, Chip } from '../domain/types'
import { Chips } from './KpiChip'

type Entrada = {
  /** Comparativos do KPI (LM, LY, ANT.), cada um num chip "[ANO ANT.] R$ 1,12M ↗ +78,1%". */
  chips?: (Chip | ChipAnterior | null | undefined)[]
  /** Apoios rotulados (chip ou linha "Rótulo texto", com aviso de atenção) ou uma frase simples. */
  apoio?: Apoio[] | string
  /** Extras próprios da aba, depois dos demais (ex.: faixa da hospedagem). */
  extra?: ReactNode
}

/** O que o card ampliado do KPI mostra (comparativos e apoios); `KpiAba` lê e não repassa ao `StatCard`. */
export type DadosKpi = { chips: (Chip | ChipAnterior)[]; apoio: Apoio[] }

/** Extras do `StatCard` logo abaixo do valor, como chips compactos: `<StatCard {...extrasKpi({ chips, apoio })} />`. */
export function extrasKpi({ chips = [], apoio = [], extra }: Entrada): Pick<StatCardProps, 'children'> & { dados: DadosKpi } {
  // Comparativo sem base ("ANO ANT. s/dado") só ocupa espaço: fica de fora.
  const comparativos = chips.filter((c): c is Chip | ChipAnterior => c != null && c.tipo !== 'sem-dado')
  const frase = typeof apoio === 'string' ? apoio : ''
  const rotulados = typeof apoio === 'string' ? [] : apoio
  const dados: DadosKpi = { chips: comparativos, apoio: frase ? [...rotulados, { rotulo: '', texto: frase }] : rotulados }
  if (!comparativos.length && !rotulados.length && !frase && extra == null) return { dados }
  return {
    dados,
    children: (
      <div className="dash-kpi-extras">
        <Chips chips={comparativos} apoio={rotulados} />
        {frase ? <span className="dash-apoio">{frase}</span> : null}
        {extra}
      </div>
    ),
  }
}
