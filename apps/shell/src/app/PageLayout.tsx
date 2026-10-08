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
  /** Linha extra do cabeçalho, na largura toda (DS §10.2): tabs de seção. */
  tabs?: ReactNode
  /** `<PageToolbar>` entre o cabeçalho e o corpo. */
  toolbar?: ReactNode
  className?: string
  children: ReactNode
}

/** Página React do shell: `PageHeader` do Design System, barra opcional e corpo empilhado. */
export function PageLayout({ tabs, toolbar, className, children, ...header }: Props) {
  return (
    <div className={className ? `page ${className}` : 'page'}>
      <PageHeader className="page__header" {...header}>{tabs}</PageHeader>
      {toolbar}
      <Stack gap="4">{children}</Stack>
    </div>
  )
}
