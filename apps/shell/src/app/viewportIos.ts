// App instalado no iPhone (iOS 26/27, WebKit 301994 e 300523): depois de teclado, volta ao app ou toque na borda, o iOS deixa o
// documento rolado/deslocado pela altura da barra de status. O desenho dos elementos fixos fica em 0 e o toque não, então o clique
// na sidebar cai no item vizinho ou em nada. O documento do shell nunca rola (styles.css), então qualquer deslocamento é o bug:
// volta para 0.

type Alvo = Pick<Window, 'scrollX' | 'scrollY' | 'scrollTo' | 'addEventListener'> & {
  visualViewport?: Pick<VisualViewport, 'offsetTop' | 'offsetLeft' | 'addEventListener'> | null
}

export function deslocado(alvo: Alvo): boolean {
  const vv = alvo.visualViewport
  return alvo.scrollY !== 0 || alvo.scrollX !== 0 || (vv != null && (vv.offsetTop !== 0 || vv.offsetLeft !== 0))
}

export function instalarCorrecaoViewportIos(alvo: Alvo = window): () => void {
  let pedido = false
  const corrigir = () => {
    if (pedido) return
    pedido = true
    // Depois do quadro: o iOS só aplica o deslocamento ao fim da animação do teclado/da volta ao app.
    requestAnimationFrame(() => {
      pedido = false
      if (deslocado(alvo)) alvo.scrollTo(0, 0)
    })
  }
  const opts = { passive: true } as const
  alvo.addEventListener('scroll', corrigir, opts)
  alvo.addEventListener('resize', corrigir, opts)
  alvo.addEventListener('pageshow', corrigir, opts)
  alvo.addEventListener('focusout', corrigir, opts)
  alvo.addEventListener('orientationchange', corrigir, opts)
  alvo.visualViewport?.addEventListener('resize', corrigir, opts)
  alvo.visualViewport?.addEventListener('scroll', corrigir, opts)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') corrigir() })
  }
  corrigir()
  return corrigir
}
