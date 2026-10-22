import { Alert, Button, Dialog, Field, Input } from '@betinhos/ui'
import { useEffect, useState } from 'react'
import { parseAcessoError } from '../data/acesso'

type Props = { open: boolean; nome: string; onCancel: () => void; onConfirmar: (confirmacao: string) => Promise<void> }
const simples = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Dupla confirmação: aviso do que acontece e, depois, digitar o primeiro nome. */
export function EncerrarAcessoDialog({ open, nome, onCancel, onConfirmar }: Props) {
  const [etapa, setEtapa] = useState<1 | 2>(1)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<{ codigo: string; mensagem: string } | null>(null)
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  const confere = primeiro.length > 0 && simples(texto) === simples(primeiro)

  useEffect(() => { if (open) { setEtapa(1); setTexto(''); setErro(null); setEnviando(false) } }, [open])

  async function confirmar() {
    setEnviando(true); setErro(null)
    try { await onConfirmar(texto.trim()) } catch (reason) { const e = parseAcessoError(reason); setErro({ codigo: e.codigo, mensagem: e.message }) } finally { setEnviando(false) }
  }

  const fechar = () => { if (!enviando) onCancel() }

  return (
    <Dialog open={open} onClose={fechar} title={`Encerrar acesso de ${nome}?`} tone="danger"
      actions={etapa === 1
        ? <><Button variant="secondary" onClick={fechar}>Cancelar</Button><Button variant="danger" onClick={() => setEtapa(2)}>Continuar</Button></>
        : <><Button variant="secondary" onClick={fechar} disabled={enviando}>Cancelar</Button><Button variant="danger" loading={enviando} disabled={!confere || enviando} onClick={() => void confirmar()}>Encerrar agora</Button></>}>
      {etapa === 1 ? (
        <ul>
          <li>Sai do grupo de motoristas e perde a licença.</li>
          <li>A conta Microsoft é bloqueada (não excluída).</li>
          <li>O funcionário fica inativo com a data de hoje como demissão.</li>
          <li>Nenhum registro é excluído.</li>
        </ul>
      ) : (
        <>
          <Field label={`Digite o primeiro nome (${primeiro}) para confirmar`} error={erro?.codigo === 'CONFIRMACAO_INVALIDA' ? erro.mensagem : undefined}>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} autoComplete="off" autoFocus />
          </Field>
          {erro && erro.codigo !== 'CONFIRMACAO_INVALIDA' && <Alert tone="danger" title="Não foi possível encerrar">{erro.mensagem}</Alert>}
        </>
      )}
    </Dialog>
  )
}
