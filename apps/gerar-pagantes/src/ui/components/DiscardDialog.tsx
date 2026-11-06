import { Button, Dialog } from '@betinhos-executive-service/ui'

export function DiscardDialog({ open, onKeepEditing, onDiscard }: { open: boolean; onKeepEditing: () => void; onDiscard: () => void }) {
  return <Dialog open={open} onClose={onKeepEditing} tone="danger" title="Descartar alterações?"
    actions={<><Button variant="secondary" onClick={onKeepEditing}>Continuar editando</Button><Button variant="danger" onClick={onDiscard}>Descartar</Button></>}>
    As mudanças feitas nesta tela ainda não foram salvas.
  </Dialog>
}
