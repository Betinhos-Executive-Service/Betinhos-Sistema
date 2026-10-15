import { Alert, Button, EmptyState, PageHeader, PageToolbar, SearchBox, ToastProvider } from '@betinhos/ui'
import { Cake, CloudOff, IdCard, Plus, RefreshCw, Stethoscope } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryFilters, useQueryId } from '../../nav/queryState'
import type { AlertKind } from './data/alerts'
import { todaySP } from './data/dates'
import { applyBaseFilters, applyFilters, countAlertas, DEFAULT_FILTERS, loadFilters, saveFilters, withAlertas, type Filters, type SortKey } from './data/filters'
import { EMPRESA, FUNCAO, STATUS, VINCULO, type Option } from './data/schema'
import { createFuncionariosSource } from './data/hostSource'
import { funcionariosQuery } from './data/query'
import type { DataSource } from './data/source'
import type { Funcionario } from './data/types'
import { errorMessage } from './data/xrm'
import { createDocsSource, type DocsSource } from '../documentos/data/source'
import { EnvBadge } from './components/Badges'
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

const EMPRESA_CURTA: Option[] = EMPRESA.map((option) => ({ ...option, label: option.value === 202410000 ? 'Betinhos' : 'DePaula' }))

function SelectFilter({ label, allLabel, options, value, onChange }: { label: string; allLabel: string; options: Option[]; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <span className={`bt-control bt-control--compact filter-select${value !== null ? ' is-active' : ''}`}>
      <select className="bt-control__input" aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}>
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </span>
  )
}

export function FuncionariosPage({ host }: { host: Host }) {
  const [state] = useState(() => {
    try { return { source: createFuncionariosSource(host), error: null } } catch (reason) { return { source: null, error: errorMessage(reason) } }
  })
  const docs = useMemo(() => { try { return createDocsSource(host) } catch { return null } }, [host])
  return (
    <ToastProvider>
      {state.source ? <Funcionarios source={state.source} docs={docs} /> : (
        <PageLayout eyebrow="Gestão de pessoas" title="Funcionários">
          <Alert tone="danger" title="Não foi possível abrir Funcionários">{state.error}. Abra o Sistema Betinhos pelo Dataverse.</Alert>
        </PageLayout>
      )}
    </ToastProvider>
  )
}

/** Página com a fonte já resolvida; exportada para os testes. A rota do shell ocupa o hash, então a ficha aberta fica no estado. */
export function Funcionarios({ source, docs }: { source: DataSource; docs?: DocsSource | null }) {
  const [rows, setRows] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Filtros e ficha aberta vivem na URL (#/funcionarios?q=…&funcao=…&ficha=<id|novo>); sem filtro na abertura, entram os últimos usados neste navegador.
  const [filters, setFiltersUrl] = useQueryFilters(funcionariosQuery, loadFilters)
  const setFilters = (next: Filters) => setFiltersUrl(next)
  const [fichaId, setFichaId] = useQueryId('ficha')
  const selection: Selection = fichaId === null ? { mode: 'closed' } : fichaId === 'novo' ? { mode: 'new' } : { mode: 'open', id: fichaId }
  const setSelection = (next: Selection) => setFichaId(next.mode === 'closed' ? null : next.mode === 'new' ? 'novo' : next.id)
  const mobile = useIsMobile()
  const today = todaySP()

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await source.list())
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => saveFilters(filters), [filters])

  const views = useMemo(() => withAlertas(rows, today), [rows, today])
  const base = useMemo(() => applyBaseFilters(views, filters), [views, filters])
  const visible = useMemo(() => applyFilters(views, filters), [views, filters])
  const counts = useMemo(() => countAlertas(base), [base])

  const update = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })
  const toggleStatus = (value: number) => update({ status: filters.status.includes(value) ? filters.status.filter((item) => item !== value) : [...filters.status, value] })
  const sort = (key: SortKey) => update({ sort: key, desc: filters.sort === key ? !filters.desc : false })

  const onSaved = useCallback(async (id: string, created: boolean) => {
    try {
      const fresh = await source.get(id)
      setRows((current) => (created ? [...current, fresh] : current.map((row) => (row.id === id ? fresh : row))))
    } catch {
      void reload()
    }
    if (created) setSelection({ mode: 'open', id })
  }, [source, reload])

  const ativos = views.filter((row) => row.values.cr40f_status === 0).length
  const ficha = selection.mode !== 'closed' && (
    <Ficha source={source} docs={docs} id={selection.mode === 'open' ? selection.id : null} onClose={() => setSelection({ mode: 'closed' })} onSaved={onSaved} />
  )

  if (mobile) {
    return (
      <div className="func">
        <MobileHome
          views={views}
          visible={visible}
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

  return (
    <div className="page func">
    <div className="app">
      <PageHeader
        className="page-head"
        eyebrow="Gestão de pessoas"
        title="Funcionários"
        meta={<><span>{ativos} ativos de {views.length}</span><EnvBadge env={source.envLabel} /></>}
        actions={<>
          <Button variant="secondary" icon={<RefreshCw size={18} className={loading ? 'spin' : ''} />} aria-label="Recarregar lista" title="Recarregar" onClick={() => void reload()} disabled={loading} />
          <Button icon={<Plus size={16} />} onClick={() => setSelection({ mode: 'new' })}>Novo</Button>
        </>}
      />

      <div className="page-search">
        <SearchBox aria-label="Buscar colaborador" placeholder="Buscar nome, CPF, telefone ou placa" value={filters.search} onChange={(search) => update({ search })} />
      </div>

      <PageToolbar
        className="toolbar"
        label="Filtros"
        start={<>
          <div className="bt-segmented bt-segmented--compact" role="group" aria-label="Status">
            {STATUS.map((option) => {
              const on = filters.status.includes(option.value)
              return <button key={option.value} type="button" className={`bt-segmented__item${on ? ' is-active' : ''}`} aria-pressed={on} onClick={() => toggleStatus(option.value)}>{option.label}</button>
            })}
          </div>
          <SelectFilter label="Função" allLabel="Todas as funções" options={FUNCAO} value={filters.funcao} onChange={(funcao) => update({ funcao })} />
          <SelectFilter label="Empresa" allLabel="Todas as empresas" options={EMPRESA_CURTA} value={filters.empresa} onChange={(empresa) => update({ empresa })} />
          <SelectFilter label="Vínculo" allLabel="Todos os vínculos" options={VINCULO} value={filters.vinculo} onChange={(vinculo) => update({ vinculo })} />
          <div className="chips" role="group" aria-label="Alertas de vencimento">
            {CHIPS.map(({ kind, label, icon: Icon }) => (
              <button key={kind} type="button" className={`chip chip--${kind}`} aria-pressed={filters.alerta === kind} disabled={!counts[kind] && filters.alerta !== kind} title={kind === 'aniversario' ? 'Aniversários nos próximos 7 dias' : `${label} vencida ou vencendo em até 60 dias`} onClick={() => update({ alerta: filters.alerta === kind ? null : kind })}>
                <Icon size={14} aria-hidden />
                {label}
                <strong>{counts[kind]}</strong>
              </button>
            ))}
          </div>
        </>}
        end={<>
          <span className="toolbar-count">{visible.length} de {views.length}</span>
          {JSON.stringify({ ...filters, sort: 'nome', desc: false }) !== JSON.stringify(DEFAULT_FILTERS) && (
            <Button variant="ghost" size="compact" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros</Button>
          )}
        </>}
      />

      <main className="content">
        {loading && !rows.length ? <FuncionarioTable.Skeleton />
          : error ? (
            <div className="table-wrap">
              <EmptyState tone="danger" icon={<CloudOff />} title="Não foi possível carregar os colaboradores." action={<Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void reload()}>Tentar de novo</Button>}>{error}</EmptyState>
            </div>
          )
          : <FuncionarioTable rows={visible} filters={filters} selectedId={selection.mode === 'open' ? selection.id : null} onSort={sort} onOpen={(id) => setSelection({ mode: 'open', id })} onReset={() => setFilters(DEFAULT_FILTERS)} />}
      </main>

      {ficha}
    </div>
    </div>
  )
}
