// components/StatusDoc.tsx
import { StatusBadge, type StatusTone } from '@betinhos/ui'
import { rotuloPrazo } from '../domain/vencimento'
import type { EstadoItem } from '../domain/types'

export const ESTADO_LABEL: Record<EstadoItem, string> = {
  vencido: 'Vencido', vence7: 'Vence em até 7 dias', vence30: 'Vence em até 30 dias', vence60: 'Vence em até 60 dias',
  ok: 'Em dia', semValidade: 'Sem validade', faltando: 'Faltando', opcional: 'Não enviado',
}
const TOM: Record<EstadoItem, StatusTone> = {
  vencido: 'danger', vence7: 'danger', vence30: 'warning', vence60: 'warning', ok: 'success', semValidade: 'neutral', faltando: 'danger', opcional: 'neutral',
}

export function StatusDoc({ estado, dias }: { estado: EstadoItem; dias: number | null }) {
  const prazo = rotuloPrazo(dias)
  let texto = ESTADO_LABEL[estado]
  if ((estado === 'vencido' || estado === 'vence7' || estado === 'vence30' || estado === 'vence60') && prazo) texto = prazo.charAt(0).toUpperCase() + prazo.slice(1)
  return <StatusBadge tone={TOM[estado]} dot>{texto}</StatusBadge>
}
