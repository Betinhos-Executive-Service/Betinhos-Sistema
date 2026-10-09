import { useEffect, useRef, useState } from 'react'
import { Bookmark, BookmarkPlus, Link2, Pencil, Save, Trash2 } from 'lucide-react'
import { Button, Dialog, Field, Input, Menu } from '@betinhos/ui'
import type { View } from '../domain/types'

export const VIEW_NAME_MAX = 100

type Props = {
  view: View | null
  mobile: boolean
  /** Cada ação devolve `true` quando deu certo (o diálogo fecha) e `false` quando falhou (fica aberto; o aviso é de quem chamou). */
  onSaveAs: (name: string) => Promise<boolean>
  onSave: () => Promise<boolean>
  onRename: (name: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onShare: () => void
}

type Mode = 'create' | 'rename' | 'delete' | null

/** Ações da visão: criar uma visão pessoal a partir da tela, regravar, renomear, excluir e copiar o link. */
export function ViewMenu({ view, mobile, onSaveAs, onSave, onRename, onDelete, onShare }: Props) {
  const [mode, setMode] = useState<Mode>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const personal = view?.grupo === 'minhas'
  const inputRef = useRef<HTMLInputElement>(null)
  // Mantém o nome da visão para o texto do diálogo não esvaziar durante o fechamento.
  const lastName = useRef('')
  if (view) lastName.current = view.nome

  useEffect(() => {
    if (mode === 'create' || mode === 'rename') window.setTimeout(() => inputRef.current?.select(), 0)
  }, [mode])

  const open = (next: Exclude<Mode, null>) => {
    setName(next === 'rename' ? view?.nome ?? '' : '')
    setMode(next)
  }
  const close = () => { if (!busy) setMode(null) }
  const run = async (action: () => Promise<boolean>, closeAfter = true) => {
    setBusy(true)
    try { if ((await action()) && closeAfter) setMode(null) } finally { setBusy(false) }
  }
  const trimmed = name.trim()
  const submitName = () => {
    if (!trimmed || busy) return
    void run(() => (mode === 'rename' ? onRename(trimmed) : onSaveAs(trimmed)))
  }

  return (
    <>
      <Menu
        align="start"
        trigger={(props) => <Button {...props} variant="secondary" size={mobile ? 'touch' : 'compact'} icon={<Bookmark size={16} />} aria-label="Opções da visão" title="Opções da visão" disabled={!view} />}
        actions={[
          { id: 'salvar-como', label: 'Salvar como visão…', icon: <BookmarkPlus size={16} />, onSelect: () => open('create') },
          ...(personal ? [
            { id: 'salvar', label: 'Salvar nesta visão', icon: <Save size={16} />, onSelect: () => { void run(onSave, false) } },
            { id: 'renomear', label: 'Renomear…', icon: <Pencil size={16} />, onSelect: () => open('rename') },
            { id: 'excluir', label: 'Excluir visão', icon: <Trash2 size={16} />, tone: 'danger' as const, onSelect: () => open('delete') },
          ] : []),
          { id: 'compartilhar', label: 'Compartilhar link', icon: <Link2 size={16} />, onSelect: onShare },
        ]}
      />
      <Dialog
        open={mode === 'create' || mode === 'rename'}
        onClose={close}
        title={mode === 'rename' ? 'Renomear visão' : 'Salvar como visão'}
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={close}>Cancelar</Button>
          <Button loading={busy} disabled={!trimmed} onClick={submitName}>{mode === 'rename' ? 'Renomear' : 'Salvar visão'}</Button>
        </>}
      >
        <div className="gr-dialog">
          {mode === 'create' ? <p>A visão guarda as colunas, a ordem, as larguras, a ordenação e os filtros que estão na tela. Fica só para você.</p> : null}
          <Field label="Nome da visão" required>
            <Input ref={inputRef} value={name} maxLength={VIEW_NAME_MAX} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submitName() } }} />
          </Field>
        </div>
      </Dialog>
      <Dialog
        open={mode === 'delete'}
        onClose={close}
        tone="danger"
        title="Excluir esta visão?"
        actions={<>
          <Button variant="secondary" disabled={busy} onClick={close}>Manter visão</Button>
          <Button variant="danger" loading={busy} onClick={() => { void run(onDelete) }}>Excluir visão</Button>
        </>}
      >
        <div className="gr-dialog">
          <p>A visão “{lastName.current}” será excluída do Dataverse e não pode ser recuperada. Os serviços não são afetados.</p>
        </div>
      </Dialog>
    </>
  )
}
