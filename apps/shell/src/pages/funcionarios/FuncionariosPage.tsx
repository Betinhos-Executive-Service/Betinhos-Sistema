import { Alert, Button, EmptyState, SearchBox, ToastProvider, ViewBar } from '@betinhos/ui'
import { Cake, CloudOff, IdCard, KeyRound, Plus, RefreshCw, SearchX, Stethoscope } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { listCache } from '../../app/listCache'
import { useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryFilters, useQueryId, useQueryTexto } from '../../nav/queryState'
import type { AlertKind } from './data/alerts'
import { todaySP } from './data/dates'
import { applyBaseFilters, applyFilters, countAlertas, DEFAULT_FILTERS, loadFilters, saveFilters, withAlertas, type Filters } from './data/filters'
import { FUNCIONARIO_COLUMNS, FUNCIONARIO_DEFAULT_FILTERS, FUNCIONARIO_FIELDS, FUNCIONARIO_SORT, TELA, builtinViews, fromLegacyFilters, matchesAlerta, matchesKeyword, readFuncionario, sortFuncionarios } from './data/lista'
import { type AcessoInicial, createAcessoSource } from './data/acesso'
import { createFuncionariosSource } from './data/hostSource'
import { funcionariosQuery } from './data/query'
import type { DataSource } from './data/source'
import type { Funcionario, FuncionarioView } from './data/types'
import { errorMessage } from './data/xrm'
import { createDocsSource, type DocsSource } from '../documentos/data/source'
import { EnvBadge } from './components/Badges'
import { CadastroAcessoDrawer } from './components/CadastroAcessoDrawer'
import { Ficha } from './components/Ficha'
import { MobileHome } from './components/MobileHome'
import { useIsMobile } from './lib/useMediaQuery'
import { FuncionarioTable } from './components/FuncionarioTable'
import './funcionarios.css'

type Selection = { mode: 'closed' } | { mode: 'new' } | { mode: 'open'; id: string }

const CHIPS: { kind: AlertKind; label: string; icon: typeof IdCard }[] = [
  { kind: 'cnh', label: 'CNH', icon: IdCard },
  { kind: 'aso', label: 'ASO', icon: Stethoscope },
  { kind: 'aniversario', label: 'Aniversários', icon: Cake },
]

const ALERTAS: readonly AlertKind[] = ['cnh', 'aso', 'aniversario']
const LEGACY_KEYS = ['status', 'funcao', 'empresa', 'vinculo'] as const
const MOCK_HOST: Host = { mode: 'mock' }
const NENHUM: Funcionario[] = []

export function FuncionariosPage({ host }: { host: Host }) {
  const [state] = useState(() => {
    try { return { source: createFuncionariosSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  })
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  return (
    <ToastProvider>
      {state.source ? <Funcionarios source={state.source} docs={docs} host={host} /> : (
        <PageLayout eyebrow="Gestão de pessoas" title="Funcionários">
          <Alert tone="danger" title="Não foi possível abrir Funcionários">{state.error}. Abra o Sistema Betinhos pelo Dataverse.</Alert>
        </PageLayout>
      )}
    </ToastProvider>
  )
}

/** Página com a fonte já resolvida; exportada para os testes. A rota do shell ocupa o hash, então a ficha aberta fica no estado. */
export function Funcionarios({ source, docs, host = MOCK_HOST }: { source: DataSource; docs?: DocsSource | null; host?: Host }) {
  // Primeira página antes do resto e cache por sessão: voltar à tela dentro do TTL não recarrega.
  const load = useCallback((partial: (rows: Funcionario[]) => void) => source.list(partial), [source])
  const carga = useProgressiveData<Funcionario[]>({ cache: listCache(source), key: 'funcionarios', load })
  const rows = carga.data ?? NENHUM
  const { loading, error, mutate } = carga
  const pending = !carga.complete && loading
  const reload = carga.reload
  // Celular: filtros próprios na URL (#/funcionarios?q=…&funcao=…); sem filtro na abertura, entram os últimos usados neste navegador.
  const mobile = useIsMobile()
  // A semente (últimos filtros deste navegador) só vale no celular: no desktop ela viraria um link antigo e trocaria a visão.
  const [filters, setFiltersUrl] = useQueryFilters(funcionariosQuery, mobile ? loadFilters : undefined)
  const setFilters = (next: Filters) => setFiltersUrl(next)
  const [fichaId, setFichaId] = useQueryId('ficha')
  const selection: Selection = fichaId === null ? { mode: 'closed' } : fichaId === 'novo' ? { mode: 'new' } : { mode: 'open', id: fichaId }
  const setSelection = (next: Selection) => setFichaId(next.mode === 'closed' ? null : next.mode === 'new' ? 'novo' : next.id)
  const today = todaySP()

  useEffect(() => { if (mobile) saveFilters(filters) }, [mobile, filters])

  // A busca filtra 200 ms depois da última tecla (celular e desktop); o texto de cada colaborador já vem normalizado.
  const buscaCelular = useDebouncedText(filters.search)
  const filtrosCelular = useMemo(() => ({ ...filters, search: buscaCelular }), [filters, buscaCelular])
  const views = useMemo(() => withAlertas(rows, today), [rows, today])
  const base = useMemo(() => applyBaseFilters(views, filtrosCelular), [views, filtrosCelular])
  const visible = useMemo(() => applyFilters(views, filtrosCelular), [views, filtrosCelular])
  const counts = useMemo(() => countAlertas(base), [base])

  // Desktop: visões, colunas e filtros do Design System (§10.9.1/§10.9.2); a Visão padrão esconde os desligados.
  // Busca (`q`) e chips de alerta (`alerta`) ficam fora da visão; os filtros vão em `f=`.
  const lista = useListView({
    host,
    defaultName: 'Funcionários',
    tela: TELA,
    columns: FUNCIONARIO_COLUMNS,
    defaultSort: FUNCIONARIO_SORT,
    defaultFilters: FUNCIONARIO_DEFAULT_FILTERS,
    fields: FUNCIONARIO_FIELDS,
    ready: true,
    builtins: builtinViews,
    // No celular os parâmetros antigos continuam sendo o filtro da tela: só o desktop converte e retira.
    legacy: mobile ? undefined : { keys: LEGACY_KEYS, read: (q) => fromLegacyFilters(funcionariosQuery.ler(q)) },
  })
  const [busca, setBusca] = useQueryTexto('q')
  const termo = useDebouncedText(busca)
  const [alertaUrl, setAlerta] = useQueryTexto('alerta')
  const alerta = ALERTAS.find((kind) => kind === alertaUrl) ?? null
  const desktopFiltrados = useMemo(() => filterRows(views, lista.filters, FUNCIONARIO_FIELDS, readFuncionario), [views, lista.filters])
  const desktopBase = useMemo(() => desktopFiltrados.filter((row) => matchesKeyword(row, termo)), [desktopFiltrados, termo])
  const desktopCounts = useMemo(() => countAlertas(desktopBase), [desktopBase])
  const desktopVisible = useMemo<FuncionarioView[]>(
    () => sortFuncionarios(desktopBase.filter((row) => matchesAlerta(row, alerta)), lista.view.config.sort),
    [desktopBase, alerta, lista.view.config.sort],
  )
  // Rolagem infinita (sem paginação visível): trocar filtro, busca, alerta ou ordenação volta ao primeiro lote.
  const lazyKey = useMemo(() => JSON.stringify({ f: lista.filters, termo, alerta, sort: lista.view.config.sort }), [lista.filters, termo, alerta, lista.view.config.sort])
  const desktopSlice = useLazySlice(desktopVisible, lazyKey)
  const mobileSlice = useLazySlice(visible, JSON.stringify(filtrosCelular))
  const clearDesktop = () => { lista.clearFilters(); setBusca(''); setAlerta('') }

  const update = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })

  const onSaved = useCallback(async (id: string, created: boolean) => {
    try {
      const fresh = await source.get(id)
      mutate((current) => (created ? [...current, fresh] : current.map((row) => (row.id === id ? fresh : row))))
    } catch {
      void reload()
    }
    if (created) setSelection({ mode: 'open', id })
  }, [source, reload, mutate])

  const [acessoAberto, setAcessoAberto] = useState<{ inicial?: AcessoInicial } | null>(null)
  const acesso = useMemo(() => createAcessoSource(host), [host])
  const onAcessoCadastrado = useCallback((id: string) => {
    setAcessoAberto(null)
    void onSaved(id, !rows.some((row) => row.id === id))
    setSelection({ mode: 'open', id })
  }, [onSaved, rows])

  const ativos = views.filter((row) => row.values.cr40f_status === 0).length
  const ficha = selection.mode !== 'closed' && (
    <Ficha source={source} docs={docs} id={selection.mode === 'open' ? selection.id : null} onClose={() => setSelection({ mode: 'closed' })} onSaved={onSaved} acesso={acesso} onCadastrarAcesso={(inicial) => setAcessoAberto({ inicial })} />
  )

  if (mobile) {
    return (
      <div className="func">
        <MobileHome
          views={views}
          visible={visible}
          shown={mobileSlice.slice}
          footer={<LazyFooter loaded={mobileSlice.slice.length} more={mobileSlice.more} onLoadMore={mobileSlice.loadMore} pending={pending} />}
          counts={counts}
          filters={filters}
          update={update}
          reset={() => setFilters(DEFAULT_FILTERS)}
          ativos={ativos}
          loading={loading}
          error={error}
          envLabel={source.envLabel}
          onReload={() => void reload()}
          onOpen={(id) => setSelection({ mode: 'open', id })}
          onNew={() => setSelection({ mode: 'new' })}
        />
        {ficha}
      </div>
    )
  }

  const { view, quickFilters } = lista
  return (
    <div className="page func">
    <div className="app">
      <div role="toolbar" aria-label="Comandos de funcionários" className="toolbar">
        <ViewBar view={view} columns={FUNCIONARIO_COLUMNS} filters={{ fields: FUNCIONARIO_FIELDS }}>
          <EnvBadge env={source.envLabel} />
          <SearchBox aria-label="Buscar colaborador" placeholder="Buscar nome, CPF, telefone ou placa" value={busca} onChange={setBusca} />
          <div className="chips" role="group" aria-label="Alertas de vencimento">
            {CHIPS.map(({ kind, label, icon: Icon }) => (
              <button key={kind} type="button" className={`chip chip--${kind}`} aria-pressed={alerta === kind} disabled={!desktopCounts[kind] && alerta !== kind} title={kind === 'aniversario' ? 'Aniversários nos próximos 7 dias' : `${label} vencida ou vencendo em até 60 dias`} onClick={() => setAlerta(alerta === kind ? '' : kind)}>
                <Icon size={14} aria-hidden />
                {label}
                <strong>{desktopCounts[kind]}</strong>
              </button>
            ))}
          </div>
          <Button variant="secondary" icon={<RefreshCw size={16} className={loading ? 'spin' : ''} />} aria-label="Recarregar lista" title="Recarregar" onClick={() => void reload()} disabled={loading} />
          <Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => setAcessoAberto({})}>Cadastrar acesso</Button>
          <Button icon={<Plus size={16} />} onClick={() => setSelection({ mode: 'new' })}>Novo</Button>
        </ViewBar>
      </div>

      <main className="content">
        {error && rows.length ? (
          <Alert tone="danger" title={carga.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={() => void reload()}>Tentar de novo</Button>}>
            {error} {carga.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só os colaboradores que chegaram.'}
          </Alert>
        ) : null}
        {error && !rows.length ? (
          <EmptyState className="surface" tone="danger" icon={<CloudOff />} title="Não foi possível carregar os colaboradores." action={<Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void reload()}>Tentar de novo</Button>}>{error}</EmptyState>
        ) : (
          <>
          <FuncionarioTable
            rows={desktopSlice.slice}
            loading={loading && !rows.length}
            onOpen={(id) => setSelection({ mode: 'open', id })}
            view={{ config: view.config, onChange: view.setConfig }}
            quickFilters={quickFilters}
            footer={<span className="toolbar-count">{desktopVisible.length} de {views.length} · {ativos} ativos{pending ? ' · carregando o restante…' : ''}</span>}
            empty={pending
              ? <EmptyState align="start" icon={<SearchX />} title="Procurando no restante da lista…" />
              : <EmptyState align="start" icon={<SearchX />} title="Nenhum colaborador encontrado para estes filtros." action={<Button variant="secondary" onClick={clearDesktop}>Limpar filtros</Button>}>Revise a busca ou limpe os filtros para ver a lista completa.</EmptyState>}
          />
          <LazyFooter loaded={desktopSlice.slice.length} more={desktopSlice.more} onLoadMore={desktopSlice.loadMore} pending={pending} />
          </>
        )}
      </main>

      {ficha}
      {acessoAberto && <CadastroAcessoDrawer acesso={acesso} inicial={acessoAberto.inicial} onClose={() => setAcessoAberto(null)} onCadastrado={onAcessoCadastrado} />}
    </div>
    </div>
  )
}
