import { useId, type ReactNode } from 'react'
import { AlertCard, type StatusTone } from '@betinhos/ui'
import type { AlertaItem, Tom } from '../domain/types'

const TOM: Record<Tom, StatusTone> = { ok: 'success', warn: 'warning', danger: 'danger', neutral: 'neutral' }

/** Faixa de alertas com eyebrow ("ALERTAS DE OPERAÇÃO") e cards em grade fluida. */
export function Faixa({ titulo, itens, children }: { titulo: string; itens: number; children: ReactNode }) {
  const id = useId()
  return (
    <section className="dash-faixa" aria-labelledby={id}>
      <h2 className="dash-faixa__titulo" id={id}>{titulo}</h2>
      <ul className={`dash-faixa__lista dash-faixa__lista--${itens}`}>{children}</ul>
    </section>
  )
}

/** `abrir`: drill-down por id do alerta (só aparece com número diferente de zero e dado disponível). */
export function AlertList({ titulo, itens, abrir = {} }: { titulo: string; itens: AlertaItem[]; abrir?: Partial<Record<string, () => void>> }) {
  return (
    <Faixa titulo={titulo} itens={itens.length}>
      {itens.map((a) => <AlertCard as="li" key={a.id} value={a.valor} label={a.rotulo} status={a.status} tone={TOM[a.tom]} onOpen={a.status !== 's/dado' && a.valor !== '0' ? abrir[a.id] : undefined} />)}
    </Faixa>
  )
}

/** Títulos das duas faixas do Resumo, na ordem da página. */
export const FAIXAS_RESUMO = ['Alertas de operação', 'Qualidade dos dados'] as const
