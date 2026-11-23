import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from '@betinhos/ui'
import { Mic, Square, Trash2 } from 'lucide-react'

/** Limite da gravação: 3 minutos (cabe folgado nos 5 MB da nota). */
export const MAX_SEGUNDOS = 180

type Props = {
  /** Gravação pronta (vai junto com a atualização) ou null quando descartada. */
  onChange: (arquivo: File | null) => void
  disabled?: boolean
  /** Começa a gravar assim que aparece (botão "Gravar áudio" do painel). */
  autoIniciar?: boolean
}

type Estado =
  | { fase: 'parado' }
  | { fase: 'pedindo' }
  | { fase: 'gravando'; segundos: number }
  | { fase: 'pronto'; url: string; segundos: number }

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function tipoSuportado(): string {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  const check = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : null
  return candidatos.find((t) => check?.(t)) ?? ''
}

const extensao = (tipo: string) => (tipo.includes('mp4') ? 'm4a' : tipo.includes('ogg') ? 'ogg' : 'webm')
const carimbo = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}` }

function mensagemDeErro(reason: unknown): string {
  const nome = reason instanceof DOMException || reason instanceof Error ? reason.name : ''
  if (nome === 'NotAllowedError' || nome === 'SecurityError') return 'O navegador não liberou o microfone. Libere o acesso nas permissões do site ou anexe um arquivo de áudio.'
  if (nome === 'NotFoundError') return 'Nenhum microfone encontrado. Conecte um microfone ou anexe um arquivo de áudio.'
  return 'Não foi possível gravar. Anexe um arquivo de áudio.'
}

/** Gravar áudio até 3 min: contador, parar, descartar e pré-escuta. O arquivo segue como anexo da atualização. */
export function GravadorAudio({ onChange, disabled, autoIniciar }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' })
  const [erro, setErro] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const descartando = useRef(false)
  const url = useRef<string | null>(null)
  const inicio = useRef(0)
  const suportado = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined'

  const soltar = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }
  const limparUrl = () => { if (url.current) { URL.revokeObjectURL(url.current); url.current = null } }

  // Ao sair da tela: para a gravação, desliga o microfone e libera a prévia.
  useEffect(() => () => {
    descartando.current = true
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
    soltar()
    limparUrl()
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoIniciar) void gravar() }, [])

  async function gravar() {
    setErro(null)
    if (!suportado) { setErro('Este navegador não grava áudio. Anexe um arquivo de áudio.'); return }
    setEstado({ fase: 'pedindo' })
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (reason) {
      setEstado({ fase: 'parado' }); setErro(mensagemDeErro(reason)); return
    }
    const tipo = tipoSuportado()
    const rec = tipo ? new MediaRecorder(stream.current, { mimeType: tipo }) : new MediaRecorder(stream.current)
    const partes: Blob[] = []
    descartando.current = false
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
    rec.onstop = () => {
      soltar()
      if (descartando.current) return
      const segundos = Math.min(MAX_SEGUNDOS, Math.round((Date.now() - inicio.current) / 1000))
      const mime = (rec.mimeType || tipo || 'audio/webm').split(';')[0]
      const blob = new Blob(partes, { type: mime })
      const arquivo = new File([blob], `audio-${carimbo()}.${extensao(mime)}`, { type: mime })
      limparUrl()
      url.current = URL.createObjectURL(blob)
      setEstado({ fase: 'pronto', url: url.current, segundos })
      onChange(arquivo)
    }
    recorder.current = rec
    inicio.current = Date.now()
    rec.start()
    setEstado({ fase: 'gravando', segundos: 0 })
    timer.current = setInterval(() => {
      const segundos = Math.floor((Date.now() - inicio.current) / 1000)
      if (segundos >= MAX_SEGUNDOS) { parar(); return }
      setEstado({ fase: 'gravando', segundos })
    }, 250)
  }

  function parar() {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  function descartar() {
    descartando.current = true
    parar()
    soltar()
    limparUrl()
    setEstado({ fase: 'parado' })
    onChange(null)
  }

  return (
    <div className="pj-audio" role="group" aria-label="Gravar áudio">
      {estado.fase === 'parado' || estado.fase === 'pedindo' ? (
        <Button variant="secondary" icon={<Mic size={16} />} disabled={disabled} loading={estado.fase === 'pedindo'} onClick={() => void gravar()}>Gravar áudio</Button>
      ) : null}
      {estado.fase === 'gravando' ? (
        <>
          <span className="pj-audio__rec" aria-live="polite"><span className="pj-audio__dot" aria-hidden="true" />Gravando <span className="pj-num">{mmss(estado.segundos)}</span> de {mmss(MAX_SEGUNDOS)}</span>
          <Button variant="secondary" icon={<Square size={14} />} onClick={parar}>Parar</Button>
          <Button variant="ghost" icon={<Trash2 size={16} />} onClick={descartar}>Descartar</Button>
        </>
      ) : null}
      {estado.fase === 'pronto' ? (
        <>
          <audio className="pj-audio__player" controls src={estado.url} aria-label="Pré-escuta da gravação" />
          <span className="pj-num pj-muted">{mmss(estado.segundos)}</span>
          <Button variant="ghost" icon={<Trash2 size={16} />} disabled={disabled} onClick={descartar}>Descartar gravação</Button>
        </>
      ) : null}
      {erro ? <Alert tone="warning" title="Microfone indisponível">{erro}</Alert> : null}
    </div>
  )
}
