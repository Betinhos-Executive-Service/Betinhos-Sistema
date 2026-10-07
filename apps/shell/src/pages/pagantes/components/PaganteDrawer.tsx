import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, Skeleton, StatusBadge } from '@betinhos/ui'
import { CheckCircle2, ExternalLink, FileText, Lock, Split, XCircle } from 'lucide-react'
import type { Source } from '../data/source'
import { formatDate, formatDateTime, formatMoney } from '../domain/messages'
import { ETAPA, canCancel, canMarkPaid, isPaid, label, statusTone } from '../domain/status'
import { buildTimeline } from '../domain/timeline'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../domain/types'
import { QuickActions } from './QuickActions'
import { FalhaBadge, PagamentoBadge, ReciboBadge } from './StatusBadges'

type Props = {
  p: Pagante | null
  onClose: () => void
  onOpen: (p: Pagante) => void
  choices: ChoiceSet
  contatos: Map<string, Contato>
  source: Source
  onStatus: (p: Pagante, kind: 'pago' | 'cancelado') => void
  onRecibo: (p: Pagante) => void
  onAbrirOp: (p: Pagante) => void
  /** Muda a cada recarga, para a ficha buscar o rateio de novo. */
  version: number
}

type Related = { rateio: Pagante[]; servicos: ServicoOp[] } | { error: string } | null

function Item({ label: name, children }: { label: string; children: ReactNode }) {
  return <div className="pg-ficha__item"><dt>{name}</dt><dd>{children || '—'}</dd></div>
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="pg-ficha__block">
      <header className="pg-ficha__block-head"><h3>{title}</h3>{aside}</header>
      {children}
    </section>
  )
}

/** Rateio e serviços da OP: buscados quando a ficha abre, sem limite de período. */
function useRelated(source: Source, opId: string | null, version: number) {
  const [data, setData] = useState<Related>(null)
  useEffect(() => {
    if (!opId) { setData(null); return }
    let cancelled = false
    setData(null)
    Promise.all([source.rateio(opId), source.servicos(opId)])
      .then(([rateio, servicos]) => { if (!cancelled) setData({ rateio, servicos }) })
      .catch((reason) => { if (!cancelled) setData({ error: reason instanceof Error ? reason.message : String(reason) }) })
    return () => { cancelled = true }
  }, [source, opId, version])
  return data
}

export function PaganteDrawer({ p, onClose, onOpen, choices, contatos, source, onStatus, onRecibo, onAbrirOp, version }: Props) {
  const related = useRelated(source, p?.opId || null, version)
  const contato = p ? contatos.get(p.pessoaId) : undefined
  const locked = p ? isPaid(p) : false

  const footer = p ? (
    locked ? (
      <p className="pg-ficha__locked"><Lock size={14} aria-hidden="true" />Pagamento confirmado: o status não pode mais ser alterado.</p>
    ) : (
      <>
        {canCancel(p) ? <Button variant="secondary" icon={<XCircle size={16} />} onClick={() => onStatus(p, 'cancelado')}>Cancelar pagante</Button> : null}
        {canMarkPaid(p) ? <Button icon={<CheckCircle2 size={16} />} onClick={() => onStatus(p, 'pago')}>Marcar como pago</Button> : null}
      </>
    )
  ) : undefined

  return (
    <Drawer open={p != null} onClose={onClose} size="wide" eyebrow={p?.codigo || 'Pagante'} title={p?.pessoa || 'Pagante'} footer={footer}>
      {p ? (
        <div className="pg-ficha">
          <div className="pg-ficha__hero">
            <span className="pg-badges"><PagamentoBadge p={p} choices={choices} /><ReciboBadge p={p} choices={choices} /><FalhaBadge p={p} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(p.valor)}</strong>
            <span className="pg-muted">{label(choices.forma, p.forma)}{p.op ? ` · ${p.op}` : ''}</span>
          </div>

          {p.link.status === ETAPA.erro ? <Alert tone="danger" title="Falha ao gerar o link de pagamento">{p.link.erro || 'Sem detalhe do erro.'} Refaça o rateio no Gerar Pagantes.</Alert> : null}
          {p.email.status === ETAPA.erro ? <Alert tone="warning" title="Falha ao enviar o e-mail de cobrança">{p.email.erro || 'Sem detalhe do erro.'} Envie o link pelo WhatsApp ou refaça o envio no Gerar Pagantes.</Alert> : null}

          <div className="pg-ficha__actions">
            <QuickActions p={p} contato={contato} size="default" labels />
            {locked ? <Button variant="secondary" icon={<FileText size={16} />} onClick={() => onRecibo(p)}>{p.linkRecibo ? 'Reenviar recibo' : 'Gerar recibo'}</Button> : null}
            {p.opId ? <Button variant="secondary" icon={<Split size={16} />} onClick={() => onAbrirOp(p)}>Abrir OP no Gerar Pagantes</Button> : null}
          </div>

          <Section title="Pagamento">
            <dl className="pg-ficha__grid">
              <Item label="Ordem de pagamento">{p.op}</Item>
              <Item label="Forma">{label(choices.forma, p.forma)}</Item>
              <Item label="Criado em">{formatDateTime(p.criadoEm)}</Item>
              <Item label="Último lembrete">{formatDateTime(p.ultimoLembrete)}</Item>
              <Item label="Link de pagamento">{p.linkPagamento ? <a href={p.linkPagamento} target="_blank" rel="noopener noreferrer">Abrir link <ExternalLink size={12} aria-hidden="true" /></a> : ''}</Item>
              <Item label="Recibo">{p.linkRecibo ? <a href={p.linkRecibo} target="_blank" rel="noopener noreferrer">Abrir recibo <ExternalLink size={12} aria-hidden="true" /></a> : label(choices.recibo, p.recibo, '')}</Item>
            </dl>
          </Section>

          <Section title="Contato">
            {contato ? (
              <dl className="pg-ficha__grid">
                <Item label="Nome">{contato.nome}</Item>
                <Item label="Cliente">{contato.cliente}</Item>
                <Item label="Celular">{contato.telefone}</Item>
                <Item label="E-mail">{contato.email ? <a href={`mailto:${contato.email}`}>{contato.email}</a> : ''}</Item>
              </dl>
            ) : <p className="pg-muted">{p.pessoaId ? 'Contato não carregado.' : 'Pagante sem pessoa vinculada.'}</p>}
          </Section>

          {p.opId ? <RelatedBlocks p={p} related={related} choices={choices} onOpen={onOpen} /> : null}

          <Section title="Linha do tempo">
            <ol className="pg-timeline">
              {buildTimeline(p, choices).map((e) => (
                <li key={e.key} className={`pg-timeline__item pg-timeline__item--${e.tone}`}>
                  <span className="pg-timeline__dot" aria-hidden="true" />
                  <span className="pg-timeline__title">{e.title}</span>
                  <span className="pg-timeline__at">{e.at ? formatDateTime(e.at) : 'Sem data registrada'}</span>
                  {e.detail ? <span className="pg-timeline__detail">{e.detail}</span> : null}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      ) : null}
    </Drawer>
  )
}

function RelatedBlocks({ p, related, choices, onOpen }: { p: Pagante; related: Related; choices: ChoiceSet; onOpen: (p: Pagante) => void }) {
  if (related == null) {
    return <Section title="Rateio da OP"><div className="pg-ficha__loading" role="status" aria-label="Carregando rateio"><Skeleton height={18} /><Skeleton height={18} /><Skeleton height={18} /></div></Section>
  }
  if ('error' in related) return <Alert tone="danger" title="Não foi possível carregar o rateio da OP">{related.error}</Alert>
  const soma = related.rateio.reduce((sum, x) => sum + (x.valor ?? 0), 0)
  const pagos = related.rateio.filter(isPaid).reduce((sum, x) => sum + (x.valor ?? 0), 0)
  return (
    <>
      <Section title="Rateio da OP" aside={<span className="pg-muted pg-num">{related.rateio.length} parcelas · {formatMoney(soma)} · recebido {formatMoney(pagos)}</span>}>
        <ul className="pg-related">
          {related.rateio.map((x) => (
            <li key={x.id}>
              {x.id === p.id ? (
                <span className="pg-related__row is-current"><span>{x.pessoa} <span className="pg-muted">(este)</span></span><span className="pg-num">{formatMoney(x.valor)}</span><StatusBadge tone={statusTone(x.status)}>{label(choices.status, x.status)}</StatusBadge></span>
              ) : (
                <button type="button" className="pg-related__row" onClick={() => onOpen(x)}><span>{x.pessoa || x.codigo}</span><span className="pg-num">{formatMoney(x.valor)}</span><StatusBadge tone={statusTone(x.status)}>{label(choices.status, x.status)}</StatusBadge></button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Serviços da OP" aside={<span className="pg-muted">{related.servicos.length} serviço(s)</span>}>
        {related.servicos.length ? (
          <ul className="pg-related">
            {related.servicos.map((s) => (
              <li key={s.id} className="pg-related__row pg-related__row--static">
                <span className="pg-num">{formatDate(s.data)}</span>
                <span>{s.destino || 'Sem destino'}{s.codigo ? <span className="pg-muted"> · nº {s.codigo}</span> : null}</span>
                <span className="pg-muted">{s.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="pg-muted">Nenhum serviço ligado a esta OP.</p>}
      </Section>
    </>
  )
}
