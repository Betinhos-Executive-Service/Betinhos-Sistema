import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, useShellHeader } from '@betinhos/ui'
import { Landmark, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { listCache } from '../../app/listCache'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { CLIENTE_COLUMNS, TELA, builtinViews, clienteFields, clienteKeywordText, readCliente, sortClientes } from './domain/lista'
import type { Cliente } from './domain/types'
import { ClientesCards, ClientesTable } from './components/ClientesList'
import { ClienteDrawer } from './components/ClienteDrawer'
import './clientes.css'

export function ClientesPage({ host }: { host: Host }) {
  return <ToastProvider><Clientes host={host} /></ToastProvider>
}

const EMPTY: Cliente[] = []

function Clientes({ host }: { host: Host }) {
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

  const { view, filters: valid, quickFilters, clearFilters } = useListView({
    host, defaultName: 'Todos os clientes', tela: TELA, columns: CLIENTE_COLUMNS, defaultSort: { key: 'nome', dir: 'asc' }, fields, ready, builtins: builtinViews,
  })

  const sorted = useMemo(() => {
    const sort = view.config.sort
    return sort ? sortClientes(list, sort.key, sort.dir) : list
  }, [list, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, valid, fields, readCliente), [sorted, valid, fields])
  const index = useMemo(() => keywordIndex<Cliente>(clienteKeywordText), [])
  const visible = useMemo(() => {
    const words = searchWords(q)
    return words.length ? filtered.filter((c) => index.matches(c, words)) : filtered
  }, [filtered, index, q])

  const refresh = useCallback(() => { void cs.reload() }, [cs.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar clientes" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Clientes', actions: headerActions })
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
    body = mobile
      ? (visible.length ? <ClientesCards list={visible} onOpen={open} /> : <div className="surface">{empty}</div>)
      : <ClientesTable list={visible} onOpen={open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />
  }

  return (
    <div className="page page--full cl-page">
      <div role="toolbar" aria-label="Comandos de clientes">
        <ViewBar view={view} columns={CLIENTE_COLUMNS} filters={ready ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="cl-search" value={query} onChange={setQuery} placeholder="Buscar por nome, registro ou endereço" aria-label="Buscar clientes" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!ready} onClick={create}>Novo cliente</Button>
        </ViewBar>
      </div>
      {cs.error && ready ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {ready ? <ClienteDrawer target={target} onTarget={setTarget} list={list} source={source} onSaved={upsert} /> : null}
    </div>
  )
}
