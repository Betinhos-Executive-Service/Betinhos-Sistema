import { Alert, Button, EmptyState, Spinner } from '@betinhos/ui'
import { AlertCircle, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, File as FileIcon, FolderOpen, Loader2, RotateCw, Trash2, UploadCloud } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { DOC_MAX_BYTES, sanitizeFileName, uniqueName } from '../data/sharepoint'
import type { DataSource } from '../data/source'
import type { Documento } from '../data/types'
import { errorMessage } from '../data/xrm'
import { useNotify } from './Toasts'

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const PREVIEWABLE = /^(application\/pdf|image\/|text\/plain)/

export function formatBytes(bytes: number | null) {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`
}

function DocIcon({ doc }: { doc: Pick<Documento, 'nome' | 'mimeType'> }) {
  const type = doc.mimeType ?? ''
  const ext = doc.nome.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return <FileImage size={18} aria-hidden />
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet size={18} aria-hidden />
  if (type === 'application/pdf' || ['pdf', 'doc', 'docx', 'txt'].includes(ext)) return <FileText size={18} aria-hidden />
  return <FileIcon size={18} aria-hidden />
}

type Envio = { key: string; nome: string; tamanho: number; erro?: string; file: File }

function saveBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: nome }).click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function DocumentosArquivos({ source, id }: { source: DataSource; id: string }) {
  const store = source.documentos
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<Documento[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [fila, setFila] = useState<Envio[]>([])
  const [enviando, setEnviando] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const docsRef = useRef<Documento[]>([])
  docsRef.current = docs ?? []

  const carregar = useCallback(() => {
    setLoadError(null)
    store.listar(id).then(setDocs, (reason) => { setLoadError(errorMessage(reason)); setDocs((current) => current ?? []) })
  }, [store, id])

  useEffect(() => { setDocs(null); carregar() }, [carregar])

  // Envia um arquivo por vez; erros ficam na fila com opção de tentar de novo.
  useEffect(() => {
    if (enviando) return
    const proximo = fila.find((item) => !item.erro)
    if (!proximo) return
    setEnviando(proximo.key)
    const nome = uniqueName(sanitizeFileName(proximo.nome), docsRef.current.map((doc) => doc.nome))
    store.enviar(id, proximo.file, nome).then(
      (doc) => {
        setDocs((current) => [doc, ...(current ?? []).filter((item) => item.nome !== doc.nome)])
        setFila((current) => current.filter((item) => item.key !== proximo.key))
        notify('success', `${nome} enviado.`)
      },
      (reason) => setFila((current) => current.map((item) => (item.key === proximo.key ? { ...item, erro: errorMessage(reason) } : item))),
    ).finally(() => setEnviando(null))
  }, [fila, enviando, store, id, notify])

  function adicionar(files: FileList | File[]) {
    const novos: Envio[] = []
    for (const file of Array.from(files)) {
      if (file.size > DOC_MAX_BYTES) { notify('error', `${file.name} tem ${formatBytes(file.size)}. O limite é ${formatBytes(DOC_MAX_BYTES)}.`); continue }
      if (file.size === 0) { notify('error', `${file.name} está vazio.`); continue }
      novos.push({ key: `${Date.now()}-${Math.random()}`, nome: file.name, tamanho: file.size, file })
    }
    if (novos.length) setFila((current) => [...current, ...novos])
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length) adicionar(event.dataTransfer.files)
  }

  async function abrir(doc: Documento, baixar: boolean) {
    const preview = !baixar && PREVIEWABLE.test(doc.mimeType ?? '')
    const janela = preview ? window.open('', '_blank') : null
    setBusy(doc.id)
    try {
      const { nome, blob } = await store.abrir(doc)
      if (janela) janela.location.href = URL.createObjectURL(blob)
      else saveBlob(blob, nome)
    } catch (reason) {
      janela?.close()
      notify('error', `Não foi possível abrir ${doc.nome}: ${errorMessage(reason)}`)
    } finally {
      setBusy(null)
    }
  }

  async function excluir(doc: Documento) {
    setBusy(doc.id)
    try {
      await store.excluir(id, doc)
      setDocs((current) => (current ?? []).filter((item) => item.id !== doc.id))
      notify('success', `${doc.nome} excluído.`)
    } catch (reason) {
      notify('error', `Não foi possível excluir ${doc.nome}: ${errorMessage(reason)}`)
    } finally {
      setBusy(null)
      setConfirmar(null)
    }
  }

  const pasta = store.pasta(id)
  const total = docs?.length ?? 0

  return (
    <section className="files" aria-labelledby="files-title" aria-busy={docs === null || Boolean(enviando)}>
      <header className="files-head">
        <div>
          <h3 id="files-title">Arquivos</h3>
          <p className="hint" title={`SharePoint › Documentos Compartilhados › ${pasta}`}>SharePoint · Gestão Interna{docs ? ` · ${total} arquivo${total === 1 ? '' : 's'}` : ''}</p>
        </div>
        <Button variant="secondary" size="compact" icon={<RotateCw size={16} />} aria-label="Atualizar lista de arquivos" title="Atualizar" onClick={carregar} disabled={docs === null} />
      </header>

      <div
        className={`files-drop${dragging ? ' files-drop--over' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <UploadCloud size={24} aria-hidden />
        <span>Arraste arquivos aqui ou <button type="button" className="link" onClick={() => input.current?.click()}>escolha no computador</button></span>
        <span className="hint">Até {formatBytes(DOC_MAX_BYTES)} por arquivo</span>
        <input ref={input} type="file" multiple hidden onChange={(event) => { if (event.target.files) adicionar(event.target.files); event.target.value = '' }} />
      </div>

      {loadError && (
        <Alert tone="danger" title="Não foi possível listar os arquivos." action={<Button variant="secondary" size="compact" onClick={carregar}>Tentar de novo</Button>}>
          {loadError}
        </Alert>
      )}

      <ul className="files-list" aria-label="Arquivos do colaborador">
        {fila.map((item) => (
          <li key={item.key} className={`file-row file-row--pending${item.erro ? ' file-row--error' : ''}`}>
            <span className="file-icon">{item.erro ? <AlertCircle size={18} aria-hidden /> : <Loader2 size={18} className={enviando === item.key ? 'spin' : ''} aria-hidden />}</span>
            <span className="file-main">
              <span className="file-name">{item.nome}</span>
              <span className="file-meta">{item.erro ? item.erro : enviando === item.key ? `Enviando · ${formatBytes(item.tamanho)}` : 'Na fila'}</span>
            </span>
            {item.erro && (
              <span className="file-actions">
                <Button variant="secondary" size="compact" onClick={() => setFila((current) => current.map((entry) => (entry.key === item.key ? { ...entry, erro: undefined } : entry)))}>Tentar de novo</Button>
                <Button variant="ghost" size="compact" className="icon-danger" icon={<Trash2 size={16} />} aria-label={`Descartar ${item.nome}`} onClick={() => setFila((current) => current.filter((entry) => entry.key !== item.key))} />
              </span>
            )}
          </li>
        ))}

        {docs === null && [0, 1].map((n) => <li key={`sk${n}`} className="file-row file-row--skeleton" aria-hidden><span className="bt-skeleton sk--icon" /><span className="bt-skeleton bt-skeleton--text sk--text" /></li>)}

        {docs?.map((doc) => (
          <li key={doc.id || doc.nome} className="file-row">
            <span className="file-icon"><DocIcon doc={doc} /></span>
            <button type="button" className="file-main file-open" onClick={() => void abrir(doc, false)} disabled={busy === doc.id} title={`Abrir ${doc.nome}`}>
              <span className="file-name">{doc.nome}</span>
              <span className="file-meta">{[formatBytes(doc.tamanho), doc.modificadoEm ? dateTime.format(new Date(doc.modificadoEm)) : ''].filter(Boolean).join(' · ')}</span>
            </button>
            {confirmar === doc.id ? (
              <span className="file-actions file-confirm" role="group" aria-label={`Confirmar exclusão de ${doc.nome}`}>
                <span className="file-confirm-text">Excluir do SharePoint?</span>
                <Button variant="danger" size="compact" icon={<Trash2 size={14} />} loading={busy === doc.id} onClick={() => void excluir(doc)}>Excluir arquivo</Button>
                <Button variant="secondary" size="compact" onClick={() => setConfirmar(null)} disabled={busy === doc.id}>Cancelar</Button>
              </span>
            ) : (
              <span className="file-actions">
                {busy === doc.id ? <span className="file-busy"><Spinner size={16} /></span> : (
                  <>
                    <Button variant="ghost" size="compact" icon={<ExternalLink size={16} />} aria-label={`Abrir ${doc.nome}`} title="Abrir" onClick={() => void abrir(doc, false)} />
                    <Button variant="ghost" size="compact" icon={<Download size={16} />} aria-label={`Baixar ${doc.nome}`} title="Baixar" onClick={() => void abrir(doc, true)} />
                    <Button variant="ghost" size="compact" className="icon-danger" icon={<Trash2 size={16} />} aria-label={`Excluir ${doc.nome}`} title="Excluir" onClick={() => setConfirmar(doc.id)} />
                  </>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      {docs?.length === 0 && !fila.length && !loadError && (
        <EmptyState compact align="start" icon={<FolderOpen />} title="Nenhum arquivo enviado por esta tela ainda.">Arraste um arquivo acima ou escolha no computador.</EmptyState>
      )}
    </section>
  )
}
