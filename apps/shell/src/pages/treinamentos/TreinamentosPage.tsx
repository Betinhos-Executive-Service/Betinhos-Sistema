import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, todaySaoPaulo, useShellHeader } from '@betinhos/ui'
import { GraduationCap, Plus, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { TELA, TREINAMENTO_COLUMNS, TREINAMENTO_FIELDS, TREINAMENTO_SORT, builtinViews, matchesKeyword, readTreinamento, sortTreinamentos } from './domain/lista'
import { copiaParaReciclagem, emptyDraft, isPublicado, plural, type Treinamento } from './domain/treinamentos'
import { useTreinamentos } from './useTreinamentos'
import { TreinamentosCards, TreinamentosTable } from './components/TreinamentosLista'
import { NavTopo } from './components/NavTopo'
import { TreinamentoEditor } from './components/TreinamentoEditor'
import { TreinamentoPainel } from './components/TreinamentoPainel'
import './treinamentos.css'

export function TreinamentosPage({ host }: { host: Host }) {
  return <ToastProvider><Treinamentos host={host} /></ToastProvider>
}

/**
 * Treinamentos do RH para os motoristas: lista (visões e filtros do DS), editor de rascunho e painel de participação
 * do publicado. A tela aberta fica na URL (`ver=<id>`, `novo=1`).
 */
function Treinamentos({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const data = useTreinamentos(source)
  const mobile = useMedia('(max-width: 820px)')
  const [target, setTarget] = useQueryAlvo()
  const [query, setQuery] = useQueryTexto('q')
  // Cada "novo" remonta o editor do zero.
  const [createKey, setCreateKey] = useState(0)
  // Rascunho copiado por "Reaplicar"; nulo em "Novo treinamento".
  const [modelo, setModelo] = useState<Treinamento | null>(null)

  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_treinamento', ids: data.items.map((t) => t.id) },
    defaultName: 'Treinamentos',
    tela: TELA,
    columns: TREINAMENTO_COLUMNS,
    defaultSort: TREINAMENTO_SORT,
    fields: TREINAMENTO_FIELDS,
    ready: data.loaded,
    builtins: builtinViews,
  })

  const visible = useMemo(() => {
    const read = extra.read(readTreinamento, (t) => t.id)
    const list = data.items.filter((t) => matchesFilters(t, filters, allFields, read) && matchesKeyword(t, query))
    return extra.sort(sortTreinamentos(list, view.config.sort, data.progresso), view.config.sort, (t) => t.id)
  }, [data.items, data.progresso, filters, allFields, query, view.config.sort, extra])
  const lazyKey = useMemo(() => JSON.stringify({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar treinamentos" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Treinamentos', actions: headerActions })

  const goHome = useCallback(() => setTarget(null), [setTarget])
  const startNew = useCallback(() => { setModelo(null); setCreateKey((n) => n + 1); setTarget({ mode: 'create' }) }, [setTarget])
  const reaplicar = useCallback((item: Treinamento) => { setModelo(copiaParaReciclagem(item, todaySaoPaulo())); setCreateKey((n) => n + 1); setTarget({ mode: 'create' }) }, [setTarget])
  const open = useCallback((id: string) => setTarget({ mode: 'view', id }), [setTarget])
  const editar = useCallback((id: string) => setTarget({ mode: 'edit', id }), [setTarget])
  const saved = useCallback(async (id: string) => { await data.reload(); open(id) }, [data.reload, open])

  const selected = target && target.mode !== 'create' ? data.items.find((item) => item.id === target.id) : undefined
  const erroCarga = <Alert tone="danger" title="Não foi possível carregar os treinamentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  const editor = (initial: Treinamento, key: string, onDeleted?: () => Promise<void>) =>
    <TreinamentoEditor key={key} initial={initial} funcionarios={data.funcionarios} source={source} onBack={isPublicado(initial) ? () => open(initial.id) : goHome} onSaved={saved} onAnexos={(id, anexos) => data.patch(id, isPublicado(initial) ? { anexos, editadoEm: new Date().toISOString() } : { anexos })} onDeleted={onDeleted} />

  let body
  if (target?.mode === 'create') {
    body = editor(modelo ?? emptyDraft(), `novo-${createKey}`)
  } else if (target && !data.loaded) {
    body = data.error ? erroCarga : <div className="surface tr-loading" role="status" aria-label="Carregando treinamento" />
  } else if (target && !selected) {
    body = <><NavTopo onBack={goHome} atual="Não encontrado" /><Alert tone="warning" title="Treinamento não encontrado">Ele pode ter sido excluído. Atualize a lista para conferir.</Alert></>
  } else if (selected) {
    body = isPublicado(selected) && target?.mode !== 'edit'
      ? <TreinamentoPainel key={selected.id} item={selected} funcionarios={data.funcionarios} source={source} onBack={goHome} onEditar={() => editar(selected.id)} onReaplicar={() => reaplicar(selected)} />
      : editor(selected, `${selected.id}-${target?.mode}`, isPublicado(selected) ? undefined : async () => { goHome(); await data.reload() })
  }
  if (body) return <div className="page tr-page">{body}</div>

  if (data.error && !data.loaded) {
    body = erroCarga
  } else if (!data.loaded) {
    body = <TreinamentosTable list={[]} onOpen={() => undefined} loading />
  } else if (!data.items.length) {
    body = <EmptyState className="surface" align="start" icon={<GraduationCap size={36} />} title="Nenhum treinamento ainda" action={<Button icon={<Plus size={16} />} onClick={startNew}>Novo treinamento</Button>}>Crie o primeiro treinamento para os motoristas: texto, fotos, vídeo e quiz, com assinatura se precisar.</EmptyState>
  } else {
    const publicados = data.items.filter(isPublicado).length
    const footer = <span className="tr-num">{visible.length} de {data.items.length} · {publicados} {plural(publicados, 'publicado', 'publicados')}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum treinamento com estes filtros" action={<Button variant="secondary" onClick={() => { clearFilters(); setQuery('') }}>Limpar filtros</Button>}>Tire um filtro ou mude a busca para ver mais resultados.</EmptyState>
    body = (
      <>
        {mobile
          ? (visible.length ? <TreinamentosCards list={slice} funcionarios={data.funcionarios} progresso={data.progresso} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <TreinamentosTable list={slice} funcionarios={data.funcionarios} progresso={data.progresso} onOpen={open} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page tr-page">
      <div role="toolbar" aria-label="Comandos de treinamentos">
        <ViewBar onAudit={() => auditoria({ entity: 'cr40f_treinamento', onOpenRecord: open })} view={view} columns={TREINAMENTO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="tr-search" value={query} onChange={setQuery} placeholder="Buscar por título ou descrição" aria-label="Buscar treinamentos" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
          <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={startNew}>Novo treinamento</Button>
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
    </div>
  )
}
