import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { normalizeSearch } from './Select'
import { ShellHeaderContext, useShellHeaderEntry, useShellHeaderStore } from './ShellHeader'

export type NavItem = {
  id: string
  label: string
  /** Destino. Com `external`, abre em nova aba. */
  href: string
  external?: boolean
  /** Ícone Lucide de 14px ao lado do rótulo. */
  icon?: ReactNode
  /** Contagem ou marca à direita do rótulo. */
  badge?: ReactNode
}

export type NavGroup = {
  id: string
  label: string
  /** Ícone Lucide de 20px; obrigatório para o grupo aparecer no trilho recolhido. */
  icon?: ReactNode
  items: NavItem[]
  /** Grupo técnico: fica na seção "Administração", separada e fechada por padrão. */
  admin?: boolean
}

export type AppShellProps = {
  brand: { name: string; subtitle?: string; logo?: ReactNode; href?: string }
  groups: NavGroup[]
  /** Id do item ativo; o grupo dele abre sozinho. */
  activeId: string
  /** Título da tela, mostrado no cabeçalho do celular; uma rota com `useShellHeader` pode trocá-lo. */
  title: string
  /** Ações à direita do cabeçalho do celular (em geral só atualizar, ícone com `aria-label`). */
  headerActions?: ReactNode
  /** Estado de conexão no rodapé: ponto e texto, nunca só o ponto. */
  status?: { tone: 'success' | 'warning' | 'danger'; text: string }
  /** Usuário conectado, no rodapé; no trilho vira só o avatar. */
  user?: { name: string; initials: string }
  /** Ações extras no rodapé da navegação (instalar app, sair). */
  footer?: ReactNode
  /** Permite recolher a navegação num trilho de 72px no desktop. */
  collapsible?: boolean
  /**
   * Telas largas (grades) abrem com a navegação recolhida no trilho. Vale só no desktop, com `collapsible` e
   * enquanto o usuário não tiver escolhido nada: a preferência salva sempre vence e o padrão nunca é gravado.
   */
  defaultCollapsed?: boolean
  /** Mostra a busca de telas; por padrão aparece com mais de 12 itens. */
  searchable?: boolean
  /** Gaveta do celular aberta, controlada de fora (ex.: guardada na URL); sem isto o estado é interno. */
  navOpen?: boolean
  onNavOpenChange?: (open: boolean) => void
  /** Texto da busca de telas, controlado de fora; sem isto o estado é interno. */
  search?: string
  onSearchChange?: (search: string) => void
  children: ReactNode
}

const STORAGE_KEY = 'bt-shell-collapsed'
const DESKTOP = '(min-width: 821px)'

/** Preferência salva do usuário (`'1'` recolhido, `'0'` aberto); `null` = nunca escolheu (ou sem storage). */
function storedCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches
const icon = (path: ReactNode, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
)
const I = {
  menu: icon(<><path d="M4 12h16" /><path d="M4 6h16" /><path d="M4 18h16" /></>),
  close: icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  chevron: icon(<path d="m6 9 6 6 6-6" />, 16),
  collapse: icon(<><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></>, 18),
  expand: icon(<><path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" /></>, 18),
  external: icon(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>, 14),
  search: icon(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, 16),
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function renderItem(item: NavItem, className: string, activeId: string) {
  const active = item.id === activeId
  return (
    <li key={item.id}>
      <a
        className={className}
        href={item.href}
        target={item.external ? '_blank' : undefined}
        rel={item.external ? 'noreferrer' : undefined}
        aria-current={active ? 'page' : undefined}
        data-active={active || undefined}
      >
        {item.icon != null ? <span className="bt-shell__item-icon" aria-hidden="true">{item.icon}</span> : null}
        <span className="bt-shell__item-label">{item.label}</span>
        {item.badge != null ? <span className="bt-shell__badge">{item.badge}</span> : null}
        {item.external ? <span className="bt-shell__item-external" aria-label="abre em nova aba">{I.external}</span> : null}
      </a>
    </li>
  )
}

type NavGroupsProps = { groups: NavGroup[]; openGroups: Set<string>; filtering: boolean; activeId: string; navId: string; onToggle: (id: string) => void }

/**
 * Lista de grupos em acordeão, memoizada: abrir a gaveta, pousar no trilho ou trocar o popover não a re-renderiza;
 * só grupos visíveis, grupos abertos, busca ou item ativo.
 */
const NavGroups = memo(function NavGroups({ groups, openGroups, filtering, activeId, navId, onToggle }: NavGroupsProps) {
  return (
    <div className="bt-shell__groups">
      {groups.length === 0 ? <p className="bt-shell__empty">Nenhuma tela com esse nome.</p> : null}
      {groups.map((group, index) => {
        const open = filtering || openGroups.has(group.id)
        const panelId = `${navId}-${group.id}`
        const firstAdmin = group.admin && !groups[index - 1]?.admin
        return (
          <section key={group.id} className="bt-shell__group" data-open={open || undefined}>
            {firstAdmin ? <p className="bt-shell__section-label">Administração</p> : null}
            <button type="button" className="bt-shell__group-toggle" aria-expanded={open} aria-controls={panelId} onClick={(event) => { event.currentTarget.blur(); onToggle(group.id) }}>
              {group.icon != null ? <span className="bt-shell__group-icon" aria-hidden="true">{group.icon}</span> : null}
              <span className="bt-shell__group-label">{group.label}</span>
              {!open ? <span className="bt-shell__group-count" aria-hidden="true">{group.items.length}</span> : null}
              <span className="bt-shell__group-chevron" aria-hidden="true">{I.chevron}</span>
            </button>
            <div className="bt-shell__panel">
              <ul id={panelId} className="bt-shell__items">
                {group.items.map((item) => renderItem(item, 'bt-shell__item', activeId))}
              </ul>
            </div>
          </section>
        )
      })}
    </div>
  )
})

/**
 * Chrome persistente: navegação navy à esquerda com dois desenhos independentes, sidebar de 238px
 * (grupos em acordeão, busca, rodapé) e trilho de 72px (só ícones, popover ao pousar). No celular a
 * sidebar vira gaveta e entra o cabeçalho fixo.
 */
export function AppShell({ brand, groups, activeId, title, headerActions, status, user, footer, collapsible = true, defaultCollapsed = false, searchable, navOpen, onNavOpenChange, search, onSearchChange, children }: AppShellProps) {
  const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeId)) ?? null
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup.id] : []))
  const [drawerInternal, setDrawerInternal] = useState(false)
  const drawerOpen = navOpen ?? drawerInternal
  const setDrawerOpen = (open: boolean) => { setDrawerInternal(open); onNavOpenChange?.(open) }
  const [collapsed, setCollapsed] = useState(() => {
    const stored = storedCollapsed()
    if (stored !== null) return collapsible && stored === '1'
    return collapsible && defaultCollapsed && isDesktop()
  })
  const [queryInternal, setQueryInternal] = useState('')
  const query = search ?? queryInternal
  const setQuery = (text: string) => { setQueryInternal(text); onSearchChange?.(text) }
  const [popover, setPopover] = useState<{ id: string; top: number } | null>(null)
  const popoverTimer = useRef<number | undefined>(undefined)
  const desktop = useMediaQuery(DESKTOP)
  const navId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const total = groups.reduce((sum, group) => sum + group.items.length, 0)
  const showSearch = searchable ?? total > 12
  const rail = desktop && collapsible && collapsed
  // Entrar numa tela que pede o trilho recolhe a navegação, mas só para quem nunca escolheu; não grava nada.
  useEffect(() => {
    if (defaultCollapsed && collapsible && desktop && storedCollapsed() === null) setCollapsed(true)
  }, [defaultCollapsed, collapsible, desktop])
  const headerStore = useShellHeaderStore()
  const page = useShellHeaderEntry(headerStore)
  const mobileActions = page?.actions ?? headerActions

  // Ao navegar, o grupo do item ativo abre, a gaveta do celular fecha e o popover some.
  const shownId = useRef(activeId)
  useEffect(() => {
    if (activeGroup) setOpenGroups((current) => (current.has(activeGroup.id) ? current : new Set(current).add(activeGroup.id)))
    // Na abertura vale a gaveta que veio de fora (URL); só trocar de tela a fecha (comparar o id também vale no StrictMode, que roda o efeito duas vezes).
    if (shownId.current !== activeId) { shownId.current = activeId; setDrawerOpen(false) }
    setPopover(null)
  }, [activeId, activeGroup])

  useEffect(() => {
    if (!drawerOpen) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const setCollapsedPersist = (value: boolean) => {
    try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0') } catch { /* sem storage: só nesta sessão */ }
    setCollapsed(value)
    setPopover(null)
  }
  const openGroup = (id: string) => setOpenGroups((current) => new Set(current).add(id))
  const toggleGroup = useCallback((id: string) => setOpenGroups((current) => {
    const next = new Set(current)
    if (!next.delete(id)) next.add(id)
    return next
  }), [])
  const focusSearch = () => window.setTimeout(() => searchRef.current?.focus(), 50)

  // Popover do trilho: abre ao pousar no grupo, fecha 120ms depois de sair (dá tempo de entrar nele).
  const showPopover = (id: string, event: MouseEvent<HTMLElement>) => {
    window.clearTimeout(popoverTimer.current)
    const root = rootRef.current?.getBoundingClientRect()
    setPopover({ id, top: event.currentTarget.getBoundingClientRect().top - (root?.top ?? 0) })
  }
  const hidePopover = () => { popoverTimer.current = window.setTimeout(() => setPopover(null), 120) }
  const keepPopover = () => window.clearTimeout(popoverTimer.current)

  // Com busca, só os itens que casam aparecem e os grupos deles ficam abertos.
  const visible = useMemo(() => {
    const q = normalizeSearch(query)
    if (!q) return groups
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => normalizeSearch(`${group.label} ${item.label}`).includes(q)) }))
      .filter((group) => group.items.length)
  }, [groups, query])
  const filtering = query.trim() !== ''
  const popoverGroup = popover ? groups.find((group) => group.id === popover.id) ?? null : null

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && showSearch) {
      event.preventDefault()
      if (rail) setCollapsedPersist(false)
      focusSearch()
    }
  }

  const avatar = user ? (
    <span className="bt-shell__avatar" title={status ? `${user.name} · ${status.text}` : user.name}>
      <span className="bt-shell__avatar-initials" aria-hidden="true">{user.initials}</span>
      {status ? <span className={`bt-shell__avatar-dot bt-shell__avatar-dot--${status.tone}`} aria-hidden="true" /> : null}
    </span>
  ) : null

  return (
    <div ref={rootRef} className={['bt-shell', rail && 'bt-shell--rail'].filter(Boolean).join(' ')} data-drawer={drawerOpen ? 'open' : 'closed'} onKeyDown={onKeyDown}>
      <header className="bt-shell__header">
        <button type="button" className="bt-shell__icon-button" aria-label="Abrir menu" aria-expanded={drawerOpen} aria-controls={navId} onClick={() => setDrawerOpen(true)}>{I.menu}</button>
        <span className="bt-shell__header-title">{page?.title ?? title}</span>
        {mobileActions != null ? <div className="bt-shell__header-actions">{mobileActions}</div> : null}
      </header>
      <div className="bt-shell__backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      {rail ? (
        <nav className="bt-shell__rail" aria-label="Menu principal">
          <a className="bt-shell__rail-brand" href={brand.href ?? '#/'} aria-label={brand.name}>
            {brand.logo ?? <span aria-hidden="true">{brand.name.charAt(0)}</span>}
          </a>
          <button type="button" className="bt-shell__rail-button" aria-label="Expandir menu" title="Expandir menu" onClick={() => setCollapsedPersist(false)}>{I.expand}</button>
          {showSearch ? (
            <button type="button" className="bt-shell__rail-button bt-shell__rail-search" aria-label="Buscar tela" title="Buscar tela" onClick={() => { setCollapsedPersist(false); focusSearch() }}>{I.search}</button>
          ) : null}
          {groups.map((group) => group.icon == null ? null : (
            <div key={group.id} className="bt-shell__rail-slot">
              {group.admin ? <span className="bt-shell__rail-divider" aria-hidden="true" /> : null}
              <button
                type="button"
                className="bt-shell__rail-button"
                aria-label={group.label}
                title={group.label}
                aria-current={group.id === activeGroup?.id ? 'true' : undefined}
                aria-haspopup="menu"
                aria-expanded={popover?.id === group.id}
                onClick={() => { openGroup(group.id); setCollapsedPersist(false) }}
                onMouseEnter={(event) => showPopover(group.id, event)}
                onMouseLeave={hidePopover}
              >
                {group.icon}
              </button>
            </div>
          ))}
          <span className="bt-shell__rail-spacer" />
          {avatar ? <div className="bt-shell__rail-foot">{avatar}</div> : null}
        </nav>
      ) : (
        <nav id={navId} className="bt-shell__nav" aria-label="Menu principal">
          <div className="bt-shell__brand">
            <a className="bt-shell__brand-link" href={brand.href ?? '#/'} aria-label={brand.name}>
              <span className="bt-shell__logo" aria-hidden="true">{brand.logo ?? brand.name.charAt(0)}</span>
              <span className="bt-shell__brand-text">
                <span className="bt-shell__brand-name">{brand.name}</span>
                {brand.subtitle ? <span className="bt-shell__brand-sub">{brand.subtitle}</span> : null}
              </span>
            </a>
            <button ref={closeRef} type="button" className="bt-shell__nav-button bt-shell__close" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)}>{I.close}</button>
            {collapsible ? (
              <button type="button" className="bt-shell__nav-button bt-shell__collapse" aria-label="Recolher menu" title="Recolher menu" onClick={(event) => { event.currentTarget.blur(); setCollapsedPersist(true) }}>{I.collapse}</button>
            ) : null}
          </div>

          {showSearch ? (
            <label className="bt-shell__search">
              <span className="bt-shell__search-icon" aria-hidden="true">{I.search}</span>
              <input ref={searchRef} type="search" placeholder="Buscar tela" aria-label="Buscar tela" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} autoComplete="off" />
            </label>
          ) : null}

          <NavGroups groups={visible} openGroups={openGroups} filtering={filtering} activeId={activeId} navId={navId} onToggle={toggleGroup} />

          <div className="bt-shell__foot">
            {footer}
            {user ? (
              <div className="bt-shell__user">
                {avatar}
                <span className="bt-shell__user-text">
                  <span className="bt-shell__user-name">{user.name}</span>
                  {status ? <span className="bt-shell__user-status" role="status">{status.text}</span> : null}
                </span>
              </div>
            ) : status ? (
              <div className="bt-shell__status" role="status" title={status.text}>
                <span className={`bt-shell__status-dot bt-shell__status-dot--${status.tone}`} aria-hidden="true" />
                <span className="bt-shell__status-text">{status.text}</span>
              </div>
            ) : null}
          </div>
        </nav>
      )}

      <main className="bt-shell__main">
        <ShellHeaderContext.Provider value={headerStore}>{children}</ShellHeaderContext.Provider>
      </main>

      {rail && popoverGroup ? (
        <div className="bt-shell__popover" role="menu" aria-label={popoverGroup.label} style={{ top: popover?.top }} onMouseEnter={keepPopover} onMouseLeave={hidePopover}>
          <p className="bt-shell__popover-title">{popoverGroup.label}</p>
          <ul className="bt-shell__popover-items">
            {popoverGroup.items.map((item) => renderItem(item, 'bt-shell__popover-item', activeId))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
