import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Drawer, Skeleton, StatusBadge } from '@betinhos/ui'
import { ExternalLink, FileText, MapPin } from 'lucide-react'
import { formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import type { Source } from '../data/source'
import { LINKED } from '../data/queries'
import { arquivoTone } from '../domain/status'
import type { Anexo, Despesa, DespesaChoices } from '../domain/types'
import { Alertas, FinanceiroBadge, OperacionalBadge, titulo } from './DespesasList'

type Props = { despesa: Despesa | null; onClose: () => void; choices: DespesaChoices; source: Source; version: number }
type Anexos = Anexo[] | { error: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

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

/** Nome do vínculo com link para a ficha no model-driven, quando houver. */
function Vinculo({ nome, url }: { nome: string; url: string | null }) {
  if (!nome) return null
  if (!url) return <>{nome}</>
  return <a className="dp-link" href={url} target="_blank" rel="noopener noreferrer">{nome}<ExternalLink size={14} aria-label="abre em nova aba" /></a>
}

/** Comprovantes buscados quando a ficha abre. */
function useAnexos(source: Source, id: string | null, version: number) {
  const [data, setData] = useState<Anexos>(null)
  useEffect(() => {
    if (!id) { setData(null); return }
    let cancelled = false
    setData(null)
    source.anexos(id).then((list) => { if (!cancelled) setData(list) }).catch((reason) => { if (!cancelled) setData({ error: message(reason) }) })
    return () => { cancelled = true }
  }, [source, id, version])
  return data
}

export function DespesaDrawer({ despesa: d, onClose, choices, source, version }: Props) {
  const anexos = useAnexos(source, d?.id ?? null, version)
  const url = (entity: string, id: string) => (id ? source.recordUrl(entity, id) : null)
  const mapa = d && d.latitude != null && d.longitude != null ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}` : null

  return (
    <Drawer open={d != null} onClose={onClose} size="wide" eyebrow="Despesa operacional" title={d ? titulo(d) : ''}>
      {d ? (
        <div className="pg-ficha">
          <div className="pg-ficha__hero">
            <span className="pg-badges"><OperacionalBadge d={d} choices={choices} /><FinanceiroBadge d={d} choices={choices} /><Alertas d={d} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(d.valor)}</strong>
            <span className="pg-muted">{[formatDateTime(d.data), d.motorista || 'Sem motorista'].join(' · ')}</span>
          </div>

          {d.possivelDuplicidade ? <Alert tone="warning" title="Possível duplicidade">O App Motoristas marcou esta despesa como parecida com outra já lançada. Confira antes de pagar.</Alert> : null}

          <Section title="Gasto">
            <dl className="pg-ficha__grid">
              <Item label="Descrição">{d.nome}</Item>
              <Item label="Estabelecimento">{d.estabelecimento}</Item>
              <Item label="Categoria">{d.categoria}</Item>
              <Item label="Forma de pagamento">{d.forma}</Item>
              <Item label="Data do gasto">{formatDateTime(d.data)}</Item>
              <Item label="Cidade">{d.cidade}</Item>
              <Item label="Km informado">{d.km != null ? <span className="pg-num">{numero.format(d.km)}</span> : ''}</Item>
              <Item label="Litros">{d.litros != null ? <span className="pg-num">{numero.format(d.litros)}</span> : ''}</Item>
            </dl>
          </Section>

          <Section title="Vínculos">
            <dl className="pg-ficha__grid">
              <Item label="Motorista"><Vinculo nome={d.motorista} url={url(LINKED.motorista, d.motoristaId)} /></Item>
              <Item label="Veículo"><Vinculo nome={d.veiculo} url={url(LINKED.veiculo, d.veiculoId)} /></Item>
              <Item label="Reserva"><Vinculo nome={d.reserva} url={url(LINKED.reserva, d.reservaId)} /></Item>
              <Item label="Manutenção"><Vinculo nome={d.manutencao} url={url(LINKED.manutencao, d.manutencaoId)} /></Item>
            </dl>
          </Section>

          {d.observacao || d.observacaoInterna ? (
            <Section title="Observações">
              <dl className="pg-ficha__grid dp-ficha__full">
                {d.observacao ? <Item label="Do motorista"><span className="dp-texto">{d.observacao}</span></Item> : null}
                {d.observacaoInterna ? <Item label="Interna"><span className="dp-texto">{d.observacaoInterna}</span></Item> : null}
              </dl>
            </Section>
          ) : null}

          <Comprovantes anexos={anexos} choices={choices} statusAnexo={label(choices.anexo, d.statusAnexo, 'Sem status')} />

          <Section title="Origem e registro">
            <dl className="pg-ficha__grid">
              <Item label="Origem">{label(choices.origem, d.origem, '')}</Item>
              <Item label="Protocolo"><span className="pg-num">{d.protocolo}</span></Item>
              <Item label="Criada em">{d.criadoEm ? `${formatDateTime(d.criadoEm)}${d.criadoPor ? ` · ${d.criadoPor}` : ''}` : ''}</Item>
              <Item label="Alterada em">{d.alteradoEm ? `${formatDateTime(d.alteradoEm)}${d.alteradoPor ? ` · ${d.alteradoPor}` : ''}` : ''}</Item>
              <Item label="Local do lançamento">{mapa ? <a className="dp-link" href={mapa} target="_blank" rel="noopener noreferrer"><MapPin size={14} aria-hidden="true" />Ver no mapa</a> : ''}</Item>
            </dl>
          </Section>
        </div>
      ) : null}
    </Drawer>
  )
}

function Comprovantes({ anexos, choices, statusAnexo }: { anexos: Anexos; choices: DespesaChoices; statusAnexo: string }) {
  if (anexos == null) {
    return <Section title="Comprovantes"><div className="pg-ficha__loading" role="status" aria-label="Carregando comprovantes"><Skeleton height={18} /><Skeleton height={18} /></div></Section>
  }
  if ('error' in anexos) return <Alert tone="danger" title="Não foi possível carregar os comprovantes">{anexos.error}</Alert>
  return (
    <Section title="Comprovantes" aside={<span className="pg-muted">{statusAnexo}</span>}>
      {anexos.length ? (
        <ul className="pg-related">
          {anexos.map((a) => (
            <li key={a.id} className="pg-related__row dp-anexo">
              <span className="dp-anexo__name">
                <FileText size={16} aria-hidden="true" />
                <span><strong>{a.nome}</strong><span className="pg-muted">{[label(choices.anexoTipo, a.tipo, ''), a.enviadoEm ? formatDateTime(a.enviadoEm) : ''].filter(Boolean).join(' · ')}</span></span>
              </span>
              <StatusBadge tone={arquivoTone(a.status)}>{label(choices.anexoStatus, a.status, 'Sem status')}</StatusBadge>
              {a.url ? <a className="dp-link" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome}`}>Abrir<ExternalLink size={14} aria-hidden="true" /></a> : <span className="pg-muted">Sem link</span>}
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">Nenhum comprovante enviado.</p>}
    </Section>
  )
}
