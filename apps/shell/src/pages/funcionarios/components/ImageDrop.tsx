import { Button } from '@betinhos/ui'
import { AlertCircle, ImageUp } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { IMAGE_TYPES, validateImage } from '../data/source'

type Props = { label: string; src: string | null; disabledReason?: string; onUpload: (file: File) => Promise<void> }

export function ImageDrop({ label, src, disabledReason, onUpload }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  async function handle(file: File | undefined) {
    if (!file || disabledReason) return
    const problem = validateImage(file)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      await onUpload(file)
      setBroken(false)
    } finally {
      setBusy(false)
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void handle(event.dataTransfer.files[0])
  }

  return (
    <div className="image-field">
      <span className="image-label">{label}</span>
      <div
        className={`dropzone${dragging ? ' dropzone--over' : ''}${disabledReason ? ' dropzone--disabled' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {src && !broken ? <img src={src} alt={label} onError={() => setBroken(true)} /> : <ImageUp size={24} aria-hidden className="dropzone-icon" />}
        <Button variant="secondary" size="compact" loading={busy} disabled={Boolean(disabledReason)} onClick={() => input.current?.click()}>
          {busy ? 'Enviando…' : src ? 'Substituir imagem' : 'Enviar imagem'}
        </Button>
        <span className="hint">{disabledReason ?? 'Arraste aqui · PNG, JPG, GIF ou BMP até 5 MB'}</span>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={(event) => { void handle(event.target.files?.[0]); event.target.value = '' }} />
      </div>
      {error && <span className="bt-field__error" role="alert"><AlertCircle size={14} aria-hidden />{error}</span>}
    </div>
  )
}
