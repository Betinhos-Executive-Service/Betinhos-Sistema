import { useCallback, useMemo } from 'react'
import { Alert, Button, EmptyState, StatusBadge, ToastProvider, useShellHeader } from '@betinhos/ui'
import { FileWarning, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useQueryAlvo, useQueryFilters } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { EMPTY_FILTERS, filterInfracoes } from './domain/filters'
import { infracoesQuery } from './domain/query'
import { usoIndex } from './domain/uso'
import { useInfracoes } from './useInfracoes'
import { InfracoesToolbar } from './components/InfracoesToolbar'
import { InfracoesCards, InfracoesTable } from './components/InfracoesList'
import { InfracaoDrawer } from './components/InfracaoDrawer'
import './infracoes.css'

export function InfracoesPage({ host }: { host: Host }) {
  return <ToastProvider><Infracoes host={host} /></ToastProvider>
}

function Infracoes({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const data = useInfracoes(source)

  // Filtros, página e gaveta vivem na URL (#/infracoes?q=…&gravidade=…&pagina=2&ver=…).
  const [filters, setFilters] = useQueryFilters(infracoesQuery)

  const uso = useMemo(() => usoIndex(data.multas), [data.multas])
  const comUso = useMemo(() => new Set(uso.keys()), [uso])
  const visible = useMemo(() => filterInfracoes(data.list, filters, comUso), [data.list, filters, comUso])
  const { slice, more, loadMore } = useLazySlice(visible, filters)
  const ativas = useMemo(() => data.list.filter((i) => i.ativo).length, [data.list])
  const usoState = data.multasError ?? (data.loading && !data.loaded ? 'loading' : 'ok')

  const [target, setTarget] = useQueryAlvo()

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar infrações" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Infrações de trânsito', actions: headerActions })

  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar as infrações" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <InfracoesTable list={[]} uso={uso} onOpen={() => undefined} loading />
  } else if (!data.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileWarning size={36} />} title="Nenhuma infração cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova infração</Button>}>Cadastre os códigos do CTB para usar nas multas.</EmptyState>
  } else if (!visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhuma infração encontrada para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    body = (
      <>
        {mobile ? <InfracoesCards list={slice} uso={uso} onOpen={open} /> : <InfracoesTable list={slice} uso={uso} onOpen={open} />}
        <LazyFooter loaded={slice.length} total={visible.length} more={more} onLoadMore={loadMore} noun={['infração', 'infrações']} touch={mobile} />
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Infrações de trânsito"
      meta={<span className="if-meta">{data.loaded ? <span className="if-num">{visible.length} de {data.list.length} · {ativas} ativas</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Catálogo do CTB usado nas multas: gravidade, pontos e valor."
      actions={<>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={data.loading && data.loaded} onClick={refresh}>Atualizar</Button>}
        <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={() => setTarget({ mode: 'create' })}>Nova infração</Button>
      </>}
      toolbar={data.loaded && data.list.length ? <InfracoesToolbar filters={filters} onChange={setFilters} /> : undefined}
    >
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {data.multasError && data.loaded ? <Alert tone="warning" title="Não foi possível carregar o uso nas multas">{data.multasError} A contagem de multas fica indisponível até atualizar.</Alert> : null}
      {body}
      {data.loaded ? <InfracaoDrawer target={target} onTarget={setTarget} list={data.list} uso={uso} usoState={usoState} source={source} onSaved={data.upsert} /> : null}
    </PageLayout>
  )
}
