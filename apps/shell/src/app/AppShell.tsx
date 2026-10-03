import type { ReactNode } from 'react'
import { Banknote, Car, Database, Download, FolderCog, Home, Palette, Truck } from 'lucide-react'
import { AppShell as Shell, type NavGroup } from '@betinhos/ui'
import { MENU, itemLabel, type MenuGroup } from '../nav/menu'
import { hrefFor } from '../nav/useHashRoute'
import { useInstallPrompt } from './useInstallPrompt'

type Props = {
  activeId: string
  title: string
  entityLabels: Map<string, string>
  connection: { ok: boolean; text: string }
  children: ReactNode
}

const GROUP_ICONS: Record<string, ReactNode> = {
  inicio: <Home />,
  operacional: <Truck />,
  financeiro: <Banknote />,
  frota: <Car />,
  cadastros: <FolderCog />,
  'back-end': <Database />,
  'design-system': <Palette />,
}

/** Traduz o sitemap do app para a navegação do AppShell do Design System. */
function toNavGroup(group: MenuGroup, entityLabels: Map<string, string>): NavGroup {
  return {
    id: group.id,
    label: group.label,
    icon: GROUP_ICONS[group.id],
    items: group.items.map((item) => ({
      id: item.id,
      label: itemLabel(item, entityLabels),
      href: item.kind === 'external' ? item.url : hrefFor(item.id),
      external: item.kind === 'external',
    })),
  }
}

/** Chrome persistente do Sistema Betinhos: AppShell do pacote alimentado pelo sitemap e pelo estado de conexão. */
export function AppShell({ activeId, title, entityLabels, connection, children }: Props) {
  const install = useInstallPrompt()
  return (
    <Shell
      brand={{ name: 'Betinhos', subtitle: 'Executive Service', href: hrefFor(MENU[0].items[0].id) }}
      groups={MENU.map((group) => toNavGroup(group, entityLabels))}
      activeId={activeId}
      title={title}
      status={{ tone: connection.ok ? 'success' : 'warning', text: connection.text }}
      footer={install ? (
        <button type="button" className="bt-shell__item" onClick={install}>
          <span className="bt-shell__item-icon" aria-hidden="true"><Download /></span>
          <span className="bt-shell__item-label">Instalar app</span>
        </button>
      ) : null}
    >
      {children}
    </Shell>
  )
}
