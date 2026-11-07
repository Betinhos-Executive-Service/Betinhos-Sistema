import { Button, PageHeader, StatusBadge } from '@betinhos-executive-service/ui'
import { RefreshCw, X } from 'lucide-react'

export function OperationHeader({ editing = false, displayId, serviceCount, balanced, onRefresh, onClose }: { editing?: boolean; displayId: string; serviceCount: number; balanced: boolean; onRefresh: () => void; onClose?: () => void }) {
  return <PageHeader
    eyebrow={editing ? 'EDITAR PAGANTES' : 'GERAR PAGANTES'}
    title={`Rateio da ${displayId}`}
    meta={<StatusBadge tone={balanced ? 'success' : 'warning'} dot>{balanced ? 'Rateio conferido' : 'Revisar rateio'}</StatusBadge>}
    description={`${serviceCount} ${serviceCount === 1 ? 'serviço vinculado' : 'serviços vinculados'}`}
    actions={<>
      <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dados" onClick={onRefresh} />
      {onClose ? <Button variant="secondary" icon={<X size={18} />} aria-label="Fechar" onClick={onClose} /> : null}
    </>} />
}
