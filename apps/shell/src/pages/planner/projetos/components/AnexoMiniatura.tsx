import { useEffect, useState } from 'react'
import { AlertCircle, FileText, Film, ImageOff, LoaderCircle, Play, RotateCcw, X } from 'lucide-react'
import type { Source } from '../data/source'
import { ehAudio, ehImagem, ehVideo } from '../domain/anexos'
import type { Anexo } from '../domain/types'

type Props = { anexo: Anexo; source: Source }

/** Miniatura do anexo: imagem baixada sob demanda; vídeo e PDF mostram ícone. Clicar abre o arquivo em nova aba. */
export function AnexoMiniatura({ anexo, source }: Props) {
  const imagem = ehImagem(anexo.tipo)
  const [url, setUrl] = useState<string | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(imagem ? 'carregando' : 'ok')

  useEffect(() => {
    if (!imagem) return
    let vivo = true
    let criada: string | null = null
    source.baixarAnexo(anexo).then((blob) => {
      if (!vivo) return
      criada = URL.createObjectURL(blob)
      setUrl(criada)
      setEstado('ok')
    }).catch(() => { if (vivo) setEstado('erro') })
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada) }
  }, [anexo, imagem, source])

  async function abrir() {
    if (url) { window.open(url, '_blank', 'noopener'); return }
    // A aba abre no clique (depois do download o navegador bloquearia o popup); o blob é liberado alguns minutos depois.
    const janela = window.open('', '_blank')
    try {
      const href = URL.createObjectURL(await source.baixarAnexo(anexo))
      if (janela) { janela.opener = null; janela.location.href = href } else window.open(href, '_blank', 'noopener')
      window.setTimeout(() => URL.revokeObjectURL(href), 5 * 60000)
    } catch { janela?.close(); setEstado('erro') }
  }

  const video = ehVideo(anexo.tipo)
  const Icone = video ? Film : FileText
  // Tipo vem do mimetype da anotação: pode ser vazio ou outro formato (anexo de agente), então só PDF de fato leva o rótulo PDF.
  const tipo = imagem ? 'imagem' : video ? 'video' : anexo.tipo === 'application/pdf' ? 'pdf' : 'arquivo'
  return (
    <button type="button" className={`pj-anexo is-${tipo}`} onClick={() => void abrir()} title={anexo.nome} aria-label={`Abrir anexo ${anexo.nome}`}>
      <span className="pj-anexo__thumb" aria-hidden="true">
        {estado === 'carregando' ? <LoaderCircle size={18} className="pj-spin" />
          : estado === 'erro' ? <ImageOff size={18} />
          : url ? <img src={url} alt="" /> : <><Icone size={22} /><small>{video ? 'Vídeo' : tipo === 'pdf' ? 'PDF' : 'Arquivo'}</small></>}
      </span>
      <span className="pj-anexo__nome">{anexo.nome}</span>
    </button>
  )
}

/** Áudio anexado: baixa só quando pedem para ouvir e mostra o player. */
export function AnexoAudio({ anexo, source }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [estado, setEstado] = useState<'parado' | 'carregando' | 'erro'>('parado')
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function ouvir() {
    if (estado === 'carregando') return
    setEstado('carregando')
    try { setUrl(URL.createObjectURL(await source.baixarAnexo(anexo))); setEstado('parado') } catch { setEstado('erro') }
  }

  return (
    <div className="pj-audio">
      {url ? <><strong className="pj-audio__nome">{anexo.nome}</strong><audio className="pj-audio__player" controls autoPlay src={url} aria-label={`Áudio ${anexo.nome}`} /></>
        : (
          <button type="button" className="pj-audio__ouvir" aria-disabled={estado === 'carregando' || undefined} aria-busy={estado === 'carregando' || undefined} onClick={() => void ouvir()} aria-label={`Ouvir áudio ${anexo.nome}`}>
            <span className="pj-audio__play" aria-hidden="true">{estado === 'carregando' ? <LoaderCircle size={16} className="pj-spin" /> : <Play size={16} />}</span>
            <span className="pj-audio__info"><strong>{anexo.nome}</strong><small>{estado === 'carregando' ? 'Carregando…' : 'Toque para ouvir'}</small></span>
          </button>
        )}
      {estado === 'erro' ? <span className="pj-muted" role="alert">Não foi possível baixar o áudio. Tente de novo.</span> : null}
    </div>
  )
}

type EnvioProps = { arquivo: File; previa: string; erro: string; onRetry: () => void; onDiscard: () => void }

/** Anexo que acabou de ser escolhido: aparece na hora (com prévia da imagem) enquanto sobe; se falhar, oferece tentar de novo ou descartar. */
export function AnexoEnviando({ arquivo, previa, erro, onRetry, onDiscard }: EnvioProps) {
  const audio = ehAudio(arquivo.type)
  const Icone = ehVideo(arquivo.type) ? Film : FileText
  const estado = erro
    ? <span className="pj-envio__falha" role="alert"><AlertCircle size={13} aria-hidden="true" />Falhou</span>
    : <span className="pj-envio__sub">Enviando…</span>
  const acoes = erro ? (
    <span className="pj-envio__acoes">
      <button type="button" onClick={onRetry} title={erro}><RotateCcw size={13} aria-hidden="true" />Tentar de novo</button>
      <button type="button" onClick={onDiscard} aria-label={`Descartar ${arquivo.name}`}><X size={13} aria-hidden="true" /></button>
    </span>
  ) : null
  if (audio) {
    return (
      <div className={`pj-audio pj-envio${erro ? ' is-erro' : ''}`} aria-busy={!erro || undefined}>
        <span className="pj-audio__ouvir">
          <span className="pj-audio__play" aria-hidden="true">{erro ? <AlertCircle size={16} /> : <LoaderCircle size={16} className="pj-spin" />}</span>
          <span className="pj-audio__info"><strong>{arquivo.name}</strong>{estado}</span>
          {acoes}
        </span>
      </div>
    )
  }
  return (
    <div className={`pj-anexo pj-envio${erro ? ' is-erro' : ''}`} aria-busy={!erro || undefined}>
      <span className="pj-anexo__thumb">
        {previa ? <img src={previa} alt="" /> : <Icone size={22} />}
        <span className="pj-envio__selo" aria-hidden="true">{erro ? <AlertCircle size={16} /> : <LoaderCircle size={16} className="pj-spin" />}</span>
      </span>
      <span className="pj-anexo__nome">{arquivo.name}</span>
      {estado}
      {acoes}
    </div>
  )
}
