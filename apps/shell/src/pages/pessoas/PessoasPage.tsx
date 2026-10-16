import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, Pagination, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader, useToast } from '@betinhos/ui'
import { Plus, RefreshCw, SearchX, Users } from 'lucide-react'
import type { Host } from '../../host'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryPagina, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { label } from './domain/choices'
import { duplicateIndex } from './domain/duplicates'
import { VIEWS_KEY, clienteOptions, loadViews } from './domain/filters'
import { PESSOA_COLUMNS, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, matchesKeyword, pessoaFields, readPessoa, sortPessoas } from './domain/lista'
import { pessoasQuery } from './domain/query'
import { usePessoas } from './usePessoas'
import { PessoasCards, PessoasTable } from './components/PessoasList'
import { PessoaDrawer } from './components/PessoaDrawer'
import './pessoas.css'

export function PessoasPage({ host }: { host: Host }) {
  return <ToastProvider><Pessoas host={host} /></ToastProvider>
}

const PAGE_SIZE = 50
/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. */
const LEGACY_KEYS = ['cliente', 'classificacao', 'idioma', 'status', 'duplicados'] as const

function Pessoas({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const ps = usePessoas(source)
  const choices = ps.choices

  const dups = useMemo(() => duplicateIndex(ps.list), [ps.list])
  const dupIds = useMemo(() => new Set(dups.keys()), [dups])
  const clientes = useMemo(() => clienteOptions(ps.list), [ps.list])
  const fields = useMemo(() => (choices ? pessoaFields(choices, clientes) : []), [choices, clientes])

  const { view, filters: valid, quickFilters, clearFilters } = useListView({
    host,
    tela: TELA,
    columns: PESSOA_COLUMNS,
    defaultSort: { key: 'nome', dir: 'asc' },
    fields,
    ready: Boolean(choices),
    builtins: () => (choices ? builtinViews(choices) : []),
    legacy: { keys: LEGACY_KEYS, read: (q) => fromLegacyFilters(pessoasQuery.ler(q), choices!, clientes) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters, choices!, clientes) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca, página e ficha continuam na URL; os filtros vão em `f=` (useListView).
  const [query, setQuery] = useQueryTexto('q')
  const [page, setPage] = useQueryPagina()
  const [target, setTarget] = useQueryAlvo()

  const visible = useMemo(() => {
    if (!choices) return []
    const read = (p: (typeof ps.list)[number], key: string) => readPessoa(p, key, dupIds)
    const list = ps.list.filter((p) => matchesFilters(p, valid, fields, read) && matchesKeyword(p, query, label(choices.cargo, p.cargo)))
    const sort = view.config.sort
    return sort ? sortPessoas(list, sort.key, sort.dir, choices) : list
  }, [ps.list, valid, fields, query, choices, dupIds, view.config.sort])

  const refresh = useCallback(() => { void ps.reload() }, [ps.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pessoas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pessoas', actions: headerActions })
  const clearAll = () => { clearFilters(); setQuery('') }

  let body
  if (ps.error && !choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as pessoas" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error}</Alert>
  } else if (!choices) {
    body = <PessoasTable list={[]} choices={{ cargo: [], classificacao: [], idioma: [], status: [], sexo: [], tipoVeiculo: [] }} dups={dups} onOpen={() => undefined} loading />
  } else if (!ps.list.length) {
    body = <EmptyState className="surface" align="start" icon={<Users size={36} />} title="Nenhuma pessoa cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>}>Cadastre passageiros e solicitantes para usar nas reservas.</EmptyState>
  } else {
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="ps-num">{visible.length} de {ps.list.length} · {dupIds.size} possíveis duplicados</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum registro com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <PessoasCards list={slice} choices={choices} dups={dups} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <PessoasTable list={slice} choices={choices} dups={dups} onOpen={open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="pessoas" /> : null}
      </>
    )
  }

  return (
    <div className="page ps-page">
      <div role="toolbar" aria-label="Comandos de pessoas">
        <ViewBar view={view} columns={PESSOA_COLUMNS} filters={choices ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="ps-filters__search" value={query} onChange={setQuery} placeholder="Buscar por nome, cliente, celular ou e-mail" aria-label="Buscar pessoas" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={ps.loading && Boolean(choices)} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!choices} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>
        </ViewBar>
      </div>
      {ps.error && choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {choices ? <PessoaDrawer target={target} onTarget={setTarget} list={ps.list} dups={dups} choices={choices} source={source} onSaved={ps.upsert} /> : null}
    </div>
  )
}
