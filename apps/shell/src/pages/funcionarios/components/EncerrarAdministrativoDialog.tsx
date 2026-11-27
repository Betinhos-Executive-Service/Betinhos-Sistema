import { useState } from 'react'
import { Button, Dialog, Field, Input } from '@betinhos/ui'
import { normalizeSearch } from '../data/format'
import { parseAcessoError } from '../data/acesso'

type Props = {
  open: boolean
  nome: string
  /** O que a pessoa perde, já em texto (perfis, acesso amplo, equipes). */
  perdas: string[]
  onClose: () => void
  /** Rejeita com o erro do servidor; só `CONFIRMACAO_INVALIDA` mantém o diálogo aberto (quem chama fecha nas outras recusas). */
  onConfirmar: (confirmacao: string) => Promise<void>
}

const simples = (s: string) => normalizeSearch(s.trim())

/** Confirmação do encerramento de um administrativo: o que se perde e o primeiro nome digitado. Durante a gravação não fecha. */
export function EncerrarAdministrativoDialog({ open, nome, perdas, onClose, onConfirmar }: Props) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [descartando, setDescartando] = useState(false)
  const primeiro = nome.trim().split(/\s+/)[0] ?? ''
  const confere = primeiro.length > 0 && simples(texto) === simples(primeiro)

  const fechar = () => {
    if (enviando) return
    if (texto.trim()) setDescartando(true)
    else onClose()
  }

  async function confirmar() {
    setEnviando(true); setErro(null)
    try { await onConfirmar(texto.trim()) } catch (reason) {
      const e = parseAcessoError(reason)
      if (e.codigo === 'CONFIRMACAO_INVALIDA') setErro(e.message)
    } finally { setEnviando(false) }
  }

  return (
    <>
      <Dialog open={open} onClose={fechar} title={`Encerrar acesso de ${nome}?`} tone="danger"
        actions={<>
          <Button variant="secondary" onClick={fechar} disabled={enviando}>Cancelar</Button>
          <Button variant="danger" loading={enviando} disabled={!confere || enviando} onClick={() => void confirmar()}>Encerrar acesso</Button>
        </>}>
        <p>{primeiro} perde tudo isto e a conta no sistema é bloqueada:</p>
        <ul>{perdas.map((p) => <li key={p}>{p}</li>)}</ul>
        <Field label={`Digite o primeiro nome (${primeiro}) para confirmar`} error={erro ?? undefined}>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} autoComplete="off" autoFocus />
        </Field>
      </Dialog>
      {descartando ? (
        <Dialog open onClose={() => setDescartando(false)} title="Descartar alterações?"
          actions={<>
            <Button variant="secondary" onClick={() => setDescartando(false)}>Continuar editando</Button>
            <Button variant="danger" onClick={() => { setDescartando(false); onClose() }}>Descartar</Button>
          </>}>
          O nome digitado ainda não foi confirmado.
        </Dialog>
      ) : null}
    </>
  )
}
