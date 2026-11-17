import { Download, ExternalLink } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, Drawer, EmptyState } from '@betinhos/ui'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { CANAL, GRAVIDADE, KIND_LABEL, KIND_TABLE, label, TIPO_COLISAO } from '../data/schema'
import type { ColunaArquivoMulta, DataSource, FlowResult } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { StatusPanel } from './StatusPanel'
import { MultaPassoAPasso } from './MultaPassoAPasso'
import { useNotify } from './Toasts'
import { StatusBadge } from './Ui'

/** Multa e colisão; a manutenção tem a gaveta própria (GavetaManutencao). */
export type KindRegistro = Exclude<Kind, 'manutencao'>

type Campo = [string, ReactNode]
type Detalhe = { titulo: string; status: number | null; veiculo: Ref | null; temMotorista: boolean; campos: Campo[] }

const texto = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? NAO_INFORMADO : String(value))
const dia = (iso: string | null) => formatBR(diaSP(iso)) || NAO_INFORMADO

/** Link que baixa o arquivo da multa; sem arquivo, o texto padrão (sem link). */
function arquivoLink(nome: string | null | undefined, href: () => string): ReactNode {
  if (!nome) return NAO_INFORMADO
  return <a className="frota-link" href={href()} download={nome}><Download size={14} aria-hidden="true" /> {nome}</a>
}

function detalhe(kind: KindRegistro, id: string, data: FrotaData, urlArquivo: (multaId: string, coluna: ColunaArquivoMulta) => string): Detalhe | null {
  if (kind === 'multa') {
    const item = data.multas.find((row) => row.id === id)
    const infracao = item?.infracaoId ? data.infracoes.find((row) => row.id === item.infracaoId) : undefined
    return !item ? null : { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: item.motorista !== null, campos: [
      ['Código', texto(item.codigo)], ['Motorista', texto(item.motorista?.label)], ['Data da infração', dia(item.dataHora)], ['Local', texto(item.local)],
      ['Infração', infracao ? `${infracao.codigo} · ${texto(infracao.descricao)}` : 'Sem código de infração'], ['Gravidade', infracao ? label(GRAVIDADE, infracao.gravidade) : NAO_INFORMADO],
      ['Valor', brl(item.valorGuia ?? infracao?.valor ?? null)], ['Pontos na CNH', texto(infracao?.pontos)],
      ['Prazo para indicar', formatBR(item.dataParaIndicar) || NAO_INFORMADO], ['Vencimento da guia', formatBR(item.vencimento ?? null) || NAO_INFORMADO],
      ['Valor com desconto', brl(item.valorComDesconto ?? null)], ['Canal da indicação', item.canal === CANAL.SENATRAN ? 'Senatran' : item.canal === CANAL.DSV ? 'DSV Digital' : item.canal === CANAL.PREFEITURA ? 'Prefeitura' : NAO_INFORMADO],
      ['Notificação de autuação', arquivoLink(item.arquivos?.autuacao, () => urlArquivo(id, 'cr40f_autodainfracao'))], ['PDF da penalidade', arquivoLink(item.arquivos?.penalidade, () => urlArquivo(id, 'cr40f_pdfpenalidade'))],
      ['Comprovante', arquivoLink(item.arquivos?.comprovante, () => urlArquivo(id, 'cr40f_comprovantepagamento'))],
    ] }
  }
  const item = data.colisoes.find((row) => row.id === id)
  return item ? { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: true, campos: [
    ['Motorista', texto(item.motorista?.label)], ['Data', dia(item.dataHora)], ['Local', texto(item.local)], ['Tipo', label(TIPO_COLISAO, item.tipo)],
    ['Houve terceiro', item.houveTerceiro ? 'Sim' : 'Não'], ['Descrição', texto(item.descricao)],
  ] } : null
}

export function RegistroDrawer({ source, kind, id, data, onClose, onChanged, onOpenVeiculo }: { source: DataSource; kind: KindRegistro; id: string; data: FrotaData; onClose: () => void; onChanged: () => void; onOpenVeiculo: (id: string) => void }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const notify = useNotify()
  const registro = detalhe(kind, id, data, (multaId, coluna) => source.urlArquivoMulta(multaId, coluna))
  const multa = kind === 'multa' ? data.multas.find((row) => row.id === id) : undefined
  useEffect(() => { setShareUrl(null) }, [kind, id])

  async function abrirFormulario() {
    try {
      await source.openForm(kind, id)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onChanged()
  }

  function concluido(result: FlowResult | null) {
    if (result?.shareUrl) setShareUrl(result.shareUrl)
    onChanged()
  }

  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      actions={registro ? <BotaoAuditoria entity={KIND_TABLE[kind]} ids={[id]} name={registro.titulo} /> : null}
      eyebrow={KIND_LABEL[kind]}
      title={registro?.titulo || 'Registro não encontrado'}
      footer={multa ? undefined : <>
        <span className="frota-muted">Edição completa no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirFormulario()} disabled={!registro}>Abrir formulário</Button>
      </>}
    >
      {!registro ? <EmptyState compact align="start" title="Este registro não está mais na lista">Recarregue a tela.</EmptyState> : (
        <div className="frota-drawer">
          {!multa && <div className="frota-drawer__status"><StatusBadge kind={kind} value={registro.status} /></div>}
          {multa ? (
            <MultaPassoAPasso key={`${id}-${multa.status}`} source={source} multa={multa} data={data} onChanged={onChanged} />
          ) : (
            <section className="frota-group" aria-labelledby={`${id}-acoes`}>
              <h3 id={`${id}-acoes`} className="frota-group__title">Ações de status</h3>
              {shareUrl && /^https?:\/\//i.test(shareUrl) && <p><a className="frota-link" href={shareUrl} target="_blank" rel="noreferrer">Abrir contrato gerado</a></p>}
              <StatusPanel
                key={`${id}-${registro.status}`}
                source={source}
                kind={kind}
                record={{ id, status: registro.status, temVeiculo: registro.veiculo !== null, temMotorista: registro.temMotorista }}
                onDone={concluido}
                onReload={onChanged}
              />
            </section>
          )}
          <section className="frota-group" aria-labelledby={`${id}-dados`}>
            <h3 id={`${id}-dados`} className="frota-group__title">{multa ? 'Dados da multa' : 'Dados'}</h3>
            <dl className="frota-detail">
              <dt>Veículo</dt>
              <dd>{registro.veiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(registro.veiculo!.id)}>{registro.veiculo.label || NAO_INFORMADO}</button> : NAO_INFORMADO}</dd>
              {registro.campos.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}
            </dl>
          </section>
        </div>
      )}
    </Drawer>
  )
}
