import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { normalizeSearch } from './Select'

export type NavItem = {
  id: string
  label: string
  /** Destino. Com `external`, abre em nova aba. */
  href: string
  external?: boolean
  /** Ícone Lucide de 20px; sem ele, o trilho recolhido mostra a inicial. */
  icon?: ReactNode
  /** Contagem ou marca à direita do rótulo. */
  badge?: ReactNode
}

export type NavGroup = { id: string; label: string; icon?: ReactNode; items: NavItem[] }

export type AppShellProps = {
  brand: { name: string; subtitle?: string; logo?: ReactNode; href?: string }
  groups: NavGroup[]
  /** Id do item ativo; o grupo dele abre sozinho. */
  activeId: string
  /** Título da tela, mostrado no cabeçalho do celular. */
  title: string
  /** Estado de conexão no rodapé: ponto e texto, nunca só o ponto. */
  status?: { tone: 'success' | 'warning' | 'danger'; text: string }
  /** Ações extras no rodapé da navegação (instalar app, sair). */
  footer?: ReactNode
  /** Permite recolher a navegação num trilho de 72px no desktop. */
  collapsible?: boolean
  /** Mostra a busca de telas quando a navegação tem muitos itens. */
  searchable?: boolean
  children: ReactNode
}

const STORAGE_KEY = 'bt-shell-collapsed'
const icon = (path: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
)
const I = {
  menu: icon(<><path d="M4 12h16" /><path d="M4 6h16" /><path d="M4 18h16" /></>),
  close: icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  chevron: icon(<path d="m6 9 6 6 6-6" />),
  collapse: icon(<><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>),
  expand: icon(<><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></>),
  external: icon(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>),
  search: icon(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
}

/** Chrome persistente: navegação lateral navy (desktop, recolhível) ou cabeçalho fixo e gaveta (celular), mais a área da tela. */
export function AppShell({ brand, groups, activeId, title, status, footer, collapsible = true, searchable, children }: AppShellProps) {
  const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeId))?.id ?? null
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return collapsible && localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [query, setQuery] = useState('')
  const navId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const showSearch = searchable ?? total > 12

  // Ao navegar, o grupo do item ativo abre e a gaveta do celular fecha.
  useEffect(() => {
    if (activeGroup) setOpenGroups((current) => (current.has(activeGroup) ? current : new Set(current).add(activeGroup)))
    setDrawerOpen(false)
  }, [activeId, activeGroup])

  useEffect(() => {
    if (!drawerOpen) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      try { localStorage.setItem(STORAGE_KEY, current ? '0' : '1') } catch { /* sem storage: só nesta sessão */ }
      return !current
    })
  }
  const toggleGroup = (id: string) => setOpenGroups((current) => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  })

  // Com busca, só os itens que casam aparecem e os grupos deles ficam abertos.
  const visible = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return groups
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => normalizeSearch(`${group.label} ${item.label}`).includes(q)) }))
      .filter((group) => group.items.length)
  }, [groups, query])
  const filtering = query.trim() !== ''

  return (
    <div className={['bt-shell', collapsed && 'bt-shell--collapsed'].filter(Boolean).join(' ')} data-drawer={drawerOpen ? 'open' : 'closed'}>
      <header className="bt-shell__header">
        <button type="button" className="bt-shell__icon-button" aria-label="Abrir menu" aria-expanded={drawerOpen} aria-controls={navId} onClick={() => setDrawerOpen(true)}>{I.menu}</button>
        <span className="bt-shell__header-title">{title}</span>
      </header>
      <div className="bt-shell__backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <nav id={navId} className="bt-shell__nav" aria-label="Menu principal">
        <div className="bt-shell__brand">
          <a className="bt-shell__brand-link" href={brand.href ?? '#/'} aria-label={brand.name}>
            {brand.logo != null ? <span className="bt-shell__logo">{brand.logo}</span> : <span className="bt-shell__logo bt-shell__logo--mark" aria-hidden="true">{brand.name.charAt(0)}</span>}
            <span className="bt-shell__brand-text">
              <span className="bt-shell__brand-name">{brand.name}</span>
              {brand.subtitle ? <span className="bt-shell__brand-sub">{brand.subtitle}</span> : null}
            </span>
          </a>
          <button ref={closeRef} type="button" className="bt-shell__icon-button bt-shell__icon-button--on-brand bt-shell__close" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)}>{I.close}</button>
          {collapsible ? (
            <button type="button" className="bt-shell__icon-button bt-shell__icon-button--on-brand bt-shell__collapse" aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} title={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-pressed={collapsed} onClick={toggleCollapsed}>
              {collapsed ? I.expand : I.collapse}
            </button>
          ) : null}
        </div>

        {showSearch ? (
          <label className="bt-shell__search">
            <span className="bt-shell__search-icon" aria-hidden="true">{I.search}</span>
            <input type="search" placeholder="Buscar tela" aria-label="Buscar tela" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          </label>
        ) : null}

        <div className="bt-shell__groups">
          {visible.length === 0 ? <p className="bt-shell__empty">Nenhuma tela com esse nome.</p> : null}
          {visible.map((group) => {
            const open = filtering || openGroups.has(group.id)
            const panelId = `${navId}-${group.id}`
            // No trilho recolhido, o ícone do grupo expande o menu já com o grupo aberto.
            const onGroupClick = () => {
              if (collapsed) { setOpenGroups((current) => new Set(current).add(group.id)); toggleCollapsed() }
              else toggleGroup(group.id)
            }
            return (
              <section key={group.id} className="bt-shell__group">
                <button type="button" className="bt-shell__group-toggle" aria-expanded={open} aria-controls={panelId} title={group.label} onClick={onGroupClick}>
                  {group.icon != null ? <span className="bt-shell__group-icon">{group.icon}</span> : null}
                  <span className="bt-shell__group-label">{group.label}</span>
                  <span className="bt-shell__group-chevron">{I.chevron}</span>
                </button>
                <ul id={panelId} className="bt-shell__items" hidden={!open}>
                  {group.items.map((item) => {
                    const active = item.id === activeId
                    return (
                      <li key={item.id}>
                        <a
                          className="bt-shell__item"
                          href={item.href}
                          target={item.external ? '_blank' : undefined}
                          rel={item.external ? 'noreferrer' : undefined}
                          aria-current={active ? 'page' : undefined}
                          title={item.label}
                        >
                          <span className="bt-shell__item-icon" aria-hidden="true">{item.icon ?? <span className="bt-shell__initial">{item.label.charAt(0)}</span>}</span>
                          <span className="bt-shell__item-label">{item.label}</span>
                          {item.badge != null ? <span className="bt-shell__item-badge">{item.badge}</span> : null}
                          {item.external ? <span className="bt-shell__item-external" aria-label="abre em nova aba">{I.external}</span> : null}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>

        <div className="bt-shell__foot">
          {footer}
          {status ? (
            <div className="bt-shell__status" role="status" title={status.text}>
              <span className={`bt-shell__status-dot bt-shell__status-dot--${status.tone}`} aria-hidden="true" />
              <span className="bt-shell__status-text">{status.text}</span>
            </div>
          ) : null}
        </div>
      </nav>

      <main className="bt-shell__main">{children}</main>
    </div>
  )
}
