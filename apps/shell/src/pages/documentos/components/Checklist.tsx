// components/Checklist.tsx
import { useMemo, useState } from 'react'
import { Alert, Button, Skeleton, useToast } from '@betinhos/ui'
import { FileText, Upload as UploadIcon } from 'lucide-react'
import { formatBR, todaySP } from '../../funcionarios/data/dates'
import type { DocsSource } from '../data/source'
import type { SalvarDocResult } from '../data/salvar'
import { montarChecklist } from '../domain/pendencias'
import type { Arquivo, DocEmitido, ItemChecklist } from '../domain/types'
import { useDocumentos } from '../useDocumentos'
import { RenovarDrawer, type AlvoRenovar } from './RenovarDrawer'
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
    if (r.falhas.length) toast({ tone: 'warning', message: `Documento salvo, mas arquivos não foram enviados: ${r.falhas.map((f) => `${f.nome} (${f.erro})`).join(' · ')}` })
    else toast({ tone: 'success', message: 'Documento salvo' })
    for (const aviso of r.avisos) toast({ tone: 'warning', message: aviso })
    void reload()
  }

  if (error && !data) return <Alert tone="danger" title="Não foi possível carregar os documentos" action={<Button variant="secondary" onClick={() => void reload()}>Tentar de novo</Button>}>{error}</Alert>
  if (loading && !data) return <Skeleton shape="rect" height={160} />
  if (!dono) return <p className="doc-muted">Cadastro não encontrado na lista de documentos.</p>

  return (
    <section className="doc-checklist" aria-labelledby={`${donoId}-docs`}>
      <h3 id={`${donoId}-docs`} className="doc-checklist__title">{titulo}</h3>
      <ul className="doc-checklist__list">
        {itens.map((item) => <ItemLinha key={item.tipo.id} item={item} source={source} onRenovar={() => setAlvo({ tipo: item.tipo, dono, anterior: item.vigente })} />)}
      </ul>
      <RenovarDrawer alvo={alvo} source={source} onClose={() => setAlvo(null)} onSaved={onSaved} />
    </section>
  )
}

function ItemLinha({ item, source, onRenovar }: { item: ItemChecklist; source: DocsSource; onRenovar: () => void }) {
  const [verHistorico, setVerHistorico] = useState(false)
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null)
  const [erroArq, setErroArq] = useState<string | null>(null)
  const v = item.vigente

  const carregarArquivos = async (doc: DocEmitido) => {
    setErroArq(null)
    try { setArquivos(await source.arquivos(doc)) } catch (e) { setErroArq(e instanceof Error ? e.message : String(e)) }
  }
  const abrir = async (arq: Arquivo) => {
    setErroArq(null)
    try {
      const { blob } = await source.abrirArquivo(arq)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) { setErroArq(e instanceof Error ? e.message : String(e)) }
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
        {item.historico.length ? <Button size="compact" variant="ghost" aria-expanded={verHistorico} onClick={() => setVerHistorico((x) => !x)}>{`Histórico (${item.historico.length})`}</Button> : null}
      </div>
      {erroArq ? <p className="doc-muted" role="alert">{erroArq}</p> : null}
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
