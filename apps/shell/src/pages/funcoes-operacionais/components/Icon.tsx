import { AlertTriangle, ArrowLeftRight, Building2, Calendar, Check, ChevronDown, Copy, Plus, RefreshCw, Search, User, Users, X, type LucideIcon } from 'lucide-react'

// Ícones da tela (Lucide, como o resto do shell); a classe `ui-icon` mantém os ajustes de tamanho do CSS da tela.
export type IconName = 'refresh' | 'users' | 'user' | 'copy' | 'swap' | 'alert' | 'check' | 'close' | 'search' | 'calendar' | 'building' | 'chevron' | 'plus'

const ICONS: Record<IconName, LucideIcon> = {
  refresh: RefreshCw, users: Users, user: User, copy: Copy, swap: ArrowLeftRight, alert: AlertTriangle, check: Check,
  close: X, search: Search, calendar: Calendar, building: Building2, chevron: ChevronDown, plus: Plus,
}

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const Component = ICONS[name]
  return <Component className={`ui-icon ${className}`.trim()} size={16} aria-hidden="true" />
}
