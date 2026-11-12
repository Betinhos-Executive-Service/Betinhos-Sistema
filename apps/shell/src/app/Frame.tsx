import { useEffect, useState } from 'react'
import { BrandLoader } from './BrandLoader'

type Props = {
  src: string
  title: string
  /** Chamado a cada carga do iframe (ex.: ajustar o documento quando é da mesma origem). */
  onLoad?: (iframe: HTMLIFrameElement) => void
  className?: string
}

/** Tela legada (WebResource ou lista nativa) ocupando toda a área, sem cabeçalho duplicado. */
export function Frame({ src, title, onLoad, className }: Props) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setLoaded(false), [src])
  return (
    <div className={className ? `frame ${className}` : 'frame'} aria-busy={!loaded}>
      {loaded ? null : <BrandLoader label={`Carregando ${title}`} text={`Carregando ${title}…`} />}
      <iframe key={src} className="frame__iframe" src={src} title={title} onLoad={(event) => { onLoad?.(event.currentTarget); setLoaded(true) }} />
    </div>
  )
}
