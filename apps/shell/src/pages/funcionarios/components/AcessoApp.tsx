import { Alert, Button, StatusBadge as DsStatusBadge } from '@betinhos/ui'
import { KeyRound, RefreshCw, RotateCcw, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type AcessoSource, ERROS_PERMANENTES, type Etapa, type Fluxo, liberacaoPendente, parseAcessoError } from '../data/acesso'
import type { UsuarioApp } from '../data/source'
import type { Funcionario } from '../data/types'
import { ListaEtapas, ProgressoAcesso, useRetentativa } from './AcessoProgresso'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'
import { ReativarAcessoDialog } from './ReativarAcessoDialog'
import { useNotify } from './Toasts'

export type EstadoConta = 'verificando' | 'ativo' | 'encerrado' | 'liberando' | 'falha'
export type EstadoAcesso = EstadoConta | 'sem'

/**
 * Estado do acesso pelo systemuser ligado ao e-mail Microsoft (nunca pelo status do funcionário).
 * Sem systemuser conta como encerrado: "Reativar acesso" refaz o addUser.
 */
export function useContaApp(email: string, usuarioDoApp: (email: string) => Promise<UsuarioApp | null>) {
  const [conta, setConta] = useState<EstadoConta>('verificando')
  useEffect(() => {
    if (!email) return
    let vivo = true
    setConta('verificando')
    usuarioDoApp(email).then((u) => { if (vivo) setConta(u?.ativo ? 'ativo' : 'encerrado') }, () => { if (vivo) setConta('falha') })
    return () => { vivo = false }
  }, [email, usuarioDoApp])
  return [conta, setConta] as const
}

const SELO: Partial<Record<EstadoAcesso, { tone: 'success' | 'neutral' | 'info'; texto: string }>> = {
  ativo: { tone: 'success', texto: 'App ativo' }, encerrado: { tone: 'neutral', texto: 'App encerrado' }, liberando: { tone: 'info', texto: 'Liberando' },
}

/** Selo do cabeçalho da ficha; nada quando não há acesso ou ainda está conferindo. */
export function SeloApp({ estado }: { estado: EstadoAcesso }) {
  const selo = SELO[estado]
  return selo ? <DsStatusBadge tone={selo.tone} dot>{selo.texto}</DsStatusBadge> : null
}

const TITULO: Record<EstadoAcesso, string> = {
  sem: 'Sem acesso ao app', verificando: 'Conferindo acesso…', ativo: 'Acesso ativo', encerrado: 'Acesso encerrado',
  liberando: 'Liberando no app', falha: 'Não foi possível conferir o acesso',
}
const RESUMO: Record<Fluxo, string> = { cadastro: 'Liberação concluída.', encerrar: 'Acesso encerrado. A ficha não mudou.', reativar: 'Acesso reativado.' }

type Props = {
  funcionario: Funcionario
  acesso: AcessoSource
  estado: EstadoAcesso
  setConta: (conta: EstadoConta) => void
  /** E-mail criado cuja liberação ficou pendente (ainda não gravado na ficha). */
  emailPendente?: string
  onCadastrar: () => void
  /** A ficha mudou no Dataverse (ex.: e-mail vinculado ao concluir a liberação). */
  onAtualizado: () => void
  /** Acesso encerrado ou reativado: a lista relê a linha para o selo "Sem app" acompanhar. */
  onAlterado?: () => void
}

/** Bloco "Acesso ao app" da aba Acesso: cadastrar, concluir liberação, encerrar e reativar. */
export function AcessoApp({ funcionario, acesso, estado, setConta, emailPendente, onCadastrar, onAtualizado, onAlterado }: Props) {
  const notify = useNotify()
  const [encerrando, setEncerrando] = useState(false)
  const [reativando, setReativando] = useState(false)
  const [concluindo, setConcluindo] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [ultimo, setUltimo] = useState<{ fluxo: Fluxo; etapas: Etapa[]; erro?: string; permanente?: boolean } | null>(null)
  const [faltouSenha, setFaltouSenha] = useState(false)
  const email = String(funcionario.values.cr40f_emailmicrosoft ?? '') || emailPendente || ''
  const nome = String(funcionario.values.cr40f_nomecompleto ?? '')
  const celular = String(funcionario.values.cr40f_telefonecorporativo ?? '')

  function semPermissaoDeGerir() { setSemPermissao(true); notify('error', 'Você não tem permissão para gerir acessos.') }

  async function encerrar(confirmacao: string) {
    try {
      const etapas = await acesso.encerrar(funcionario.id, confirmacao)
      // O plugin já bloqueia o systemuser; o bloco segue o resultado da API e a lista relê a linha.
      setUltimo({ fluxo: 'encerrar', etapas }); setEncerrando(false); setConta('encerrado'); notify('success', 'Acesso encerrado.'); onAlterado?.()
    } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setEncerrando(false); semPermissaoDeGerir(); return }
      throw erro
    }
  }

  async function reativar() {
    try { return await acesso.reativar(funcionario.id) } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setReativando(false); semPermissaoDeGerir() }
      // A senha é a última etapa do plugin: sem permissão para ela, a conta já voltou e o bloco mostra ativo.
      if (erro.codigo === 'SEM_PERMISSAO_SENHA') { setConta('ativo'); setUltimo({ fluxo: 'reativar', etapas: erro.etapas }); setFaltouSenha(true); onAlterado?.() }
      throw erro
    }
  }

  /** Reexecuta o cadastro com o mesmo e-mail: idempotente, só termina o que faltou (systemuser e vínculo na ficha). */
  const reexecutarCadastro = () => acesso.cadastrar({
    funcionarioId: funcionario.id, nomeCompleto: nome, celular, prefixoEmail: email.split('@')[0],
    tipoVinculo: funcionario.values.cr40f_tipodevinculo === 0 ? 0 : 1,
  })

  // Após reativar, o e-mail da ficha não muda e useContaApp não reconsulta: o bloco sai de "liberando" aqui.
  function liberado(etapas: Etapa[]) { setUltimo({ fluxo: 'cadastro', etapas }); setConta('ativo'); notify('success', 'Liberação concluída.'); onAtualizado() }

  // Em segundo plano enquanto a ficha mostra "Liberando"; o botão continua para quem não quer esperar.
  const { esgotou, tentando } = useRetentativa(estado === 'liberando' && !concluindo, async () => {
    const r = await reexecutarCadastro()
    return liberacaoPendente(r.etapas) ? undefined : r.etapas
  }, liberado, (reason) => falhou(reason, true))
  const textoPendente = esgotou ? 'O Dataverse está demorando para liberar. Use "Concluir liberação" para tentar de novo.' : 'Ainda liberando no Dataverse. Conclui sozinho em alguns minutos.'

  /** Mostra o erro da liberação; na retentativa automática (`soPermanente`), erros passageiros ficam calados. Devolve se é permanente. */
  function falhou(reason: unknown, soPermanente = false) {
    const erro = parseAcessoError(reason)
    const permanente = ERROS_PERMANENTES.has(erro.codigo)
    if (soPermanente && !permanente) return false
    if (erro.codigo === 'SEM_PERMISSAO') semPermissaoDeGerir()
    else setUltimo({ fluxo: 'cadastro', etapas: erro.etapas, erro: erro.message, permanente })
    return permanente
  }

  async function concluirLiberacao() {
    setConcluindo(true); setUltimo(null)
    try {
      const r = await reexecutarCadastro()
      if (liberacaoPendente(r.etapas)) { setUltimo({ fluxo: 'cadastro', etapas: r.etapas }); return }   // o resumo diz "Ainda liberando"
      liberado(r.etapas)
    } catch (reason) {
      falhou(reason)
    } finally { setConcluindo(false) }
  }

  const pode = !semPermissao && !concluindo
  return (
    <section className="group acesso-bloco" aria-labelledby="acesso-bloco-titulo" onKeyDown={(event) => { if (event.key === 'Escape' && (event.target as HTMLElement).closest('dialog')) event.stopPropagation() }}>
      <h3 id="acesso-bloco-titulo" className="acesso-bloco__titulo">Acesso ao app</h3>
      <div className="acesso-estado" data-estado={estado}>
        <strong>{TITULO[estado]}</strong>
        <SeloApp estado={estado} />
      </div>
      <dl className="acesso-email">
        <dt>E-mail Microsoft</dt>
        <dd>{email ? <code>{email}</code> : <span className="muted">Ainda não criado</span>}</dd>
      </dl>
      {estado === 'liberando' && !concluindo && !ultimo && <p className="acesso-dica">{esgotou ? `A conta existe. ${textoPendente}` : 'A conta existe; o Dataverse ainda está liberando e isto conclui sozinho em alguns minutos. Para tentar agora, use "Concluir liberação".'}</p>}
      {concluindo && <ProgressoAcesso fluxo="cadastro" />}
      <div className="cluster">
        {pode && estado === 'sem' && <Button variant="secondary" size="compact" icon={<KeyRound size={16} />} onClick={onCadastrar}>Cadastrar acesso</Button>}
        {pode && estado === 'liberando' && <Button size="compact" icon={<RefreshCw size={16} />} disabled={tentando} onClick={() => void concluirLiberacao()}>Concluir liberação</Button>}
        {pode && estado === 'ativo' && <Button variant="secondary" size="compact" icon={<UserX size={16} />} onClick={() => setEncerrando(true)}>Encerrar acesso</Button>}
        {pode && (estado === 'encerrado' || (estado === 'ativo' && faltouSenha)) && <Button variant="secondary" size="compact" icon={<RotateCcw size={16} />} onClick={() => setReativando(true)}>Reativar acesso</Button>}
      </div>
      {ultimo && (ultimo.erro
        ? <Alert tone="danger" title="Não foi possível concluir a liberação">{ultimo.erro}{!ultimo.permanente && ' Use "Concluir liberação" de novo em instantes.'}<ListaEtapas etapas={ultimo.etapas} fluxo={ultimo.fluxo} /></Alert>
        : <div className="acesso-resumo" role="status"><p>{liberacaoPendente(ultimo.etapas) ? textoPendente : faltouSenha && ultimo.fluxo === 'reativar' ? 'Conta reativada sem senha nova.' : RESUMO[ultimo.fluxo]}</p><ListaEtapas etapas={ultimo.etapas} fluxo={ultimo.fluxo} /></div>)}
      {semPermissao && <Alert tone="warning">Você não tem permissão para gerir acessos.</Alert>}
      <EncerrarAcessoDialog open={encerrando} nome={nome} onCancel={() => setEncerrando(false)} onConfirmar={encerrar} />
      <ReativarAcessoDialog open={reativando} nome={nome} celular={celular} onCancel={() => setReativando(false)} onReativar={reativar}
        onReativado={(r) => { setConta(liberacaoPendente(r.etapas) ? 'liberando' : 'ativo'); setUltimo({ fluxo: 'reativar', etapas: r.etapas }); setFaltouSenha(false); onAlterado?.() }} />
    </section>
  )
}
