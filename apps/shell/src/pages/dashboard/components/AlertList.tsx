import { useId, type ReactNode } from 'react'
import { Skeleton, StatusBadge, type StatusTone } from '@betinhos/ui'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import type { AlertaItem, Tom } from '../domain/types'

export type TomAlerta = 'danger' | 'warning' | 'success' | 'neutral' | 'brand'
const TOM: Record<Tom, TomAlerta> = { ok: 'success', warn: 'warning', danger: 'danger', neutral: 'neutral' }
/** Prefixo lido pelo leitor de tela quando o texto do selo não diz o estado. */
const PREFIXO: Partial<Record<TomAlerta, string>> = { danger: 'Atenção', warning: 'Atenção', success: 'OK' }

/** Card pequeno de alerta: número colorido pelo tom, rótulo e selo de status com ícone (status nunca só por cor). */
export function AlertaCard({ valor, rotulo, status, tom }: { valor: string; rotulo: string; status: string; tom: TomAlerta }) {
  const tone: StatusTone = tom === 'brand' ? 'neutral' : tom
  const prefixo = PREFIXO[tom]
  const icone = tom === 'danger' || tom === 'warning' ? <AlertTriangle size={12} /> : tom === 'success' ? <CircleCheck size={12} /> : undefined
  return (
    <li className={`dash-alerta dash-alerta--${tom}`}>
      <strong className="dash-alerta__valor">{valor}</strong>
      <span className="dash-alerta__rotulo">{rotulo}</span>
      <span className="dash-alerta__selo">
        <StatusBadge tone={tone} icon={icone} title={status}>
          {prefixo && !status.startsWith(prefixo) ? <span className="dash-sr">{prefixo}: </span> : null}{status}
        </StatusBadge>
      </span>
    </li>
  )
}

/** Faixa de alertas com eyebrow ("OPERAÇÃO") e cards em grade fluida. */
export function Faixa({ titulo, itens, children }: { titulo: string; itens: number; children: ReactNode }) {
  const id = useId()
  return (
    <section className="dash-faixa" aria-labelledby={id}>
      <h3 className="dash-faixa__titulo" id={id}>{titulo}</h3>
      <ul className={`dash-faixa__lista dash-faixa__lista--${itens}`}>{children}</ul>
    </section>
  )
}

export function AlertList({ titulo, itens }: { titulo: string; itens: AlertaItem[] }) {
  return (
    <Faixa titulo={titulo} itens={itens.length}>
      {itens.map((a) => <AlertaCard key={a.id} valor={a.valor} rotulo={a.rotulo} status={a.status} tom={TOM[a.tom]} />)}
    </Faixa>
  )
}

const FAIXAS = ['Operação', 'Qualidade dos dados', 'Frota e pessoas']

/** Primeira carga: as três faixas no formato final, com quatro cards ocupados cada e sem números. */
export function AlertasCarregando() {
  return (
    <div className="dash-faixas">
      {FAIXAS.map((titulo) => (
        <Faixa key={titulo} titulo={titulo} itens={4}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="dash-alerta" aria-hidden="true">
              <span className="dash-alerta__valor"><Skeleton width={28} height={20} /></span>
              <span className="dash-alerta__rotulo"><Skeleton width="56%" height={11} /></span>
              <span className="dash-alerta__selo"><Skeleton width="72%" height={22} /></span>
            </li>
          ))}
        </Faixa>
      ))}
      <span className="dash-sr">Carregando alertas</span>
    </div>
  )
}
