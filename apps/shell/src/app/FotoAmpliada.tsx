import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** Foto em tamanho grande com legenda; fecha por Esc, X ou clique fora. Dentro de um Drawer, envolva em ContemEsc. */
export function FotoAmpliada({ src, alt, legenda, onClose }: { src: string; alt: string; legenda: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return (
    <dialog
      ref={ref}
      className="foto-ampliada"
      aria-label={alt}
      onCancel={(event) => { event.preventDefault(); onClose() }}
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
