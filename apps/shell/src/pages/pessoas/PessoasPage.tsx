import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, readFilters, storedFilters, useShellHeader, useTableFilters, useTableView, useToast, type TableFilters, type TableViewState, type ViewStore } from '@betinhos/ui'
import { Plus, RefreshCw, SearchX, Users } from 'lucide-react'
import type { Host } from '../../host'
import { decodeTableFilters, encodeTableFilters } from '../../app/filtersUrl'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { viewStoreFor, withBuiltinViews } from '../../app/viewStore'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { patchHashQuery, readHashQuery } from '../../nav/useHashRoute'
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

  // Visões (DS §10.9.1): salvas no Dataverse, mais as prontas do código como públicas só leitura. As prontas dependem
  // das escolhas; a lista espera por elas para o store não mudar (trocar o store recarrega e descarta o filtro da URL).
  const choicesRef = useRef(choices)
  choicesRef.current = choices
  const [gate] = useState(() => {
    let open = () => undefined as void
    const ready = new Promise<void>((resolve) => { open = resolve })
    return { ready, open: () => open() }
  })
  useEffect(() => { if (choices) gate.open() }, [choices, gate])
  const store = useMemo<ViewStore>(() => {
    const base = withBuiltinViews(viewStoreFor(host), () => (choicesRef.current ? builtinViews(choicesRef.current) : []))
    return { ...base, list: async (tela) => { await gate.ready; return base.list(tela) } }
  }, [host, gate])
  const raw = useTableView({ tela: TELA, columns: PESSOA_COLUMNS, store, defaultSort: { key: 'nome', dir: 'asc' } })
  // O que o usuário muda (visão, colunas, filtros) encerra o filtro vindo do link; até lá ele vale a cada recarga.
  const touched = useRef(false)
  const view = useMemo<TableViewState>(() => ({
    ...raw,
    setConfig: (update) => { touched.current = true; raw.setConfig(update) },
    select: (id) => { touched.current = true; raw.select(id) },
    restore: () => { touched.current = true; raw.restore() },
  }), [raw])
  const { filters, quickFilters } = useTableFilters(view, fields)

  // Busca e gaveta continuam na URL; os filtros vão em `f=` (o link compartilhado abre igual).
  const [query, setQuery] = useQueryTexto('q')
  const [target, setTarget] = useQueryAlvo()
  const urlApplied = useRef(false)
  const linked = useRef<TableFilters | null | undefined>(undefined)
  const { status, views } = raw
  const applyConfig = raw.setConfig
  useEffect(() => {
    if (status !== 'ready' || !choices) return
    if (linked.current === undefined) {
      const q = readHashQuery()
      const f = q.get('f')
      const legacy = LEGACY_KEYS.some((k) => q.has(k)) ? fromLegacyFilters(pessoasQuery.ler(q), choices, clientes) : null
      linked.current = (f ? decodeTableFilters(f) : null) ?? legacy
      if (legacy) patchHashQuery(Object.fromEntries(LEGACY_KEYS.map((k) => [k, null])))
    }
    const next = linked.current
    if (next && !touched.current) applyConfig((c) => ({ ...c, filters: storedFilters(next) }))
    urlApplied.current = true
  }, [status, views, choices, clientes, applyConfig])
  const valid = useMemo(() => readFilters(filters, fields), [filters, fields])
  useEffect(() => {
    if (!urlApplied.current) return
    const f = encodeTableFilters(valid)
    if ((readHashQuery().get('f') ?? '') !== f) patchHashQuery({ f: f || null })
  }, [valid])

  // Visões salvas neste navegador (barra antiga) vão uma vez para o Dataverse, onde valem em qualquer dispositivo.
  const imported = useRef(false)
  const { reload, setConfig } = view
  useEffect(() => {
    if (imported.current || status !== 'ready' || !choices) return
    imported.current = true
    const old = loadViews(source.kv).views
    if (!old.length) return
    void (async () => {
      try {
        for (const v of old) await store.create(TELA, v.nome, legacyViewConfig(v.filters, choices, clientes))
        source.kv.removeItem(VIEWS_KEY)
        await reload()
        toast({ tone: 'info', message: old.length === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${old.length} visões salvas neste navegador agora ficam em “Minhas”.` })
      } catch {
        imported.current = false
      }
    })()
  }, [status, choices, clientes, store, source.kv, reload, toast])

  const visible = useMemo(() => {
    if (!choices) return []
    const read = (p: (typeof ps.list)[number], key: string) => readPessoa(p, key, dupIds)
    const list = ps.list.filter((p) => matchesFilters(p, valid, fields, read) && matchesKeyword(p, query, label(choices.cargo, p.cargo)))
    const sort = view.config.sort
    return sort ? sortPessoas(list, sort.key, sort.dir, choices) : list
  }, [ps.list, valid, fields, query, choices, dupIds, view.config.sort])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  const lazyKey = useMemo(() => ({ valid, query, sort: view.config.sort }), [valid, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)

  const refresh = useCallback(() => { void ps.reload() }, [ps.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pessoas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pessoas', actions: headerActions })
  const clearAll = () => { setConfig((c) => ({ ...c, filters: {} })); setQuery('') }

  let body
  if (ps.error && !choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as pessoas" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error}</Alert>
  } else if (!choices) {
    body = <PessoasTable list={[]} choices={{ cargo: [], classificacao: [], idioma: [], status: [], sexo: [], tipoVeiculo: [] }} dups={dups} onOpen={() => undefined} loading />
  } else if (!ps.list.length) {
    body = <EmptyState className="surface" align="start" icon={<Users size={36} />} title="Nenhuma pessoa cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>}>Cadastre passageiros e solicitantes para usar nas reservas.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="ps-num">{visible.length} de {ps.list.length} · {dupIds.size} possíveis duplicados</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum registro com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <PessoasCards list={slice} choices={choices} dups={dups} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <PessoasTable list={slice} choices={choices} dups={dups} onOpen={open} view={{ config: view.config, onChange: setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} total={visible.length} more onLoadMore={loadMore} noun={['pessoa', 'pessoas']} touch={mobile} /> : null}
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
