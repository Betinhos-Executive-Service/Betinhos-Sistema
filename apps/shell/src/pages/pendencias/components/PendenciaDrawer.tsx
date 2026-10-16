import type { ReactNode } from 'react'
import { Drawer } from '@betinhos/ui'
import { formatDate, formatMoney } from '../../pagantes/domain/messages'
import { TIPO_LABEL, type Pendencia } from '../domain/types'
import { AcaoPendencia, TipoBadge, servicosTexto, type Acoes } from './PendenciasList'

type Props = Acoes & { pendencia: Pendencia | null; onClose: () => void }

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pg-ficha__item"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}

/** Ficha da pendência: tipo, motivo, OP, serviços envolvidos e valor. Fecha por X, Esc ou clique fora. */
export function PendenciaDrawer({ pendencia: p, onClose, ...acoes }: Props) {
  return (
    <Drawer open={p != null} onClose={onClose} size="wide" eyebrow="Pendência" title={p ? (p.opCodigo || p.reservaCodigos[0] || 'Sem código') : ''}
      footer={p ? <AcaoPendencia p={p} {...acoes} /> : undefined}>
      {p ? (
        <div className="pg-ficha">
          <div className="pg-ficha__hero">
            <span className="pg-badges"><TipoBadge p={p} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(p.valor)}</strong>
            <span className="pg-muted">{[p.cliente || 'Sem cliente', formatDate(p.data)].join(' · ')}</span>
          </div>

          <section className="pg-ficha__block">
            <header className="pg-ficha__block-head"><h3>Resumo</h3></header>
            <dl className="pg-ficha__grid">
              <Item label="Tipo">{TIPO_LABEL[p.tipo]}</Item>
              <Item label="Motivo">{p.detalhe}</Item>
              <Item label="OP">{p.opCodigo || (p.opId ? 'OP sem código' : 'Sem OP')}</Item>
              <Item label="Cliente">{p.cliente}</Item>
              <Item label="Último serviço">{formatDate(p.data)}</Item>
              <Item label="Valor">{formatMoney(p.valor)}</Item>
            </dl>
          </section>

          <section className="pg-ficha__block">
            <header className="pg-ficha__block-head"><h3>Serviços</h3><span className="pg-muted pg-num">{servicosTexto(p.reservaIds.length)}</span></header>
            {p.reservaCodigos.length ? (
              <ul className="pg-related">
                {p.reservaCodigos.map((codigo, i) => (
                  <li key={p.reservaIds[i] ?? codigo} className="pg-related__row pg-related__row--static pend-servico">
                    <span className="pg-num">{codigo || 'Serviço sem código'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="pg-muted">Nenhum serviço ligado a esta pendência.</p>}
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
