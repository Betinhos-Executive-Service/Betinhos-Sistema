import { StatusBadge as DsStatusBadge, type StatusTone } from '@betinhos/ui'
import { AlertTriangle, Cake, FileSignature, IdCard, Stethoscope } from 'lucide-react'
import type { Alerta, AlertLevel } from '../data/alerts'
import { initials } from '../data/format'

const STATUS_TONE: Record<number, StatusTone> = { 0: 'success', 2: 'warning', 1: 'neutral' }
const STATUS_LABEL: Record<number, string> = { 0: 'Ativo', 2: 'Afastado', 1: 'Desligado' }

export function StatusBadge({ value }: { value: unknown }) {
  if (typeof value !== 'number') return null
  return <DsStatusBadge tone={STATUS_TONE[value] ?? 'neutral'} dot>{STATUS_LABEL[value] ?? value}</DsStatusBadge>
}

const ALERT_ICON = { cnh: IdCard, aso: Stethoscope, aniversario: Cake }
// Cinco estados do Design System: vencido e crítico em danger, atenção em warning, aniversário em info.
const ALERT_TONE: Record<AlertLevel, StatusTone> = { vencido: 'danger', critico: 'danger', atencao: 'warning', info: 'info' }

/** `text`: rótulo visível mais curto (ex.: em coluna estreita); a dica e o leitor de tela continuam com o rótulo completo. */
export function AlertBadge({ alerta, compact = false, text }: { alerta: Alerta; compact?: boolean; text?: string }) {
  const Icon = alerta.level === 'vencido' ? AlertTriangle : ALERT_ICON[alerta.kind]
  return (
    <DsStatusBadge tone={ALERT_TONE[alerta.level]} icon={<Icon />} title={alerta.label}>
      {compact ? <span className="sr-only">{alerta.label}</span> : text && text !== alerta.label ? <><span aria-hidden="true">{text}</span><span className="sr-only">{alerta.label}</span></> : alerta.label}
    </DsStatusBadge>
  )
}

/** Selo de aditivo de assinatura eletrônica registrado (sucesso, com ícone; não depende só da cor). */
export function AditivoBadge({ text }: { text: string }) {
  return <DsStatusBadge tone="success" icon={<FileSignature />}>{text}</DsStatusBadge>
}

/** Motorista sem acesso ao app (sem e-mail Microsoft ou usuário habilitado): selo neutro e discreto. */
export function SemAppBadge() {
  return <DsStatusBadge tone="neutral" title="Motorista sem acesso ao app">Sem app</DsStatusBadge>
}

/** Avatar do Design System (`bt-avatar`) com foto ou iniciais, no tamanho pedido. */
export function Avatar({ name, src, size = 36 }: { name: string; src: string | null; size?: number }) {
  return (
    <span className="bt-avatar" aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {src ? <img src={src} alt="" width={size} height={size} /> : initials(name)}
    </span>
  )
}

/** Selo do ambiente quando não é produção: DEV em atenção, MOCK em informação. */
export function EnvBadge({ env }: { env: string }) {
  if (env === 'PROD') return null
  return <DsStatusBadge tone={env === 'MOCK' ? 'info' : 'warning'} dot>{env}</DsStatusBadge>
}
