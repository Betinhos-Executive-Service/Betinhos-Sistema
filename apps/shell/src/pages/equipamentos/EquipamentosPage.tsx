import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader } from '@betinhos/ui'
import { Laptop, Plus, RefreshCw, SearchX, Tags } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createCacheImagens } from './data/imagens'
import { createSource } from './data/source'
import { ImagensContext } from './components/ImagemFoto'
import { STATUS } from './domain/choices'
import { EQUIPAMENTO_COLUMNS, EQUIPAMENTO_DEFAULT_FILTERS, EQUIPAMENTO_SORT, TELA, builtinViews, equipamentoFields, matchesKeyword, pessoasResponsaveis, readEquipamento, sortEquipamentos } from './domain/lista'
import { useEquipamentos } from './useEquipamentos'
import { EquipamentosCards, EquipamentosTable } from './components/EquipamentosList'
import { EquipamentoDrawer } from './components/EquipamentoDrawer'
import { TiposDrawer } from './components/TiposDrawer'
import './equipamentos.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

export function EquipamentosPage({ host }: { host: Host }) {
  return <ToastProvider><Equipamentos host={host} /></ToastProvider>
}

function Equipamentos({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  // Fotos do SharePoint baixadas nesta visita (lista e drawer); as blob URLs são revogadas ao sair da página.
  const imagens = useMemo(() => createCacheImagens(source.baixarFoto), [source])
  useEffect(() => () => imagens.liberar(), [imagens])
  const mobile = useMedia('(max-width: 820px)')
  const data = useEquipamentos(source)
  // O filtro de Responsável lista só quem tem item (o cadastro de funcionários tem centenas); campos memorizados
  // porque o useListView revalida os filtros a cada troca de `fields`.
  const responsaveis = useMemo(() => pessoasResponsaveis(data.equipamentos, data.pessoas), [data.equipamentos, data.pessoas])
  const fields = useMemo(() => equipamentoFields(data.tipos, responsaveis), [data.tipos, responsaveis])

  // Visões, colunas e filtros (DS §10.9.1/§10.9.2); a Visão padrão esconde os baixados. Busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_equipamento', ids: data.equipamentos.map((e) => e.id) },
    defaultName: 'Equipamentos em uso e disponíveis',
    tela: TELA,
    columns: EQUIPAMENTO_COLUMNS,
    defaultSort: EQUIPAMENTO_SORT,
    defaultFilters: EQUIPAMENTO_DEFAULT_FILTERS,
    fields,
    ready: data.loaded,
    builtins: builtinViews,
  })
  const [query, setQuery] = useQueryTexto('q')
  // Link direto `?ver=<guid>` (ou `?editar=`) e `?novo=1` abrem o drawer de cadastro/edição.
  const [target, setTarget] = useQueryAlvo()

  const inativos = useMemo(() => new Set(data.pessoas.filter((p) => !p.ativo).map((p) => p.id)), [data.pessoas])
  const visible = useMemo(() => {
    const read = extra.read(readEquipamento, (e) => e.id)
    const list = data.equipamentos.filter((e) => matchesFilters(e, filters, allFields, read) && matchesKeyword(e, query))
    return extra.sort(sortEquipamentos(list, view.config.sort), view.config.sort, (e) => e.id)
  }, [data.equipamentos, filters, fields, query, view.config.sort])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  // Chave por conteúdo: `fields` depende dos itens (filtro de Responsável), então salvar ou recarregar gera outro
  // objeto `filters` com o mesmo conteúdo, e uma chave por referência voltaria ao primeiro lote a cada gravação.
  const lazyKey = useMemo(() => JSON.stringify({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }
  const [tiposOpen, setTiposOpen] = useState(false)
  const usoTipos = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of data.equipamentos) if (e.tipoId) m.set(e.tipoId, (m.get(e.tipoId) ?? 0) + 1)
    return m
  }, [data.equipamentos])
  const semResponsavel = useMemo(() => data.equipamentos.filter((e) => !e.responsavelId && e.status !== STATUS.baixado).length, [data.equipamentos])

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar equipamentos" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Equipamentos', actions: headerActions })

  const novo = () => setTarget({ mode: 'create' })
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar os equipamentos" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <EquipamentosTable list={[]} inativos={inativos} onOpen={() => undefined} loading />
  } else if (!data.equipamentos.length) {
    body = <EmptyState className="surface" align="start" icon={<Laptop size={36} />} title="Nenhum equipamento cadastrado." action={<Button icon={<Plus size={16} />} onClick={novo}>Novo equipamento</Button>}>Cadastre notebooks, monitores, máquinas de cartão e outros itens da empresa.</EmptyState>
  } else {
    const open = (id: string) => setTarget({ mode: 'view', id })
    const footer = <span className="eq-num">{visible.length} de {data.equipamentos.length} · {semResponsavel} sem responsável</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum equipamento com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <EquipamentosCards list={slice} inativos={inativos} onOpen={open} /> : <div className="surface">{empty}</div>)
          : <EquipamentosTable list={slice} inativos={inativos} onOpen={open} view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <ImagensContext.Provider value={imagens}>
    <div className="page eq-page">
      <div role="toolbar" aria-label="Comandos de equipamentos">
        <ViewBar onAudit={() => auditoria({ entity: 'cr40f_equipamento', onOpenRecord: (id) => setTarget({ mode: 'view', id }) })} view={view} columns={EQUIPAMENTO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="eq-search" value={query} onChange={setQuery} placeholder="Buscar por descrição, modelo, série ou responsável" aria-label="Buscar equipamentos" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
          <span className="eq-acoes">
            <Button variant="secondary" icon={<Tags size={16} />} disabled={!data.loaded} onClick={() => setTiposOpen(true)}>Tipos</Button>
            <Button icon={<Plus size={16} />} disabled={!data.loaded} onClick={novo}>Novo equipamento</Button>
          </span>
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {data.loaded ? <EquipamentoDrawer target={target} onTarget={setTarget} list={data.equipamentos} tipos={data.tipos} pessoas={data.pessoas} source={source} onSaved={data.upsert} onCapa={data.setCapa} /> : null}
      {/* Renomear reflete nos itens (upsertTipo); inativar tira o tipo dos seletores, mas o item o mantém marcado "(inativo)". */}
      {data.loaded ? <TiposDrawer open={tiposOpen} onClose={() => setTiposOpen(false)} tipos={data.tipos} uso={usoTipos} source={source} onSaved={data.upsertTipo} /> : null}
    </div>
    </ImagensContext.Provider>
  )
}
