import { Button, Dialog } from '@betinhos/ui'
import { formatMoney } from '../../pagantes/domain/messages'
import type { Op } from '../domain/types'

/** Confirma o cancelamento: não há volta pela tela, e os serviços continuam ligados à OP. */
export function CancelDialog({ op, onClose, onConfirm }: { op: Op | null; onClose: () => void; onConfirm: (op: Op) => void }) {
  return (
    <Dialog
      open={op != null}
      onClose={onClose}
      tone="danger"
      title={op ? `Cancelar a ${op.codigo || 'OP'} (${formatMoney(op.valor)})?` : 'Cancelar OP?'}
      actions={<>
        <Button variant="secondary" onClick={onClose}>Manter a OP</Button>
        <Button variant="danger" onClick={() => { if (op) onConfirm(op) }}>Cancelar OP</Button>
      </>}
    >
      A OP deixa de ser cobrada e não volta a ficar aberta por esta tela. Os serviços continuam ligados a ela; para faturar de novo, gere outra OP a partir das reservas.
    </Dialog>
  )
}
