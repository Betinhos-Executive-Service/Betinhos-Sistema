import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, EmptyState, SearchBox, Select, StatusBadge, Table, ToastProvider, ViewBar, matchesFilters, useShellHeader, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { FileText, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { openFromRow, openRowActions } from '../pagantes/components/PagantesList'
import { MAX_LOGS, createSource, type LogApp, type Source } from './data'
import { LogDrawer } from './LogDrawer'
import { LOG_COLUMNS, LOG_SORT, builtinViews, PERIODOS, PERIODO_PADRAO, TELA, logFields, matchesKeyword, periodoStart, periodoValido, quemFoi, readLog, severidadeLabel, severidadeTone, sortLogs } from './lista'
import './logs.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const fmtData = (d: Date | null) => (d ? dateTime.format(d).replace(',', '') : '—')
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

type State = { list: LogApp[]; loaded: boolean; loading: boolean; error: string | null }

/** Carga por período, com token contra respostas fora de ordem; falha mantém a lista anterior. */
function useLogs(source: Source, since: Date) {
  const [state, setState] = useState<State>({ list: [], loaded: false, loading: true, error: null })
  const token = useRef(0)
  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const list = await source.load(since)
      if (current === token.current) setState({ list, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current === token.current) setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source, since])
  useEffect(() => { void reload() }, [reload])
  return { ...state, reload }
}

export function LogsPage({ host }: { host: Host }) {
  return <ToastProvider><Logs host={host} /></ToastProvider>
}

function Logs({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const [periodoUrl, setPeriodo] = useQueryTexto('periodo', PERIODO_PADRAO)
  const periodo = periodoValido(periodoUrl)
  const since = useMemo(() => periodoStart(periodo, new Date()), [periodo])
  const data = useLogs(source, since)

  const fields = useMemo(() => logFields(data.list), [data.list])
  const { view, filters, quickFilters, clearFilters } = useListView({
    host, defaultName: 'Todos os logs', tela: TELA, columns: LOG_COLUMNS, defaultSort: LOG_SORT, fields, ready: true, builtins: builtinViews,
  })
  const [query, setQuery] = useQueryTexto('q')

  const visible = useMemo(() => {
    const list = data.list.filter((l) => matchesFilters(l, filters, fields, readLog) && matchesKeyword(l, query))
    return sortLogs(list, view.config.sort)
  }, [data.list, filters, fields, query, view.config.sort])
  const lazyKey = useMemo(() => ({ filters, query, sort: view.config.sort, periodo }), [filters, query, view.config.sort, periodo])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  const [selectedId, setSelectedId] = useQueryId('ver')
  const selected = selectedId ? data.list.find((l) => l.id === selectedId) ?? null : null

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar logs" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Logs dos apps', actions: headerActions })

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar os logs" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <LogsTable list={[]} onOpen={() => undefined} loading />
  } else if (!data.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileText size={36} />} title="Nenhum log no período">Nenhum app registrou erro neste período.</EmptyState>
  } else {
    const footer = <span className="lg-num">{visible.length} de {data.list.length}{data.list.length >= MAX_LOGS ? ` (limite de ${MAX_LOGS}; reduza o período)` : ''}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum log com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <LogsCards list={slice} onOpen={setSelectedId} /> : <div className="surface">{empty}</div>)
          : <LogsTable list={slice} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page page--full lg-page">
      <div role="toolbar" aria-label="Comandos dos logs">
        <ViewBar onAudit={() => auditoria({ entity: 'new_appmotoristaslog', onOpenRecord: setSelectedId })} view={view} columns={LOG_COLUMNS} filters={{ fields }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="lg-search" value={query} onChange={setQuery} placeholder="Buscar por mensagem, código, tela ou usuário" aria-label="Buscar logs" />
          <Select className="lg-periodo" aria-label="Período" searchable={false} clearable={false} options={PERIODOS} value={periodo} onChange={(v) => setPeriodo(v ?? PERIODO_PADRAO)} />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {data.loaded ? <LogDrawer log={selected} list={data.list} periodo={PERIODOS.find((p) => p.value === periodo)?.label ?? ''} onClose={() => setSelectedId(null)} /> : null}
    </div>
  )
}

function Severidade({ l }: { l: LogApp }) {
  return <StatusBadge tone={severidadeTone(l.severidade)}>{severidadeLabel(l.severidade)}</StatusBadge>
}

type ListProps = { list: LogApp[]; onOpen: (id: string) => void; loading?: boolean }

function LogsTable({ list, onOpen, loading, view, quickFilters, footer, empty }: ListProps & { view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode }) {
  const columns: TableColumn<LogApp>[] = [
    { key: 'mensagem', header: 'Mensagem', label: 'Mensagem', sortable: true, defaultWidth: 380, width: 'minmax(240px, 3fr)', cell: (l) => (
      <button type="button" className="lg-open" onClick={() => onOpen(l.id)}>
        <strong>{l.erro || 'Erro'}</strong>
        <span>{l.mensagem || 'Sem mensagem'}</span>
      </button>
    ) },
    { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 170, width: 'minmax(140px, 1fr)', cell: (l) => <span className="lg-num">{fmtData(l.data)}</span> },
    { key: 'app', header: 'App', label: 'App', sortable: true, defaultWidth: 150, width: 'minmax(110px, 1fr)', cell: (l) => l.app || '—' },
    { key: 'severidade', header: 'Severidade', label: 'Severidade', sortable: true, defaultWidth: 120, width: 'minmax(96px, .7fr)', cell: (l) => <Severidade l={l} /> },
    { key: 'tela', header: 'Tela', label: 'Tela', sortable: true, defaultWidth: 150, width: 'minmax(110px, 1fr)', hideBelow: 'compact', cell: (l) => l.tela || '—' },
    { key: 'usuario', header: 'Usuário', label: 'Usuário', sortable: true, defaultWidth: 170, width: 'minmax(120px, 1fr)', hideBelow: 'compact', cell: (l) => quemFoi(l) || '—' },
    { key: 'versao', header: 'Versão', label: 'Versão', sortable: true, defaultWidth: 110, width: 'minmax(84px, .6fr)', hideBelow: 'compact', cell: (l) => <span className="lg-num">{l.versao || '—'}</span> },
  ]
  return (
    <div onClick={(event) => openFromRow(event, '.bt-table__row', '.lg-open')}>
      <Table className="lg-table" columns={columns} rows={list} rowKey={(l) => l.id} rowActions={openRowActions(onOpen)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
    </div>
  )
}

function LogsCards({ list, onOpen }: ListProps) {
  return (
    <ul className="lg-cards" aria-label="Logs" onClick={(event) => openFromRow(event, '.lg-card', '.lg-card__open')}>
      {list.map((l) => (
        <li key={l.id} className="lg-card">
          <button type="button" className="lg-card__open" onClick={() => onOpen(l.id)}>
            <span className="lg-card__top"><Severidade l={l} /><span className="lg-num lg-muted">{fmtData(l.data)}</span></span>
            <strong className="lg-card__msg">{l.mensagem || l.erro || 'Sem mensagem'}</strong>
            <span className="lg-muted">{[l.app, l.tela, quemFoi(l)].filter(Boolean).join(' · ')}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
