import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Drawer, EmptyState } from '@betinhos/ui'
import { diaSP, formatBR } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { GRAU, GRAVIDADE, KIND_LABEL, KIND_TABLE, label, TIPO_COLISAO, TIPO_REPARO } from '../data/schema'
import type { Classificacao, DataSource, FlowResult } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { ClassificacaoManutencao } from './ClassificacaoManutencao'
import { StatusPanel } from './StatusPanel'
import { TermoMultaPanel } from './TermoMultaPanel'
import { useNotify } from './Toasts'
import { StatusBadge } from './Ui'

type Campo = [string, string]
type Detalhe = { titulo: string; status: number | null; veiculo: Ref | null; temMotorista: boolean; initial?: Record<string, string>; campos: Campo[] }

const texto = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? NAO_INFORMADO : String(value))
const dia = (iso: string | null) => formatBR(diaSP(iso)) || NAO_INFORMADO

function detalhe(kind: Kind, id: string, data: FrotaData): Detalhe | null {
  if (kind === 'manutencao') {
    const item = data.manutencoes.find((row) => row.id === id)
    return !item ? null : { titulo: item.descricao, status: item.status, veiculo: item.veiculo, temMotorista: true, initial: { cr40f_agendarpara: item.agendarPara ?? '' }, campos: [
      ['Solicitante', texto(item.solicitante?.label)], ['Grau', label(GRAU, item.grau)], ['Tipo de reparo', label(TIPO_REPARO, item.tipo)], ['KM', texto(item.km)],
      ['Solicitada em', dia(item.criadoEm)], ['Agendada para', formatBR(item.agendarPara) || NAO_INFORMADO], ['Realizada em', dia(item.dataManutencao)],
      ['Valor', brl(item.valor)], ['Estabelecimento', texto(item.estabelecimento)], ['Serviço realizado', texto(item.servicoRealizado)], ['Comentário do aprovador', texto(item.comentarioAprovador)],
    ] }
  }
  if (kind === 'multa') {
    const item = data.multas.find((row) => row.id === id)
    const infracao = item?.infracaoId ? data.infracoes.find((row) => row.id === item.infracaoId) : undefined
    return !item ? null : { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: item.motorista !== null, campos: [
      ['Motorista', texto(item.motorista?.label)], ['Data da infração', dia(item.dataHora)], ['Local', texto(item.local)],
      ['Infração', infracao ? `${infracao.codigo} · ${texto(infracao.descricao)}` : 'Sem código de infração'], ['Gravidade', infracao ? label(GRAVIDADE, infracao.gravidade) : NAO_INFORMADO],
      ['Valor', brl(infracao?.valor ?? null)], ['Pontos na CNH', texto(infracao?.pontos)],
      ['Prazo para indicar', formatBR(item.dataParaIndicar) || NAO_INFORMADO], ['Indicado', item.indicado ? 'Sim' : 'Não'],
      ['Aviso ao condutor', formatBR(item.dataAviso) || NAO_INFORMADO], ['Data de indicação', formatBR(item.dataIndicacao) || NAO_INFORMADO],
    ] }
  }
  const item = data.colisoes.find((row) => row.id === id)
  return item ? { titulo: item.titulo, status: item.status, veiculo: item.veiculo, temMotorista: true, campos: [
    ['Motorista', texto(item.motorista?.label)], ['Data', dia(item.dataHora)], ['Local', texto(item.local)], ['Tipo', label(TIPO_COLISAO, item.tipo)],
    ['Houve terceiro', item.houveTerceiro ? 'Sim' : 'Não'], ['Descrição', texto(item.descricao)],
  ] } : null
}

export function RegistroDrawer({ source, kind, id, data, onClose, onChanged, onClassificado, onOpenVeiculo }: { source: DataSource; kind: Kind; id: string; data: FrotaData; onClose: () => void; onChanged: () => void; onClassificado?: (id: string, classificacao: Classificacao) => void; onOpenVeiculo: (id: string) => void }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const notify = useNotify()
  const registro = detalhe(kind, id, data)
  const manutencao = kind === 'manutencao' ? data.manutencoes.find((row) => row.id === id) : undefined
  const multa = kind === 'multa' ? data.multas.find((row) => row.id === id) : undefined
  const valorCatalogo = multa?.infracaoId ? data.infracoes.find((row) => row.id === multa.infracaoId)?.valor ?? null : null
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
      footer={<>
        <span className="frota-muted">Edição completa no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirFormulario()} disabled={!registro}>Abrir formulário</Button>
      </>}
    >
      {!registro ? <EmptyState compact align="start" title="Este registro não está mais na lista">Recarregue a tela.</EmptyState> : (
        <div className="frota-drawer">
          <div className="frota-drawer__status"><StatusBadge kind={kind} value={registro.status} /></div>
          <section className="frota-group" aria-labelledby={`${id}-acoes`}>
            <h3 id={`${id}-acoes`} className="frota-group__title">Ações de status</h3>
            {shareUrl && /^https?:\/\//i.test(shareUrl) && <p><a className="frota-link" href={shareUrl} target="_blank" rel="noreferrer">Abrir contrato gerado</a></p>}
            <StatusPanel
              key={`${id}-${registro.status}`}
              source={source}
              kind={kind}
              record={{ id, status: registro.status, temVeiculo: registro.veiculo !== null, temMotorista: registro.temMotorista }}
              initial={registro.initial}
              onDone={concluido}
              onReload={onChanged}
            />
          </section>
          {manutencao && (
            <section className="frota-group" aria-labelledby={`${id}-classif`}>
              <h3 id={`${id}-classif`} className="frota-group__title">Serviços e categorias</h3>
              <ClassificacaoManutencao key={`${id}-${manutencao.servicos.join(',')}-${manutencao.origemClassificacao}`} source={source} item={manutencao} onClassificado={(c) => (onClassificado ? onClassificado(id, c) : onChanged())} />
            </section>
          )}
          {multa && (
            <section className="frota-group" aria-labelledby={`${id}-termo`}>
              <h3 id={`${id}-termo`} className="frota-group__title">Termo de acordo</h3>
              <TermoMultaPanel key={id} source={source} multa={multa} valorCatalogo={valorCatalogo} onChanged={onChanged} />
            </section>
          )}
          <section className="frota-group" aria-labelledby={`${id}-dados`}>
            <h3 id={`${id}-dados`} className="frota-group__title">Dados</h3>
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
