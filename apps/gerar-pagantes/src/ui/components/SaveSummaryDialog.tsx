import { Alert, Button, Dialog, StatusBadge } from '@betinhos-executive-service/ui'
import { PAYMENT_METHODS, type Payer } from '../../domain'
import { formatCurrency } from '../../money'
import type { DraftChanges } from '../../payerDraft'

const methodLabel = (payer: Pick<Payer, 'paymentMethod'>) => PAYMENT_METHODS.find((method) => method.value === payer.paymentMethod)?.label ?? ''
const charge = (payer: Pick<Payer, 'amountCents' | 'paymentMethod'>) => `${formatCurrency(payer.amountCents)} · ${methodLabel(payer)}`

export function SaveSummaryDialog({ open, changes, emailCount, differenceCents, saving, onReview, onConfirm }: {
  open: boolean
  changes: DraftChanges
  emailCount: number
  differenceCents: number
  saving: boolean
  onReview: () => void
  onConfirm: () => void
}) {
  const cancelledLinks = changes.removed.filter((payer) => payer.paymentUrl).length + changes.edited.filter(({ before, after }) => before.paymentUrl && (before.amountCents !== after.amountCents || before.paymentMethod !== after.paymentMethod || !after.generateLink)).length
  return <Dialog open={open} onClose={saving ? () => undefined : onReview} title="Confirmar alterações"
    actions={<><Button variant="secondary" disabled={saving} onClick={onReview}>Revisar</Button><Button variant="primary" loading={saving} onClick={onConfirm}>{saving ? 'Salvando...' : 'Confirmar e salvar'}</Button></>}>
    <p className="save-summary__lead">Confira o que muda nesta OP antes de salvar.</p>
    <ul className="save-summary__list" aria-label="Alterações">
      {changes.added.map((payer) => <li key={`a-${payer.key}`}><StatusBadge tone="info">Novo</StatusBadge><strong>{payer.name}</strong><span>{charge(payer)}</span></li>)}
      {changes.edited.map(({ before, after }) => <li key={`e-${after.key}`}><StatusBadge tone="warning">Alterado</StatusBadge><strong>{after.name}</strong><span>{charge(before) === charge(after) ? `Envio para ${after.recipientName}` : `${charge(before)} → ${charge(after)}`}</span></li>)}
      {changes.resent.map((payer) => <li key={`s-${payer.key}`}><StatusBadge tone="info">Reenvio</StatusBadge><strong>{payer.name}</strong><span>E-mail com o link atual para {payer.recipientName}</span></li>)}
      {changes.removed.map((payer) => <li key={`r-${payer.key}`}><StatusBadge tone="danger">Removido</StatusBadge><strong>{payer.name}</strong><span>{charge(payer)}</span></li>)}
    </ul>
    <div className="save-summary__effects">
      {cancelledLinks ? <p>{cancelledLinks} {cancelledLinks === 1 ? 'link atual será cancelado' : 'links atuais serão cancelados'}.</p> : null}
      {emailCount ? <p>{emailCount} {emailCount === 1 ? 'e-mail de cobrança será enviado' : 'e-mails de cobrança serão enviados'}.</p> : null}
    </div>
    {differenceCents ? <Alert tone="warning">O rateio {differenceCents > 0 ? `fica ${formatCurrency(differenceCents)} abaixo` : `excede em ${formatCurrency(-differenceCents)}`} do valor da OP.</Alert> : null}
  </Dialog>
}
