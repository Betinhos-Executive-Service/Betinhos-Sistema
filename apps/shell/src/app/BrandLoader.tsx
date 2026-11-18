import logo from '../assets/logo-betinhos-b-192.webp'
import { useEffect } from 'react'
import './BrandLoader.css'

export type BrandLoaderProps = {
  /** Nome lido pelo leitor de tela (ex.: "Carregando despesas"). */
  label: string
  /** Texto visível embaixo da logo; sem ele só a logo aparece. */
  text?: string
  /**
   * `overlay` (padrão): véu cinza com blur sobre o bloco que carrega; o pai precisa de `position` (classe `brand-loader-host`).
   * `inline`: ocupa o lugar do conteúdo que ainda não chegou. `fullscreen`: só para a abertura do app.
   */
  variant?: 'overlay' | 'inline' | 'fullscreen'
  /** `lg` página/tabela, `md` painel/drawer, `sm` card/célula. */
  size?: 'lg' | 'md' | 'sm'
}

/** Marca do loader: anel navy girando em volta da logo B. */
export function BrandLoaderMark() {
  return (
    <span className="brand-loader__mark" aria-hidden="true">
      <span className="brand-loader__ring" />
      <img className="brand-loader__logo" src={logo} alt="" />
    </span>
  )
}

/**
 * Loader geral do Sistema Betinhos. Fica no bloco que carrega, nunca na tela toda:
 * se só a tabela carrega, a sidebar, os filtros e o resto da tela continuam usáveis.
 */
export function BrandLoader({ label, text, variant = 'overlay', size = 'lg' }: BrandLoaderProps) {
  const classes = ['brand-loader']
  if (variant === 'inline') classes.push('brand-loader--inline')
  if (variant === 'fullscreen') classes.push('brand-loader--fixed')
  if (size !== 'lg') classes.push(`brand-loader--${size}`)
  return (
    <div className={classes.join(' ')} role="status" aria-live="polite" aria-label={label}>
      <BrandLoaderMark />
      {text ? <p className="brand-loader__label" aria-hidden="true">{text}</p> : null}
    </div>
  )
}

/**
 * Loader de um registro que abre por cima da lista (gaveta de lookup): fica no meio da janela, sem véu e sem gaveta
 * provisória, para a gaveta entrar uma vez só, já com o registro. Esc desiste da abertura.
 */
export function CarregandoRegistro({ label, onCancel }: { label: string; onCancel: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onCancel])
  return (
    <div className="brand-loader brand-loader--flutuante brand-loader--md" role="status" aria-live="polite" aria-label={label}>
      <div className="brand-loader__card">
        <BrandLoaderMark />
        <p className="brand-loader__label" aria-hidden="true">{label}…</p>
      </div>
    </div>
  )
}

/** Tira o splash do index.html (mesmo visual, aparece antes do JS) com um fade curto. */
export function esconderSplashInicial() {
  const splash = document.getElementById('boot-splash')
  if (!splash) return
  splash.style.transition = 'opacity 180ms ease-out'
  splash.style.opacity = '0'
  setTimeout(() => splash.remove(), 200)
}
