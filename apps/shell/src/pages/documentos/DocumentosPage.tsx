// DocumentosPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, EmptyState, MetricCard, PageToolbar, SearchBox, Select, Skeleton, StatusBadge, Tabs, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Clock, FileX, RefreshCw, Settings } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryFilters, useQueryId } from '../../nav/queryState'
import { parseHash, patchHashQuery, readHashQuery, hrefFor } from '../../nav/useHashRoute'
import { todaySP } from '../funcionarios/data/dates'
import { useMedia } from '../operacional/useMedia'
import { createDocsSource, DOCUMENTOS_ALTERADOS, type DocsSource } from './data/source'
import { avisoFalhas, type SalvarDocResult } from './data/salvar'
import { KPIS, contarKpis, filtrarPendencias, montarPendencias } from './domain/pendencias'
import { documentosQuery } from './domain/query'
import type { Categoria, Kpi, Pendencia } from './domain/types'
import { useDocumentos } from './useDocumentos'
import { PendenciasLista } from './components/PendenciasLista'
import { RenovarDrawer, type AlvoRenovar } from './components/RenovarDrawer'
import { ConfigDrawer } from './components/ConfigDrawer'
import { FichaPessoaCentral, FichaVeiculoCentral } from './components/FichaCentral'
import './documentos.css'

const KPI_LABEL: Record<Kpi, string> = { vencido: 'Vencidos', vence7: 'Até 7 dias', vence30: '8 a 30 dias', vence60: '31 a 60 dias', faltando: 'Faltando' }
const KPI_ICONE: Record<Kpi, ReactNode> = { vencido: <AlertTriangle />, vence7: <Clock />, vence30: <CalendarClock />, vence60: <CalendarDays />, faltando: <FileX /> }
const KPI_TOM: Record<Kpi, 'danger' | 'warning' | 'info'> = { vencido: 'danger', vence7: 'danger', vence30: 'warning', vence60: 'info', faltando: 'danger' }
const ABAS: { value: Categoria; label: string }[] = [{ value: 'pessoas', label: 'Pessoas' }, { value: 'frota', label: 'Frota' }]

export function DocumentosPage({ host }: { host: Host }) {
  return <ToastProvider><Documentos host={host} /></ToastProvider>
}

function Documentos({ host }: { host: Host }) {
  const { source, fatal } = useMemo(() => {
    try { return { source: createDocsSource(host) as DocsSource | null, fatal: null } } catch (e) { return { source: null, fatal: e instanceof Error ? e.message : String(e) } }
  }, [host])
  const { data, loading, error, reload } = useDocumentos(source)
  const [filtro, setFiltro] = useQueryFilters(documentosQuery)
  const [alvo, setAlvo] = useState<AlvoRenovar | null>(null)
  const [config, setConfig] = useState(false)
  const [fichaId] = useQueryId('ficha')
  const [fichaPerdida, setFichaPerdida] = useState(false)
  // Algo mudou enquanto a ficha estava aberta (documento, arquivo, cadastro)? Só então fechar recarrega a central.
  const sujo = useRef(false)
  const mobile = useMedia('(max-width: 820px)')
  const toast = useToast()

  const hoje = todaySP()
  const todas = useMemo(() => (data ? montarPendencias(data.tipos, data.donos, data.docs, hoje) : []), [data, hoje])
  const daAba = useMemo(() => todas.filter((p) => p.dono.categoria === filtro.aba), [todas, filtro.aba])
  const kpis = useMemo(() => contarKpis(daAba), [daAba])
  const visiveis = useMemo(() => filtrarPendencias(todas, filtro), [todas, filtro])
  const tiposDaAba = useMemo(() => (data?.tipos ?? []).filter((t) => t.categoria === filtro.aba && t.ativo), [data, filtro.aba])

  const refresh = useCallback(() => { void reload() }, [reload])
  // Atualizar pedido pelo usuário também descarta as listagens de arquivos guardadas.
  const atualizar = useCallback(() => { source?.invalidarArquivos(); void reload() }, [source, reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar documentos" onClick={atualizar} />, [atualizar])
  useShellHeader({ title: 'Documentos', actions: headerActions })

  // A ficha aberta vive na URL (`ficha=<id>`, e `secao=documentos` para pessoas). Abrir cria entrada no histórico,
  // então o voltar do navegador fecha; fechar pelo X só limpa a query.
  const abrirFicha = (p: Pendencia) => {
    const q = readHashQuery()
    q.set('ficha', p.dono.id)
    if (p.dono.categoria === 'pessoas') q.set('secao', 'documentos'); else q.delete('secao')
    sujo.current = false
    setFichaPerdida(false)
    window.location.hash = `${hrefFor(parseHash(window.location.hash).id)}?${q.toString()}`
  }
  const fecharFicha = () => {
    patchHashQuery({ ficha: null, secao: null, fde: null, fate: null })
    if (sujo.current) { sujo.current = false; void reload() }
  }
  const marcarSujo = useCallback(() => { sujo.current = true }, [])
  useEffect(() => {
    window.addEventListener(DOCUMENTOS_ALTERADOS, marcarSujo)
    return () => window.removeEventListener(DOCUMENTOS_ALTERADOS, marcarSujo)
  }, [marcarSujo])
  const donoFicha = fichaId && data ? data.donos.find((d) => d.id === fichaId) ?? null : null
  // Link com ficha de cadastro que não está na lista: tira o parâmetro e avisa.
  const fichaInexistente = Boolean(fichaId && data && !donoFicha)
  useEffect(() => {
    if (!fichaInexistente) return
    setFichaPerdida(true)
    patchHashQuery({ ficha: null, secao: null, fde: null, fate: null })
  }, [fichaInexistente])

  const onSaved = (r: SalvarDocResult) => {
    setAlvo(null)
    if (r.falhas.length) toast({ tone: 'warning', message: avisoFalhas(r.falhas, 'Abra a ficha e use “Enviar arquivo” neste documento para tentar de novo.') })
    else toast({ tone: 'success', message: 'Documento salvo' })
    for (const aviso of r.avisos) toast({ tone: 'warning', message: aviso })
    void reload()
  }

  let body
  if (fatal) body = <Alert tone="danger" title="Documentos indisponíveis">{fatal}</Alert>
  else if (error && !data) body = <Alert tone="danger" title="Não foi possível carregar os documentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{error}</Alert>
  else if (!data) body = <Skeleton shape="rect" height={240} />
  else if (!visiveis.length) body = <EmptyState className="surface" align="start" icon={<CheckCircle2 size={36} />} title={daAba.length ? 'Nenhum documento para estes filtros' : 'Tudo em dia'} action={daAba.length ? <Button variant="secondary" onClick={() => setFiltro({ ...filtro, kpi: null, tipo: null, q: '' })}>Limpar filtros</Button> : undefined} />
  else body = <PendenciasLista lista={visiveis} mobile={mobile} onRenovar={(p) => setAlvo({ tipo: p.tipo, dono: p.dono, anterior: p.doc })} onAbrirFicha={abrirFicha} />

  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Documentos"
      meta={source?.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : undefined}
      description="Vencimentos e documentos obrigatórios de funcionários e da frota."
      actions={<>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading && Boolean(data)} onClick={atualizar}>Atualizar</Button>}
        <Button variant="secondary" icon={<Settings size={16} />} disabled={!data} onClick={() => setConfig(true)}>Configurações</Button>
      </>}
      tabs={<Tabs aria-label="Categoria" value={filtro.aba} onChange={(aba) => setFiltro({ aba, kpi: null, tipo: null, q: filtro.q })} tabs={ABAS} />}
      toolbar={data ? (
        <PageToolbar
          variant="filters"
          label="Filtros de documentos"
          start={<>
            <SearchBox className="doc-toolbar__search" value={filtro.q} onChange={(q) => setFiltro({ ...filtro, q })} placeholder={filtro.aba === 'pessoas' ? 'Buscar funcionário ou documento' : 'Buscar placa ou documento'} aria-label="Buscar documentos" />
            <Select className="doc-toolbar__select" aria-label="Tipo de documento" placeholder="Todos os tipos" searchable={false} clearable value={filtro.tipo} onChange={(v) => setFiltro({ ...filtro, tipo: v })}
              options={tiposDaAba.map((t) => ({ value: t.id, label: t.nome }))} />
          </>}
        />
      ) : undefined}
    >
      {fichaPerdida ? <Alert tone="warning" title="Cadastro não encontrado" onDismiss={() => setFichaPerdida(false)}>O link abria a ficha de um cadastro que não está na lista de documentos.</Alert> : null}
      {error && data ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{error} A lista mostra os dados da carga anterior.</Alert> : null}
      {data ? (
        <div className="doc-kpis"><div className="doc-kpis__grid">
          {KPIS.map((k) => (
            // O MetricCard fica dentro do botão de propósito: o cartão inteiro é um alternador de filtro acessível (aria-pressed).
            <button key={k} type="button" className="doc-kpi" aria-pressed={filtro.kpi === k} onClick={() => setFiltro({ ...filtro, kpi: filtro.kpi === k ? null : k })}>
              <MetricCard icon={KPI_ICONE[k]} tone={KPI_TOM[k]} label={KPI_LABEL[k]} value={kpis[k]} />
            </button>
          ))}
        </div></div>
      ) : null}
      {body}
      {source ? <RenovarDrawer alvo={alvo} source={source} onClose={() => setAlvo(null)} onSaved={onSaved} /> : null}
      {source && donoFicha?.categoria === 'pessoas' ? <FichaPessoaCentral host={host} docs={source} id={donoFicha.id} onClose={fecharFicha} onChanged={marcarSujo} /> : null}
      {source && donoFicha?.categoria === 'frota' ? <FichaVeiculoCentral host={host} docs={source} id={donoFicha.id} onClose={fecharFicha} onChanged={marcarSujo} /> : null}
      {source && data && config ? <ConfigDrawer source={source} data={data} onClose={() => setConfig(false)} onChanged={refresh} /> : null}
    </PageLayout>
  )
}
