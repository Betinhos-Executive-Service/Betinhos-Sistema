import { Alert, Button } from '@betinhos/ui'
import { KeyRound, RotateCcw, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type AcessoSource, type Etapa, parseAcessoError } from '../data/acesso'
import type { UsuarioApp } from '../data/source'
import type { Funcionario } from '../data/types'
import { ListaEtapas } from './CadastroAcessoDrawer'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'
import { ReativarAcessoDialog } from './ReativarAcessoDialog'
import { useNotify } from './Toasts'

type Props = { funcionario: Funcionario; acesso: AcessoSource; usuarioDoApp: (email: string) => Promise<UsuarioApp | null>; onCadastrar: () => void }
type EstadoConta = 'verificando' | 'ativo' | 'encerrado' | 'falha'

const TITULO: Record<EstadoConta | 'sem', string> = { sem: 'Sem acesso ao app', verificando: 'Conferindo acesso…', ativo: 'Acesso ativo', encerrado: 'Acesso encerrado', falha: 'Não foi possível conferir o acesso' }

/**
 * Bloco "Acesso ao app" na aba Dados. O estado vem do usuário do Dataverse (systemuser) ligado ao e-mail Microsoft,
 * nunca do status do funcionário: dar ou tirar acesso não tem relação com admissão ou demissão.
 */
export function AcessoApp({ funcionario, acesso, usuarioDoApp, onCadastrar }: Props) {
  const notify = useNotify()
  const [encerrando, setEncerrando] = useState(false)
  const [reativando, setReativando] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [etapas, setEtapas] = useState<Etapa[] | null>(null)
  const [faltouSenha, setFaltouSenha] = useState(false)
  const [conta, setConta] = useState<EstadoConta>('verificando')
  const email = String(funcionario.values.cr40f_emailmicrosoft ?? '')
  const nome = String(funcionario.values.cr40f_nomecompleto ?? '')
  const celular = String(funcionario.values.cr40f_telefonecorporativo ?? '')

  useEffect(() => {
    if (!email) return
    let vivo = true
    setConta('verificando')
    usuarioDoApp(email).then((u) => { if (vivo) setConta(u?.ativo ? 'ativo' : 'encerrado') }, () => { if (vivo) setConta('falha') })
    return () => { vivo = false }
  }, [email, usuarioDoApp])

  const estado = !email ? 'sem' : conta

  async function encerrar(confirmacao: string) {
    try {
      const resultado = await acesso.encerrar(funcionario.id, confirmacao)
      // O Dataverse sincroniza o systemuser depois; o bloco segue o resultado da API.
      setEtapas(resultado); setEncerrando(false); setConta('encerrado'); notify('success', 'Acesso encerrado.')
    } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setSemPermissao(true); setEncerrando(false); notify('error', 'Você não tem permissão para gerir acessos.'); return }
      throw erro
    }
  }

  async function reativar() {
    try { return await acesso.reativar(funcionario.id) } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setSemPermissao(true); setReativando(false); notify('error', 'Você não tem permissão para gerir acessos.') }
      // A senha é a última etapa do plugin: sem permissão para ela, a conta já voltou e o bloco mostra ativo.
      if (erro.codigo === 'SEM_PERMISSAO_SENHA') { setConta('ativo'); setEtapas(erro.etapas); setFaltouSenha(true) }
      throw erro
    }
  }

  return (
    <fieldset className="group acesso-bloco" onKeyDown={(event) => { if (event.key === 'Escape' && (event.target as HTMLElement).closest('dialog')) event.stopPropagation() }}>
      <legend>Acesso ao app</legend>
      <div className="acesso-estado" data-estado={estado}>
        <strong>{TITULO[estado]}</strong>
        {email && <code>{email}</code>}
      </div>
      {!semPermissao && estado === 'sem' && <Button variant="secondary" size="compact" icon={<KeyRound size={16} />} onClick={onCadastrar}>Cadastrar acesso</Button>}
      {!semPermissao && estado === 'ativo' && <Button variant="secondary" size="compact" icon={<UserX size={16} />} onClick={() => setEncerrando(true)}>Encerrar acesso</Button>}
      {!semPermissao && (estado === 'encerrado' || (estado === 'ativo' && faltouSenha)) && <Button variant="secondary" size="compact" icon={<RotateCcw size={16} />} onClick={() => setReativando(true)}>Reativar acesso</Button>}
      {etapas && <ListaEtapas etapas={etapas} />}
      {semPermissao && <Alert tone="warning">Você não tem permissão para gerir acessos.</Alert>}
      <EncerrarAcessoDialog open={encerrando} nome={nome} onCancel={() => setEncerrando(false)} onConfirmar={encerrar} />
      <ReativarAcessoDialog open={reativando} nome={nome} celular={celular} onCancel={() => setReativando(false)} onReativar={reativar}
        onReativado={(r) => { setConta('ativo'); setEtapas(r.etapas); setFaltouSenha(false) }} />
    </fieldset>
  )
}
