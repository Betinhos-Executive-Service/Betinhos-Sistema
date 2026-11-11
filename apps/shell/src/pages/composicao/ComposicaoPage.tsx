import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, useShellHeader } from '@betinhos/ui'
import { Calculator, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { listCache } from '../../app/listCache'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useProgressiveData } from '../../app/useProgressiveData'
import { useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { COMPOSICAO_COLUMNS, COMPOSICAO_SORT, TELA, builtinViews, composicaoFields, composicaoKeywordText, readComposicao, sortComposicoes } from './domain/lista'
import type { Composicao } from './domain/types'
import { ComposicaoCards, ComposicaoTable } from './components/ComposicaoList'
import './composicao.css'

export function ComposicaoPage({ host }: { host: Host }) {
  return <ToastProvider><Composicoes host={host} /></ToastProvider>
}

const EMPTY: Composicao[] = []
const FIELDS = composicaoFields()
const index = keywordIndex<Composicao>(composicaoKeywordText)

function Composicoes({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const load = useCallback(async (partial: (list: Composicao[]) => void) => source.load(partial), [source])
  const cs = useProgressiveData<Composicao[]>({ cache: listCache(host), key: 'composicao', load })
  const list = cs.data ?? EMPTY
  const ready = cs.data != null

  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const { view, filters, quickFilters, clearFilters, fields } = useListView({
    host, defaultName: 'Composição de Preço', tela: TELA, columns: COMPOSICAO_COLUMNS, defaultSort: COMPOSICAO_SORT, fields: FIELDS, ready, builtins: builtinViews,
  })

  const sorted = useMemo(() => sortComposicoes(list, view.config.sort), [list, view.config.sort])
  const filtered = useMemo(() => filterRows(sorted, filters, fields, readComposicao), [sorted, filters, fields])
  const visible = useMemo(() => {
    const words = searchWords(q)
    return words.length ? filtered.filter((c) => index.matches(c, words)) : filtered
  }, [filtered, q])

  const refresh = useCallback(() => { void cs.reload() }, [cs.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar composições" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Composição de Preço', actions: headerActions })
  const clearAll = () => { clearFilters(); setQuery('') }

  let body
  if (cs.error && !ready) {
    body = <Alert tone="danger" title="Não foi possível carregar as composições" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error}</Alert>
  } else if (!ready) {
    body = <ComposicaoTable list={[]} onOpen={() => undefined} loading />
  } else if (cs.complete && !list.length) {
    body = <EmptyState className="surface" align="start" icon={<Calculator size={36} />} title="Nenhuma composição de preço" >As composições de serviços aparecem aqui quando forem criadas.</EmptyState>
  } else {
    const pending = !cs.complete && cs.loading
    const footer = <span className="cp-num">{visible.length} de {list.length}{pending ? ' · carregando o restante…' : ''}</span>
    const empty = pending
      ? <EmptyState align="start" icon={<SearchX size={36} />} title="Procurando no restante das composições…" />
      : <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma composição com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = mobile
      ? (visible.length ? <ComposicaoCards list={visible} onOpen={source.open} /> : <div className="surface">{empty}</div>)
      : <ComposicaoTable list={visible} onOpen={source.open} view={{ config: view.config, onChange: view.setConfig }} quickFilters={quickFilters} footer={footer} empty={empty} />
  }

  return (
    <div className="page page--full cp-page">
      <div role="toolbar" aria-label="Comandos de composição de preço">
        <ViewBar view={view} columns={COMPOSICAO_COLUMNS} filters={ready ? { fields } : undefined}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="cp-search" value={query} onChange={setQuery} placeholder="Buscar por ID, serviço, cliente, motorista, trajeto ou pax" aria-label="Buscar composições" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={cs.loading && ready} onClick={refresh} />}
        </ViewBar>
      </div>
      {cs.error && ready ? <Alert tone="danger" title={cs.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{cs.error} {cs.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só as composições mais recentes; busca, filtros e totais valem para elas.'}</Alert> : null}
      {body}
    </div>
  )
}
