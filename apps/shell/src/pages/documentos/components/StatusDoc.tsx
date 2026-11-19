// components/StatusDoc.tsx
import { StatusBadge, type StatusTone } from '@betinhos/ui'
import { rotuloPrazo } from '../domain/vencimento'
import { ESTADO_LABEL } from '../domain/pendencias'
import type { EstadoItem } from '../domain/types'

const TOM: Record<EstadoItem, StatusTone> = {
  vencido: 'danger', vence7: 'danger', vence30: 'warning', vence60: 'warning', ok: 'success', semValidade: 'neutral', faltando: 'danger', opcional: 'neutral',
}

export function StatusDoc({ estado, dias }: { estado: EstadoItem; dias: number | null }) {
  const prazo = rotuloPrazo(dias)
  let texto = ESTADO_LABEL[estado]
  if ((estado === 'vencido' || estado === 'vence7' || estado === 'vence30' || estado === 'vence60') && prazo) texto = prazo.charAt(0).toUpperCase() + prazo.slice(1)
  return <StatusBadge tone={TOM[estado]} dot>{texto}</StatusBadge>
}
