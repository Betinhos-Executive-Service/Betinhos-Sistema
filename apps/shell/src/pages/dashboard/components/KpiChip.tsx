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

/** Rótulo curto na tela e longo no leitor de tela; sem curto, mostra o próprio texto. */
function Rotulo({ curto, longo }: { curto?: string; longo: string }) {
  if (!curto) return <span className="dash-chip__rotulo">{longo}</span>
  return <><span className="dash-chip__rotulo" aria-hidden="true">{curto}</span><span className="dash-sr">{longo}</span></>
}

/**
 * Comparativos: o domínio usa os códigos do legado (LM, LY, ANT.); a tela mostra um rótulo curto em português e o nome
 * completo vai na dica (title) e no leitor de tela.
 */
const COMPARATIVO: Record<string, { curto: string; longo: string }> = {
  LM: { curto: 'Mês ant.', longo: 'Mesmo período do mês anterior' },
  LY: { curto: 'Ano ant.', longo: 'Mesmo período do ano anterior' },
  'ANT.': { curto: 'Ant.', longo: 'Período anterior de mesma duração' },
}

const comparativo = (codigo: string): { curto?: string; longo: string } => COMPARATIVO[codigo] ?? { longo: codigo }

/** Variação do comparativo: seta, sinal e % (a cor vem do chip). */
function Delta({ variacao }: { variacao: number }) {
  const sobe = variacao >= 0
  return <span className="dash-chip__delta">{sobe ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}{sobe ? '+' : '−'}{dec(Math.abs(variacao), 1)}%</span>
}

/** Comparativo mês/ano anterior: `[ANO ANT.] R$ 994,1k ↗ +87,9%` — seta, sinal e texto, nunca só cor. */
export function KpiChip({ chip }: { chip: Chip }) {
  const c = comparativo(chip.rotulo)
  if (chip.tipo === 'sem-dado') {
    return <span className="dash-chip dash-chip--neutro" title={c.longo}><Rotulo curto={c.curto} longo={c.longo} /> <span className="dash-chip__texto">s/dado</span></span>
  }
  const sobe = chip.variacao >= 0
  return (
    <span className={sobe ? 'dash-chip dash-chip--sobe' : 'dash-chip dash-chip--desce'} title={c.longo}>
      <Rotulo curto={c.curto} longo={c.longo} /> <span className="dash-chip__texto">{chip.anterior}</span>{' '}
      <Delta variacao={chip.variacao} />
    </span>
  )
}

/** Apoio como chip rotulado; em atenção ganha tom de atenção, ícone e "Atenção:" em texto oculto. */
export function ApoioChip({ apoio }: { apoio: Apoio }) {
  return (
    <span className={apoio.atencao ? 'dash-chip dash-chip--atencao' : 'dash-chip'} title={CURTO[apoio.rotulo] ? apoio.rotulo : undefined}>
      <Rotulo curto={CURTO[apoio.rotulo]} longo={apoio.rotulo} />{' '}
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

const ehAnt = (c: Chip | ChipAnterior): c is ChipAnterior => c.rotulo === 'ANT.'

/** Comparativos primeiro (LM/LY ou ANT.), depois os apoios: rotulados viram chip, o resto vira linha de texto. */
export function Chips({ chips = [], apoio = [] }: { chips?: (Chip | ChipAnterior)[]; apoio?: Apoio[] }) {
  return <>
    {chips.map((c) => (ehAnt(c) ? <ChipAnt key={c.rotulo} chip={c} /> : <KpiChip key={c.rotulo} chip={c} />))}
    {apoio.map((a) => (virouChip(a.rotulo) ? <ApoioChip key={a.rotulo} apoio={a} /> : <ApoioTexto key={a.rotulo} apoio={a} />))}
  </>
}

/**
 * Chip "ANT." contra o período anterior de mesma duração: a cor segue `favoravel` (definido por indicador no domínio); seta, sinal e
 * "favorável/desfavorável" em texto, além da cor.
 */
export function ChipAnt({ chip }: { chip: ChipAnterior }) {
  const c = comparativo(chip.rotulo)
  const rotulo = <Rotulo curto={c.curto} longo={c.longo} />
  if (chip.tipo === 'sem-dado') return <span className="dash-chip dash-chip--neutro" title={c.longo}>{rotulo} <span className="dash-chip__texto">s/dado</span></span>
  // Anterior zero: mostra o valor, sem variação em % (não existe a partir de zero).
  if (chip.tipo === 'base-zero') return <span className="dash-chip dash-chip--neutro" title={`${c.longo}: ${chip.anterior}, sem variação em %`}>{rotulo} <span className="dash-chip__texto">{chip.anterior}</span><span className="dash-sr">, sem variação em %</span></span>
  return (
    <span className={chip.favoravel ? 'dash-chip dash-chip--sobe' : 'dash-chip dash-chip--desce'} title={c.longo}>
      {rotulo} <span className="dash-chip__texto">{chip.anterior}</span>{' '}
      <Delta variacao={chip.variacao} />
      <span className="dash-sr">{chip.favoravel ? ', favorável' : ', desfavorável'}</span>
    </span>
  )
}
