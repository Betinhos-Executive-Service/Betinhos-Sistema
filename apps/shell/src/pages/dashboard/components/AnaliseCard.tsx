import { useState, type ReactNode } from 'react'
import { Button, Surface } from '@betinhos/ui'
import type { Apoio, Chip } from '../domain/types'
import { ApoioTexto, KpiChip } from './KpiChip'

type Props = { titulo: string; periodo: string; unidade: string; valor: string; sub?: string; chips?: Chip[]; apoio?: Apoio[]; grafico?: ReactNode; tabela: ReactNode }

/** Card de análise do DS §10.16: título, período, unidade, gráfico e alternativa em tabela. */
export function AnaliseCard({ titulo, periodo, unidade, valor, sub, chips = [], apoio = [], grafico, tabela }: Props) {
  const [escolha, setEscolha] = useState<boolean | null>(null)
  const verTabela = escolha ?? !grafico
  return (
    <Surface
      className="dash-analise"
      eyebrow={`${periodo} · ${unidade}`}
      title={titulo}
      action={grafico ? <Button variant="ghost" size="compact" onClick={() => setEscolha(!verTabela)}>{verTabela ? 'Ver gráfico' : 'Ver tabela'}</Button> : undefined}
    >
      <div className="dash-analise__topo">
        <strong className="dash-analise__valor">{valor}</strong>
        {sub ? <span className="dash-analise__sub">{sub}</span> : null}
        {chips.length || apoio.length ? <span className="dash-chips">{chips.map((c) => <KpiChip key={c.rotulo} chip={c} />)}{apoio.map((a) => <ApoioTexto key={a.rotulo} apoio={a} />)}</span> : null}
      </div>
      {verTabela || !grafico ? tabela : grafico}
    </Surface>
  )
}
