import { Alert, Button, Checkbox, Dialog, Field, Input, StatusBadge } from '@betinhos-executive-service/ui'
import { useEffect, useState } from 'react'
import { EMAIL_MAX_LENGTH, emailValid, PAYMENT_METHODS, type Guid, type Payer } from '../../domain'
import { formatCurrency } from '../../money'
import { recipientLabel, type DraftChanges, type MissingEmail } from '../../payerDraft'

const methodLabel = (payer: Pick<Payer, 'paymentMethod'>) => PAYMENT_METHODS.find((method) => method.value === payer.paymentMethod)?.label ?? ''
const charge = (payer: Pick<Payer, 'amountCents' | 'paymentMethod'>) => `${formatCurrency(payer.amountCents)} · ${methodLabel(payer)}`

const emailError = (item: MissingEmail) => item.save && item.email.trim() && (!emailValid(item.email) || item.email.trim().length > EMAIL_MAX_LENGTH)
  ? 'Informe um e-mail válido, como nome@empresa.com.br, ou desmarque.' : undefined

export function SaveSummaryDialog({ open, changes, missingEmails, emailCount, differenceCents, saving, onReview, onConfirm }: {
  open: boolean
  changes: DraftChanges
  /** Pagantes sem e-mail no cadastro no momento em que o resumo abriu. */
  missingEmails: MissingEmail[]
  emailCount: number
  differenceCents: number
  saving: boolean
  onReview: () => void
  /** Recebe os e-mails a gravar no cadastro (pessoa → e-mail). */
  onConfirm: (personEmails: Record<Guid, string>) => void
}) {
  const [emails, setEmails] = useState(missingEmails)
  const [attempted, setAttempted] = useState(false)
  useEffect(() => { if (open) { setEmails(missingEmails); setAttempted(false) } }, [open, missingEmails])
  const update = (personId: Guid, patch: Partial<MissingEmail>) => setEmails((current) => current.map((item) => item.personId === personId ? { ...item, ...patch } : item))
  function confirm() {
    if (emails.some(emailError)) { setAttempted(true); return }
    onConfirm(Object.fromEntries(emails.filter((item) => item.save && item.email.trim()).map((item) => [item.personId, item.email.trim()])))
  }

  const cancelledLinks = changes.removed.filter((payer) => payer.paymentUrl).length + changes.edited.filter(({ before, after }) => before.paymentUrl && (before.amountCents !== after.amountCents || before.paymentMethod !== after.paymentMethod || !after.generateLink)).length
  return <Dialog open={open} onClose={saving ? () => undefined : onReview} title="Confirmar alterações"
    actions={<><Button variant="secondary" disabled={saving} onClick={onReview}>Revisar</Button><Button variant="primary" loading={saving} onClick={confirm}>{saving ? 'Salvando...' : 'Confirmar e salvar'}</Button></>}>
    <p className="save-summary__lead">Confira o que muda nesta OP antes de salvar.</p>
    <ul className="save-summary__list" aria-label="Alterações">
      {changes.added.map((payer) => <li key={`a-${payer.key}`}><StatusBadge tone="info">Novo</StatusBadge><strong>{payer.name}</strong><span>{charge(payer)}</span></li>)}
      {changes.edited.map(({ before, after }) => <li key={`e-${after.key}`}><StatusBadge tone="warning">Alterado</StatusBadge><strong>{after.name}</strong><span>{charge(before) === charge(after) ? `Envio para ${recipientLabel(after)}` : `${charge(before)} → ${charge(after)}`}</span></li>)}
      {changes.resent.map((payer) => <li key={`s-${payer.key}`}><StatusBadge tone="info">Reenvio</StatusBadge><strong>{payer.name}</strong><span>E-mail com o link atual para {recipientLabel(payer)}</span></li>)}
      {changes.removed.map((payer) => <li key={`r-${payer.key}`}><StatusBadge tone="danger">Removido</StatusBadge><strong>{payer.name}</strong><span>{charge(payer)}</span></li>)}
    </ul>
    <div className="save-summary__effects">
      {cancelledLinks ? <p>{cancelledLinks} {cancelledLinks === 1 ? 'link atual será cancelado' : 'links atuais serão cancelados'}.</p> : null}
      {emailCount ? <p>{emailCount} {emailCount === 1 ? 'e-mail de cobrança será enviado' : 'e-mails de cobrança serão enviados'}.</p> : null}
    </div>
    {emails.length ? <section className="save-summary__emails" aria-labelledby="save-summary-emails">
      <h3 id="save-summary-emails">Pagantes sem e-mail no cadastro</h3>
      {emails.map((item) => <div key={item.personId} className="save-summary__email">
        <Field label={`E-mail de ${item.name}`} error={attempted ? emailError(item) : undefined}>
          <Input type="email" inputMode="email" autoComplete="off" size="compact" maxLength={EMAIL_MAX_LENGTH} disabled={saving} placeholder="nome@empresa.com.br" value={item.email}
            onChange={(event) => update(item.personId, { email: event.target.value, save: event.target.value.trim() !== '' })} />
        </Field>
        <Checkbox label={`Gravar no cadastro de ${item.name}`} checked={item.save} disabled={saving || !item.email.trim()} onChange={(event) => update(item.personId, { save: event.currentTarget.checked })} />
      </div>)}
    </section> : null}
    {differenceCents ? <Alert tone="warning">O rateio {differenceCents > 0 ? `fica ${formatCurrency(differenceCents)} abaixo` : `excede em ${formatCurrency(-differenceCents)}`} do valor da OP.</Alert> : null}
  </Dialog>
}
