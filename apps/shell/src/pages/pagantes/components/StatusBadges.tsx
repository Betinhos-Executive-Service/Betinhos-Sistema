import { StatusBadge } from '@betinhos/ui'
import { AlertTriangle } from 'lucide-react'
import { hasFalha, label, reciboTone, statusTone } from '../domain/status'
import type { ChoiceSet, Pagante } from '../domain/types'

export function PagamentoBadge({ p, choices }: { p: Pagante; choices: ChoiceSet }) {
  return <StatusBadge tone={statusTone(p.status)} dot>{label(choices.status, p.status, 'Sem status')}</StatusBadge>
}

export function ReciboBadge({ p, choices }: { p: Pagante; choices: ChoiceSet }) {
  if (p.recibo == null) return <span className="pg-muted">Sem recibo</span>
  return <StatusBadge tone={reciboTone(p.recibo)}>{label(choices.recibo, p.recibo)}</StatusBadge>
}

export function FalhaBadge({ p }: { p: Pagante }) {
  return hasFalha(p) ? <StatusBadge tone="danger" icon={<AlertTriangle size={12} />}>Falha de envio</StatusBadge> : null
}
