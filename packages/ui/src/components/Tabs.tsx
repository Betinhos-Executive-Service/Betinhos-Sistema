import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

/** Id do botão da aba quando o `panelId` é informado. */
export const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`

export type TabItem<T extends string = string> = { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode; disabled?: boolean }

export type TabsProps<T extends string = string> = {
  tabs: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  /** Conteúdo da aba ativa; sem ele, use `Tabs` só como barra e troque o conteúdo por fora. */
  children?: ReactNode
  /** Id do painel que mora fora do `Tabs`: liga `aria-controls` das abas a ele. O painel externo usa `aria-labelledby={tabId(panelId, valor)}`. */
  panelId?: string
}

/** Abas de uma mesma tela: barra com sublinhado azul e painel; setas trocam a aba. */
export function Tabs<T extends string>({ tabs, value, onChange, children, panelId, ...rest }: TabsProps<T>) {
  const id = useId()
  // Sem `children` e sem `panelId` não há painel para apontar: `aria-controls` seria uma referência pendente.
  const painel = panelId ?? (children != null ? `${id}-panel` : undefined)
  const base = panelId ?? id
  const listRef = useRef<HTMLDivElement>(null)
  const enabled = tabs.filter((tab) => !tab.disabled)
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? -Infinity : event.key === 'End' ? Infinity : 0
    if (!step) return
    event.preventDefault()
    const index = enabled.findIndex((tab) => tab.value === value)
    const next = step === -Infinity ? enabled[0] : step === Infinity ? enabled[enabled.length - 1] : enabled[(index + step + enabled.length) % enabled.length]
    onChange(next.value)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }
  return (
    <div className="bt-tabs">
      <div ref={listRef} role="tablist" aria-label={rest['aria-label']} className="bt-tabs__list" onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const active = tab.value === value
          return (
            <button key={tab.value} type="button" role="tab" id={tabId(base, tab.value)} aria-selected={active} aria-controls={painel} data-value={tab.value} tabIndex={active ? 0 : -1} disabled={tab.disabled} className={active ? 'bt-tabs__tab is-active' : 'bt-tabs__tab'} onClick={() => onChange(tab.value)}>
              {tab.icon != null ? <span className="bt-tabs__icon">{tab.icon}</span> : null}
              <span>{tab.label}</span>
              {tab.badge != null ? <span className="bt-tabs__badge">{tab.badge}</span> : null}
            </button>
          )
        })}
      </div>
      {children != null ? <div role="tabpanel" id={painel} aria-labelledby={tabId(base, value)} className="bt-tabs__panel" tabIndex={0}>{children}</div> : null}
    </div>
  )
}
