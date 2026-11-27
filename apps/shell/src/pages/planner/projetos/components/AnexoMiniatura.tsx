import { useEffect, useState } from 'react'
import { FileText, Film, ImageOff, LoaderCircle, Play } from 'lucide-react'
import type { Source } from '../data/source'
import { ehImagem, ehVideo } from '../domain/anexos'
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

  const Icone = ehVideo(anexo.tipo) ? Film : FileText
  return (
    <button type="button" className="pj-anexo" onClick={() => void abrir()} title={anexo.nome} aria-label={`Abrir anexo ${anexo.nome}`}>
      <span className="pj-anexo__thumb" aria-hidden="true">
        {estado === 'carregando' ? <LoaderCircle size={18} className="pj-spin" />
          : estado === 'erro' ? <ImageOff size={18} />
          : url ? <img src={url} alt="" /> : <Icone size={22} />}
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
            <span className="pj-audio__info"><strong>{anexo.nome}</strong><small>{estado === 'carregando' ? 'Carregando…' : 'Ouvir áudio'}</small></span>
          </button>
        )}
      {estado === 'erro' ? <span className="pj-muted" role="alert">Não foi possível baixar o áudio. Tente de novo.</span> : null}
    </div>
  )
}
