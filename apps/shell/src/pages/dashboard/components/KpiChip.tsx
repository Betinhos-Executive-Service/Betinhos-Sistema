import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ChipAnterior } from '../domain/comparar'
import { dec } from '../domain/format'
import type { Apoio, Chip } from '../domain/types'

/** Rótulos curtos dos chips, como no legado; o leitor de tela recebe o rótulo inteiro. */
const CURTO: Record<string, string> = {
  'Projeção': 'Proj', 'Futuros': 'Futuro', '% do faturamento': '% fat', '% da receita': '% rec', 'Concluídos': 'Conc', 'Meta': 'Meta',
}
/** Apoios que viram chip rotulado; os demais (previsão, recebido) ficam como linha de texto. */
const virouChip = (rotulo: string) => rotulo in CURTO || /^\dº$/.test(rotulo)

function Rotulo({ texto }: { texto: string }) {
  const curto = CURTO[texto]
  if (!curto) return <span className="dash-chip__rotulo">{texto}</span>
  return <><span className="dash-chip__rotulo" aria-hidden="true">{curto}</span><span className="dash-sr">{texto}</span></>
}

/** Comparativo LM/LY: `[LY] R$ 994,1k ↗ +87,9%` — seta, sinal e texto, nunca só cor. */
export function KpiChip({ chip }: { chip: Chip }) {
  if (chip.tipo === 'sem-dado') {
    return <span className="dash-chip dash-chip--neutro"><Rotulo texto={chip.rotulo} /> <span className="dash-chip__texto">s/dado</span></span>
  }
  const sobe = chip.variacao >= 0
  return (
    <span className={sobe ? 'dash-chip dash-chip--sobe' : 'dash-chip dash-chip--desce'}>
      <Rotulo texto={chip.rotulo} /> <span className="dash-chip__texto">{chip.anterior}</span>{' '}
      <span className="dash-chip__delta">{sobe ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}{sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%</span>
    </span>
  )
}

/** Apoio como chip rotulado; em atenção ganha tom de atenção, ícone e "Atenção:" em texto oculto. */
export function ApoioChip({ apoio }: { apoio: Apoio }) {
  return (
    <span className={apoio.atencao ? 'dash-chip dash-chip--atencao' : 'dash-chip'} title={CURTO[apoio.rotulo] ? apoio.rotulo : undefined}>
      <Rotulo texto={apoio.rotulo} />{' '}
      {apoio.atencao ? <><AlertTriangle className="dash-chip__icone" size={12} aria-hidden="true" /><span className="dash-sr">Atenção:</span></> : null}
      <span className="dash-chip__texto">{apoio.texto}</span>
    </span>
  )
}

/** Linha de apoio em texto; em atenção leva ícone e "Atenção:" em texto oculto, para não depender só da cor. */
export function ApoioTexto({ apoio }: { apoio: Apoio }) {
  return (
    <span className={apoio.atencao ? 'dash-apoio dash-apoio--atencao' : 'dash-apoio'}>
      {apoio.atencao ? <><AlertTriangle className="dash-apoio__icone" size={14} aria-hidden="true" /><span className="dash-sr">Atenção:</span></> : null}
      <span className="dash-apoio__rotulo">{apoio.rotulo}</span> {apoio.texto}
    </span>
  )
}

/** Comparativos primeiro, depois os apoios: rotulados viram chip, o resto vira linha de texto. */
export function Chips({ chips = [], apoio = [] }: { chips?: Chip[]; apoio?: Apoio[] }) {
  return <>
    {chips.map((c) => <KpiChip key={c.rotulo} chip={c} />)}
    {apoio.map((a) => (virouChip(a.rotulo) ? <ApoioChip key={a.rotulo} apoio={a} /> : <ApoioTexto key={a.rotulo} apoio={a} />))}
  </>
}

/**
 * Chip "ANT." contra o período anterior de mesma duração: a cor segue `favoravel` (definido por indicador no domínio); seta, sinal e
 * "favorável/desfavorável" em texto, além da cor.
 */
export function ChipAnt({ chip }: { chip: ChipAnterior }) {
  const rotulo = <><span className="dash-chip__rotulo" aria-hidden="true">{chip.rotulo}</span><span className="dash-sr">Período anterior</span></>
  if (chip.tipo === 'sem-dado') return <span className="dash-chip dash-chip--neutro">{rotulo} <span className="dash-chip__texto">s/dado</span></span>
  if (chip.tipo === 'base-zero') return <span className="dash-chip dash-chip--neutro">{rotulo} <span className="dash-chip__texto">{chip.anterior} · base zero</span></span>
  const sobe = chip.variacao >= 0
  return (
    <span className={chip.favoravel ? 'dash-chip dash-chip--sobe' : 'dash-chip dash-chip--desce'}>
      {rotulo} <span className="dash-chip__texto">{chip.anterior}</span>{' '}
      <span className="dash-chip__delta">{sobe ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}{sobe ? '+' : '−'}{dec(Math.abs(chip.variacao), 1)}%</span>
      <span className="dash-sr">{chip.favoravel ? ', favorável' : ', desfavorável'}</span>
    </span>
  )
}
