import { CalendarOff } from 'lucide-react'
import { Drawer, EmptyState } from '@betinhos/ui'

/** Escala de fim de semana (WebResource) ao lado da lista; em mock só avisa que abre no Dataverse. */
export function EscalaFdsDrawer({ url, open, onClose }: { url: string | null; open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} size="wide" title="Escala fim de semana">
      {url == null
        ? <EmptyState compact icon={<CalendarOff size={24} />} title="Abre dentro do Dataverse">Fora do ambiente não há escala de fim de semana.</EmptyState>
        : open ? <iframe className="gr-frame" title="Escala fim de semana" src={url} /> : null}
    </Drawer>
  )
}
