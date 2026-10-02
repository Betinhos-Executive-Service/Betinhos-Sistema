import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, Download, ExternalLink, Menu as MenuIcon, X } from 'lucide-react'
import { MENU, itemLabel, type MenuGroup, type MenuItem } from '../nav/menu'
import { hrefFor } from '../nav/useHashRoute'
import { useInstallPrompt } from './useInstallPrompt'

type Props = {
  activeId: string
  activeGroupId: string | null
  title: string
  entityLabels: Map<string, string>
  connection: { ok: boolean; text: string }
  children: ReactNode
}

function NavItem({ item, label, active }: { item: MenuItem; label: string; active: boolean }) {
  if (item.kind === 'external') {
    return (
      <a className="nav-item" href={item.url} target="_blank" rel="noreferrer">
        <span className="nav-item__label">{label}</span>
        <ExternalLink size={14} aria-label="abre em nova aba" />
      </a>
    )
  }
  return (
    <a className="nav-item" href={hrefFor(item.id)} aria-current={active ? 'page' : undefined}>
      <span className="nav-item__label">{label}</span>
    </a>
  )
}

function NavGroup({ group, open, onToggle, activeId, entityLabels }: { group: MenuGroup; open: boolean; onToggle: () => void; activeId: string; entityLabels: Map<string, string> }) {
  const panelId = `nav-group-${group.id}`
  return (
    <section className="nav-group">
      <button type="button" className="nav-group__toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span>{group.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <ul id={panelId} className="nav-group__items" hidden={!open}>
        {group.items.map((item) => (
          <li key={item.id}>
            <NavItem item={item} label={itemLabel(item, entityLabels)} active={item.id === activeId} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Chrome persistente: navegação lateral (desktop) ou cabeçalho + gaveta (mobile) e a área da tela. */
export function AppShell({ activeId, activeGroupId, title, entityLabels, connection, children }: Props) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroupId ? [activeGroupId] : []))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const install = useInstallPrompt()

  // Ao navegar, o grupo do item ativo abre e a gaveta mobile fecha.
  useEffect(() => {
    if (activeGroupId) setOpenGroups((current) => (current.has(activeGroupId) ? current : new Set(current).add(activeGroupId)))
    setDrawerOpen(false)
  }, [activeId, activeGroupId])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  function toggle(groupId: string) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (!next.delete(groupId)) next.add(groupId)
      return next
    })
  }

  return (
    <div className="app-shell" data-drawer={drawerOpen ? 'open' : 'closed'}>
      <header className="app-shell__header">
        <button type="button" className="icon-button" aria-label="Abrir menu" aria-expanded={drawerOpen} aria-controls="app-nav" onClick={() => setDrawerOpen(true)}>
          <MenuIcon size={20} aria-hidden="true" />
        </button>
        <span className="app-shell__header-title">{title}</span>
      </header>

      <div className="app-shell__backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <nav id="app-nav" className="app-shell__nav" aria-label="Menu principal">
        <div className="app-shell__brand">
          <span className="app-shell__brand-name">Betinhos</span>
          <span className="app-shell__brand-sub">Executive Service</span>
          <button type="button" className="icon-button icon-button--on-brand app-shell__close" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="app-shell__groups">
          {MENU.map((group) => (
            <NavGroup key={group.id} group={group} open={openGroups.has(group.id)} onToggle={() => toggle(group.id)} activeId={activeId} entityLabels={entityLabels} />
          ))}
        </div>
        {install ? (
          <button type="button" className="nav-item nav-install" onClick={install}>
            <Download size={20} aria-hidden="true" />
            <span className="nav-item__label">Instalar app</span>
          </button>
        ) : null}
        <div className="app-shell__status" role="status">
          <span className="status-dot" data-ok={connection.ok} aria-hidden="true" />
          <span>{connection.text}</span>
        </div>
      </nav>

      <main className="app-shell__main">{children}</main>
    </div>
  )
}
