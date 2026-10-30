import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, Skeleton, StatusBadge } from '@betinhos/ui'
import { Lock, Split, XCircle } from 'lucide-react'
import { QuickActions } from '../../pagantes/components/QuickActions'
import { formatDate, formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { label, statusTone } from '../../pagantes/domain/status'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../../pagantes/domain/types'
import type { Source } from '../data/source'
import { OP_STATUS, cancelBlock, resumoRateio } from '../domain/status'
import { buildTimeline } from '../domain/timeline'
import { valorOp, type Op, type OpChoices } from '../domain/types'
import { OpBadge, periodo } from './OpsList'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'

type Related = { rateio: Pagante[]; servicos: ServicoOp[]; contatos: Map<string, Contato>; pagChoices: ChoiceSet } | { error: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

type Props = {
  op: Op | null
  onClose: () => void
  choices: OpChoices
  source: Source
  /** Muda a cada recarga, para a ficha buscar rateio e serviços de novo. */
  version: number
  busy: boolean
  onCancel: (op: Op) => void
  onGerarPagantes: (op: Op) => void
}

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

/** Rateio, serviços e contatos dos pagantes, buscados quando a ficha abre. Contato só enriquece o WhatsApp. */
function useRelated(source: Source, opId: string | null, version: number) {
  const [data, setData] = useState<Related>(null)
  useEffect(() => {
    if (!opId) { setData(null); return }
    let cancelled = false
    setData(null)
    Promise.all([source.pagantes.rateio(opId), source.pagantes.servicos(opId), source.pagantes.choices()])
      .then(async ([rateio, servicos, pagChoices]) => {
        const contatos = await source.pagantes.contatos(rateio.map((p) => p.pessoaId)).catch(() => new Map<string, Contato>())
        if (!cancelled) setData({ rateio, servicos, contatos, pagChoices })
      })
      .catch((reason) => { if (!cancelled) setData({ error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, opId, version])
  return data
}

const lines = (texto: string) => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

export function OpDrawer({ op, onClose, choices, source, version, busy, onCancel, onGerarPagantes }: Props) {
  const related = useRelated(source, op?.id ?? null, version)
  const rateio = related && !('error' in related) ? related.rateio : null
  const bloqueio = op ? (related && 'error' in related ? 'O rateio não carregou; atualize antes de cancelar.' : cancelBlock(op, rateio)) : null
  const cancelada = op?.status === OP_STATUS.cancelada

  const footer = op ? (
    <>
      {!cancelada ? <Button variant="secondary" icon={<XCircle size={16} />} disabled={Boolean(bloqueio) || busy} title={bloqueio ?? undefined} onClick={() => onCancel(op)}>Cancelar OP</Button> : null}
      <Button icon={<Split size={16} />} disabled={cancelada || busy} onClick={() => onGerarPagantes(op)}>{rateio?.length ? 'Refazer rateio' : 'Gerar pagantes'}</Button>
    </>
  ) : undefined

  return (
    <Drawer actions={<BotaoAuditoria entity="cr40f_financeiro" ids={[op?.id]} name={op?.codigo} />} open={op != null} onClose={onClose} size="wide" eyebrow="Ordem de pagamento" title={op?.codigo || 'OP sem código'} footer={footer}>
      {op ? (
        <div className="pg-ficha">
          <div className="pg-ficha__hero">
            <span className="pg-badges"><OpBadge op={op} choices={choices} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(valorOp(op))}</strong>
            <span className="pg-muted">{[op.valor == null && op.valorServicos != null ? 'Soma dos serviços' : '', op.cliente || 'Sem cliente', periodo(op)].filter(Boolean).join(' · ')}</span>
          </div>

          {bloqueio && !cancelada && rateio ? <p className="op-ficha__reason"><Lock size={14} aria-hidden="true" />Cancelamento indisponível: {bloqueio}</p> : null}
          {cancelada ? <Alert tone="info" title="OP cancelada">Os serviços continuam ligados a ela. Para faturar de novo, gere outra OP a partir das reservas.</Alert> : null}

          <Section title="Resumo">
            <dl className="pg-ficha__grid">
              <Item label="Cliente">{op.cliente}</Item>
              <Item label="Idioma">{label(choices.idioma, op.idioma, '')}</Item>
              <Item label="Primeiro serviço">{formatDate(op.primeiroServico)}</Item>
              <Item label="Último serviço">{formatDate(op.ultimoServico)}</Item>
              <Item label="Passageiros">{op.passageiros ? <span className="op-lines">{lines(op.passageiros).map((l) => <span key={l}>{l}</span>)}</span> : ''}</Item>
              <Item label="Trajetos">{op.trajetos ? <span className="op-lines">{lines(op.trajetos).map((l) => <span key={l}>{l}</span>)}</span> : ''}</Item>
            </dl>
          </Section>

          <RelatedBlocks op={op} related={related} choices={choices} />

          <Section title="Linha do tempo">
            <ol className="pg-timeline">
              {buildTimeline(op, choices, rateio).map((e) => (
                <li key={e.key} className={`pg-timeline__item pg-timeline__item--${e.tone}`}>
                  <span className="pg-timeline__dot" aria-hidden="true" />
                  <span className="pg-timeline__title">{e.title}</span>
                  <span className="pg-timeline__at">{e.at ? (e.dateOnly ? formatDate(e.at) : formatDateTime(e.at)) : 'Sem data registrada'}</span>
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

function RelatedBlocks({ op, related, choices }: { op: Op; related: Related; choices: OpChoices }) {
  if (related == null) {
    return <Section title="Rateio"><div className="pg-ficha__loading" role="status" aria-label="Carregando rateio"><Skeleton height={18} /><Skeleton height={18} /><Skeleton height={18} /></div></Section>
  }
  if ('error' in related) return <Alert tone="danger" title="Não foi possível carregar o rateio e os serviços">{related.error}</Alert>
  const r = resumoRateio(op, related.rateio, related.servicos)
  const servicosDivergem = op.valor != null && r.servicos != null && Math.round((op.valor - r.servicos) * 100) !== 0
  return (
    <>
      <Section title="Rateio" aside={<span className="pg-muted pg-num">{r.parcelas} {r.parcelas === 1 ? 'parcela ativa' : 'parcelas ativas'} · {formatMoney(r.soma)} · recebido {formatMoney(r.recebido)}</span>}>
        {r.diferenca !== 0 ? (
          <Alert tone="warning" title={r.diferenca > 0 ? 'Rateio acima do valor da OP' : 'Rateio abaixo do valor da OP'}>
            As parcelas ativas somam {formatMoney(r.soma)} e a OP vale {formatMoney(r.referencia)}. Refaça o rateio no Gerar Pagantes.
          </Alert>
        ) : null}
        {related.rateio.length ? (
          <ul className="pg-related">
            {related.rateio.map((p) => (
              <li key={p.id} className="op-rateio__row">
                <span className="op-rateio__name"><strong>{p.pessoa || 'Pagante sem pessoa'}</strong><span className="pg-muted">{[p.codigo, label(related.pagChoices.forma, p.forma, '')].filter(Boolean).join(' · ')}</span></span>
                <span className="pg-num">{formatMoney(p.valor)}</span>
                <StatusBadge tone={statusTone(p.status)}>{label(related.pagChoices.status, p.status, 'Sem status')}</StatusBadge>
                <QuickActions p={p} contato={related.contatos.get(p.pessoaId)} />
              </li>
            ))}
          </ul>
        ) : <p className="pg-muted">Nenhum pagante gerado. Use “Gerar pagantes” para dividir a cobrança.</p>}
      </Section>
      <Section title="Serviços" aside={<span className="pg-muted pg-num">{related.servicos.length === 1 ? '1 serviço' : `${related.servicos.length} serviços`}{r.servicos != null ? ` · ${formatMoney(r.servicos)}` : ''}</span>}>
        {servicosDivergem ? (
          <Alert tone="warning" title="Valor da OP diferente dos serviços">A composição de preços dos serviços soma {formatMoney(r.servicos)} e a OP vale {formatMoney(op.valor)}. Confira a composição antes de cobrar.</Alert>
        ) : null}
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
