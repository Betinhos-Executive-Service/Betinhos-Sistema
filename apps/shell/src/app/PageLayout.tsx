import type { ReactNode } from 'react'
import { PageHeader, Stack } from '@betinhos/ui'

type Props = {
  eyebrow?: ReactNode
  breadcrumb?: ReactNode
  title: string
  meta?: ReactNode
  description?: ReactNode
  /** Ações do cabeçalho: secundária e primária. */
  actions?: ReactNode
  /** `<PageToolbar>` entre o cabeçalho e o corpo. */
  toolbar?: ReactNode
  children: ReactNode
}

/** Página React do shell: `PageHeader` do Design System, barra opcional e corpo empilhado. */
export function PageLayout({ toolbar, children, ...header }: Props) {
  return (
    <div className="page">
      <PageHeader className="page__header" {...header} />
      {toolbar}
      <Stack gap="4">{children}</Stack>
    </div>
  )
}
