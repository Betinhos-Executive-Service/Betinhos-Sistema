import logo from '../assets/logo-betinhos-b-192.webp'
import './BrandLoader.css'

type Props = {
  /** Nome lido pelo leitor de tela (ex.: "Carregando Despesas"). */
  label: string
  /** Texto visível embaixo da logo; sem ele só a logo aparece. */
  text?: string
  /** Cobre a janela toda; sem isso cobre o pai mais próximo com `position: relative`. */
  fullscreen?: boolean
}

/** Loader geral do Sistema Betinhos: logo B no centro, anel girando e fundo acinzentado com blur. */
export function BrandLoader({ label, text, fullscreen }: Props) {
  return (
    <div className={fullscreen ? 'brand-loader brand-loader--fixed' : 'brand-loader'} role="status" aria-label={label}>
      <div className="brand-loader__mark" aria-hidden="true">
        <span className="brand-loader__ring" />
        <img className="brand-loader__logo" src={logo} alt="" />
      </div>
      {text ? <p className="brand-loader__label" aria-hidden="true">{text}</p> : null}
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
