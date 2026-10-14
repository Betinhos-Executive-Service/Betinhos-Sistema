// components/Checklist.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { acceptFiles, Alert, Button, Dialog, Skeleton, useToast } from '@betinhos/ui'
import { File as FileIcon, FileImage, FileText, History, Paperclip, Plus, Trash2, Upload as UploadIcon } from 'lucide-react'
import { formatBR, todaySP } from '../../funcionarios/data/dates'
import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import type { DocsSource } from '../data/source'
import { avisoFalhas, type SalvarDocResult } from '../data/salvar'
import { criarLimite, type Limite } from '../domain/limite'
import { elipseMeio, nomeAmigavel } from '../domain/nomes'
import { montarChecklist } from '../domain/pendencias'
import type { Arquivo, DocEmitido, ItemChecklist } from '../domain/types'
import { useDocumentos } from '../useDocumentos'
import { ACCEPT, RenovarDrawer, type AlvoRenovar } from './RenovarDrawer'
import { StatusDoc } from './StatusDoc'
import '../documentos.css'

type Props = { source: DocsSource; donoId: string; titulo?: string }

export function Checklist({ source, donoId, titulo = 'Documentos controlados' }: Props) {
  const { data, loading, error, reload } = useDocumentos(source)
  const toast = useToast()
  const [alvo, setAlvo] = useState<AlvoRenovar | null>(null)
  // Uma fila por checklist: no máximo 3 listagens simultâneas no SharePoint.
  const limite = useMemo(() => criarLimite(3), [])
  const dono = data?.donos.find((d) => d.id === donoId) ?? null
  const itens = useMemo(() => (data && dono ? montarChecklist(dono, data.tipos, data.docs, todaySP()) : []), [data, dono])

  const onSaved = (r: SalvarDocResult) => {
    setAlvo(null)
    if (r.falhas.length) toast({ tone: 'warning', message: avisoFalhas(r.falhas, 'Use “Enviar arquivo” neste documento para tentar de novo.') })
    else toast({ tone: 'success', message: 'Documento salvo' })
    for (const aviso of r.avisos) toast({ tone: 'warning', message: aviso })
    void reload()
  }

  if (error && !data) return <Alert tone="danger" title="Não foi possível carregar os documentos" action={<Button variant="secondary" onClick={() => void reload()}>Tentar de novo</Button>}>{error}</Alert>
  if (loading && !data) return <Skeleton shape="rect" height={160} />
  if (!dono) return <p className="doc-muted">Cadastro não encontrado na lista de documentos.</p>

  return (
    <section className="doc-checklist" aria-labelledby={titulo ? `${donoId}-docs` : undefined} aria-label={titulo ? undefined : 'Documentos'}>
      {titulo ? <h3 id={`${donoId}-docs`} className="doc-checklist__title">{titulo}</h3> : null}
      {error ? <Alert tone="danger" title="Não foi possível atualizar os documentos" action={<Button variant="secondary" onClick={() => void reload()}>Tentar de novo</Button>}>{error}</Alert> : null}
      <ul className="doc-checklist__list">
        {itens.map((item) => <ItemLinha key={`${item.tipo.id}:${item.vigente?.id ?? 'novo'}`} item={item} source={source} limite={limite} onRenovar={() => setAlvo({ tipo: item.tipo, dono, anterior: item.vigente })} />)}
      </ul>
      <RenovarDrawer alvo={alvo} source={source} onClose={() => setAlvo(null)} onSaved={onSaved} />
    </section>
  )
}

const TIPOS_ACEITOS = /\.(pdf|jpe?g|png)$/i
const MIME_ACEITOS = new Set(['application/pdf', 'image/jpeg', 'image/png'])

/** Mesmas regras do drawer: PDF, JPG ou PNG, até DOC_MAX_BYTES. Devolve a mensagem de erro ou null. */
function validarArquivo(file: File) {
  if (!TIPOS_ACEITOS.test(file.name) && !MIME_ACEITOS.has(file.type)) return `${file.name} não é PDF, JPG ou PNG.`
  return acceptFiles([file], 0, { maxSize: DOC_MAX_BYTES }).error
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const IMAGEM = /\.(jpe?g|png|gif|webp|heic)$/i
const iconeArquivo = (arq: Arquivo) => {
  if (arq.mimeType?.startsWith('image/') || IMAGEM.test(arq.nome)) return <FileImage size={14} aria-hidden />
  if (arq.mimeType === 'application/pdf' || /\.pdf$/i.test(arq.nome)) return <FileText size={14} aria-hidden />
  return <FileIcon size={14} aria-hidden />
}

function ItemLinha({ item, source, limite, onRenovar }: { item: ItemChecklist; source: DocsSource; limite: Limite; onRenovar: () => void }) {
  const toast = useToast()
  const [verHistorico, setVerHistorico] = useState(false)
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [erroArq, setErroArq] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [falhaEnvio, setFalhaEnvio] = useState<{ file: File; erro: string } | null>(null)
  const [confirmar, setConfirmar] = useState<Arquivo | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [falhaExclusao, setFalhaExclusao] = useState<{ arq: Arquivo; erro: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const vivo = useRef(true)
  const v = item.vigente

  const carregarArquivos = async (doc: DocEmitido) => {
    setErroLista(null)
    try {
      const lista = await limite(() => source.arquivos(doc))
      if (vivo.current) setArquivos(lista)
    } catch (e) { if (vivo.current) setErroLista(msg(e)) }
  }
  // Os arquivos do vigente ficam sempre à vista: listados ao montar (a chave do item muda quando o vigente muda).
  useEffect(() => {
    vivo.current = true
    if (v) void carregarArquivos(v)
    return () => { vivo.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Anexa (ou reenvia) um arquivo ao vigente: serve para upload que falhou e para documento migrado sem arquivo. */
  const enviar = async (doc: DocEmitido, file: File) => {
    setErroArq(null)
    const invalido = validarArquivo(file)
    if (invalido) { setFalhaEnvio(null); setErroArq(invalido); return }
    setEnviando(true)
    try {
      await source.enviarArquivo(doc, file)
      setFalhaEnvio(null)
      toast({ tone: 'success', message: 'Arquivo enviado' })
      await carregarArquivos(doc)
    } catch (e) {
      setFalhaEnvio({ file, erro: msg(e) })
    } finally { setEnviando(false) }
  }
  const excluir = async (doc: DocEmitido, arq: Arquivo) => {
    setExcluindo(true)
    try {
      await source.excluirArquivo(doc, arq)
      setFalhaExclusao(null)
      setArquivos((lista) => lista?.filter((a) => a.id !== arq.id) ?? lista)
      toast({ tone: 'success', message: 'Arquivo excluído' })
    } catch (e) {
      setFalhaExclusao({ arq, erro: msg(e) })
    } finally { setExcluindo(false); setConfirmar(null) }
  }
  const abrir = async (arq: Arquivo) => {
    setErroArq(null)
    // Abre a janela já no clique (gesto do usuário); o arquivo entra depois do download.
    const janela = window.open('', '_blank')
    if (!janela) { setErroArq('O navegador bloqueou a abertura do arquivo. Permita pop-ups para este site e tente de novo.'); return }
    try {
      const { blob } = await source.abrirArquivo(arq)
      const url = URL.createObjectURL(blob)
      janela.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      janela.close()
      setErroArq(msg(e))
    }
  }

  const escolher = () => inputRef.current?.click()
  const comArquivos = Boolean(arquivos?.length)
  // Enquanto lista, o Enviar arquivo espera: depois vira ação primária (sem arquivo) ou ícone ao lado dos arquivos.
  const semArquivo = Boolean(v) && (arquivos?.length === 0 || (arquivos === null && erroLista !== null))

  return (
    <li className="doc-item" aria-label={item.tipo.nome}>
      <div className="doc-item__head">
        <strong className="doc-item__nome">{item.tipo.nome}</strong>
        <span className="doc-item__estado">
          <StatusDoc estado={item.estado} dias={item.dias} />
          {item.historico.length ? (
            <Button size="compact" variant="ghost" className="doc-item__historico-btn" icon={<History size={16} />} aria-label={`Histórico (${item.historico.length})`} title="Versões anteriores" aria-expanded={verHistorico} onClick={() => setVerHistorico((x) => !x)}>
              <span className="doc-contador" aria-hidden>{item.historico.length}</span>
            </Button>
          ) : null}
        </span>
      </div>
      {v ? (
        <p className="doc-muted">
          {v.numero ? `Nº ${v.numero} · ` : ''}{v.emissao ? `Emissão ${formatBR(v.emissao)} · ` : ''}{v.validade ? `Validade ${formatBR(v.validade)}` : 'Sem validade'}{v.observacao ? ` · ${v.observacao}` : ''}
        </p>
      ) : null}
      {v && arquivos === null && !erroLista ? <Skeleton className="doc-arquivos__skeleton" shape="rect" height={28} /> : null}
      {v && comArquivos ? (
        <div className="doc-arquivos">
          <ul className="doc-arquivos__lista" aria-label={`Arquivos de ${item.tipo.nome}`}>
            {arquivos!.map((a) => {
              const nome = nomeAmigavel(a.nome)
              return (
                <li key={a.id} className="doc-arq">
                  <button type="button" className="doc-arq__abrir" title={a.nome} aria-label={`Abrir ${nome}`} onClick={() => void abrir(a)}>
                    {iconeArquivo(a)}<span className="doc-arq__nome">{elipseMeio(nome)}</span>
                  </button>
                  <Button size="compact" variant="ghost" className="doc-arq__excluir" icon={<Trash2 size={14} />} aria-label={`Excluir ${nome}`} title={`Excluir ${nome}`} onClick={() => setConfirmar(a)} />
                </li>
              )
            })}
          </ul>
          <Button size="compact" variant="ghost" icon={<Paperclip size={14} />} aria-label="Enviar arquivo" title="Enviar arquivo" loading={enviando} onClick={escolher} />
        </div>
      ) : null}
      {v && arquivos?.length === 0 ? <p className="doc-muted">Nenhum arquivo enviado.</p> : null}
      <div className="doc-item__acoes">
        {v ? (
          <>
            {semArquivo ? <Button size="compact" variant="primary" icon={<Paperclip size={14} />} loading={enviando} onClick={escolher}>Enviar arquivo</Button> : null}
            <Button size="compact" variant="secondary" icon={<UploadIcon size={14} />} onClick={onRenovar}>Renovar</Button>
            <input ref={inputRef} type="file" hidden accept={ACCEPT} aria-label={`Arquivo para ${item.tipo.nome}`}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void enviar(v, file) }} />
          </>
        ) : <Button size="compact" variant="primary" icon={<Plus size={14} />} onClick={onRenovar}>Adicionar</Button>}
      </div>
      {erroArq ? <p className="doc-muted" role="alert">{erroArq}</p> : null}
      {v && erroLista ? (
        <Alert tone="danger" title="Arquivos não listados" action={<Button size="compact" variant="secondary" onClick={() => void carregarArquivos(v)}>Tentar de novo</Button>}>{erroLista}</Alert>
      ) : null}
      {v && falhaEnvio ? (
        <Alert tone="danger" title="Arquivo não enviado"
          action={<Button size="compact" variant="secondary" loading={enviando} onClick={() => void enviar(v, falhaEnvio.file)}>Tentar de novo</Button>}>
          {falhaEnvio.file.name}: {falhaEnvio.erro}
        </Alert>
      ) : null}
      {v && falhaExclusao ? (
        <Alert tone="danger" title="Arquivo não excluído"
          action={<Button size="compact" variant="secondary" loading={excluindo} onClick={() => void excluir(v, falhaExclusao.arq)}>Tentar de novo</Button>}>
          {nomeAmigavel(falhaExclusao.arq.nome)}: {falhaExclusao.erro}
        </Alert>
      ) : null}
      {verHistorico ? (
        <ul className="doc-item__historico">
          {item.historico.map((h) => <li key={h.id} className="doc-muted">Substituído · {h.validade ? `validade ${formatBR(h.validade)}` : 'sem validade'}{h.numero ? ` · Nº ${h.numero}` : ''}</li>)}
        </ul>
      ) : null}
      {v && confirmar ? (
        <Dialog open tone="danger" title="Excluir arquivo?" onClose={() => { if (!excluindo) setConfirmar(null) }}
          actions={<>
            <Button variant="secondary" disabled={excluindo} onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variant="danger" loading={excluindo} onClick={() => void excluir(v, confirmar)}>Excluir</Button>
          </>}>
          {nomeAmigavel(confirmar.nome)} será excluído do SharePoint. Esta ação não pode ser desfeita.
        </Dialog>
      ) : null}
    </li>
  )
}
