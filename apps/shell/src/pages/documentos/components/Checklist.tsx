// components/Checklist.tsx
import { useMemo, useRef, useState } from 'react'
import { acceptFiles, Alert, Button, Skeleton, useToast } from '@betinhos/ui'
import { FileText, Paperclip, Upload as UploadIcon } from 'lucide-react'
import { formatBR, todaySP } from '../../funcionarios/data/dates'
import { DOC_MAX_BYTES } from '../../funcionarios/data/sharepoint'
import type { DocsSource } from '../data/source'
import { avisoFalhas, type SalvarDocResult } from '../data/salvar'
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
        {itens.map((item) => <ItemLinha key={`${item.tipo.id}:${item.vigente?.id ?? 'novo'}`} item={item} source={source} onRenovar={() => setAlvo({ tipo: item.tipo, dono, anterior: item.vigente })} />)}
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

function ItemLinha({ item, source, onRenovar }: { item: ItemChecklist; source: DocsSource; onRenovar: () => void }) {
  const toast = useToast()
  const [verHistorico, setVerHistorico] = useState(false)
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)
  const [erroArq, setErroArq] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [falhaEnvio, setFalhaEnvio] = useState<{ file: File; erro: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const v = item.vigente

  const carregarArquivos = async (doc: DocEmitido) => {
    setErroArq(null)
    try { setArquivos(await source.arquivos(doc)) } catch (e) { setErroArq(e instanceof Error ? e.message : String(e)) }
  }
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
      setFalhaEnvio({ file, erro: e instanceof Error ? e.message : String(e) })
    } finally { setEnviando(false) }
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
      setErroArq(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <li className="doc-item" aria-label={item.tipo.nome}>
      <div className="doc-item__head">
        <strong className="doc-item__nome">{item.tipo.nome}</strong>
        <StatusDoc estado={item.estado} dias={item.dias} />
      </div>
      {v ? (
        <p className="doc-muted">
          {v.numero ? `Nº ${v.numero} · ` : ''}{v.emissao ? `Emissão ${formatBR(v.emissao)} · ` : ''}{v.validade ? `Validade ${formatBR(v.validade)}` : 'Sem validade'}{v.observacao ? ` · ${v.observacao}` : ''}
        </p>
      ) : null}
      <div className="doc-item__acoes">
        <Button size="compact" variant={v ? 'secondary' : 'primary'} icon={<UploadIcon size={14} />} onClick={onRenovar}>{v ? 'Renovar' : 'Adicionar'}</Button>
        {v ? <Button size="compact" variant="ghost" icon={<FileText size={14} />} onClick={() => void carregarArquivos(v)}>Arquivos</Button> : null}
        {v ? <Button size="compact" variant="ghost" icon={<Paperclip size={14} />} loading={enviando} onClick={() => inputRef.current?.click()}>Enviar arquivo</Button> : null}
        {v ? (
          <input ref={inputRef} type="file" hidden accept={ACCEPT} aria-label={`Arquivo para ${item.tipo.nome}`}
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void enviar(v, file) }} />
        ) : null}
        {item.historico.length ? <Button size="compact" variant="ghost" aria-expanded={verHistorico} onClick={() => setVerHistorico((x) => !x)}>{`Histórico (${item.historico.length})`}</Button> : null}
      </div>
      {erroArq ? <p className="doc-muted" role="alert">{erroArq}</p> : null}
      {v && falhaEnvio ? (
        <Alert tone="danger" title="Arquivo não enviado"
          action={<Button size="compact" variant="secondary" loading={enviando} onClick={() => void enviar(v, falhaEnvio.file)}>Tentar enviar de novo</Button>}>
          {falhaEnvio.file.name}: {falhaEnvio.erro}
        </Alert>
      ) : null}
      {arquivos ? (arquivos.length
        ? <ul className="doc-item__arquivos">{arquivos.map((a) => <li key={a.id}><button type="button" className="doc-link" onClick={() => void abrir(a)}>{a.nome}</button></li>)}</ul>
        : <p className="doc-muted">Nenhum arquivo enviado.</p>) : null}
      {verHistorico ? (
        <ul className="doc-item__historico">
          {item.historico.map((h) => <li key={h.id} className="doc-muted">Substituído · {h.validade ? `validade ${formatBR(h.validade)}` : 'sem validade'}{h.numero ? ` · Nº ${h.numero}` : ''}</li>)}
        </ul>
      ) : null}
    </li>
  )
}
