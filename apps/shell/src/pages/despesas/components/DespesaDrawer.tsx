import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, Drawer } from '@betinhos/ui'
import { ExternalLink, MapPin } from 'lucide-react'
import { formatDateTime, formatMoney } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import type { Source } from '../data/source'
import { LINKED } from '../data/queries'
import { Canal, cartaoTexto, Situacao } from '../conciliacao/components/TransacoesLista'
import { ehPluggy } from '../conciliacao/domain/regras'
import type { Transacao } from '../conciliacao/domain/types'
import { fmtData } from '../../equipamentos/components/EquipamentosList'
import type { Anexo, Despesa, DespesaChoices } from '../domain/types'
import { decidivel, type Decisao } from '../domain/decisao'
import { AnaliseIA } from './AnaliseIA'
import { DecisaoBloco, type EstadoDecisao } from './DecisaoBloco'
import { Item } from './Ficha'
import { ComprovantesGaleria } from './Comprovantes'
import { Alertas, FinanceiroBadge, OperacionalBadge, titulo } from './DespesasList'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { BrandLoader } from '../../../app/BrandLoader'

type Props = {
  despesa: Despesa | null
  onClose: () => void
  choices: DespesaChoices
  source: Source
  version: number
  /** Compra do cartão ligada a esta despesa (conciliação); `onAbrirCompra` abre a compra para casar, ignorar ou reabrir. */
  compra?: Transacao | null
  onAbrirCompra?: (id: string) => void
  /** Grava a decisão e avisa o resultado; true = gravou (a ficha pode já ter avançado para outra despesa). */
  onDecidir: (d: Despesa, tipo: Decisao, motivo: string) => Promise<boolean>
}
type Anexos = Anexo[] | { error: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const precoLitro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })

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

export function DespesaDrawer({ despesa: d, onClose, choices, source, version, compra, onAbrirCompra, onDecidir }: Props) {
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
          {/* Para decidir, o comprovante vem logo abaixo da decisão, antes da análise detalhada. */}
          {podeDecidir ? <Comprovantes anexos={anexos} choices={choices} statusAnexo={label(choices.anexo, d.statusAnexo, 'Sem status')} source={source} /> : null}

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

          {compra ? (
            <Section title="Compra no cartão" aside={onAbrirCompra ? <Button variant="secondary" size="compact" onClick={() => onAbrirCompra(compra.id)}>Abrir compra</Button> : undefined}>
              <dl className="pg-ficha__grid">
                <Item label="Canal"><Canal t={compra} /></Item>
                <Item label="Situação"><Situacao t={compra} /></Item>
                <Item label="Estabelecimento">{compra.estabelecimento || compra.descricao}</Item>
                <Item label="Data da compra">{fmtData(compra.dataCompra)}</Item>
                <Item label="Valor"><span className="pg-num">{formatMoney(compra.valor)}</span></Item>
                <Item label="Cartão">{ehPluggy(compra) ? cartaoTexto(compra) : ''}</Item>
                {ehPluggy(compra) ? null : (
                  <>
                    <Item label="Placa">{compra.placa}</Item>
                    <Item label="Veículo">{compra.veiculoNome}</Item>
                    <Item label="Combustível">{compra.combustivel}</Item>
                    <Item label="Litros">{compra.litros != null ? <span className="pg-num">{numero.format(compra.litros)}</span> : ''}</Item>
                    <Item label="Preço por litro">{compra.precoLitro != null ? <span className="pg-num">{precoLitro.format(compra.precoLitro)}</span> : ''}</Item>
                    <Item label="Hodômetro">{compra.hodometro != null ? <span className="pg-num">{numero.format(compra.hodometro)}</span> : ''}</Item>
                    <Item label="KM rodado">{compra.kmRodado != null ? <span className="pg-num">{numero.format(compra.kmRodado)}</span> : ''}</Item>
                    <Item label="Desconto">{compra.desconto != null ? <span className="pg-num">{formatMoney(compra.desconto)}</span> : ''}</Item>
                    <Item label="Cidade do posto">{compra.cidadePosto}</Item>
                  </>
                )}
                {compra.motivo ? <Item label="Motivo"><span className="dp-texto">{compra.motivo}</span></Item> : null}
              </dl>
            </Section>
          ) : null}

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

          {podeDecidir ? null : <Comprovantes anexos={anexos} choices={choices} statusAnexo={label(choices.anexo, d.statusAnexo, 'Sem status')} source={source} />}

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
    return <Section title="Comprovantes"><BrandLoader variant="inline" size="sm" label="Carregando comprovantes" text="Carregando comprovantes…" /></Section>
  }
  if ('error' in anexos) return <Alert tone="danger" title="Não foi possível carregar os comprovantes">{anexos.error}</Alert>
  return (
    <Section title="Comprovantes" aside={<span className="pg-muted">{statusAnexo}</span>}>
      {anexos.length ? <ComprovantesGaleria anexos={anexos} choices={choices} ler={source.arquivo} /> : <p className="pg-muted">Nenhum comprovante enviado.</p>}
    </Section>
  )
}
