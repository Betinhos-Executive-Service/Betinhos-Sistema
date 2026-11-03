import { useId, type ReactNode } from 'react'
import { Button, StatusBadge, type StatusTone } from '@betinhos/ui'
import { AlertTriangle, ChevronRight, CircleCheck } from 'lucide-react'
import type { AlertaItem, Tom } from '../domain/types'

export type TomAlerta = 'danger' | 'warning' | 'success' | 'neutral' | 'brand'
const TOM: Record<Tom, TomAlerta> = { ok: 'success', warn: 'warning', danger: 'danger', neutral: 'neutral' }
/** Prefixo lido pelo leitor de tela quando o texto do selo não diz o estado. */
const PREFIXO: Partial<Record<TomAlerta, string>> = { danger: 'Atenção', warning: 'Atenção', success: 'OK' }

/** Card pequeno de alerta: número colorido pelo tom, rótulo e selo de status com ícone (status nunca só por cor). */
export function AlertaCard({ valor, rotulo, status, tom, onAbrir }: { valor: string; rotulo: string; status: string; tom: TomAlerta; onAbrir?: () => void }) {
  const tone: StatusTone = tom === 'brand' ? 'neutral' : tom
  const prefixo = PREFIXO[tom]
  const icone = tom === 'danger' || tom === 'warning' ? <AlertTriangle size={12} /> : tom === 'success' ? <CircleCheck size={12} /> : undefined
  return (
    <li className={`dash-alerta dash-alerta--${tom}${onAbrir ? ' dash-alerta--abre' : ''}`}>
      <strong className="dash-alerta__valor">{valor}</strong>
      <span className="dash-alerta__rotulo">{rotulo}</span>
      <span className="dash-alerta__selo">
        <StatusBadge tone={tone} icon={icone} title={status}>
          {prefixo && !status.startsWith(prefixo) ? <span className="dash-sr">{prefixo}: </span> : null}{status}
        </StatusBadge>
      </span>
      {onAbrir ? (
        <Button className="dash-abre dash-alerta__abre" variant="ghost" size="compact" iconEnd={<ChevronRight size={14} aria-hidden="true" />} onClick={onAbrir}>
          Ver lista{' '}<span className="dash-sr">de {rotulo}</span>
        </Button>
      ) : null}
    </li>
  )
}

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
      {itens.map((a) => <AlertaCard key={a.id} valor={a.valor} rotulo={a.rotulo} status={a.status} tom={TOM[a.tom]} onAbrir={a.status !== 's/dado' && a.valor !== '0' ? abrir[a.id] : undefined} />)}
    </Faixa>
  )
}

/** Títulos das duas faixas do Resumo, na ordem da página. */
export const FAIXAS_RESUMO = ['Alertas de operação', 'Qualidade dos dados'] as const

