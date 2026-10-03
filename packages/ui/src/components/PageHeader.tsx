import type { HTMLAttributes, ReactNode } from 'react'

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  /** Módulo ou seção, em caixa alta acima do título. */
  eyebrow?: ReactNode
  /** O título da página (H1, Centabel Book). Um por página. */
  title: ReactNode
  /** Uma linha sobre o que a página faz. */
  description?: ReactNode
  /** Até duas ações: secundária e primária, nesta ordem. */
  actions?: ReactNode
}

/** Cabeçalho de página: eyebrow, título em Centabel Book, descrição e as ações do contexto. */
export function PageHeader({ eyebrow, title, description, actions, className, ...rest }: PageHeaderProps) {
  return (
    <header className={['bt-page-header', className].filter(Boolean).join(' ')} {...rest}>
      <div className="bt-page-header__text">
        {eyebrow != null ? <p className="bt-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="bt-page-header__title">{title}</h1>
        {description != null ? <p className="bt-page-header__description">{description}</p> : null}
      </div>
      {actions != null ? <div className="bt-page-header__actions">{actions}</div> : null}
    </header>
  )
}
