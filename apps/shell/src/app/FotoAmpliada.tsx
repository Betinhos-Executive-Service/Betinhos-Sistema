import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** Foto em tamanho grande com legenda; fecha por Esc, X ou clique fora. Esc não sobe para o drawer de trás. */
export function FotoAmpliada({ src, alt, legenda, onClose }: { src: string; alt: string; legenda: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog
      ref={ref}
      className="foto-ampliada"
      aria-label={alt}
      // O `cancel` sintético sobe pela árvore do React até um Drawer (<dialog>) de trás e o fecharia junto.
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose() }}
      onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <figure>
        <img src={src} alt={alt} />
        <figcaption>{legenda}</figcaption>
      </figure>
      <button type="button" className="foto-ampliada__fechar" aria-label="Fechar" onClick={onClose}><X size={18} aria-hidden /></button>
    </dialog>
  )
}
