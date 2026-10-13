// components/ConfigDrawer.tsx (provisório; a Task 10 substitui)
import { Drawer } from '@betinhos/ui'
import type { DocsSource } from '../data/source'
import type { DocsData } from '../domain/types'

export function ConfigDrawer({ onClose }: { source: DocsSource; data: DocsData; onClose: () => void; onChanged: () => void }) {
  return <Drawer open onClose={onClose} title="Configurações de documentos">{null}</Drawer>
}
