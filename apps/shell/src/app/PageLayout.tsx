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
