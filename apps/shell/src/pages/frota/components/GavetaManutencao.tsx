// apps/shell/src/pages/frota/components/GavetaManutencao.tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Drawer, EmptyState, Field, Textarea } from '@betinhos/ui'
import { BotaoAuditoria } from '../../../app/auditoria/AuditoriaProvider'
import { CarregandoRegistro } from '../../../app/BrandLoader'
import { todaySP } from '../data/dates'
import { NAO_INFORMADO } from '../data/format'
import { LIMITE, MANUT } from '../data/schema'
import type { Classificacao, DataSource } from '../data/source'
import type { DetalheManutencao } from '../data/types'
import { comPontoFinal, errorMessage } from '../data/xrm'
import { lerJanela, rotuloJanela, valoresJanelaIniciais, type ErrosJanela, type Janela, type ValoresJanela } from '../domain/janela'
import { avaliar, chavePasso, rotuloExtra, type Extra } from '../domain/manutencaoEtapas'
import { desfechoDaAcao, executarAcaoManutencao, rotuloAcao, StaleError } from '../domain/transitions'
import { ClassificacaoManutencao } from './ClassificacaoManutencao'
import { ConcluirManutencaoForm } from './ConcluirManutencaoForm'
import { JanelaCampos } from './JanelaCampos'
import { Bloco, CabecalhoManutencao, HistoricoManutencao, MaisAcoes, PedidoManutencao } from './ManutencaoResumo'
import { ManutencaoPassoAPasso } from './ManutencaoPassoAPasso'
import { useNotify } from './Toasts'

const janelaDe = (m: DetalheManutencao): Janela | null => (m.janelaInicio && m.janelaFim ? { inicio: m.janelaInicio, fim: m.janelaFim } : null)

type Leitura = { tipo: 'ok'; detalhe: DetalheManutencao | null } | { tipo: 'falha' } | { tipo: 'ignorada' }
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; detalhe: DetalheManutencao | null }

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
  /** `YYYY-MM-DD`. Padrão: hoje em São Paulo. Serve ao prazo "Atrasada" e à janela do encaixe. */
  hoje?: string
  onClose: () => void
  /** Depois de gravar (passo, exceção, classificação sem `onClassificado`, formulário nativo): quem abriu recarrega a lista. */
  onChanged: () => void
  onClassificado?: (id: string, classificacao: Classificacao) => void
  onOpenVeiculo?: (id: string) => void
}

/**
 * Gaveta única da manutenção (Frota, Pendências, hospedeiro e Geral): o guia passo a passo e, pelo "⋯", as exceções
 * (Reagendar, Reprovar, Cancelar, Concluir, Corrigir classificação) com os formulários de sempre. Lê o detalhe no
 * servidor ao abrir e de novo depois de cada gravação.
 */
export function GavetaManutencao({ source, id, hoje = todaySP(), onClose, onChanged, onClassificado, onOpenVeiculo }: Props) {
  const notify = useNotify()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [extra, setExtra] = useState<Extra | null>(null)
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

  // Foco: ao abrir uma exceção, no primeiro campo; ao voltar ao guia, no "Mais ações" (nas actions do Drawer).
  const corpo = useRef<HTMLDivElement>(null)
  const acoes = useRef<HTMLSpanElement>(null)
  const extraAnterior = useRef<Extra | null>(null)
  useEffect(() => {
    if (extra) corpo.current?.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])')?.focus()
    else if (extraAnterior.current) acoes.current?.querySelector<HTMLElement>('[aria-label="Mais ações"]')?.focus()
    extraAnterior.current = extra
  }, [extra])

  function gravado(mensagem: string) {
    notify('success', mensagem)
    setExtra(null)
    void carregar()
    onChanged()
  }

  /**
   * Outra pessoa mudou a manutenção (passo do guia ou exceção aberta). Recarrega e decide pelo estado novo: com exceção
   * aberta, vale se ela ainda está no "⋯" da etapa nova; sem exceção, vale se a chave do passo não mudou (ele não remontou). Se vale, o que foi
   * digitado fica e o aviso pede para confirmar de novo; se não, volta ao guia e o aviso diz que o digitado foi descartado.
   */
  async function desatualizada() {
    const aberto = extra
    const antes = ultimo.current
    onChanged()
    const leitura = await carregar()
    const aviso = comPontoFinal(new StaleError().message)
    const depois = leitura.tipo === 'ok' ? leitura.detalhe : undefined
    const naoVale = depois === null || (!!depois && (aberto !== null
      ? !avaliar(depois, hoje).extras.includes(aberto)
      : !!antes && chavePasso(antes) !== chavePasso(depois)))
    if (naoVale) {
      setExtra(null)
      notify('error', `${aviso} O que você digitou foi descartado porque a ação não se aplica mais.`)
    } else notify('error', `${aviso} Confira e confirme de novo.`)
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

  const voltar = () => setExtra(null)
  let formulario: ReactNode = null
  if (extra === 'reagendar') formulario = <EncaixeForm source={source} m={m} hoje={hoje} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={voltar} />
  else if (extra === 'reprovar' || extra === 'cancelar') formulario = <MotivoForm source={source} m={m} acao={extra} onFeito={gravado} onDesatualizada={desatualizada} onVoltar={voltar} />
  else if (extra === 'concluir') {
    formulario = (
      <ConcluirManutencaoForm source={source} detalhe={m} onVoltar={voltar} onDesatualizada={desatualizada}
        onConcluida={(avisoNota) => { gravado('Manutenção concluída. A despesa foi criada.'); if (avisoNota) notify('error', avisoNota) }} />
    )
  } else if (extra === 'corrigirClassificacao') {
    formulario = (
      <div className="frota-stack">
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
        <div className="frota-cluster"><Button variant="secondary" onClick={voltar}>Voltar</Button></div>
      </div>
    )
  }

  const placa = m.veiculo?.label || NAO_INFORMADO
  const situacao = avaliar(m, hoje)
  const tituloPasso = situacao.etapa === 'realizada' ? 'Resultado' : situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada' ? 'Encerrada' : 'Próximo passo'
  return (
    <Drawer
      open
      size="wide"
      onClose={onClose}
      eyebrow={m.codigo ? `Manutenção ${m.codigo}` : 'Manutenção'}
      title={<span className="frota-gaveta__titulo">{placa} · {m.descricao || 'Manutenção'}</span>}
      actions={<>
        <span ref={acoes}>{extra ? null : <MaisAcoes situacao={situacao} onExtra={setExtra} />}</span>
        <BotaoAuditoria entity="cr40f_manutencoes" ids={[m.id]} name={m.descricao} />
      </>}
    >
      <div className="frota-gaveta-corpo" ref={corpo}>
        <CabecalhoManutencao m={m} situacao={situacao} />
        <PedidoManutencao m={m} onOpenVeiculo={onOpenVeiculo} />
        <Bloco titulo={extra ? rotuloExtra(extra, situacao.etapa) : tituloPasso} destaque>
          {formulario ?? <ManutencaoPassoAPasso source={source} m={m} hoje={hoje} onFeito={gravado} onDesatualizada={desatualizada} onExtra={setExtra} autoFoco={extraAnterior.current === null} />}
        </Bloco>
        <HistoricoManutencao situacao={situacao} />
      </div>
    </Drawer>
  )
}
