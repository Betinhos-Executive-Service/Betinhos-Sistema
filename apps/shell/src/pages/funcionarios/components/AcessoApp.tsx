import { Alert, Button } from '@betinhos/ui'
import { KeyRound, UserX } from 'lucide-react'
import { useState } from 'react'
import { type AcessoSource, type Etapa, parseAcessoError } from '../data/acesso'
import type { Funcionario } from '../data/types'
import { EncerrarAcessoDialog } from './EncerrarAcessoDialog'
import { useNotify } from './Toasts'

type Props = { funcionario: Funcionario; acesso: AcessoSource; onCadastrar: () => void; onEncerrado: () => void }

/** Bloco "Acesso ao app" na aba Dados: estado derivado do e-mail Microsoft e do status. */
export function AcessoApp({ funcionario, acesso, onCadastrar, onEncerrado }: Props) {
  const notify = useNotify()
  const [aberto, setAberto] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [etapas, setEtapas] = useState<Etapa[] | null>(null)
  const email = String(funcionario.values.cr40f_emailmicrosoft ?? '')
  // Status: 0 Ativo, 2 Afastado (conta como ativo), 1 Desligado.
  const status = Number(funcionario.values.cr40f_status)
  const nome = String(funcionario.values.cr40f_nomecompleto ?? '')
  const estado = !email ? 'sem' : status === 1 ? 'encerrado' : 'ativo'

  async function encerrar(confirmacao: string) {
    try {
      const resultado = await acesso.encerrar(funcionario.id, confirmacao)
      setEtapas(resultado); setAberto(false); notify('success', 'Acesso encerrado.'); onEncerrado()
    } catch (reason) {
      const erro = parseAcessoError(reason)
      if (erro.codigo === 'SEM_PERMISSAO') { setSemPermissao(true); setAberto(false); notify('error', 'Você não tem permissão para gerir acessos.'); return }
      throw erro
    }
  }

  return (
    <fieldset className="group acesso-bloco" onKeyDown={(event) => { if (event.key === 'Escape' && (event.target as HTMLElement).closest('dialog')) event.stopPropagation() }}>
      <legend>Acesso ao app</legend>
      <div className="acesso-estado" data-estado={estado}>
        <strong>{estado === 'sem' ? 'Sem acesso ao app' : estado === 'ativo' ? 'Acesso ativo' : 'Acesso encerrado'}</strong>
        {email && <code>{email}</code>}
      </div>
      {!semPermissao && estado === 'sem' && <Button variant="secondary" size="compact" icon={<KeyRound size={16} />} onClick={onCadastrar}>Cadastrar acesso</Button>}
      {!semPermissao && estado === 'ativo' && status === 0 && <Button variant="secondary" size="compact" icon={<UserX size={16} />} onClick={() => setAberto(true)}>Encerrar acesso</Button>}
      {etapas && <ul className="acesso-etapas">{etapas.map((e) => <li key={e.etapa} data-estado={e.estado}>{e.etapa}: {e.detalhe}</li>)}</ul>}
      {semPermissao && <Alert tone="warning">Você não tem permissão para gerir acessos.</Alert>}
      <EncerrarAcessoDialog open={aberto} nome={nome} onCancel={() => setAberto(false)} onConfirmar={encerrar} />
    </fieldset>
  )
}
