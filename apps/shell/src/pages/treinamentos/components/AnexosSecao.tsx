import { useRef, useState } from 'react'
import { Button, formatFileSize, useToast } from '@betinhos/ui'
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Video } from 'lucide-react'
import type { Source } from '../data/source'
import { ANEXO_TIPOS, erroTexto, isImagem, isVideo, validarAnexo, type Anexo } from '../domain/treinamentos'

type Props = {
  /** Rascunho salvo; null = ainda sem id (o primeiro anexo salva o rascunho antes, via `garantirId`). */
  treinamentoId: string | null
  anexos: Anexo[]
  source: Source
  onChange: (anexos: Anexo[], id: string) => void
  /** Salva o rascunho e devolve o id; null quando o rascunho está incompleto. */
  garantirId?: () => Promise<string | null>
  /** Rascunho criado só para anexar: chamado depois do último envio. */
  aposCriar?: (id: string) => Promise<void>
  disabled: boolean
  /** Publicado: só leitura além de abrir. */
  somenteLeitura?: boolean
}

const TEXTO_LIMITES = 'Fotos, PDF, Word e PowerPoint até 25 MB; vídeo (MP4, MOV, WEBM) até 50 MB. Ficam no SharePoint BetinhosGestoInterna.'

function baixar(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Fotos e arquivos do treinamento no SharePoint (`Treinamentos/<id>`); a lista fica no registro e é salva com o rascunho. */
export function AnexosSecao({ treinamentoId, anexos, source, onChange, garantirId, aposCriar, disabled, somenteLeitura }: Props) {
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const enviar = async (files: FileList | null) => {
    const validos = Array.from(files ?? []).filter((file) => {
      const erro = validarAnexo(file)
      if (erro) toast({ tone: 'danger', message: `${file.name}: ${erro}` })
      return !erro
    })
    if (!validos.length) return
    const id = treinamentoId ?? (await garantirId?.()) ?? null
    if (!id) return
    let lista = anexos
    for (const file of validos) {
      setEnviando(file.name)
      try {
        const anexo = await source.enviarAnexo(id, file, lista)
        lista = [...lista, anexo]
        onChange(lista, id)
      } catch (reason) {
        toast({ tone: 'danger', message: `Não foi possível enviar ${file.name}. ${erroTexto(reason)}` })
      }
    }
    setEnviando(null)
    if (!treinamentoId) await aposCriar?.(id)
  }

  const excluir = async (anexo: Anexo) => {
    if (!treinamentoId) return
    setOcupado(anexo.caminho)
    try {
      await source.excluirAnexo(treinamentoId, anexo)
      onChange(anexos.filter((a) => a.caminho !== anexo.caminho), treinamentoId)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível excluir ${anexo.nome}. ${erroTexto(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  const abrir = async (anexo: Anexo) => {
    setOcupado(anexo.caminho)
    try {
      const { nome, blob } = await source.abrirAnexo(anexo)
      baixar(nome, blob)
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível abrir ${anexo.nome}. ${erroTexto(reason)}` })
    } finally {
      setOcupado(null)
    }
  }

  const bloqueado = disabled || (!treinamentoId && !garantirId) || Boolean(enviando)
  return (
    <div className="tr-anexos">
      <ul className="tr-anexos__lista" aria-label="Anexos">
        {anexos.map((a) => (
          <li key={a.caminho}>
            <span className="tr-anexos__icone" aria-hidden="true">{isImagem(a) ? <ImageIcon size={16} /> : isVideo(a) ? <Video size={16} /> : <FileText size={16} />}</span>
            <span className="tr-anexos__nome"><strong>{a.nome}</strong><small>{isImagem(a) ? 'Foto' : isVideo(a) ? 'Vídeo' : 'Arquivo'} · {formatFileSize(a.tamanho)}</small></span>
            <Button variant="ghost" size="compact" icon={<Download size={14} />} aria-label={`Abrir ${a.nome}`} loading={ocupado === a.caminho} disabled={Boolean(ocupado)} onClick={() => void abrir(a)} />
            {somenteLeitura ? null : <Button variant="ghost" size="compact" icon={<Trash2 size={14} />} aria-label={`Excluir ${a.nome}`} disabled={bloqueado || Boolean(ocupado)} onClick={() => void excluir(a)} />}
          </li>
        ))}
        {!anexos.length ? <li className="tr-anexos__vazio">{somenteLeitura ? 'Sem anexos.' : 'Nenhum anexo ainda.'}</li> : null}
      </ul>
      {somenteLeitura ? null : (
        <div className="tr-anexos__acoes">
          <input ref={input} type="file" hidden multiple accept={ANEXO_TIPOS.join(',')} aria-label="Arquivos para anexar" onChange={(e) => { void enviar(e.target.files); e.currentTarget.value = '' }} />
          <Button variant="secondary" size="compact" icon={<Paperclip size={14} />} loading={Boolean(enviando)} disabled={bloqueado} onClick={() => input.current?.click()}>{enviando ? `Enviando ${enviando}` : 'Adicionar foto ou arquivo'}</Button>
          <small className="tr-hint">{treinamentoId ? TEXTO_LIMITES : `${TEXTO_LIMITES} O rascunho é salvo ao anexar.`}</small>
        </div>
      )}
    </div>
  )
}
