import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Progress, StatusBadge, TableTitle, type StatusTone } from '@betinhos/ui'
import type { Delta } from '../domain/analises'
import { dec, normL } from '../domain/format'

/* Células das tabelas do Resumo no desktop: valor forte com linha de apoio, barra de participação e status. */

export const pct = (v: number) => `${dec(v, 1)}%`

/** Primeira coluna: nome em 13 px/700 (TableTitle do DS); o nome inteiro fica no `title` quando é cortado. */
export function Nome({ texto, meta }: { texto: string; meta?: ReactNode }) {
  return <span className="dash-nome" title={texto}><TableTitle title={texto} meta={meta} /></span>
}

/** Número em negrito com uma linha menor abaixo (percentual, quantidade, variação). */
export function Duplo({ valor, apoio, tom }: { valor: ReactNode; apoio?: ReactNode; tom?: 'sobe' | 'desce' | 'novo' }) {
  return (
    <span className="dash-duplo">
      <strong className="dash-duplo__valor">{valor}</strong>
      {apoio != null ? <span className={tom ? `dash-duplo__apoio dash-duplo__apoio--${tom}` : 'dash-duplo__apoio'}>{apoio}</span> : null}
    </span>
  )
}

/** Valor do mês e a variação sobre o mês anterior: sinal e texto, além da cor. */
export function ValorDelta({ valor, delta }: { valor: string; delta: Delta }) {
  if (delta.tipo === 'novo') return <Duplo valor={valor} apoio="Novo" tom="novo" />
  if (delta.tipo === 'nada') return <Duplo valor={valor} apoio="—" />
  const sobe = delta.valor >= 0
  return <Duplo valor={valor} apoio={`${sobe ? '+' : '−'}${dec(Math.abs(delta.valor), 1)}%`} tom={sobe ? 'sobe' : 'desce'} />
}

/** Barra de participação (Progress do DS) com o percentual em negrito e o número abaixo, ao lado da barra. */
export function Participacao({ valor, rotulo, detalhe, tom = 'info' }: { valor: number; rotulo: string; detalhe?: string; tom?: 'info' | 'success' | 'warning' }) {
  return (
    <span className="dash-part">
      <Progress value={Math.max(0, Math.min(100, valor))} label={`${rotulo}: ${pct(valor)}`} tone={tom} showValue={false} />
      <Duplo valor={pct(valor)} apoio={detalhe} />
    </span>
  )
}

/** Tom do status pelo texto, como o legado classifica: concluído em sucesso, cancelado/recusado em perigo, demais neutro. */
export function tomStatus(status: string): StatusTone {
  const k = normL(status)
  if (k.includes('conclu') || k.includes('realiz') || k.includes('finaliz')) return 'success'
  if (k.includes('cancel') || k.includes('recus')) return 'danger'
  return 'neutral'
}
export const Status = ({ texto }: { texto: string }) => <StatusBadge tone={tomStatus(texto)} dot>{texto}</StatusBadge>

/** Trilha de coluna com largura mínima em px: quando a soma não cabe, a tabela rola dentro do card. */
export const col = (min: number, fr = 1) => ({ min, width: `minmax(${min}px, ${fr}fr)` })
/** Largura mínima da tabela: colunas + vãos + padding lateral da linha (14 px de cada lado). */
export const larguraMinima = (cols: { min: number }[], vao: number) => cols.reduce((t, c) => t + c.min, 0) + vao * (cols.length - 1) + 28

/**
 * Região rolável de uma tabela larga ou longa: rola só dentro do card, nunca a página.
 * Quando há o que rolar, recebe foco pelo teclado (setas rolam); cabeçalho e 1ª coluna ficam fixos.
 */
export function Rolagem({ rotulo, alturaMax, children }: { rotulo: string; alturaMax?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [rola, setRola] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setRola(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    if (el.firstElementChild) obs.observe(el.firstElementChild)
    return () => obs.disconnect()
  }, [])
  const style: CSSProperties | undefined = alturaMax ? { maxHeight: alturaMax } : undefined
  return <div ref={ref} className="dash-rolagem" role="region" aria-label={rotulo} tabIndex={rola ? 0 : undefined} style={style}>{children}</div>
}
