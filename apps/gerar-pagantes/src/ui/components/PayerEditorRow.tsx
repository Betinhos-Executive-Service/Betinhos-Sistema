import { Avatar, Button, Cluster, Field, Input, Select, StatusBadge, Switch, Tooltip } from '@betinhos-executive-service/ui'
import { Check, CircleAlert, Copy, Lock, LockOpen, Mail, RotateCcw, Send, Trash2, Undo2, UserRoundPen } from 'lucide-react'
import { memo, useEffect, useState, type FormEvent } from 'react'
import { EMAIL_MAX_LENGTH, emailValid, PAYMENT_METHODS, type Person, type PersonSearch } from '../../domain'
import { formatCurrency, hasValidCurrencyPrecision, parseCurrency } from '../../money'
import { isCard, type DraftAction, type PayerDraft } from '../../payerDraft'
import { PersonSelect } from './PersonSelect'

export type RowChange = 'new' | 'edited' | 'unchanged'
type Dispatch = (action: DraftAction) => void

const methodOptions = PAYMENT_METHODS.map((method) => ({ value: String(method.value), label: method.label }))
const linkText = { Generated: 'Link gerado', Pending: 'Link em processamento', Failed: 'Falha ao gerar link', Indeterminate: 'Link indeterminado', NotApplicable: 'Sem link' } as const
const emailText = { Sent: 'E-mail enviado', Pending: 'E-mail em processamento', Failed: 'Falha no envio do e-mail', NotApplicable: 'E-mail não enviado' } as const

export const PayerEditorRow = memo(function PayerEditorRow({ draft, change, errors, totalCents, people, onSearch, dispatch, onAmountInvalid }: {
  draft: PayerDraft
  change?: RowChange
  errors: string[]
  totalCents: number
  people: Person[]
  onSearch: PersonSearch
  dispatch: Dispatch
  onAmountInvalid: (key: string, invalid: boolean) => void
}) {
  const [amountInput, setAmountInput] = useState(() => formatCurrency(draft.amountCents))
  const [amountError, setAmountError] = useState('')
  const [editingAmount, setEditingAmount] = useState(false)
  const [pickingRecipient, setPickingRecipient] = useState(false)
  const [copied, setCopied] = useState(false)
  const key = draft.key
  const readOnly = draft.settled || draft.removed
  const sendsEmail = draft.generateLink && draft.sendEmail
  const recipientHasEmail = emailValid(draft.recipientEmail ?? '')
  const saved = Boolean(draft.existingPayerId)

  useEffect(() => { if (!editingAmount) setAmountInput(formatCurrency(draft.amountCents)) }, [draft.amountCents, editingAmount])
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), 1800); return () => window.clearTimeout(timer) }, [copied])

  function commitAmount() {
    setEditingAmount(false)
    const cents = parseCurrency(amountInput)
    if (!hasValidCurrencyPrecision(amountInput) || cents === null) { setAmountError('Use um valor em reais com até 2 casas decimais.'); onAmountInvalid(key, true); return }
    setAmountError(''); onAmountInvalid(key, false)
    // Só trava o valor quando ele foi de fato alterado; focar e sair do campo não conta.
    if (cents !== draft.amountCents) dispatch({ type: 'setAmount', key, amountCents: cents, totalCents })
    setAmountInput(formatCurrency(cents))
  }

  async function copyLink() {
    if (!draft.paymentUrl) return
    try { await navigator.clipboard.writeText(draft.paymentUrl); setCopied(true) } catch { window.prompt('Copie o link de pagamento:', draft.paymentUrl) }
  }

  const badge = draft.settled ? <StatusBadge tone="success" icon={<Check size={12} />}>{draft.paymentStatus}</StatusBadge>
    : draft.removed ? <StatusBadge tone="danger">Será removido</StatusBadge>
    : change === 'new' ? <StatusBadge tone="info">Novo</StatusBadge>
    : change === 'edited' ? <StatusBadge tone="warning">Alterado</StatusBadge> : null
  const rowError = errors.join(' ')

  return <article className={`payer-editor ${draft.removed ? 'is-removed' : ''} ${amountError || rowError ? 'has-error' : ''}`} data-payer-key={key} aria-label={`Pagante ${draft.name}`}>
    <header className="payer-editor__head">
      <Avatar name={draft.name} size="sm" />
      <div className="payer-editor__identity">
        <Cluster className="payer-editor__name"><strong>{draft.name}</strong>{badge}</Cluster>
        <small>{draft.role} · {draft.email || 'Sem e-mail no cadastro'}</small>
      </div>
      {draft.settled ? <span className="payer-editor__locked"><Lock size={14} aria-hidden="true" />Pagamento confirmado</span>
        : draft.removed ? <Button variant="secondary" size="compact" icon={<Undo2 size={15} />} onClick={() => dispatch({ type: 'undoRemove', key, totalCents })}>Desfazer</Button>
        : <Button variant="ghost" size="compact" icon={<Trash2 size={16} />} aria-label={`Remover ${draft.name}`} onClick={() => dispatch({ type: 'remove', key, totalCents })} />}
    </header>

    {draft.removed ? <p className="payer-editor__note">Será removido ao salvar{draft.paymentUrl ? ' e o link atual será cancelado' : ''}.</p> : <>
      <div className="payer-editor__fields">
        <Select aria-label={`Forma de cobrança de ${draft.name}`} size="compact" searchable={false} clearable={false} required disabled={readOnly} options={methodOptions} value={String(draft.paymentMethod)}
          onChange={(value) => { if (value) dispatch({ type: 'setMethod', key, paymentMethod: Number(value) as PayerDraft['paymentMethod'] }) }} />
        <Input className="payer-editor__amount" size="compact" inputMode="decimal" disabled={readOnly} invalid={Boolean(amountError)} aria-label={`Valor de ${draft.name}`} value={amountInput}
          suffix={draft.settled ? null : <Tooltip text={draft.amountLocked ? 'Valor fixo: não entra na divisão automática' : 'Dividido automaticamente'}>{draft.amountLocked ? <Lock size={13} aria-hidden="true" /> : <LockOpen size={13} aria-hidden="true" />}</Tooltip>}
          onFocus={(event) => { setEditingAmount(true); event.currentTarget.select() }} onChange={(event) => setAmountInput(event.target.value)} onBlur={commitAmount} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <div className="payer-editor__toggles">
          {isCard(draft.paymentMethod) ? <>
            <Switch label="Link" checked={draft.generateLink} disabled={readOnly} onChange={(event) => dispatch({ type: 'setLink', key, generateLink: event.target.checked })} />
            <Switch label="E-mail" checked={draft.sendEmail} disabled={readOnly || !draft.generateLink} onChange={(event) => dispatch({ type: 'setEmail', key, sendEmail: event.target.checked })} />
            {sendsEmail && !draft.settled && !pickingRecipient ? <RecipientChip draft={draft} onPick={() => setPickingRecipient(true)} /> : null}
          </> : <small>Sem link de pagamento</small>}
        </div>
      </div>

      {sendsEmail && !draft.settled && pickingRecipient ? <div className="payer-editor__picker" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setPickingRecipient(false) } }}>
        <Mail size={15} aria-hidden="true" />
        <PersonSelect size="compact" ariaLabel={`Destinatário do e-mail de ${draft.name}`} placeholder="Para quem vai o e-mail?" suggestions={people} excludedIds={new Set([draft.recipientId ?? ''])} onSearch={onSearch}
          onSelect={(person) => { dispatch({ type: 'setRecipient', key, person }); setPickingRecipient(false) }} />
        <Button variant="ghost" size="compact" onClick={() => setPickingRecipient(false)}>Cancelar</Button>
      </div> : null}
      {sendsEmail && !draft.settled && !pickingRecipient && !recipientHasEmail ? <div className="payer-editor__missing-wrap"><MissingEmail personId={draft.recipientId ?? draft.id} personName={draft.recipientName ?? draft.name} onSave={(personId, email) => dispatch({ type: 'setPersonEmail', personId, email })} /></div> : null}

      {saved ? <div className="payer-editor__status">
        <Cluster>
          <StatusBadge tone={draft.linkStatus === 'Failed' ? 'danger' : draft.linkStatus === 'Generated' ? 'success' : 'neutral'}>{linkText[draft.linkStatus]}</StatusBadge>
          {draft.generateLink ? <StatusBadge tone={draft.emailStatus === 'Failed' ? 'danger' : draft.emailStatus === 'Sent' ? 'success' : 'neutral'}>{emailText[draft.emailStatus]}</StatusBadge> : null}
        </Cluster>
        <Cluster className="payer-editor__actions">
          {draft.paymentUrl ? <Button variant="ghost" size="compact" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyLink()}>{copied ? 'Copiado' : 'Copiar link'}</Button> : null}
          {sendsEmail && draft.paymentUrl && !draft.settled ? <Button variant="ghost" size="compact" aria-pressed={draft.resendEmail} icon={draft.resendEmail ? <RotateCcw size={14} /> : <Send size={14} />} onClick={() => dispatch({ type: 'toggleResend', key })}>{draft.resendEmail ? 'Cancelar reenvio' : 'Reenviar e-mail'}</Button> : null}
        </Cluster>
      </div> : null}
      {draft.linkError || draft.emailError ? <p className="payer-editor__note payer-editor__note--error"><CircleAlert size={14} aria-hidden="true" />{draft.linkError ?? draft.emailError}</p> : null}
      {amountError || errors.length ? <ul className="payer-editor__errors" role="alert">{[...(amountError ? [amountError] : []), ...errors].map((error) => <li key={error}><CircleAlert size={14} aria-hidden="true" />{error}</li>)}</ul> : null}
    </>}
  </article>
})

/**
 * Destinatário do e-mail como chip clicável. Some quando é o próprio pagante
 * (o e-mail já está sob o nome); fica em atenção quando falta e-mail.
 */
function RecipientChip({ draft, onPick }: { draft: PayerDraft; onPick: () => void }) {
  const self = (draft.recipientId ?? draft.id) === draft.id
  const email = draft.recipientEmail ?? ''
  const hasEmail = emailValid(email)
  const label = self ? 'Para o próprio pagante' : `Para ${draft.recipientName}`
  const hint = hasEmail ? email : 'Sem e-mail cadastrado'
  const tone = hasEmail ? (self ? 'neutral' : 'info') : 'warning'
  if (self && hasEmail) {
    return <Tooltip text="Trocar destinatário do e-mail"><Button variant="ghost" size="compact" icon={<UserRoundPen size={15} />} aria-label={`Trocar destinatário do e-mail de ${draft.name}`} onClick={onPick} /></Tooltip>
  }
  return <Tooltip text={`${hint}. Clique para trocar.`}>
    <button type="button" className={`payer-editor__chip payer-editor__chip--${tone}`} onClick={onPick} aria-label={`${label}, ${hint}. Trocar destinatário`}>
      <Mail size={13} aria-hidden="true" /><span>{self ? 'Sem e-mail' : draft.recipientName}</span>
    </button>
  </Tooltip>
}

function MissingEmail({ personId, personName, onSave }: { personId: string; personName: string; onSave: (personId: string, email: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!emailValid(value) || value.trim().length > EMAIL_MAX_LENGTH) { setError('Informe um e-mail válido, como nome@empresa.com.br.'); return }
    onSave(personId, value)
  }
  return <form className="payer-editor__missing" onSubmit={submit} noValidate>
    <Field label={`E-mail de ${personName}`} error={error || undefined} hint={error ? undefined : 'Será gravado no cadastro ao salvar.'}>
      <Input type="email" inputMode="email" autoComplete="off" size="compact" maxLength={EMAIL_MAX_LENGTH} value={value} placeholder="nome@empresa.com.br" onChange={(event) => { setValue(event.target.value); setError('') }} />
    </Field>
    <Button type="submit" variant="secondary" size="compact">Usar e-mail</Button>
  </form>
}
