import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, StatusBadge } from '@betinhos/ui'
import { Lock, Split, XCircle } from 'lucide-react'
import { QuickActions } from '../../pagantes/components/QuickActions'
import { formatDate, formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { label, statusTone } from '../../pagantes/domain/status'
import type { ChoiceSet, Contato, Pagante, ServicoOp } from '../../pagantes/domain/types'
import type { Source } from '../data/source'
import { ETAPAS, OP_STATUS, cancelBlock, proximoPasso, resumoRateio, servicosDivergem, type ProximoPasso, type Resumo } from '../domain/status'
import { buildTimeline } from '../domain/timeline'
import { valorOp, type Op, type OpChoices } from '../domain/types'
import { OpBadge, periodo } from './OpsList'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { BrandLoader } from '../../../app/BrandLoader'

type Related = { valor: number | null; rateio: Pagante[]; servicos: ServicoOp[]; contatos: Map<string, Contato>; pagChoices: ChoiceSet } | { error: string } | null
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

/** Bloco recolhível: o título resume o conteúdo, então fechado ainda informa. */
function Section({ title, children, aside, open = false }: { title: string; children: ReactNode; aside?: ReactNode; open?: boolean }) {
  return (
    <details className="op-secao" open={open}>
      <summary className="op-secao__head"><h3>{title}</h3>{aside}</summary>
      <div className="op-secao__body">{children}</div>
    </details>
  )
}

/** Rateio, serviços, contatos dos pagantes e o valor da OP (relido: a lista pode tê-lo lido no meio da soma), buscados quando a ficha abre. Contato só enriquece o WhatsApp. */
function useRelated(source: Source, opId: string | null, version: number) {
  const [data, setData] = useState<Related>(null)
  useEffect(() => {
    if (!opId) { setData(null); return }
    let cancelled = false
    setData(null)
    Promise.all([source.pagantes.rateio(opId), source.pagantes.servicos(opId), source.pagantes.choices()])
      .then(async ([rateio, servicos, pagChoices]) => {
        // Valor depois dos serviços: o que se compara nunca é mais antigo que a lista de serviços.
        const [valor, contatos] = await Promise.all([
          source.valor(opId),
          source.pagantes.contatos(rateio.map((p) => p.pessoaId)).catch(() => new Map<string, Contato>()),
        ])
        if (!cancelled) setData({ valor, rateio, servicos, contatos, pagChoices })
      })
      .catch((reason) => { if (!cancelled) setData({ error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, opId, version])
  return data
}

const lines = (texto: string) => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

export function OpDrawer({ op: opDaLista, onClose, choices, source, version, busy, onCancel, onGerarPagantes }: Props) {
  const related = useRelated(source, opDaLista?.id ?? null, version)
  const loaded = related && !('error' in related) ? related : null
  const op = opDaLista && loaded ? { ...opDaLista, valor: loaded.valor } : opDaLista
  const rateio = loaded?.rateio ?? null
  const bloqueio = op ? (related && 'error' in related ? 'O rateio não carregou; atualize antes de cancelar.' : cancelBlock(op, rateio)) : null
  const cancelada = op?.status === OP_STATUS.cancelada
  const resumo = op && loaded ? resumoRateio(op, loaded.rateio, loaded.servicos) : null
  const passo = op && resumo && !cancelada ? proximoPasso(op, resumo) : null
  const rotuloRateio = rateio?.length ? 'Refazer rateio' : 'Gerar pagantes'
  const gerar = () => op && onGerarPagantes(op)

  // A ação do passo fica na caixa do passo; o rodapé guarda o rateio só quando o passo não o pede.
  const footer = op ? (
    <>
      {!cancelada ? <Button variant="ghost" icon={<XCircle size={16} />} disabled={Boolean(bloqueio) || busy} title={bloqueio ?? undefined} onClick={() => onCancel(op)}>Cancelar OP</Button> : null}
      {!cancelada && passo && !passo.acao ? <Button variant="secondary" icon={<Split size={16} />} disabled={busy} onClick={gerar}>{rotuloRateio}</Button> : null}
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

          {cancelada ? <Alert tone="info" title="OP cancelada">Os serviços continuam ligados a ela. Para faturar de novo, gere outra OP a partir das reservas.</Alert> : null}
          {related == null ? <BrandLoader variant="inline" size="sm" label="Carregando a OP" text="Carregando a OP…" /> : null}
          {related && 'error' in related ? <Alert tone="danger" title="Não foi possível carregar o rateio e os serviços">{related.error}</Alert> : null}
          {passo ? <Passo passo={passo} busy={busy} onAcao={gerar} /> : null}

          {loaded && resumo ? <RelatedBlocks op={op} related={loaded} r={resumo} /> : null}

          <Section title="Resumo" aside={<span className="pg-muted">{[lines(op.passageiros)[0], label(choices.idioma, op.idioma, '')].filter(Boolean).join(' · ')}</span>}>
            <dl className="pg-ficha__grid">
              <Item label="Cliente">{op.cliente}</Item>
              <Item label="Idioma">{label(choices.idioma, op.idioma, '')}</Item>
              <Item label="Primeiro serviço">{formatDate(op.primeiroServico)}</Item>
              <Item label="Último serviço">{formatDate(op.ultimoServico)}</Item>
              <Item label="Passageiros">{op.passageiros ? <span className="op-lines">{lines(op.passageiros).map((l) => <span key={l}>{l}</span>)}</span> : ''}</Item>
              <Item label="Trajetos">{op.trajetos ? <span className="op-lines">{lines(op.trajetos).map((l) => <span key={l}>{l}</span>)}</span> : ''}</Item>
            </dl>
          </Section>

          <Section title="Linha do tempo" aside={op.criadoEm ? <span className="pg-muted">criada {formatDateTime(op.criadoEm)}</span> : null}>
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

          {bloqueio && !cancelada && rateio ? <p className="op-ficha__reason"><Lock size={14} aria-hidden="true" />Cancelamento indisponível: {bloqueio}</p> : null}
        </div>
      ) : null}
    </Drawer>
  )
}

/** Etapas da OP e a próxima ação, com o botão dela. */
function Passo({ passo, busy, onAcao }: { passo: ProximoPasso; busy: boolean; onAcao: () => void }) {
  const atual = ETAPAS.find(([k]) => !passo.feitas.includes(k))?.[0]
  return (
    <div className="op-passo-wrap">
      <ol className="op-etapas" aria-label="Etapas da OP">
        {ETAPAS.map(([k, nome]) => (
          <li key={k} className={`op-etapas__item op-etapas__item--${passo.feitas.includes(k) ? 'feita' : k === atual ? 'atual' : 'futura'}`} aria-current={k === atual ? 'step' : undefined}>{nome}</li>
        ))}
      </ol>
      <div className={`op-passo op-passo--${passo.tone}`} role="status">
        <div className="op-passo__texto"><strong>{passo.titulo}</strong><span>{passo.detalhe}</span></div>
        {passo.acao ? <Button icon={<Split size={16} />} disabled={busy} onClick={onAcao}>{passo.acao === 'gerar' ? 'Gerar pagantes' : 'Refazer rateio'}</Button> : null}
      </div>
    </div>
  )
}

type Loaded = Exclude<Related, { error: string } | null>

function RelatedBlocks({ op, related, r }: { op: Op; related: Loaded; r: Resumo }) {
  const divergem = servicosDivergem(op, r)
  return (
    <>
      <Section open={r.parcelas > 0} title="Rateio" aside={<span className="pg-muted pg-num">{r.parcelas ? `${r.parcelas} ${r.parcelas === 1 ? 'parcela' : 'parcelas'} · recebido ${formatMoney(r.recebido)} de ${formatMoney(r.soma)}` : 'sem pagantes'}</span>}>
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
        ) : <p className="pg-muted">Nenhum pagante gerado.</p>}
      </Section>
      <Section open={divergem || r.parcelas === 0} title="Serviços" aside={<span className={`pg-muted pg-num${divergem ? ' op-secao__alerta' : ''}`}>{related.servicos.length === 1 ? '1 serviço' : `${related.servicos.length} serviços`}{r.servicos != null ? ` · ${formatMoney(r.servicos)}` : ''}{divergem ? ' · diferente da OP' : ''}</span>}>
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
