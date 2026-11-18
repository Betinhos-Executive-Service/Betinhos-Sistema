import { useCallback, useMemo, type ReactNode } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, useShellHeader } from '@betinhos/ui'
import { Landmark, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { listCache } from '../../app/listCache'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { ListaAgrupada, useRowGroups } from '../../app/ListaAgrupada'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { ENTITY, createSource } from './data/source'
import { CLIENTE_COLUMNS, TELA, builtinViews, clienteFields, clienteKeywordText, readCliente, sortClientes } from './domain/lista'
import type { Cliente } from './domain/types'
import { ClientesCards, ClientesTable } from './components/ClientesList'
import { ClienteDrawer } from './components/ClienteDrawer'
import './clientes.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

export function ClientesPage({ host }: { host: Host }) {
  return <ToastProvider><Clientes host={host} /></ToastProvider>
}

const EMPTY: Cliente[] = []
const byId = (c: Cliente) => c.id

function Clientes({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const load = useCallback(async () => source.load(), [source])
  const cs = useProgressiveData<Cliente[]>({ cache: listCache(host), key: 'clientes', load })
  const list = cs.data ?? EMPTY
  const ready = cs.data != null
  const upsert = useCallback((c: Cliente) => cs.mutate((d) => (d.some((x) => x.id === c.id) ? d.map((x) => (x.id === c.id ? c : x)) : [c, ...d])), [cs.mutate])

  const [query, setQuery] = useQueryTexto('q')
  const [target, setTarget] = useQueryAlvo()
  const q = useDebouncedText(query)
  const fields = useMemo(() => clienteFields(list), [list])

  const ids = useMemo(() => list.map((c) => c.id), [list])
  const { view, filters: valid, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host, defaultName: 'Todos os clientes', tela: TELA, columns: CLIENTE_COLUMNS, defaultSort: { key: 'nome', dir: 'asc' }, fields, ready, builtins: builtinViews,
    extra: { entity: ENTITY, ids },
  })

  const sorted = useMemo(() => {
    const sort = view.config.sort
    return extra.sort(sort ? sortClientes(list, sort.key, sort.dir) : list, sort, byId)
  }, [list, view.config.sort, extra])
  const read = useMemo(() => extra.read(readCliente, byId), [extra])
  const filtered = useMemo(() => filterRows(sorted, valid, allFields, read), [sorted, valid, allFields, read])
  const index = useMemo(() => keywordIndex<Cliente>(clienteKeywordText), [])
  const words = useMemo(() => searchWords(q), [q])
  const visible = useMemo(() => {
    return words.length ? filtered.filter((c) => index.matches(c, words)) : filtered
  }, [filtered, index, words])
  const groups = useRowGroups(visible, view.config.group, allFields, read)
  const lazyKey = useMemo(() => JSON.stringify({ valid, q, sort: view.config.sort }), [valid, q, view.config.sort])

  const refresh = useCallback(() => { void cs.reload() }, [cs.reload])
  // "Atualizar" fica na linha de comando em todas as larguras; o cabeçalho do celular não repete.
  useShellHeader({ title: 'Clientes' })
  const size = mobile ? 'touch' : 'default'
  const clearAll = () => { clearFilters(); setQuery('') }
  const create = () => setTarget({ mode: 'create' })

  let body
  if (cs.error && !ready) {
    body = <Alert tone="danger" title="Não foi possível carregar os clientes" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error}</Alert>
  } else if (!ready) {
    body = <ClientesTable list={[]} onOpen={() => undefined} loading />
  } else if (!list.length) {
    body = <EmptyState className="surface" align="start" icon={<Landmark size={36} />} title="Nenhum cliente cadastrado" action={<Button icon={<Plus size={16} />} onClick={create}>Novo cliente</Button>}>Cadastre os clientes para vinculá-los às pessoas e reservas.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="cl-num">{visible.length} de {list.length}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum cliente com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    const table = (rows: Cliente[], tableFooter?: ReactNode) => (
      <ClientesTable list={rows} onOpen={open} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true, extraCell: extra.cell }} quickFilters={quickFilters} footer={tableFooter} empty={empty} />
    )
    const cards = (rows: Cliente[]) => <ClientesCards list={rows} onOpen={open} />
    body = groups
      ? <ListaAgrupada groups={groups} group={view.config.group} lazyKey={lazyKey} mobile={mobile} table={table} cards={cards} footer={footer} />
      : mobile
        ? (visible.length ? cards(visible) : <div className="surface">{empty}</div>)
        : table(visible, footer)
  }

  return (
    <div className="page page--full cl-page">
      <div role="toolbar" aria-label="Comandos de clientes">
        <ViewBar pinnable onAudit={() => auditoria({ entity: ENTITY, onOpenRecord: (id) => setTarget({ mode: 'view', id }) })} view={view} columns={CLIENTE_COLUMNS} catalog={extra.catalog} filters={ready ? { fields: allFields } : undefined}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por nome, registro, endereço ou data de cadastro" aria-label="Buscar clientes" />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />
            <Button size={size} icon={<Plus size={16} />} disabled={!ready} onClick={create}>Novo cliente</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {cs.error && ready ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {ready ? <ClienteDrawer target={target} onTarget={setTarget} list={list} source={source} onSaved={upsert} /> : null}
    </div>
  )
}
