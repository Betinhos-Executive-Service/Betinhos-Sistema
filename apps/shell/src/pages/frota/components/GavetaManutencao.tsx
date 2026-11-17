// apps/shell/src/pages/frota/components/GavetaManutencao.tsx
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, EmptyState, Field, StatusBadge as Badge, Textarea } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { CarregandoRegistro } from '../../../app/BrandLoader'
import { diaSP, formatBR, todaySP } from '../data/dates'
import { brl, NAO_INFORMADO } from '../data/format'
import { GRAU, LIMITE, MANUT, PAGAMENTO_MANUT, TIPO_REPARO, label } from '../data/schema'
import type { Classificacao, DataSource } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { comPontoFinal, errorMessage } from '../data/xrm'
import { atrasada, lerJanela, rotuloJanela, valoresJanelaIniciais, type ErrosJanela, type Janela, type ValoresJanela } from '../domain/janela'
import { acoesManutencao, desfechoDaAcao, executarAcaoManutencao, rotuloAcao, StaleError, type AcaoManutencao } from '../domain/transitions'
import { ClassificacaoManutencao } from './ClassificacaoManutencao'
import { ConcluirManutencaoForm } from './ConcluirManutencaoForm'
import { JanelaCampos } from './JanelaCampos'
import { Arquivos } from './ManutencaoPassoAPasso'
import { useNotify } from './Toasts'
import { StatusBadge } from './Ui'

const texto = (valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === '' ? NAO_INFORMADO : String(valor))
const dia = (iso: string | null) => formatBR(diaSP(iso)) || NAO_INFORMADO
const km = (valor: number | null) => (valor !== null ? `${valor.toLocaleString('pt-BR')} km` : NAO_INFORMADO)
const janelaDe = (m: DetalheManutencao): Janela | null => (m.janelaInicio && m.janelaFim ? { inicio: m.janelaInicio, fim: m.janelaFim } : null)
const linksDe = (valor: string | null) => (valor ?? '').split('\n').map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l))

type Linha = [string, ReactNode]
type Leitura = { tipo: 'ok'; detalhe: DetalheManutencao | null } | { tipo: 'falha' } | { tipo: 'ignorada' }
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; detalhe: DetalheManutencao | null }

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="frota-group" aria-labelledby={id}>
      <h3 id={id} className="frota-group__title">{titulo}</h3>
      {children}
    </section>
  )
}

function Linhas({ linhas }: { linhas: Linha[] }) {
  return <dl className="frota-detail">{linhas.map(([nome, valor]) => (<div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>))}</dl>
}

type FormProps = { source: DataSource; m: DetalheManutencao; onFeito: (mensagem: string) => void; onDesatualizada: () => void; onVoltar: () => void }

function EncaixeForm({ source, m, hoje, onFeito, onDesatualizada, onVoltar }: FormProps & { hoje: string }) {
  const [valores, setValores] = useState<ValoresJanela>(() => valoresJanelaIniciais(janelaDe(m), hoje, m.comentarioAoMotorista))
  const [erros, setErros] = useState<ErrosJanela>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const rotulo = rotuloAcao('encaixar', m.status)

  async function confirmar() {
    if (salvando) return
    const leitura = lerJanela(valores, hoje, LIMITE.comentarioAoMotorista)
    setErros(leitura.erros)
    const janela = leitura.janela
    if (!janela) return
    setSalvando(true)
    setFalha(null)
    const desfecho = await desfechoDaAcao(() => executarAcaoManutencao(source, { id: m.id, status: m.status }, 'encaixar', () => source.agendarManutencao({ manutencaoId: m.id, inicio: janela.inicio, fim: janela.fim, comentario: leitura.comentario })))
    setSalvando(false)
    if (desfecho.tipo === 'feito') onFeito(`Manutenção ${m.status === MANUT.SOLICITADO ? 'encaixada' : 'reagendada'}: ${rotuloJanela(janela)}.`)
    else if (desfecho.tipo === 'desatualizada') onDesatualizada()
    else setFalha(desfecho.mensagem)
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void confirmar() }}>
      <strong>{rotulo}</strong>
      {m.status === MANUT.PROGRAMADO ? <Alert tone="warning">Reagendar tira o motorista da programação na Geral; ele recebe o aviso de retirada.</Alert> : null}
      {falha ? <Alert tone="danger" title="Não foi possível gravar">{falha}</Alert> : null}
      <JanelaCampos valores={valores} erros={erros} hoje={hoje} disabled={salvando} onChange={setValores} />
      <div className="frota-cluster">
        <Button type="submit" loading={salvando}>Confirmar</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

function MotivoForm({ source, m, acao, onFeito, onDesatualizada, onVoltar }: FormProps & { acao: 'reprovar' | 'cancelar' }) {
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const reprovar = acao === 'reprovar'
  const rotulo = rotuloAcao(acao, m.status)

  async function confirmar() {
    if (salvando) return
    const motivo = comentario.trim()
    if (reprovar && !motivo) { setErro('Escreva o motivo da reprovação'); return }
    if (motivo.length > LIMITE.comentarioAprovador) { setErro(`Máximo de ${LIMITE.comentarioAprovador} caracteres`); return }
    setErro(undefined)
    setSalvando(true)
    setFalha(null)
    const desfecho = await desfechoDaAcao(() => executarAcaoManutencao(source, { id: m.id, status: m.status }, acao, () => (reprovar ? source.reprovarManutencao(m.id, motivo) : source.cancelarManutencao(m.id, motivo || null))))
    setSalvando(false)
    if (desfecho.tipo === 'feito') onFeito(reprovar ? 'Manutenção reprovada.' : 'Manutenção cancelada.')
    else if (desfecho.tipo === 'desatualizada') onDesatualizada()
    else setFalha(desfecho.mensagem)
  }

  return (
    <form className="frota-stack" noValidate onSubmit={(event) => { event.preventDefault(); void confirmar() }}>
      <strong>{rotulo}</strong>
      <p className="frota-muted">{reprovar ? 'O pedido não será feito.' : 'A manutenção sai do ciclo. Se já houver linha na Geral, ela é cancelada.'}</p>
      {falha ? <Alert tone="danger" title="Não foi possível gravar">{falha}</Alert> : null}
      <Field label={reprovar ? 'Motivo da reprovação' : 'Motivo do cancelamento'} required={reprovar} error={erro} disabled={salvando}>
        <Textarea rows={2} maxLength={LIMITE.comentarioAprovador} value={comentario} onChange={(event) => setComentario(event.target.value)} />
      </Field>
      <div className="frota-cluster">
        <Button type="submit" variant="danger" loading={salvando}>{rotulo}</Button>
        <Button variant="secondary" disabled={salvando} onClick={onVoltar}>Voltar</Button>
      </div>
    </form>
  )
}

type Props = {
  source: DataSource
  id: string
  /** `YYYY-MM-DD`. Padrão: hoje em São Paulo. Serve ao selo "Atrasada" e à janela do encaixe. */
  hoje?: string
  onClose: () => void
  /** Depois de gravar (ação, classificação sem `onClassificado`, formulário nativo): quem abriu recarrega a lista. */
  onChanged: () => void
  onClassificado?: (id: string, classificacao: Classificacao) => void
  onOpenVeiculo?: (id: string) => void
}

/**
 * Gaveta única da manutenção (Frota e, no plano 3, Geral): pedido, encaixe, conclusão, classificação e histórico, e as
 * ações do ciclo novo pelas Custom APIs. Lê o detalhe no servidor ao abrir e de novo depois de cada gravação.
 */
export function GavetaManutencao({ source, id, hoje = todaySP(), onClose, onChanged, onClassificado, onOpenVeiculo }: Props) {
  const notify = useNotify()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [acao, setAcao] = useState<AcaoManutencao | null>(null)
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => { vivo.current = false }
  }, [])

  // O aviso de toast fica num ref: `carregar` precisa ser estável (ele dispara a leitura inicial).
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  const requisicao = useRef(0)
  const ultimo = useRef<DetalheManutencao | null>(null)

  /**
   * Lê o detalhe no servidor. A resposta que chega depois de outra leitura mais nova é ignorada (contador). Se a leitura
   * falha e já há um detalhe na tela, ele fica e o toast avisa; só a leitura inicial troca a gaveta por erro.
   */
  const carregar = useCallback(async (): Promise<Leitura> => {
    const minha = ++requisicao.current
    try {
      const detalhe = await source.detalheManutencao(id)
      if (!vivo.current || minha !== requisicao.current) return { tipo: 'ignorada' }
      ultimo.current = detalhe
      setEstado({ tipo: 'ok', detalhe })
      return { tipo: 'ok', detalhe }
    } catch (reason) {
      if (!vivo.current || minha !== requisicao.current) return { tipo: 'ignorada' }
      if (ultimo.current) notifyRef.current('error', `Não foi possível atualizar a gaveta (${errorMessage(reason)}). O que aparece pode estar desatualizado.`)
      else setEstado({ tipo: 'erro', mensagem: errorMessage(reason) })
      return { tipo: 'falha' }
    }
  }, [source, id])
  useEffect(() => { void carregar() }, [carregar])

  // Foco: ao abrir um formulário, no primeiro campo; ao voltar, no botão da ação que o abriu.
  const areaAcoes = useRef<HTMLDivElement>(null)
  const acaoAnterior = useRef<AcaoManutencao | null>(null)
  useEffect(() => {
    const area = areaAcoes.current
    if (acao) area?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])')?.focus()
    else if (acaoAnterior.current) (area?.querySelector<HTMLElement>(`[data-acao="${acaoAnterior.current}"]`) ?? area?.querySelector<HTMLElement>('button'))?.focus()
    acaoAnterior.current = acao
  }, [acao])

  function gravado(mensagem: string) {
    notify('success', mensagem)
    setAcao(null)
    void carregar()
    onChanged()
  }

  /**
   * Outra pessoa mudou a manutenção com um formulário aberto. Recarrega e decide pelo estado novo: se a ação ainda vale, o
   * formulário fica aberto com o que foi digitado (ele não é desmontado) e o aviso pede para confirmar de novo; se não vale
   * mais, fecha e o aviso diz que o digitado foi descartado.
   */
  async function desatualizada() {
    const aberta = acao
    onChanged()
    const leitura = await carregar()
    const aviso = comPontoFinal(new StaleError().message)
    const naoVale = leitura.tipo === 'ok' && (leitura.detalhe === null || (aberta !== null && !acoesManutencao(leitura.detalhe.status).includes(aberta)))
    if (naoVale) {
      setAcao(null)
      notify('error', `${aviso} O que você digitou foi descartado porque a ação não se aplica mais.`)
    } else notify('error', `${aviso} Confira e confirme de novo.`)
  }

  async function abrirFormulario() {
    try {
      await source.openForm('manutencao', id)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    void carregar()
    onChanged()
  }

  if (estado.tipo === 'carregando') return <CarregandoRegistro label="Carregando manutenção" onCancel={onClose} />
  if (estado.tipo === 'erro') {
    return (
      <Drawer open eyebrow="Manutenção" title="Não foi possível abrir" onClose={onClose}>
        <Alert tone="danger" title="Não foi possível abrir a manutenção" action={<Button variant="secondary" onClick={() => { setEstado({ tipo: 'carregando' }); void carregar() }}>Tentar de novo</Button>}>{estado.mensagem}</Alert>
      </Drawer>
    )
  }
  const m = estado.detalhe
  if (!m) {
    return (
      <Drawer open eyebrow="Manutenção" title="Manutenção não encontrada" onClose={onClose}>
        <EmptyState compact align="start" title="Esta manutenção não está mais disponível">Ela pode ter sido excluída ou desativada. Recarregue a lista.</EmptyState>
      </Drawer>
    )
  }

  const janela = janelaDe(m)
  const acoes = acoesManutencao(m.status)
  const veiculo = !m.veiculo ? NAO_INFORMADO
    : onOpenVeiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(m.veiculo!.id)}>{m.veiculo.label || NAO_INFORMADO}</button>
    : m.veiculo.label || NAO_INFORMADO
  const encaixe: Linha[] = [
    ...(janela ? [['Janela', rotuloJanela(janela)] as Linha] : m.agendarPara ? [['Agendada para (antes das manutenções v2)', formatBR(m.agendarPara)] as Linha] : []),
    ['Comentário ao motorista', texto(m.comentarioAoMotorista)],
  ]

  let formulario: ReactNode = null
  if (acao === 'encaixar') formulario = <EncaixeForm source={source} m={m} hoje={hoje} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={() => setAcao(null)} />
  else if (acao === 'reprovar' || acao === 'cancelar') formulario = <MotivoForm source={source} m={m} acao={acao} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={() => setAcao(null)} />
  else if (acao === 'concluir') {
    formulario = (
      <ConcluirManutencaoForm source={source} detalhe={m} onVoltar={() => setAcao(null)} onDesatualizada={desatualizada}
        onConcluida={(avisoNota) => { gravado('Manutenção concluída. A despesa foi criada.'); if (avisoNota) notify('error', avisoNota) }} />
    )
  }

  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      eyebrow={m.codigo ? `Manutenção ${m.codigo}` : 'Manutenção'}
      title={m.descricao || 'Manutenção'}
      actions={<BotaoAuditoria entity="cr40f_manutencoes" ids={[m.id]} name={m.descricao} />}
      footer={<>
        <span className="frota-muted">Edição completa no formulário do Dataverse.</span>
        <Button variant="secondary" icon={<ExternalLink size={16} />} onClick={() => void abrirFormulario()}>Abrir formulário</Button>
      </>}
    >
      <div className="frota-drawer">
        <div className="frota-drawer__status frota-cluster">
          <StatusBadge kind="manutencao" value={m.status} />
          {atrasada(m, hoje) ? <Badge tone="danger">Atrasada</Badge> : null}
        </div>

        <Secao id={`${m.id}-acoes`} titulo="Ações">
          <div ref={areaAcoes}>
            {formulario ?? (acoes.length === 0 ? <p className="frota-muted">Sem ações para esta manutenção.</p> : (
              <div className="frota-cluster">
                {acoes.map((a) => <Button key={a} data-acao={a} variant={a === 'encaixar' ? 'primary' : 'secondary'} onClick={() => setAcao(a)}>{rotuloAcao(a, m.status)}</Button>)}
              </div>
            ))}
          </div>
        </Secao>

        <Secao id={`${m.id}-pedido`} titulo="Pedido">
          <Linhas linhas={[
            ['Veículo', veiculo], ['Solicitante', texto(m.solicitante?.label)], ['Grau', label(GRAU, m.grau)], ['Tipo de reparo', label(TIPO_REPARO, m.tipo)],
            ['Km no pedido', km(m.km)], ['Descrição', texto(m.descricao)],
          ]} />
          <Arquivos titulo="Fotos do pedido" links={m.fotosPedido} />
        </Secao>

        {janela || m.agendarPara || m.comentarioAoMotorista ? (
          <Secao id={`${m.id}-encaixe`} titulo="Encaixe"><Linhas linhas={encaixe} /></Secao>
        ) : null}

        {m.status === MANUT.REALIZADO ? (
          <Secao id={`${m.id}-conclusao`} titulo="Conclusão">
            <Linhas linhas={[
              ['Km na realização', km(m.kmRealizado)], ['Valor', brl(m.valor)], ['Pagamento', label(PAGAMENTO_MANUT, m.pagamento)], ['Estabelecimento', texto(m.estabelecimento)],
              ['Quem realizou', texto(m.realizadoPor?.label)], ['Serviço realizado', texto(m.servicoRealizado)], ['Comentário', texto(m.comentarioColaborador)],
            ]} />
            <Arquivos titulo="Nota fiscal" links={linksDe(m.linkNotaFiscal)} />
            <Arquivos titulo="Fotos da manutenção" links={m.fotosFinais} />
          </Secao>
        ) : null}

        <Secao id={`${m.id}-classif`} titulo="Serviços e categorias">
          <ClassificacaoManutencao
            key={`${m.id}-${m.servicos.join(',')}-${m.origemClassificacao}`}
            source={source}
            item={m}
            onClassificado={(c) => {
              setEstado({ tipo: 'ok', detalhe: { ...m, servicos: c.servicos, categorias: c.categorias, origemClassificacao: c.origem, confiancaIa: c.confianca } })
              if (onClassificado) onClassificado(m.id, c)
              else onChanged()
            }}
          />
        </Secao>

        <Secao id={`${m.id}-historico`} titulo="Histórico">
          <Linhas linhas={[
            ['Solicitada em', dia(m.criadoEm)], ['Encaixada em', m.dataAprovacao ? formatBR(m.dataAprovacao) : NAO_INFORMADO],
            ['Realizada em', dia(m.dataManutencao)], ['Comentário do gestor', texto(m.comentarioAprovador)],
          ]} />
          <p className="frota-muted">As alterações uma a uma ficam na auditoria, no botão do alto da gaveta.</p>
        </Secao>
      </div>
    </Drawer>
  )
}
