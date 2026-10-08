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
  /** Classe extra na raiz da página (ajustes de layout da própria tela). */
  className?: string
  /** Classe extra no corpo empilhado (a tela que preenche a altura da janela usa para esticá-lo). */
  bodyClassName?: string
  children: ReactNode
}

/** Página React do shell: `PageHeader` do Design System, barra opcional e corpo empilhado. */
export function PageLayout({ toolbar, children, className, bodyClassName, ...header }: Props) {
  return (
    <div className={className ? `page ${className}` : 'page'}>
      <PageHeader className="page__header" {...header} />
      {toolbar}
      <Stack gap="4" className={bodyClassName}>{children}</Stack>
    </div>
  )
}
