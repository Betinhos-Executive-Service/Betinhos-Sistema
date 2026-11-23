import { useEffect, useState } from 'react'
import { Button } from '@betinhos/ui'
import { FileText, Film, ImageOff, LoaderCircle, Volume2 } from 'lucide-react'
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
    try {
      const blob = url ? null : await source.baixarAnexo(anexo)
      const href = url ?? URL.createObjectURL(blob as Blob)
      window.open(href, '_blank', 'noopener')
    } catch { setEstado('erro') }
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
    setEstado('carregando')
    try { setUrl(URL.createObjectURL(await source.baixarAnexo(anexo))); setEstado('parado') } catch { setEstado('erro') }
  }

  return (
    <div className="pj-audio">
      {url ? <audio className="pj-audio__player" controls autoPlay src={url} aria-label={`Áudio ${anexo.nome}`} />
        : <Button variant="secondary" size="compact" icon={<Volume2 size={16} />} loading={estado === 'carregando'} onClick={() => void ouvir()} aria-label={`Ouvir áudio ${anexo.nome}`}>Ouvir áudio</Button>}
      {estado === 'erro' ? <span className="pj-muted">Não foi possível baixar o áudio.</span> : null}
    </div>
  )
}
