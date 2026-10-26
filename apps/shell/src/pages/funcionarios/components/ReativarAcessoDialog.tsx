import { Alert, Button, buttonClassName, Dialog } from '@betinhos/ui'
import { MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Etapa, liberacaoPendente, type ReativacaoResultado, mensagemWhatsApp, parseAcessoError, whatsappComMensagem } from '../data/acesso'
import { ListaEtapas, ProgressoAcesso } from './AcessoProgresso'
import { CredenciaisAcesso, FecharSemEnviarDialog } from './CadastroAcessoDrawer'

type Props = { open: boolean; nome: string; celular: string; onCancel: () => void; onReativar: () => Promise<ReativacaoResultado>; onReativado: (r: ReativacaoResultado) => void }
type Estado = { fase: 'confirmar' } | { fase: 'enviando' } | { fase: 'erro'; codigo: string; mensagem: string; etapas: Etapa[] } | { fase: 'resultado'; r: ReativacaoResultado }

/** Confirmação e, depois, a senha nova com envio pelo WhatsApp (a senha só aparece aqui). */
export function ReativarAcessoDialog({ open, nome, celular, onCancel, onReativar, onReativado }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'confirmar' })
  const [fechando, setFechando] = useState(false)

  useEffect(() => { if (open) { setEstado({ fase: 'confirmar' }); setFechando(false) } }, [open])

  const enviando = estado.fase === 'enviando'
  const waHref = estado.fase === 'resultado' ? whatsappComMensagem(celular, mensagemWhatsApp({ nome, ...estado.r })) : null

  async function reativar() {
    setEstado({ fase: 'enviando' })
    try {
      const r = await onReativar()
      setEstado({ fase: 'resultado', r }); onReativado(r)
    } catch (reason) {
      const erro = parseAcessoError(reason)
      setEstado({ fase: 'erro', codigo: erro.codigo, mensagem: erro.message, etapas: erro.etapas })
    }
  }

  function fechar() {
    if (enviando) return
    if (estado.fase === 'resultado' && estado.r.senhaTemporaria) { setFechando(true); return }
    onCancel()
  }

  return (
    <>
      <Dialog open={open} onClose={fechar} title={estado.fase === 'resultado' ? 'Acesso reativado' : `Reativar acesso de ${nome}?`}
        actions={estado.fase === 'resultado'
          ? <>{waHref && <a className={buttonClassName({ variant: 'primary' })} href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden /> Enviar no WhatsApp</a>}<Button variant="secondary" onClick={fechar}>Fechar</Button></>
          : <><Button variant="secondary" onClick={fechar} disabled={enviando}>Cancelar</Button><Button loading={enviando} disabled={enviando} onClick={() => void reativar()}>{estado.fase === 'erro' ? 'Tentar de novo' : 'Reativar acesso'}</Button></>}>
        {estado.fase === 'resultado' ? (
          <div className="acesso-resultado">
            {liberacaoPendente(estado.r.etapas)
              ? <Alert tone="info" title="Acesso reativado, liberando no app">A senha nova já vale. O app libera em instantes — se o motorista não conseguir entrar, use "Concluir liberação" na ficha.</Alert>
              : <Alert tone="success" title="Senha nova">A senha aparece só agora. Envie para o motorista antes de fechar.</Alert>}
            <CredenciaisAcesso r={estado.r} semSenha="Senha não redefinida" />
            <ListaEtapas etapas={estado.r.etapas} fluxo="reativar" />
          </div>
        ) : enviando ? <ProgressoAcesso fluxo="reativar" /> : (
          <>
            <ul>
              <li>A conta Microsoft é desbloqueada e recebe uma senha nova.</li>
              <li>Volta ao grupo de motoristas e recebe a licença, se faltar.</li>
              <li>O cadastro do funcionário não muda.</li>
            </ul>
            {estado.fase === 'erro' && (
              <Alert {...(estado.codigo === 'SEM_PERMISSAO_SENHA' ? { tone: 'warning', title: 'Conta reativada sem senha nova' } : { tone: 'danger', title: 'Não foi possível reativar' })}>
                {estado.mensagem}{estado.codigo !== 'SEM_PERMISSAO_SENHA' && ' O que já foi feito fica guardado; "Tentar de novo" continua de onde parou.'}
                <ListaEtapas etapas={estado.etapas} fluxo="reativar" />
              </Alert>
            )}
          </>
        )}
      </Dialog>
      <FecharSemEnviarDialog open={fechando} onVoltar={() => setFechando(false)} onFechar={() => { setFechando(false); onCancel() }} />
    </>
  )
}
