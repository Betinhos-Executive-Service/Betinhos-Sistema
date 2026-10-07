import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, Skeleton, StatusBadge } from '@betinhos/ui'
import { CheckCircle2, ExternalLink, FileText, Lock, Split, XCircle } from 'lucide-react'
import type { Source } from '../data/source'
import { totalOp } from '../data/queries'
import { formatDate, formatDateTime, formatMoney, safeUrl } from '../domain/messages'
import { ETAPA, GERACAO_RECIBO, STATUS, canCancel, canGerarRecibo, canMarkPaid, isPaid, label, reciboEnviado, statusTone } from '../domain/status'
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
  /** Pagante com mudança de status ou recibo em andamento: ações ficam bloqueadas. */
  busyId: string | null
  /** Muda a cada recarga, para a ficha buscar o rateio de novo. */
  version: number
}

type Related = { rateio: Pagante[]; servicos: ServicoOp[] } | { error: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

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

function ExternalAnchor({ href, children }: { href: string; children: ReactNode }) {
  const url = safeUrl(href)
  if (!url) return null
  return <a href={url} target="_blank" rel="noopener noreferrer">{children} <ExternalLink size={12} aria-hidden="true" /></a>
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
      .catch((reason) => { if (!cancelled) setData({ error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, opId, version])
  return data
}

/** Contato da lista; se a ficha veio do rateio (pessoa fora do período), busca só ele. */
function useContato(source: Source, pessoaId: string, contatos: Map<string, Contato>) {
  const known = pessoaId ? contatos.get(pessoaId) : undefined
  const [own, setOwn] = useState<{ id: string; contato: Contato | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!pessoaId || known) return
    let cancelled = false
    setOwn(null)
    source.contatos([pessoaId])
      .then((map) => { if (!cancelled) setOwn({ id: pessoaId, contato: map.get(pessoaId) ?? null, error: null }) })
      .catch((reason) => { if (!cancelled) setOwn({ id: pessoaId, contato: null, error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, pessoaId, known])
  if (known) return { contato: known, loading: false, error: null }
  if (!pessoaId) return { contato: undefined, loading: false, error: null }
  if (!own || own.id !== pessoaId) return { contato: undefined, loading: true, error: null }
  return { contato: own.contato ?? undefined, loading: false, error: own.error }
}

export function PaganteDrawer({ p, onClose, onOpen, choices, contatos, source, onStatus, onRecibo, onAbrirOp, busyId, version }: Props) {
  const related = useRelated(source, p?.opId || null, version)
  const { contato, loading: contatoLoading, error: contatoError } = useContato(source, p?.pessoaId ?? '', contatos)
  const locked = p ? isPaid(p) : false
  const busy = p != null && busyId === p.id

  const footer = p ? (
    locked ? (
      <p className="pg-ficha__locked"><Lock size={14} aria-hidden="true" />Pagamento confirmado: o status não pode mais ser alterado.</p>
    ) : (
      <>
        {canCancel(p) ? <Button variant="secondary" icon={<XCircle size={16} />} disabled={busy} onClick={() => onStatus(p, 'cancelado')}>Cancelar pagante</Button> : null}
        {canMarkPaid(p) ? <Button icon={<CheckCircle2 size={16} />} loading={busy} onClick={() => onStatus(p, 'pago')}>Marcar como pago</Button> : null}
      </>
    )
  ) : undefined

  return (
    <Drawer open={p != null} onClose={onClose} size="wide" eyebrow={p?.pessoa ? p.codigo : 'Pagante'} title={p?.pessoa || p?.codigo || 'Pagante'} footer={footer}>
      {p ? (
        <div className="pg-ficha">
          <div className="pg-ficha__hero">
            <span className="pg-badges"><PagamentoBadge p={p} choices={choices} /><ReciboBadge p={p} choices={choices} /><FalhaBadge p={p} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(p.valor)}</strong>
            <span className="pg-muted">{[label(choices.forma, p.forma, ''), p.op].filter(Boolean).join(' · ') || 'Sem forma de pagamento'}</span>
          </div>

          {p.link.status === ETAPA.erro ? <Alert tone="danger" title="Falha ao gerar o link de pagamento">{p.link.erro || 'Sem detalhe do erro.'} Refaça o rateio no Gerar Pagantes.</Alert> : null}
          {p.email.status === ETAPA.erro ? <Alert tone="warning" title="Falha ao enviar o e-mail de cobrança">{p.email.erro || 'Sem detalhe do erro.'} Envie o link pelo WhatsApp ou refaça o envio no Gerar Pagantes.</Alert> : null}
          {p.reciboGeracao.status === GERACAO_RECIBO.erro ? <Alert tone="danger" title="Falha ao gerar o recibo">{p.reciboGeracao.erro || 'Sem detalhe do erro.'} Gere o recibo de novo pelo botão abaixo.</Alert> : null}
          {!p.pessoaId ? <Alert tone="warning" title="Pagante sem pessoa vinculada">Sem pessoa não há contato para cobrar nem destinatário para o recibo automático.</Alert> : null}

          <div className="pg-ficha__actions">
            <QuickActions p={p} contato={contato} size="default" labels />
            {canGerarRecibo(p) ? (
              <Button variant="secondary" icon={<FileText size={16} />} loading={busy} onClick={() => onRecibo(p)}>{reciboEnviado(p) || p.linkRecibo ? 'Reenviar recibo' : 'Gerar recibo'}</Button>
            ) : null}
            {p.opId ? <Button variant="secondary" icon={<Split size={16} />} disabled={busy} onClick={() => onAbrirOp(p)}>Abrir OP no Gerar Pagantes</Button> : null}
          </div>

          <Section title="Pagamento">
            <dl className="pg-ficha__grid">
              <Item label="Ordem de pagamento">{p.op || (p.opId ? '' : 'Sem OP vinculada')}</Item>
              <Item label="Forma">{label(choices.forma, p.forma)}</Item>
              <Item label="Criado em">{formatDateTime(p.criadoEm)}</Item>
              <Item label="Último lembrete">{formatDateTime(p.ultimoLembrete)}</Item>
              <Item label="Link de pagamento"><ExternalAnchor href={p.linkPagamento}>Abrir link</ExternalAnchor></Item>
              <Item label="Recibo">{safeUrl(p.linkRecibo) ? <ExternalAnchor href={p.linkRecibo}>Abrir recibo</ExternalAnchor> : label(choices.recibo, p.recibo, '')}</Item>
            </dl>
          </Section>

          <Section title="Contato">
            {contato ? (
              <dl className="pg-ficha__grid">
                <Item label="Nome">{contato.nome}</Item>
                <Item label="Cliente">{contato.cliente || 'Sem cliente vinculado'}</Item>
                <Item label="Celular">{contato.telefone}</Item>
                <Item label="E-mail">{contato.email ? <a href={`mailto:${encodeURIComponent(contato.email)}`}>{contato.email}</a> : ''}</Item>
              </dl>
            ) : contatoLoading ? (
              <div className="pg-ficha__loading" role="status" aria-label="Carregando contato"><Skeleton height={18} /><Skeleton height={18} /></div>
            ) : (
              <p className="pg-muted">{!p.pessoaId ? 'Pagante sem pessoa vinculada.' : contatoError ? `Não foi possível carregar o contato. ${contatoError}` : 'Pessoa não encontrada ou inativa.'}</p>
            )}
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
  // A própria parcela vem da lista (mais nova que a consulta, se o status acabou de mudar).
  const rateio = related.rateio.some((x) => x.id === p.id) ? related.rateio.map((x) => (x.id === p.id ? p : x)) : [p, ...related.rateio]
  const ativos = rateio.filter((x) => x.status !== STATUS.cancelado)
  const soma = ativos.reduce((sum, x) => sum + (x.valor ?? 0), 0)
  const pagos = ativos.filter(isPaid).reduce((sum, x) => sum + (x.valor ?? 0), 0)
  const total = totalOp(related.servicos)
  const diferenca = total == null ? 0 : Math.round((soma - total) * 100) / 100
  return (
    <>
      <Section title="Rateio da OP" aside={<span className="pg-muted pg-num">{ativos.length} {ativos.length === 1 ? 'parcela ativa' : 'parcelas ativas'} · {formatMoney(soma)}{total != null ? ` de ${formatMoney(total)}` : ''} · recebido {formatMoney(pagos)}</span>}>
        {diferenca !== 0 ? (
          <Alert tone="warning" title={diferenca > 0 ? 'Rateio acima do total da OP' : 'Rateio abaixo do total da OP'}>
            As parcelas ativas somam {formatMoney(soma)} e os serviços da OP, {formatMoney(total)}. Confira o rateio no Gerar Pagantes.
          </Alert>
        ) : null}
        <ul className="pg-related">
          {rateio.map((x) => {
            const cells = <><span>{x.pessoa || x.codigo}{x.id === p.id ? <span className="pg-muted"> (este)</span> : null}</span><span className="pg-num">{formatMoney(x.valor)}</span><StatusBadge tone={statusTone(x.status)}>{label(choices.status, x.status)}</StatusBadge></>
            return (
              <li key={x.id}>
                {x.id === p.id
                  ? <span className="pg-related__row is-current" aria-current="true">{cells}</span>
                  : <button type="button" className="pg-related__row" onClick={() => onOpen(x)} aria-label={`Abrir ${x.pessoa || x.codigo}`}>{cells}</button>}
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title="Serviços da OP" aside={<span className="pg-muted">{related.servicos.length === 1 ? '1 serviço' : `${related.servicos.length} serviços`}</span>}>
        {related.servicos.length ? (
          <ul className="pg-related">
            {related.servicos.map((s) => (
              <li key={s.id} className="pg-related__row pg-related__row--static">
                <span className="pg-num">{formatDate(s.data)}</span>
                <span>{s.destino || 'Sem destino'}{s.codigo ? <span className="pg-muted"> · {s.codigo}</span> : null}</span>
                <span className="pg-muted">{s.valor != null ? <span className="pg-num">{formatMoney(s.valor)} · </span> : null}{s.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="pg-muted">Nenhum serviço ligado a esta OP.</p>}
      </Section>
    </>
  )
}
