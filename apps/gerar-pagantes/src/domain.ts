export type Guid = string

export const PAYMENT_METHODS = [
  { value: 202410000, label: 'Cartão de crédito' },
  { value: 202410001, label: 'Pedido de compra' },
  { value: 202410002, label: 'Pix' }
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export type LinkStatus = 'NotApplicable' | 'Generated' | 'Pending' | 'Failed' | 'Indeterminate'
export type EmailStatus = 'NotApplicable' | 'Pending' | 'Sent' | 'Failed'

export interface Person {
  id: Guid
  name: string
  email: string
  phone: string
  role: 'Solicitante' | 'Passageiro' | 'Adicionado'
}

export interface PersonSearchPage {
  people: Person[]
  nextLink?: string
}

export type PersonSearch = (query: string, nextLink?: string) => Promise<PersonSearchPage>

export type PersonEmailUpdate = (person: Person, email: string) => Promise<void>

export const EMAIL_MAX_LENGTH = 1000
export const RECEIPT_EMAIL_MAX_LENGTH = 320
export const emailValid = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim())

export interface Payer extends Person {
  existingPayerId?: Guid
  paymentStatus?: string
  amountCents: number
  paymentMethod: PaymentMethod
  generateLink: boolean
  sendEmail: boolean
  recipientId?: Guid
  recipientName?: string
  recipientEmail?: string
  paymentUrl?: string
  linkStatus: LinkStatus
  emailStatus: EmailStatus
  linkError?: string
  emailError?: string
}

export interface OperationData {
  id: Guid
  displayId: string
  version: string
  serviceCount: number
  serviceStartDate: string | null
  serviceEndDate: string | null
  totalCents: number
  statusLabel: string
  stateCode: number
  ownerId?: Guid
  people: Person[]
  directory: Person[]
  payers: Payer[]
}

export interface SubmitRequest {
  requestId: Guid
  expectedFinanceiroVersion: string
  financeiroDisplayId: string
  totalCents: number
  allowTotalMismatch: boolean
  replaceExisting?: boolean
  serviceStartDate?: string | null
  serviceEndDate?: string | null
  pagantes: Array<{
    paganteId: Guid
    existingPaganteId?: Guid
    name: string
    email: string
    recipientId?: Guid
    recipientName?: string
    recipientEmail?: string
    amountCents: number
    paymentMethod: PaymentMethod
    generateLink: boolean
    sendEmail: boolean
    resendEmail?: boolean
    receiptToRecipient: boolean
  }>
}

export interface SubmitResult {
  success: boolean
  requestId: Guid
  financeiroId: Guid
  totalCents: number
  results: Array<{
    paganteId: Guid
    pagantesRecordId: Guid
    linkStatus: LinkStatus
    emailStatus: EmailStatus
    paymentUrl?: string
  }>
  errors: Array<{ code: string; message: string; paganteId?: Guid }>
}
