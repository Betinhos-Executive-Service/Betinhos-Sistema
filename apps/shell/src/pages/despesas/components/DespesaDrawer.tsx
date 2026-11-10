import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, Drawer, Skeleton } from '@betinhos/ui'
import { ExternalLink, MapPin } from 'lucide-react'
import { formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import type { Source } from '../data/source'
import { LINKED } from '../data/queries'
import type { Anexo, Despesa, DespesaChoices } from '../domain/types'
import { decidivel, type Decisao } from '../domain/decisao'
import { AnaliseIA } from './AnaliseIA'
import { DecisaoBloco, type EstadoDecisao } from './DecisaoBloco'
import { Item } from './Ficha'
import { ComprovantesGaleria } from './Comprovantes'
import { Alertas, FinanceiroBadge, OperacionalBadge, titulo } from './DespesasList'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'

type Props = {
  despesa: Despesa | null
  onClose: () => void
  choices: DespesaChoices
  source: Source
  version: number
  /** Grava a decisão e avisa o resultado; true = gravou (a ficha pode já ter avançado para outra despesa). */
  onDecidir: (d: Despesa, tipo: Decisao, motivo: string) => Promise<boolean>
}
type Anexos = Anexo[] | { error: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

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

export function DespesaDrawer({ despesa: d, onClose, choices, source, version, onDecidir }: Props) {
  const anexos = useAnexos(source, d?.id ?? null, version)
  const [estadoBloco, setDecisao] = useState<EstadoDecisao>('livre')
  const [descartando, setDescartando] = useState(false)
  const podeDecidir = d != null && decidivel(d)
  // O bloco some sem avisar ao desmontar: sem ele, o último estado dele não vale.
  const decisao = podeDecidir ? estadoBloco : 'livre'

  // X, Esc e clique fora passam por aqui: gravando não fecha; motivo digitado pede confirmação.
  function pedirFechar() {
    if (decisao === 'enviando') return
    if (decisao === 'sujo') { setDescartando(true); return }
    onClose()
  }

  const url = (entity: string, id: string) => (id ? source.recordUrl(entity, id) : null)
  const mapa = d && d.latitude != null && d.longitude != null ? `https://www.google.com/maps?q=${d.latitude},${d.longitude}` : null

  return (
    <>
    <Drawer actions={<BotaoAuditoria entity="cr40f_despesaoperacional" ids={[d?.id]} name={d ? titulo(d) : undefined} />} open={d != null} onClose={pedirFechar} size="wide" eyebrow="Despesa operacional" title={d ? titulo(d) : ''}>
      {d ? (
        <div className="pg-ficha dp-troca" key={d.id}>
          <div className="pg-ficha__hero">
            <span className="pg-badges"><OperacionalBadge d={d} choices={choices} /><FinanceiroBadge d={d} choices={choices} /><Alertas d={d} /></span>
            <strong className="pg-ficha__value pg-num">{formatMoney(d.valor)}</strong>
            <span className="pg-muted">{[formatDateTime(d.data), d.motorista || 'Sem motorista'].join(' · ')}</span>
          </div>

          {podeDecidir ? <DecisaoBloco d={d} onDecidir={onDecidir} onEstado={setDecisao} /> : null}

          {d.possivelDuplicidade ? <Alert tone="warning" title="Possível duplicidade">O App Motoristas marcou esta despesa como parecida com outra já lançada. Confira antes de pagar.</Alert> : null}

          <AnaliseIA ia={d.ia} valor={d.valor} />

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

          {d.observacao || d.observacaoInterna || (!podeDecidir && (d.motivoDevolucao || d.justificativaMotorista)) ? (
            <Section title="Observações">
              <dl className="pg-ficha__grid dp-ficha__full">
                {!podeDecidir && d.motivoDevolucao ? <Item label="Motivo da devolução ou cancelamento"><span className="dp-texto">{d.motivoDevolucao}</span></Item> : null}
                {!podeDecidir && d.justificativaMotorista ? <Item label="Justificativa do motorista"><span className="dp-texto">{d.justificativaMotorista}</span></Item> : null}
                {d.observacao ? <Item label="Do motorista"><span className="dp-texto">{d.observacao}</span></Item> : null}
                {d.observacaoInterna ? <Item label="Interna"><span className="dp-texto">{d.observacaoInterna}</span></Item> : null}
              </dl>
            </Section>
          ) : null}

          <Comprovantes anexos={anexos} choices={choices} statusAnexo={label(choices.anexo, d.statusAnexo, 'Sem status')} source={source} />

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
    <Dialog open={descartando} onClose={() => setDescartando(false)} title="Descartar alterações?"
      actions={<>
        <Button variant="secondary" onClick={() => setDescartando(false)}>Continuar editando</Button>
        <Button variant="danger" onClick={() => { setDescartando(false); onClose() }}>Descartar</Button>
      </>}>
      O motivo digitado ainda não foi enviado.
    </Dialog>
    </>
  )
}

function Comprovantes({ anexos, choices, statusAnexo, source }: { anexos: Anexos; choices: DespesaChoices; statusAnexo: string; source: Source }) {
  if (anexos == null) {
    return <Section title="Comprovantes"><div className="pg-ficha__loading" role="status" aria-label="Carregando comprovantes"><Skeleton height={18} /><Skeleton height={18} /></div></Section>
  }
  if ('error' in anexos) return <Alert tone="danger" title="Não foi possível carregar os comprovantes">{anexos.error}</Alert>
  return (
    <Section title="Comprovantes" aside={<span className="pg-muted">{statusAnexo}</span>}>
      {anexos.length ? <ComprovantesGaleria anexos={anexos} choices={choices} ler={source.arquivo} /> : <p className="pg-muted">Nenhum comprovante enviado.</p>}
    </Section>
  )
}
