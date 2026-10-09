import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Dialog } from '@betinhos/ui'

const COPY_FAILED = 'Não foi possível copiar automaticamente. Selecione e copie.'

/** Prévia do bloco de WhatsApp dos serviços marcados, com cópia para a área de transferência. */
export function CopyDialog({ open, text, loading, onClose, onCopied }: { open: boolean; text: string; loading: boolean; onClose: () => void; onCopied: () => void }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [warning, setWarning] = useState<string | null>(null)
  useEffect(() => { if (open) setWarning(null) }, [open])

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível.')
      await navigator.clipboard.writeText(text)
      onCopied()
    } catch {
      // Sem permissão ou sem suporte: deixa o texto selecionado para o Ctrl+C.
      const pre = preRef.current
      if (pre) {
        const range = document.createRange()
        range.selectNodeContents(pre)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
      setWarning(COPY_FAILED)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Copiar serviços"
      actions={<>
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button disabled={loading || text === ''} onClick={() => { void copy() }}>Copiar</Button>
      </>}
    >
      <div className="gr-dialog">
        <pre className="gr-copy" ref={preRef} tabIndex={0} aria-busy={loading}>{loading ? 'Montando o texto…' : text}</pre>
        {warning ? <p role="alert" className="gr-dialog__warn">{warning}</p> : null}
      </div>
    </Dialog>
  )
}

export type StateRequest = { ids: string[]; labels: string[]; active: boolean }

/** Confirma desativar ou ativar os serviços marcados, listando quais são. */
export function StateDialog({ request, busy, onClose, onConfirm }: { request: StateRequest | null; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  // Mantém o último pedido para o conteúdo não esvaziar durante o fechamento.
  const last = useRef<StateRequest | null>(null)
  if (request) last.current = request
  const shown = request ?? last.current
  const count = shown?.ids.length ?? 0
  const noun = count === 1 ? 'serviço' : 'serviços'
  const verb = shown?.active ? 'Ativar' : 'Desativar'
  return (
    <Dialog
      open={request != null}
      onClose={() => { if (!busy) onClose() }}
      tone={shown?.active ? 'neutral' : 'danger'}
      title={`${verb} ${count} ${noun}?`}
      actions={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Manter como está</Button>
        <Button variant={shown?.active ? 'primary' : 'danger'} loading={busy} onClick={onConfirm}>{verb}</Button>
      </>}
    >
      <div className="gr-dialog">
        <p>{shown?.active ? 'Os serviços voltam a aparecer nas visões.' : 'Os serviços saem das visões, mas continuam no Dataverse e podem ser ativados de novo.'}</p>
        <ul className="gr-ids">{shown?.labels.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>
      </div>
    </Dialog>
  )
}

/** Fora do Dataverse não há Formulário Geral: avisa em vez de abrir uma tela vazia. */
export function MockFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Formulário Geral abre no Dataverse" actions={<Button onClick={onClose}>Entendi</Button>}>
      Fora do ambiente não há formulário. Publique com pnpm push e abra o Sistema Betinhos no Dataverse.
    </Dialog>
  )
}

export type OpRequest = { ids: string[]; labels: string[]; excluded: string[] }

/** Confirma a criação de OP; se algum serviço já tem OP, lista os que ficam de fora. */
export function GerarOpDialog({ request, busy, error, onClose, onConfirm }: { request: OpRequest | null; busy: boolean; error: string | null; onClose: () => void; onConfirm: () => void }) {
  const last = useRef<OpRequest | null>(null)
  if (request) last.current = request
  const shown = request ?? last.current
  const count = shown?.ids.length ?? 0
  const partial = (shown?.excluded.length ?? 0) > 0
  return (
    <Dialog
      open={request != null}
      onClose={() => { if (!busy) onClose() }}
      title="Gerar OP"
      actions={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button loading={busy} onClick={onConfirm}>{partial ? 'Sim, continuar' : 'Criar OP'}</Button>
      </>}
    >
      <div className="gr-dialog">
        {partial ? (
          <>
            <p>Serviços com OP existente</p>
            <ul className="gr-ids">{shown?.excluded.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>
            <p>Criar OP para {count} serviço(s) restante(s)?</p>
          </>
        ) : <p>Criar OP para {count} serviço(s)?</p>}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Dialog>
  )
}

export type DispararRequest = { ids: string[] }

/** Confirma marcar os serviços como Programado (dispara o aviso ao motorista). */
export function DispararDialog({ request, busy, onClose, onConfirm }: { request: DispararRequest | null; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const last = useRef<DispararRequest | null>(null)
  if (request) last.current = request
  const count = (request ?? last.current)?.ids.length ?? 0
  return (
    <Dialog
      open={request != null}
      onClose={() => { if (!busy) onClose() }}
      title={`Marcar ${count} serviço(s) como Programado?`}
      actions={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancelar</Button>
        <Button loading={busy} onClick={onConfirm}>Disparar</Button>
      </>}
    >
      <div className="gr-dialog">
        <p>Serviços sem motorista são recusados pelo servidor.</p>
      </div>
    </Dialog>
  )
}
