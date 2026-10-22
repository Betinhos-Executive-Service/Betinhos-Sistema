import { createContext, useContext, useEffect, useState, type RefObject } from 'react'
import type { CacheImagens, EstadoImagem } from '../data/imagens'

/** Cache das fotos da página (lista e drawer); sem provider, nenhuma imagem é baixada e a tela mostra os ícones. */
export const ImagensContext = createContext<CacheImagens | null>(null)

/**
 * Imagem do SharePoint para `caminho`, pedida só quando `alvo` entra perto da tela (IntersectionObserver);
 * sem `alvo` (foto grande) ou sem IntersectionObserver, pede logo. Devolve a blob URL, `null` se falhou
 * ou `undefined` enquanto não chegou.
 */
export function useImagemFoto(caminho: string | null, alvo?: RefObject<Element | null>): EstadoImagem {
  const cache = useContext(ImagensContext)
  const [visivel, setVisivel] = useState(!alvo)
  const [, setVersao] = useState(0)

  useEffect(() => {
    const el = alvo?.current
    if (visivel || !el) return
    if (typeof IntersectionObserver === 'undefined') { setVisivel(true); return }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisivel(true); observer.disconnect() }
    }, { rootMargin: '200px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [alvo, visivel])

  const estado = caminho && cache ? cache.estado(caminho) : null
  useEffect(() => {
    if (!caminho || !cache || !visivel || cache.estado(caminho) !== undefined) return
    let vivo = true
    void cache.pedir(caminho).then(() => { if (vivo) setVersao((n) => n + 1) })
    return () => { vivo = false }
  }, [caminho, cache, visivel])

  return estado
}
