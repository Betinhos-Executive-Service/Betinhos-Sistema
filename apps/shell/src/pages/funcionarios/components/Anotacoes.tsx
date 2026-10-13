import { Button, buttonClassName, SearchBox, Spinner } from '@betinhos/ui'
import { ArrowLeft, ChevronRight, CloudUpload, Download, ExternalLink, FileText, ImageIcon, Paperclip, Pencil, Send, Trash2, X } from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useQueryId, useQueryTexto } from '../../../nav/queryState'
import { initials, normalizeSearch, richTextToPlain } from '../data/format'
import { imagensNoDataverse, migrarImagens, type ResultadoMigracao } from '../data/migracao'
import { buildNoteHtml, countInlineImages, extractSpAnexos, noteIsPlain, sanitizeNoteHtml, spWebUrl, textToNoteHtml, type SafeNode, type SpAnexo } from '../data/notes'
import { DOC_MAX_BYTES } from '../data/sharepoint'
import { LIMITES_PADRAO, validarAnexo, type DataSource, type LimitesAnexo } from '../data/source'
import type { Anotacao } from '../data/types'
import { errorMessage } from '../data/xrm'
import { Status, useLoad } from './RelatedTabs'
import { useNotify } from './Toasts'

const TZ = 'America/Sao_Paulo'
const fullDate = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'long', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

export function relativeTime(iso: string, now = Date.now()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.round((date.getTime() - now) / 60_000)
  if (Math.abs(minutes) < 1) return 'agora'
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  const days = Math.round(hours / 24)
  if (Math.abs(days) < 7) return relative.format(days, 'day')
  return shortDate.format(date)
}

function fileSize(bytes: number | null) {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`
}

const isImage = (type: string | null | undefined) => Boolean(type && /^image\//.test(type))

/** Título só quando o usuário escreveu algo além do padrão "Anotação". */
function customTitle(nota: Anotacao) {
  const title = nota.titulo.trim()
  return title && !['anotação', 'nota', 'note'].includes(title.toLowerCase()) ? title : ''
}

type View = Anotacao & { corpo: string; anexosSp: SpAnexo[]; plain: string; imagens: number }

function toView(nota: Anotacao): View {
  const { corpo, anexos } = extractSpAnexos(nota.texto)
  return { ...nota, corpo, anexosSp: anexos, plain: richTextToPlain(corpo), imagens: countInlineImages(corpo) }
}

function useLimites(source: DataSource) {
  const [limites, setLimites] = useState<LimitesAnexo>(LIMITES_PADRAO)
  useEffect(() => { source.limitesAnexo().then(setLimites, () => {}) }, [source])
  return limites
}

export function AnotacoesTab({ source, id }: { source: DataSource; id: string }) {
  const load = useCallback(() => source.anotacoes(id), [source, id])
  const { data, loading, error, reload } = useLoad<Anotacao[]>(load)
  const limites = useLimites(source)
  const notes = useMemo<View[]>(() => (data ?? []).map(toView), [data])
  // Busca e nota aberta vivem na URL (`qnota=…&nota=<id>`).
  const [busca, setBusca] = useQueryTexto('qnota')
  const [openId, setOpenId] = useQueryId('nota')
  const cards = useRef(new Map<string, HTMLButtonElement>())
  const lastOpened = useRef<string | null>(null)
  const open = notes.find((nota) => nota.id === openId) ?? null

  const visiveis = useMemo(() => {
    const termo = normalizeSearch(busca.trim())
    if (!termo) return notes
    return notes.filter((nota) => normalizeSearch(`${nota.titulo} ${nota.plain} ${nota.autor} ${nota.arquivo?.nome ?? ''} ${nota.anexosSp.map((a) => a.nome).join(' ')}`).includes(termo))
  }, [notes, busca])

  useEffect(() => {
    if (openId || !lastOpened.current) return
    cards.current.get(lastOpened.current)?.focus()
  }, [openId])

  if (open) {
    return (
      <NotaDetalhe
        nota={open}
        source={source}
        onBack={() => { lastOpened.current = open.id; setOpenId(null) }}
        onChanged={reload}
        onDeleted={() => { lastOpened.current = null; setOpenId(null); reload() }}
      />
    )
  }

  return (
    <div className="notes">
      <Composer source={source} id={id} limites={limites} onSaved={reload} />
      {notes.length > 2 && (
        <SearchBox size="compact" aria-label="Buscar nas anotações" placeholder="Buscar por texto, autor ou anexo" value={busca} onChange={setBusca} />
      )}
      <Status loading={loading && !data} error={error} empty={!notes.length} emptyText="Nenhuma anotação para este colaborador." />
      {notes.length > 0 && (
        <>
          <div className="notes-count-row">
            <p className="notes-count">{busca ? `${visiveis.length} de ${notes.length}` : notes.length} anotaç{notes.length === 1 ? 'ão' : 'ões'}</p>
            <MigrarImagens source={source} id={id} notas={data ?? []} onDone={reload} />
          </div>
          {!visiveis.length && <p className="muted">Nenhuma anotação encontrada para “{busca}”.</p>}
          <ul className="note-list">
            {visiveis.map((nota, index) => {
              const title = customTitle(nota)
              return (
                <li key={nota.id} style={{ '--i': Math.min(index, 8) } as CSSProperties}>
                  <button
                    type="button"
                    className="note-card"
                    ref={(element) => { if (element) cards.current.set(nota.id, element); else cards.current.delete(nota.id) }}
                    onClick={() => setOpenId(nota.id)}
                    aria-label={`Abrir anotação de ${nota.autor || 'autor desconhecido'}, ${relativeTime(nota.criadoEm)}`}
                  >
                    <span className="bt-avatar bt-avatar--md note-avatar" aria-hidden>{initials(nota.autor || '?')}</span>
                    <span className="note-main">
                      <span className="note-meta">
                        <strong>{nota.autor || 'Sem autor'}</strong>
                        <time dateTime={nota.criadoEm} title={fullDate.format(new Date(nota.criadoEm))}>{relativeTime(nota.criadoEm)}</time>
                      </span>
                      {title && <span className="note-title">{title}</span>}
                      {nota.plain ? <span className="note-preview">{nota.plain.replace(/\s+/g, ' ')}</span> : !nota.arquivo && !nota.imagens && !nota.anexosSp.length && <span className="note-preview muted">Sem texto</span>}
                      {(nota.arquivo || nota.imagens > 0 || nota.anexosSp.length > 0) && (
                        <span className="note-tags">
                          {nota.imagens > 0 && <span className="note-file"><ImageIcon size={13} aria-hidden />{nota.imagens} imagem{nota.imagens > 1 ? 'ns' : ''} no texto</span>}
                          {nota.anexosSp.map((anexo) => <span key={anexo.caminho} className="note-file">{isImage(anexo.mime) ? <ImageIcon size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}{anexo.nome}</span>)}
                          {nota.arquivo && !nota.anexosSp.length && <span className="note-file">{isImage(nota.arquivo.tipo) ? <ImageIcon size={13} aria-hidden /> : <Paperclip size={13} aria-hidden />}{nota.arquivo.nome}</span>}
                        </span>
                      )}
                    </span>
                    <ChevronRight size={16} className="note-chevron" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function Composer({ source, id, limites, onSaved }: { source: DataSource; id: string; limites: LimitesAnexo; onSaved: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [erroAnexo, setErroAnexo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const notify = useNotify()

  useEffect(() => {
    if (!arquivo || !isImage(arquivo.type)) { setPreview(null); return }
    const url = URL.createObjectURL(arquivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  function anexar(file: File | undefined) {
    if (!file) return
    // Anexos vão para o SharePoint: vale o limite dos flows, com as extensões bloqueadas do Dataverse.
    const problema = validarAnexo(file, { ...limites, maxBytes: DOC_MAX_BYTES })
    setErroAnexo(problema)
    if (!problema) setArquivo(file)
  }

  function onPaste(event: ClipboardEvent) {
    const file = Array.from(event.clipboardData.files)[0]
    if (!file) return
    event.preventDefault()
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    anexar(file.name && file.name !== 'image.png' ? file : new File([file], `imagem-colada-${stamp}.${ext}`, { type: file.type }))
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    anexar(event.dataTransfer.files[0])
  }

  function limpar() {
    setTitulo(''); setTexto(''); setArquivo(null); setErroAnexo(null)
  }

  const podeEnviar = Boolean(texto.trim() || arquivo || titulo.trim()) && !saving

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!podeEnviar) return
    setSaving(true)
    try {
      await source.addAnotacao(id, { titulo, texto, arquivo })
      limpar()
      notify('success', 'Anotação adicionada.')
      onSaved()
    } catch (reason) {
      notify('error', `Anotação não salva: ${errorMessage(reason)}. O texto continua no campo.`)
    } finally {
      setSaving(false)
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit() }
  }

  return (
    <form
      className={`composer${dragging ? ' composer--over' : ''}`}
      onSubmit={submit}
      onPaste={onPaste}
      onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true) } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={onDrop}
      aria-label="Nova anotação"
    >
      <label htmlFor="nota-titulo" className="sr-only">Título</label>
      <input id="nota-titulo" className="composer-title" placeholder="Título (opcional)" value={titulo} maxLength={500} onChange={(event) => setTitulo(event.target.value)} onKeyDown={onKey} />
      <label htmlFor="nova-nota" className="sr-only">Texto da anotação</label>
      <textarea id="nova-nota" rows={4} placeholder="Escreva a anotação… Cole ou arraste uma imagem para anexar." value={texto} onChange={(event) => setTexto(event.target.value)} onKeyDown={onKey} />
      {arquivo && (
        <div className="composer-attachment">
          {preview ? <img src={preview} alt="" /> : <span className="composer-attachment-icon"><Paperclip size={16} aria-hidden /></span>}
          <span className="composer-attachment-name"><strong>{arquivo.name}</strong><span className="hint">{fileSize(arquivo.size)}</span></span>
          <Button variant="ghost" size="compact" icon={<X size={16} />} aria-label={`Remover anexo ${arquivo.name}`} onClick={() => setArquivo(null)} />
        </div>
      )}
      {erroAnexo && <p className="bt-field__error composer-error" role="alert">{erroAnexo}</p>}
      <div className="composer-bar">
        <Button variant="secondary" size="compact" icon={<Paperclip size={14} />} onClick={() => input.current?.click()} disabled={saving}>
          {arquivo ? 'Trocar anexo' : 'Anexar arquivo'}
        </Button>
        <span className="hint composer-hint">Anexo vai para o SharePoint · até {Math.round(DOC_MAX_BYTES / 1024 / 1024)} MB · Ctrl + Enter adiciona</span>
        {(texto || titulo || arquivo) && <Button variant="ghost" size="compact" onClick={limpar} disabled={saving}>Descartar</Button>}
        <Button type="submit" size="compact" icon={<Send size={14} />} loading={saving} disabled={!podeEnviar && !saving}>
          Adicionar anotação
        </Button>
      </div>
      <input ref={input} type="file" hidden onChange={(event) => { anexar(event.target.files?.[0]); event.target.value = '' }} />
    </form>
  )
}

const TAG_PROPS: Record<string, (attrs: Record<string, string>) => Record<string, unknown>> = {
  a: (attrs) => ({ href: attrs.href, target: '_blank', rel: 'noopener noreferrer' }),
  img: (attrs) => ({ src: attrs.src, alt: attrs.alt, loading: 'lazy', className: 'note-inline-img', onClick: () => window.open(attrs.src, '_blank', 'noopener'), title: 'Abrir imagem em tamanho real' }),
  td: (attrs) => (attrs.colspan ? { colSpan: Number(attrs.colspan) } : {}),
  th: (attrs) => (attrs.colspan ? { colSpan: Number(attrs.colspan) } : {}),
}

function renderNodes(nodes: SafeNode[], prefix = ''): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}${index}`
    if (node.type === 'text') return node.text
    const props = { key, ...(TAG_PROPS[node.tag]?.(node.attrs) ?? {}) }
    if (node.tag === 'br' || node.tag === 'hr' || node.tag === 'img') return createElement(node.tag, props)
    return createElement(node.tag, props, ...renderNodes(node.children, `${key}.`))
  })
}

/** Corpo da anotação com formatação e imagens da timeline nativa, sem innerHTML. */
export function RichNote({ html }: { html: string }) {
  // Notas antigas gravadas como texto puro viram parágrafos antes de exibir.
  const nodes = useMemo(() => sanitizeNoteHtml(/<[a-z][\s\S]*>/i.test(html) ? html : textToNoteHtml(html), location.origin), [html])
  return <div className="note-body">{renderNodes(nodes)}</div>
}

type AnexoInfo = { chave: string; nome: string; tipo: string | null; tamanho: number | null; webUrl?: string; carregar: () => Promise<{ nome: string; blob: Blob }> }

function anexosDaNota(nota: View, source: DataSource): AnexoInfo[] {
  const lista: AnexoInfo[] = nota.anexosSp.map((anexo) => ({
    chave: anexo.caminho,
    nome: anexo.nome,
    tipo: anexo.mime,
    tamanho: anexo.tamanho,
    webUrl: spWebUrl(anexo.caminho),
    carregar: () => source.documentos.abrir({ id: anexo.id, caminho: anexo.caminho, nome: anexo.nome, tamanho: anexo.tamanho, modificadoEm: null, mimeType: anexo.mime }),
  }))
  // Nota migrada: o SharePoint é a fonte e o anexo do Dataverse vira cópia de segurança.
  if (nota.arquivo && lista.length) {
    const principal = lista[0]
    lista[0] = { ...principal, carregar: () => principal.carregar().catch(() => source.anexo(nota.id)) }
  } else if (nota.arquivo) {
    lista.push({ chave: `dv-${nota.id}`, nome: nota.arquivo.nome, tipo: nota.arquivo.tipo, tamanho: nota.arquivo.tamanho, carregar: () => source.anexo(nota.id) })
  }
  return lista
}

function Anexo({ anexo }: { anexo: AnexoInfo }) {
  const notify = useNotify()
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const imagem = isImage(anexo.tipo)
  const carregar = useRef(anexo.carregar)
  carregar.current = anexo.carregar

  useEffect(() => {
    if (!imagem) return
    let url: string | null = null
    let alive = true
    carregar.current().then(({ blob }) => { if (alive) { url = URL.createObjectURL(blob); setPreview(url) } }, () => {})
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [imagem, anexo.chave])

  async function obter(abrir: boolean) {
    const janela = abrir ? window.open('', '_blank') : null
    setBusy(true)
    try {
      const { nome, blob } = await anexo.carregar()
      const url = URL.createObjectURL(blob)
      if (janela) janela.location.href = url
      else Object.assign(document.createElement('a'), { href: url, download: nome }).click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (reason) {
      janela?.close()
      notify('error', `Não foi possível obter o anexo: ${errorMessage(reason)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="note-attachment-block">
      {imagem && (
        <button type="button" className="note-attachment-preview" onClick={() => void obter(true)} aria-label={`Abrir imagem ${anexo.nome}`}>
          {preview ? <img src={preview} alt={anexo.nome} /> : <span className="bt-skeleton note-attachment-sk" aria-hidden />}
        </button>
      )}
      <div className="note-attachment">
        {imagem ? <ImageIcon size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
        <span className="note-attachment-name">
          <strong>{anexo.nome}</strong>
          <span className="hint">{[anexo.webUrl ? 'SharePoint' : 'Dataverse', fileSize(anexo.tamanho)].filter(Boolean).join(' · ')}</span>
        </span>
        {anexo.webUrl
          ? <a className={buttonClassName({ variant: 'ghost', size: 'compact', iconOnly: true })} href={anexo.webUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${anexo.nome} no SharePoint`} title="Abrir no SharePoint"><ExternalLink size={16} /></a>
          : <Button variant="ghost" size="compact" icon={<ExternalLink size={16} />} aria-label={`Abrir ${anexo.nome}`} title="Abrir" onClick={() => void obter(true)} disabled={busy} />}
        <Button variant="secondary" size="compact" icon={<Download size={14} />} loading={busy} onClick={() => void obter(false)}>
          Baixar
        </Button>
      </div>
    </div>
  )
}

type DetalheProps = { nota: View; source: DataSource; onBack: () => void; onChanged: () => void; onDeleted: () => void }

function NotaDetalhe({ nota, source, onBack, onChanged, onDeleted }: DetalheProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const notify = useNotify()
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(nota.titulo)
  const [texto, setTexto] = useState(nota.plain)
  const [confirmar, setConfirmar] = useState(false)
  const [busy, setBusy] = useState(false)
  // Mostra o conteúdo salvo na hora, sem esperar a lista recarregar.
  const [salvo, setSalvo] = useState<{ titulo: string; corpo: string } | null>(null)
  const atual = salvo ?? { titulo: nota.titulo, corpo: nota.corpo }
  const title = customTitle({ ...nota, titulo: atual.titulo }) || 'Anotação'
  const editavel = noteIsPlain(atual.corpo)
  const temConteudo = Boolean(richTextToPlain(atual.corpo) || countInlineImages(atual.corpo))
  const anexos = anexosDaNota(nota, source)

  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => { setTitulo(nota.titulo); setTexto(nota.plain); setSalvo(null) }, [nota])

  async function salvar(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      // Os links de anexo do SharePoint continuam no fim da nota.
      await source.updateAnotacao(nota.id, { titulo, notetext: buildNoteHtml(texto, nota.anexosSp) })
      notify('success', 'Anotação atualizada.')
      setSalvo({ titulo, corpo: textToNoteHtml(texto) })
      setEditando(false)
      onChanged()
    } catch (reason) {
      notify('error', `Não salvou: ${errorMessage(reason)}. O texto continua no campo.`)
    } finally {
      setBusy(false)
    }
  }

  async function excluir() {
    setBusy(true)
    try {
      await source.deleteAnotacao(nota.id)
    } catch (reason) {
      notify('error', `Não foi possível excluir: ${errorMessage(reason)}`)
      setBusy(false)
      setConfirmar(false)
      return
    }
    const falhas: string[] = []
    for (const anexo of nota.anexosSp) {
      await source.documentos.excluir('', { id: anexo.id, caminho: anexo.caminho, nome: anexo.nome, tamanho: null, modificadoEm: null, mimeType: null }).catch(() => falhas.push(anexo.nome))
    }
    if (falhas.length) notify('error', `Anotação excluída, mas ${falhas.join(', ')} ficou no SharePoint.`)
    else notify('success', 'Anotação excluída.')
    onDeleted()
  }

  return (
    <article
      className="note-detail"
      aria-labelledby="note-detail-title"
      onKeyDown={(event) => { if (event.key === 'Escape' && !editando) { event.stopPropagation(); onBack() } }}
    >
      <div className="note-detail-top">
        <Button variant="ghost" size="compact" className="note-back" icon={<ArrowLeft size={16} />} onClick={onBack}>Anotações</Button>
        {!editando && (
          <div className="cluster">
            <Button
              variant="secondary"
              size="compact"
              icon={<Pencil size={14} />}
              onClick={() => setEditando(true)}
              disabled={!editavel}
              title={editavel ? 'Editar título e texto' : 'Esta anotação tem formatação ou imagens no texto. Edite pela timeline do formulário nativo.'}
            >
              Editar
            </Button>
            {confirmar ? (
              <span className="note-confirm" role="group" aria-label="Confirmar exclusão">
                <span>{nota.anexosSp.length ? 'Excluir a anotação e o anexo no SharePoint?' : 'Excluir esta anotação?'}</span>
                <Button variant="danger" size="compact" icon={<Trash2 size={14} />} loading={busy} onClick={() => void excluir()}>Excluir anotação</Button>
                <Button variant="secondary" size="compact" onClick={() => setConfirmar(false)} disabled={busy}>Cancelar</Button>
              </span>
            ) : (
              <Button variant="ghost" size="compact" className="icon-danger" icon={<Trash2 size={16} />} aria-label="Excluir anotação" title="Excluir" onClick={() => setConfirmar(true)} />
            )}
          </div>
        )}
      </div>

      {editando ? (
        <form className="composer composer--edit" onSubmit={salvar} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditando(false) } }}>
          <label htmlFor="edit-titulo" className="sr-only">Título</label>
          <input id="edit-titulo" className="composer-title" placeholder="Título (opcional)" value={titulo} maxLength={500} onChange={(event) => setTitulo(event.target.value)} autoFocus />
          <label htmlFor="edit-texto" className="sr-only">Texto da anotação</label>
          <textarea id="edit-texto" rows={6} value={texto} onChange={(event) => setTexto(event.target.value)} />
          <div className="composer-bar">
            <span className="hint composer-hint">Os anexos não mudam na edição.</span>
            <Button variant="secondary" size="compact" onClick={() => setEditando(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" size="compact" loading={busy} disabled={!(texto.trim() || titulo.trim() || anexos.length)}>
              Salvar alterações
            </Button>
          </div>
        </form>
      ) : (
        <>
          <header className="note-detail-head">
            <h3 id="note-detail-title" ref={heading} tabIndex={-1}>{title}</h3>
            <div className="note-detail-meta">
              <span className="bt-avatar bt-avatar--sm" aria-hidden>{initials(nota.autor || '?')}</span>
              <span><strong>{nota.autor || 'Sem autor'}</strong> · <time dateTime={nota.criadoEm}>{fullDate.format(new Date(nota.criadoEm))}</time></span>
            </div>
            {nota.modificadoEm && <p className="hint">Editada em {fullDate.format(new Date(nota.modificadoEm))}</p>}
          </header>
          {temConteudo ? <RichNote html={atual.corpo} /> : !anexos.length && <p className="muted">Esta anotação não tem texto.</p>}
        </>
      )}
      {anexos.map((anexo) => <Anexo key={anexo.chave} anexo={anexo} />)}
    </article>
  )
}

/** Botão discreto: leva as imagens anexadas no Dataverse para o SharePoint, nota a nota. */
function MigrarImagens({ source, id, notas, onDone }: { source: DataSource; id: string; notas: Anotacao[]; onDone: () => void }) {
  const notify = useNotify()
  const pendentes = imagensNoDataverse(notas)
  const [aberto, setAberto] = useState(false)
  const [progresso, setProgresso] = useState<[number, number] | null>(null)
  const [resultado, setResultado] = useState<ResultadoMigracao | null>(null)

  if (!pendentes.length && !resultado && !progresso) return null
  const n = pendentes.length
  const plural = n === 1 ? '' : 'ns'

  async function iniciar() {
    setResultado(null)
    setProgresso([0, n])
    const final = await migrarImagens(source, id, notas, (feitas, total) => setProgresso([feitas, total]))
    setProgresso(null)
    if (final.falhas.length) setResultado(final)
    else {
      notify('success', `${final.movidas} imagem${final.movidas === 1 ? '' : 'ns'} copiada${final.movidas === 1 ? '' : 's'} para o SharePoint.`)
      setAberto(false)
    }
    onDone()
  }

  return (
    <div className="migrar">
      <button
        type="button"
        className="migrar-trigger"
        aria-expanded={aberto}
        aria-label={`Copiar ${n} imagem${plural} anexada${n === 1 ? '' : 's'} para o SharePoint`}
        title="Copiar imagens anexadas na timeline para o SharePoint"
        onClick={() => setAberto((value) => !value)}
        disabled={Boolean(progresso)}
      >
        <CloudUpload size={14} aria-hidden /><span>{n}</span>
      </button>
      {aberto && (
        <div className="migrar-panel" role="dialog" aria-label="Copiar imagens para o SharePoint">
          {progresso ? (
            <p className="migrar-status" role="status"><Spinner size={14} /> Copiando {Math.min(progresso[0] + 1, progresso[1])} de {progresso[1]}…</p>
          ) : resultado ? (
            <>
              <p className="migrar-status" role="alert">{resultado.movidas} copiada{resultado.movidas === 1 ? '' : 's'}, {resultado.falhas.length} com erro:</p>
              <ul className="migrar-falhas">{resultado.falhas.map((falha) => <li key={falha.notaId}><strong>{falha.arquivo}</strong>: {falha.erro}</li>)}</ul>
              <div className="cluster">
                {n > 0 && <Button size="compact" onClick={() => void iniciar()}>Tentar de novo</Button>}
                <Button variant="secondary" size="compact" onClick={() => { setAberto(false); setResultado(null) }}>Fechar</Button>
              </div>
            </>
          ) : (
            <>
              <p className="migrar-text">
                {n} imagem{plural} anexada{n === 1 ? '' : 's'} na timeline. Cada uma ganha uma cópia no SharePoint e o link na anotação. O anexo continua na timeline como cópia de segurança e o texto não muda.
              </p>
              <div className="cluster">
                <Button size="compact" icon={<CloudUpload size={14} />} onClick={() => void iniciar()}>Copiar {n} imagem{plural}</Button>
                <Button variant="secondary" size="compact" onClick={() => setAberto(false)}>Cancelar</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
