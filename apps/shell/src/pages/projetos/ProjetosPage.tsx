import { useCallback, useMemo, type ReactNode } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader } from '@betinhos/ui'
import { FolderKanban, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { ListaAgrupada, useRowGroups } from '../../app/ListaAgrupada'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { PROJETO_COLUMNS, PROJETO_DEFAULT_FILTERS, PROJETO_SORT, TELA, builtinViews, projetoFields, projetoKeywordText, readProjeto, sortProjetos } from './domain/lista'
import { doProjeto, provas } from './domain/regras'
import type { ProjetoLinha } from './domain/types'
import { useProjetos } from './useProjetos'
import { ProjetosCards, ProjetosTable } from './components/ProjetosList'
import { ProjetoDrawer } from './components/ProjetoDrawer'
import './projetos.css'

export function ProjetosPage({ host }: { host: Host }) {
  return <ToastProvider><Projetos host={host} /></ToastProvider>
}

function Projetos({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const data = useProjetos(source)
  const fields = useMemo(() => projetoFields(), [])

  const linhas = useMemo<ProjetoLinha[]>(() => data.projetos.map((p) => {
    const itens = doProjeto(data.atualizacoes, p.id)
    return { ...p, ultimaEm: itens[0]?.data ?? null, provas: provas(itens).length }
  }), [data.projetos, data.atualizacoes])

  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_projeto', ids: data.projetos.map((p) => p.id) },
    defaultName: 'Todos os projetos',
    tela: TELA,
    columns: PROJETO_COLUMNS,
    defaultSort: PROJETO_SORT,
    defaultFilters: PROJETO_DEFAULT_FILTERS,
    fields,
    ready: data.loaded,
    builtins: builtinViews,
  })
  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const words = useMemo(() => searchWords(q), [q])
  const index = useMemo(() => keywordIndex<ProjetoLinha>(projetoKeywordText), [])
  const [target, setTarget] = useQueryAlvo()

  const read = useMemo(() => extra.read(readProjeto, (p) => p.id), [extra])
  const visible = useMemo(() => {
    const list = linhas.filter((p) => matchesFilters(p, filters, allFields, read) && index.matches(p, words))
    return extra.sort(sortProjetos(list, view.config.sort), view.config.sort, (p) => p.id)
  }, [linhas, filters, allFields, index, words, view.config.sort, read])
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const groups = useRowGroups(visible, view.config.group, allFields, read)
  const clearAll = () => { clearFilters(); setQuery('') }

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  useShellHeader({ title: 'Projetos' })
  const size = mobile ? 'touch' : 'default'
  const novo = () => setTarget({ mode: 'create' })

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar os projetos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <ProjetosTable list={[]} onOpen={() => undefined} loading />
  } else if (!data.projetos.length) {
    body = <EmptyState className="surface" align="start" icon={<FolderKanban size={36} />} title="Nenhum projeto cadastrado." action={<Button icon={<Plus size={16} />} onClick={novo}>Novo projeto</Button>}>Cadastre cada projeto para acompanhar status, andamento e provas.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="pj-num">{visible.length} de {data.projetos.length}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum projeto com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    const table = (rows: ProjetoLinha[], tableFooter?: ReactNode) => (
      <ProjetosTable list={rows} onOpen={open} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true, extraCell: extra.cell }} quickFilters={quickFilters} footer={tableFooter} empty={empty} />
    )
    const cards = (rows: ProjetoLinha[]) => <ProjetosCards list={rows} onOpen={open} />
    body = groups ? (
      <ListaAgrupada groups={groups} group={view.config.group} lazyKey={lazyKey} mobile={mobile} table={table} cards={cards} footer={footer} />
    ) : (
      <>
        {mobile ? (visible.length ? cards(slice) : <div className="surface">{empty}</div>) : table(slice, footer)}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page pj-page">
      <div role="toolbar" aria-label="Comandos de projetos">
        <ViewBar pinnable onAudit={() => auditoria({ entity: 'cr40f_projeto', onOpenRecord: (id) => setTarget({ mode: 'view', id }) })} view={view} columns={PROJETO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por nome, área, status, responsável ou instruções" aria-label="Buscar projetos" />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />
            <Button size={size} icon={<Plus size={16} />} disabled={!data.loaded} onClick={novo}>Novo projeto</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {data.loaded ? <ProjetoDrawer target={target} onTarget={setTarget} list={data.projetos} atualizacoes={data.atualizacoes} source={source} onSaved={data.upsert} onAtualizacao={data.addAtualizacao} /> : null}
    </div>
  )
}
