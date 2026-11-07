import { emailValid, type Guid, type Payer, type PaymentMethod, type Person, type SubmitRequest } from './domain'
import { splitEvenly } from './money'

const CARD: PaymentMethod = 202410000
const guidValid = (value?: string) => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))

export interface PayerDraft extends Payer {
  /** Chave estável da linha: registro gravado ou pessoa. */
  key: string
  /** Valor digitado ou já gravado; não entra na divisão automática. */
  amountLocked: boolean
  /** Registro gravado marcado para remoção (desfeito até salvar). */
  removed: boolean
  /** Reenviar o e-mail mesmo sem alteração. */
  resendEmail: boolean
  /** Pago ou Autorizado: somente leitura. */
  settled: boolean
  /** Destinatário diferente do pagante também recebe o recibo. */
  receiptToRecipient: boolean
}

export interface DraftState {
  drafts: PayerDraft[]
  /** E-mails a gravar no cadastro da pessoa antes de salvar (pessoa → e-mail). */
  pendingEmails: Record<Guid, string>
}

export const isSettledStatus = (status?: string) => /^(pago|autorizado)$/i.test(status?.trim() ?? '')
export const isCard = (method: number) => method === CARD
export const activeDrafts = (drafts: PayerDraft[]) => drafts.filter((draft) => !draft.removed)

/** Sem id e com e-mail: digitado sem cadastro. Sem nada: o próprio pagante. */
const recipientIdOf = (payer: Payer) => payer.recipientId ?? (payer.recipientEmail ? undefined : payer.id)
export const recipientIsOther = (draft: PayerDraft) => draft.recipientId !== draft.id
export const recipientLabel = (draft: PayerDraft) => draft.recipientName ?? draft.recipientEmail ?? ''
export const needsRecipient = (draft: PayerDraft) => !draft.settled && draft.generateLink && (draft.sendEmail || (recipientIsOther(draft) && draft.receiptToRecipient))

export function draftFromPayer(payer: Payer): PayerDraft {
  const recipientId = recipientIdOf(payer)
  return {
    ...payer,
    recipientId,
    recipientName: payer.recipientName ?? (recipientId ? payer.name : undefined),
    recipientEmail: payer.recipientEmail ?? payer.email,
    receiptToRecipient: true,
    key: payer.existingPayerId ?? payer.id,
    amountLocked: true,
    removed: false,
    resendEmail: false,
    settled: isSettledStatus(payer.paymentStatus)
  }
}

export function draftFromPerson(person: Person): PayerDraft {
  return {
    ...person,
    key: person.id,
    amountCents: 0,
    paymentMethod: CARD,
    generateLink: true,
    sendEmail: emailValid(person.email),
    recipientId: person.id,
    recipientName: person.name,
    recipientEmail: person.email,
    receiptToRecipient: true,
    linkStatus: 'NotApplicable',
    emailStatus: 'NotApplicable',
    amountLocked: false,
    removed: false,
    resendEmail: false,
    settled: false
  }
}

/** Valores travados e pagos ficam como estão; o saldo é dividido entre os demais. */
export function distribute(drafts: PayerDraft[], totalCents: number): PayerDraft[] {
  const active = activeDrafts(drafts)
  const free = active.filter((draft) => !draft.amountLocked && !draft.settled)
  if (!free.length) return drafts
  const fixed = active.filter((draft) => draft.amountLocked || draft.settled).reduce((sum, draft) => sum + draft.amountCents, 0)
  const shares = splitEvenly(Math.max(0, totalCents - fixed), free.map((draft) => draft.key))
  return drafts.map((draft) => shares.has(draft.key) ? { ...draft, amountCents: shares.get(draft.key) ?? 0 } : draft)
}

export function initialState(payers: Payer[], people: Person[], totalCents: number): DraftState {
  if (payers.length) return { drafts: payers.map(draftFromPayer), pendingEmails: {} }
  // OP com um único solicitante já abre com ele pagando o total.
  const requesters = people.filter((person) => person.role === 'Solicitante')
  const drafts = requesters.length === 1 ? distribute([draftFromPerson(requesters[0])], totalCents) : []
  return { drafts, pendingEmails: {} }
}

export type DraftAction =
  | { type: 'reset'; state: DraftState }
  | { type: 'add'; person: Person; saved?: Payer; totalCents: number }
  | { type: 'remove'; key: string; totalCents: number }
  | { type: 'undoRemove'; key: string; totalCents: number }
  | { type: 'setAmount'; key: string; amountCents: number; totalCents: number }
  | { type: 'splitEvenly'; totalCents: number }
  | { type: 'setMethod'; key: string; paymentMethod: PaymentMethod }
  | { type: 'setLink'; key: string; generateLink: boolean }
  | { type: 'setEmail'; key: string; sendEmail: boolean }
  | { type: 'setRecipient'; key: string; person: Person }
  | { type: 'setRecipientEmail'; key: string; email: string }
  | { type: 'setReceipt'; key: string; receiptToRecipient: boolean }
  | { type: 'setPersonEmail'; personId: Guid; email: string }
  | { type: 'toggleResend'; key: string }

function patch(drafts: PayerDraft[], key: string, change: Partial<PayerDraft>) {
  return drafts.map((draft) => draft.key === key && !draft.settled ? { ...draft, ...change } : draft)
}

// Trocar destinatário de cobrança já enviada exige reenvio para o novo endereço.
function resendAfterRecipientChange(drafts: PayerDraft[], key: string) {
  const target = drafts.find((draft) => draft.key === key)
  return Boolean(target?.resendEmail) || Boolean(target?.existingPayerId && target.emailStatus === 'Sent')
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  const { drafts } = state
  switch (action.type) {
    case 'reset': return action.state
    case 'add': {
      const existing = drafts.find((draft) => draft.id === action.person.id)
      if (existing && !existing.removed) return state
      if (existing) return { ...state, drafts: distribute(patch(drafts, existing.key, { removed: false }), action.totalCents) }
      const draft = action.saved ? draftFromPayer(action.saved) : draftFromPerson(action.person)
      return { ...state, drafts: distribute([...drafts, draft], action.totalCents) }
    }
    case 'remove': {
      const target = drafts.find((draft) => draft.key === action.key)
      if (!target || target.settled) return state
      const next = target.existingPayerId ? patch(drafts, action.key, { removed: true }) : drafts.filter((draft) => draft.key !== action.key)
      return { ...state, drafts: distribute(next, action.totalCents) }
    }
    case 'undoRemove': return { ...state, drafts: distribute(patch(drafts, action.key, { removed: false }), action.totalCents) }
    case 'setAmount': return { ...state, drafts: distribute(patch(drafts, action.key, { amountCents: action.amountCents, amountLocked: true }), action.totalCents) }
    case 'splitEvenly': return { ...state, drafts: distribute(drafts.map((draft) => draft.settled ? draft : { ...draft, amountLocked: false }), action.totalCents) }
    case 'setMethod': {
      const card = isCard(action.paymentMethod)
      return { ...state, drafts: drafts.map((draft) => draft.key === action.key && !draft.settled ? { ...draft, paymentMethod: action.paymentMethod, generateLink: card && draft.generateLink, sendEmail: card && draft.sendEmail } : draft) }
    }
    case 'setLink': return { ...state, drafts: drafts.map((draft) => draft.key === action.key && !draft.settled ? { ...draft, generateLink: action.generateLink, sendEmail: action.generateLink && draft.sendEmail } : draft) }
    case 'setEmail': return { ...state, drafts: patch(drafts, action.key, { sendEmail: action.sendEmail }) }
    case 'setRecipient': {
      const email = state.pendingEmails[action.person.id] ?? action.person.email
      return { ...state, drafts: patch(drafts, action.key, { recipientId: action.person.id, recipientName: action.person.name, recipientEmail: email, resendEmail: resendAfterRecipientChange(drafts, action.key) }) }
    }
    case 'setRecipientEmail': return { ...state, drafts: patch(drafts, action.key, { recipientId: undefined, recipientName: undefined, recipientEmail: action.email.trim(), resendEmail: resendAfterRecipientChange(drafts, action.key) }) }
    case 'setReceipt': return { ...state, drafts: patch(drafts, action.key, { receiptToRecipient: action.receiptToRecipient }) }
    case 'setPersonEmail': {
      const email = action.email.trim()
      return {
        pendingEmails: { ...state.pendingEmails, [action.personId]: email },
        drafts: drafts.map((draft) => ({
          ...draft,
          email: draft.id === action.personId ? email : draft.email,
          recipientEmail: draft.recipientId === action.personId ? email : draft.recipientEmail
        }))
      }
    }
    case 'toggleResend': return { ...state, drafts: patch(drafts, action.key, { resendEmail: !drafts.find((draft) => draft.key === action.key)?.resendEmail }) }
  }
}

export interface DraftValidation {
  rowErrors: Map<string, string[]>
  blocking: boolean
  allocatedCents: number
  differenceCents: number
}

export function validate(drafts: PayerDraft[], totalCents: number): DraftValidation {
  const active = activeDrafts(drafts)
  const rowErrors = new Map<string, string[]>()
  for (const draft of active) {
    const errors: string[] = []
    if (draft.amountCents <= 0) errors.push('Informe um valor maior que zero.')
    const recipientValid = emailValid(draft.recipientEmail ?? '') && (!draft.recipientId || (guidValid(draft.recipientId) && Boolean(draft.recipientName?.trim())))
    if (needsRecipient(draft) && !recipientValid) errors.push('Informe um e-mail válido para o envio.')
    if (errors.length) rowErrors.set(draft.key, errors)
  }
  const allocatedCents = active.reduce((sum, draft) => sum + draft.amountCents, 0)
  return { rowErrors, blocking: active.length === 0 || rowErrors.size > 0, allocatedCents, differenceCents: totalCents - allocatedCents }
}

export interface DraftChanges {
  added: PayerDraft[]
  removed: PayerDraft[]
  edited: Array<{ before: Payer; after: PayerDraft }>
  resent: PayerDraft[]
}

export function diffDrafts(original: Payer[], drafts: PayerDraft[]): DraftChanges {
  const byRecord = new Map(original.filter((payer) => payer.existingPayerId).map((payer) => [payer.existingPayerId, payer]))
  const changed = (before: Payer, after: PayerDraft) =>
    before.amountCents !== after.amountCents || before.paymentMethod !== after.paymentMethod || before.generateLink !== after.generateLink ||
    before.sendEmail !== after.sendEmail || recipientIdOf(before) !== after.recipientId || (before.recipientEmail ?? before.email) !== after.recipientEmail ||
    (recipientIsOther(after) && !after.receiptToRecipient)
  const kept = activeDrafts(drafts).filter((draft) => draft.existingPayerId && byRecord.has(draft.existingPayerId))
  const edited = kept.flatMap((after) => {
    const before = byRecord.get(after.existingPayerId)
    return before && changed(before, after) ? [{ before, after }] : []
  })
  return {
    added: activeDrafts(drafts).filter((draft) => !draft.existingPayerId || !byRecord.has(draft.existingPayerId)),
    removed: drafts.filter((draft) => draft.removed && draft.existingPayerId),
    edited,
    resent: kept.filter((draft) => draft.resendEmail && !edited.some((item) => item.after === draft))
  }
}

export const changeCount = (changes: DraftChanges) => changes.added.length + changes.removed.length + changes.edited.length + changes.resent.length

export function toSubmitPayers(drafts: PayerDraft[]): SubmitRequest['pagantes'] {
  return activeDrafts(drafts).map((draft) => ({
    paganteId: draft.id,
    existingPaganteId: draft.existingPayerId,
    name: draft.name,
    email: draft.email,
    recipientId: draft.recipientId,
    recipientName: draft.recipientName,
    recipientEmail: draft.recipientEmail ?? draft.email,
    amountCents: draft.amountCents,
    paymentMethod: draft.paymentMethod,
    generateLink: draft.generateLink,
    sendEmail: draft.sendEmail,
    resendEmail: (draft.sendEmail && draft.resendEmail) || undefined,
    receiptToRecipient: draft.receiptToRecipient
  }))
}
