import { Button, Dialog, Menu, Spinner } from '@betinhos/ui'
import { Camera, Eye, ImageUp, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { ContemEsc } from '../../../app/ContemEsc'
import { FotoAmpliada } from '../../../app/FotoAmpliada'
import { IMAGE_TYPES } from '../data/source'
import { initials } from '../data/format'

type Props = {
  name: string
  src: string | null
  /** Usada quando `src` não carrega (ex.: a imagem cheia pela API exige token que o <img> não envia). */
  fallback?: string | null
  size: number
  /** Recebe a foto já recortada (JPEG quadrado). Deve tratar o próprio erro (toast) e não lançar. */
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}

// Só o tipo importa: o recorte sempre gera um JPEG de 512 px, então foto grande de celular também serve.
const TIPOS = [...IMAGE_TYPES, 'image/webp']
const STAGE = 240
const OUTPUT = 512

/**
 * Foto de perfil no cabeçalho do drawer: clicar abre Ver/Trocar/Remover; arrastar uma imagem
 * sobre o círculo não troca direto, abre o recorte para confirmar.
 */
export function FotoPerfil({ name, src, fallback = null, size, onUpload, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [falhas, setFalhas] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pending, setPending] = useState<{ file: File; url: string; dropped: boolean } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setFalhas([]), [src, fallback])
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url) }, [pending])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const foto = [src, fallback].find((url): url is string => Boolean(url) && !falhas.includes(url!)) ?? null
  const shown = preview ?? foto

  function pick(file: File | undefined, dropped: boolean) {
    if (!file) return
    const problem = TIPOS.includes(file.type) ? null : 'Use PNG, JPG, WEBP, GIF ou BMP.'
    setError(problem)
    if (problem) return
    setPending({ file, url: URL.createObjectURL(file), dropped })
  }

  async function confirm(blob: Blob) {
    setPending(null)
    setPreview(URL.createObjectURL(blob))
    setBusy(true)
    try {
      await onUpload(new File([blob], 'foto.jpg', { type: 'image/jpeg' }))
    } finally {
      setBusy(false)
      setPreview(null)
    }
  }

  async function remove() {
    setRemoving(false)
    setBusy(true)
    try { await onRemove() } finally { setBusy(false) }
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  const dropProps = {
    onDragEnter: (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); setOver(true) } },
    onDragOver: (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false) },
    onDrop: (event: DragEvent) => { event.preventDefault(); setOver(false); if (!busy) pick(event.dataTransfer.files[0], true) },
  }

  const face = (
    <>
      {shown ? <img src={shown} alt="" onError={() => { if (!preview && foto) setFalhas((atual) => [...atual, foto]) }} /> : <span className="foto-perfil__iniciais">{initials(name)}</span>}
      <span className="foto-perfil__veu" aria-hidden>{busy ? <Spinner size={18} label="Enviando foto" /> : over ? <ImageUp size={20} /> : <Camera size={18} />}</span>
    </>
  )
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }
  const className = `bt-avatar foto-perfil${over ? ' foto-perfil--over' : ''}${busy ? ' foto-perfil--busy' : ''}`

  return (
    <ContemEsc>
    <span className="foto-perfil__box" {...dropProps}>
      {shown ? (
        <Menu
          align="start"
          trigger={(props) => (
            <button type="button" {...props} className={className} style={style} disabled={busy} aria-label={`Foto de ${name}: ver, trocar ou remover`} title="Clique ou arraste uma imagem">{face}</button>
          )}
          actions={[
            { id: 'ver', label: 'Ver foto', icon: <Eye size={16} />, onSelect: () => setViewing(true) },
            { id: 'trocar', label: 'Trocar foto', icon: <ImageUp size={16} />, onSelect: () => input.current?.click() },
            { id: 'remover', label: 'Remover', icon: <Trash2 size={16} />, tone: 'danger', group: '', onSelect: () => setRemoving(true) },
          ]}
        />
      ) : (
        <button type="button" className={className} style={style} disabled={busy} aria-label={`Adicionar foto de ${name}`} title="Clique ou arraste uma imagem" onClick={() => input.current?.click()}>{face}</button>
      )}
      <input ref={input} type="file" accept={TIPOS.join(',')} hidden onChange={(event) => { pick(event.target.files?.[0], false); event.target.value = '' }} />

      <Dialog open={error !== null} tone="danger" onClose={() => setError(null)} title="Imagem não aceita" actions={<Button onClick={() => setError(null)}>Entendi</Button>}>
        {error}
      </Dialog>

      {viewing && foto ? <FotoAmpliada src={foto} alt={`Foto de ${name}`} legenda={name} onClose={() => setViewing(false)} /> : null}

      <Dialog
        open={removing}
        tone="danger"
        onClose={() => setRemoving(false)}
        title="Remover a foto?"
        actions={<>
          <Button variant="secondary" onClick={() => setRemoving(false)}>Cancelar</Button>
          <Button variant="danger" onClick={() => void remove()}>Remover</Button>
        </>}
      >
        A ficha volta a mostrar as iniciais. Dá para enviar outra foto quando quiser.
      </Dialog>

      {pending ? <Recorte key={pending.url} url={pending.url} title={pending.dropped && src ? 'Trocar a foto por esta?' : 'Ajustar a foto'} onCancel={() => setPending(null)} onConfirm={(blob) => void confirm(blob)} /> : null}
    </span>
    </ContemEsc>
  )
}

type RecorteProps ={ url: string; title: string; onCancel: () => void; onConfirm: (blob: Blob) => void }

/** Recorte circular: arrastar move, roda/slider/teclas +/− aproximam, setas movem. */
function Recorte({ url, title, onCancel, onConfirm }: RecorteProps) {
  const img = useRef<HTMLImageElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const base = natural ? Math.max(STAGE / natural.w, STAGE / natural.h) : 1
  const scale = base * zoom
  const dw = natural ? natural.w * scale : STAGE
  const dh = natural ? natural.h * scale : STAGE
  const clamp = (x: number, y: number, z = scale) => {
    const mx = natural ? Math.max(0, (natural.w * z - STAGE) / 2) : 0
    const my = natural ? Math.max(0, (natural.h * z - STAGE) / 2) : 0
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }
  const setZoomClamped = (next: number) => {
    const z = Math.min(3, Math.max(1, next))
    setZoom(z)
    setPos((p) => clamp(p.x, p.y, base * z))
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, px: pos.x, py: pos.y }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    setPos(clamp(d.px + event.clientX - d.x, d.py + event.clientY - d.y))
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[event.key]) { event.preventDefault(); const [dx, dy] = moves[event.key]; setPos((p) => clamp(p.x + dx, p.y + dy)) }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoomClamped(zoom + 0.1) }
    if (event.key === '-') { event.preventDefault(); setZoomClamped(zoom - 0.1) }
  }

  function save() {
    const image = img.current
    if (!image || !natural) return
    setSaving(true)
    const left = (STAGE - dw) / 2 + pos.x
    const top = (STAGE - dh) / 2 + pos.y
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(image, -left / scale, -top / scale, STAGE / scale, STAGE / scale, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob((blob) => { setSaving(false); if (blob) onConfirm(blob) }, 'image/jpeg', 0.9)
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      actions={<>
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={save} loading={saving} disabled={!natural}>Usar foto</Button>
      </>}
    >
      <div className="foto-recorte">
        <div
          className="foto-recorte__palco"
          style={{ width: STAGE, height: STAGE }}
          tabIndex={0}
          role="application"
          aria-label="Área de recorte. Arraste ou use as setas para posicionar; + e − para aproximar."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => setZoomClamped(zoom - event.deltaY * 0.002)}
          onKeyDown={onKeyDown}
        >
          <img
            ref={img}
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
            style={{ width: dw, height: dh, transform: `translate(${(STAGE - dw) / 2 + pos.x}px, ${(STAGE - dh) / 2 + pos.y}px)` }}
          />
          <span className="foto-recorte__mascara" aria-hidden />
        </div>
        <label className="foto-recorte__zoom">
          <ZoomOut size={16} aria-hidden />
          <input type="range" min={1} max={3} step={0.01} value={zoom} aria-label="Aproximar" onChange={(event) => setZoomClamped(Number(event.target.value))} />
          <ZoomIn size={16} aria-hidden />
        </label>
        <span className="hint">Arraste para enquadrar o rosto no círculo.</span>
      </div>
    </Dialog>
  )
}
