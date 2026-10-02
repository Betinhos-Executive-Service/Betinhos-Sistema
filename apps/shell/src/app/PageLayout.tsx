import type { ReactNode } from 'react'
import { Stack } from '@betinhos/ui'

/** Página com cabeçalho próprio do shell (eyebrow + título) e corpo rolável. */
export function PageLayout({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page__header">
        {eyebrow ? <p className="page__eyebrow">{eyebrow}</p> : null}
        <h1 className="page__title">{title}</h1>
      </header>
      <Stack gap="4">{children}</Stack>
    </div>
  )
}

/** Estado vazio/explicativo: ícone, título, explicação curta e ação opcional. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="surface empty-state">
      <span className="empty-state__icon" aria-hidden="true">{icon}</span>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__text">{children}</p>
      {action}
    </section>
  )
}
