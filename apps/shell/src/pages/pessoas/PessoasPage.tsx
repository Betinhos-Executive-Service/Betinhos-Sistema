import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, useShellHeader, useToast } from '@betinhos/ui'
import { Plus, RefreshCw, SearchX, Users } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { listCache } from '../../app/listCache'
import { keywordIndex, searchWords, useDebouncedText, useMergedById, useServerSearch } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { label } from './domain/choices'
import { duplicateIndex } from './domain/duplicates'
import { VIEWS_KEY, clienteOptions, loadViews } from './domain/filters'
import { PESSOA_COLUMNS, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, pessoaFields, pessoaKeywordText, readPessoa, sortPessoas } from './domain/lista'
import { pessoasQuery } from './domain/query'
import { usePessoas } from './usePessoas'
import { PessoasCards, PessoasTable } from './components/PessoasList'
import { PessoaDrawer } from './components/PessoaDrawer'
import type { Pessoa } from './domain/types'
import './pessoas.css'

export function PessoasPage({ host }: { host: Host }) {
  return <ToastProvider><Pessoas host={host} /></ToastProvider>
}

/** Parâmetros da barra antiga na URL; links com eles abrem com os filtros equivalentes. */
const LEGACY_KEYS = ['cliente', 'classificacao', 'idioma', 'status', 'duplicados'] as const

function Pessoas({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const ps = usePessoas(source, listCache(host))
  const choices = ps.choices

  // Busca e ficha continuam na URL; os filtros vão em `f=` (useListView). A lista filtra 200 ms depois da última tecla.
  const [query, setQuery] = useQueryTexto('q')
  const [target, setTarget] = useQueryAlvo()
  const q = useDebouncedText(query)
  // Enquanto o cadastro não chegou inteiro, a busca também vai ao servidor (quem bate aparece já).
  const found = useServerSearch({ query: q, enabled: Boolean(choices) && !ps.complete, search: source.search })
  const list = useMergedById(ps.list, found)

  const dups = useMemo(() => duplicateIndex(list), [list])
  const dupIds = useMemo(() => new Set(dups.keys()), [dups])
  const clientes = useMemo(() => clienteOptions(list), [list])
  const fields = useMemo(() => (choices ? pessoaFields(choices, clientes) : []), [choices, clientes])

  const { view, filters: valid, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_bancodedados', ids: list.map((p) => p.id) },
    defaultName: 'Todas as pessoas',
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

  // Ordena e filtra uma vez por lista/visão; a cada busca só confere o texto já normalizado de cada linha.
  const sorted = useMemo(() => {
    const sort = view.config.sort
    return extra.sort(choices && sort ? sortPessoas(list, sort.key, sort.dir, choices) : list, sort, (p) => p.id)
  }, [list, choices, view.config.sort])
  const filtered = useMemo(() => {
    const read = (p: Pessoa, key: string) => readPessoa(p, key, dupIds)
    return filterRows(sorted, valid, allFields, extra.read(read, (p) => p.id))
  }, [sorted, valid, fields, dupIds])
  const index = useMemo(() => keywordIndex<Pessoa>((p) => pessoaKeywordText(p, choices ? label(choices.cargo, p.cargo) : '')), [choices])
  const visible = useMemo(() => {
    if (!choices) return []
    const words = searchWords(q)
    return words.length ? filtered.filter((p) => index.matches(p, words)) : filtered
  }, [filtered, index, q, choices])
  // Rolagem infinita: trocar filtro, busca ou ordenação volta ao primeiro lote; a lista crescer (carga em segundo
  // plano) ou recarregar não. A chave é texto para não mudar quando só a identidade dos filtros muda.
  const lazyKey = useMemo(() => JSON.stringify({ valid, q, sort: view.config.sort }), [valid, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)

  const refresh = useCallback(() => { void ps.reload() }, [ps.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pessoas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pessoas', actions: headerActions })
  const clearAll = () => { clearFilters(); setQuery('') }

  let body
  if (ps.error && !choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as pessoas" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error}</Alert>
  } else if (!choices) {
    body = <PessoasTable list={[]} choices={{ cargo: [], classificacao: [], idioma: [], status: [], sexo: [], tipoVeiculo: [] }} dups={dups} onOpen={() => undefined} loading />
  } else if (ps.complete && !ps.list.length) {
    body = <EmptyState className="surface" align="start" icon={<Users size={36} />} title="Nenhuma pessoa cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>}>Cadastre passageiros e solicitantes para usar nas reservas.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const pending = !ps.complete && ps.loading
    const footer = <span className="ps-num">{visible.length} de {list.length} · {dupIds.size} possíveis duplicados{pending ? ' · carregando o restante…' : ''}</span>
    const empty = pending
      ? <EmptyState align="start" icon={<SearchX size={36} />} title="Procurando no restante do cadastro…" />
      : <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum registro com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <PessoasCards list={slice} choices={choices} dups={dups} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <PessoasTable list={slice} choices={choices} dups={dups} onOpen={open} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} pending={pending} />
      </>
    )
  }

  return (
    <div className="page page--full ps-page">
      <div role="toolbar" aria-label="Comandos de pessoas">
        <ViewBar view={view} columns={PESSOA_COLUMNS} catalog={extra.catalog} filters={choices ? { fields: allFields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="ps-filters__search" value={query} onChange={setQuery} placeholder="Buscar por nome, cliente, celular ou e-mail" aria-label="Buscar pessoas" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={ps.loading && Boolean(choices)} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!choices} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>
        </ViewBar>
      </div>
      {ps.error && choices ? (
        <Alert tone="danger" title={ps.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>
          {ps.error} {ps.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só os primeiros registros; busca, filtros e totais valem para eles.'}
        </Alert>
      ) : null}
      {body}
      {choices ? <PessoaDrawer target={target} onTarget={setTarget} list={list} dups={dups} choices={choices} source={source} onSaved={ps.upsert} /> : null}
    </div>
  )
}
