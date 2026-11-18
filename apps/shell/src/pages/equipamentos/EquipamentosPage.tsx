import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, matchesFilters, useShellHeader, type MenuAction } from '@betinhos/ui'
import { Laptop, Plus, RefreshCw, SearchX, Tags } from 'lucide-react'
import type { Host } from '../../host'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { ListaAgrupada, useRowGroups } from '../../app/ListaAgrupada'
import type { Equipamento } from './domain/types'
import { useListView } from '../../app/useListView'
import { useQueryAlvo, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createCacheImagens } from './data/imagens'
import { createSource } from './data/source'
import { ImagensContext } from './components/ImagemFoto'
import { STATUS } from './domain/choices'
import { EQUIPAMENTO_COLUMNS, EQUIPAMENTO_DEFAULT_FILTERS, EQUIPAMENTO_SORT, TELA, builtinViews, equipamentoFields, equipamentoKeywordText, pessoasResponsaveis, readEquipamento, sortEquipamentos } from './domain/lista'
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
  const q = useDebouncedText(query)
  const words = useMemo(() => searchWords(q), [q])
  const index = useMemo(() => keywordIndex<Equipamento>(equipamentoKeywordText), [])
  // Link direto `?ver=<guid>` (ou `?editar=`) e `?novo=1` abrem o drawer de cadastro/edição.
  const [target, setTarget] = useQueryAlvo()

  const inativos = useMemo(() => new Set(data.pessoas.filter((p) => !p.ativo).map((p) => p.id)), [data.pessoas])
  const read = useMemo(() => extra.read(readEquipamento, (e) => e.id), [extra])
  const visible = useMemo(() => {
    const list = data.equipamentos.filter((e) => matchesFilters(e, filters, allFields, read) && index.matches(e, words))
    return extra.sort(sortEquipamentos(list, view.config.sort), view.config.sort, (e) => e.id)
  }, [data.equipamentos, filters, fields, index, words, view.config.sort, read])
  // Lazy loading de renderização: trocar filtro, busca ou ordenação volta ao primeiro lote; recarregar a lista não.
  // Chave por conteúdo: `fields` depende dos itens (filtro de Responsável), então salvar ou recarregar gera outro
  // objeto `filters` com o mesmo conteúdo, e uma chave por referência voltaria ao primeiro lote a cada gravação.
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const groups = useRowGroups(visible, view.config.group, allFields, read)
  const clearAll = () => { clearFilters(); setQuery('') }
  const [tiposOpen, setTiposOpen] = useState(false)
  const usoTipos = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of data.equipamentos) if (e.tipoId) m.set(e.tipoId, (m.get(e.tipoId) ?? 0) + 1)
    return m
  }, [data.equipamentos])
  const semResponsavel = useMemo(() => data.equipamentos.filter((e) => !e.responsavelId && e.status !== STATUS.baixado).length, [data.equipamentos])

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  // "Atualizar" fica na linha de comando em todas as larguras; o cabeçalho do celular não repete.
  useShellHeader({ title: 'Equipamentos' })
  const size = mobile ? 'touch' : 'default'
  // "⋮" (Mais ações): o que é raro e não depende da seleção.
  const moreActions: MenuAction[] = [
    { id: 'tipos', label: 'Tipos de equipamento', icon: <Tags size={16} />, disabled: !data.loaded, onSelect: () => setTiposOpen(true) },
  ]

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
    const table = (rows: Equipamento[], tableFooter?: ReactNode) => (
      <EquipamentosTable list={rows} inativos={inativos} onOpen={open} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true, extraCell: extra.cell }} quickFilters={quickFilters} footer={tableFooter} empty={empty} />
    )
    const cards = (rows: Equipamento[]) => <EquipamentosCards list={rows} inativos={inativos} onOpen={open} />
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
    <ImagensContext.Provider value={imagens}>
    <div className="page eq-page">
      <div role="toolbar" aria-label="Comandos de equipamentos">
        <ViewBar pinnable onAudit={() => auditoria({ entity: 'cr40f_equipamento', onOpenRecord: (id) => setTarget({ mode: 'view', id }) })} view={view} columns={EQUIPAMENTO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por descrição, tipo, modelo, série, responsável, status ou observação" aria-label="Buscar equipamentos" />}
          more={moreActions}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />
            <Button size={size} icon={<Plus size={16} />} disabled={!data.loaded} onClick={novo}>Novo equipamento</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {data.loaded ? <EquipamentoDrawer target={target} onTarget={setTarget} list={data.equipamentos} tipos={data.tipos} pessoas={data.pessoas} source={source} onSaved={data.upsert} onCapa={data.setCapa} /> : null}
      {/* Renomear reflete nos itens (upsertTipo); inativar tira o tipo dos seletores, mas o item o mantém marcado "(inativo)". */}
      {data.loaded ? <TiposDrawer open={tiposOpen} onClose={() => setTiposOpen(false)} tipos={data.tipos} uso={usoTipos} source={source} onSaved={data.upsertTipo} /> : null}
    </div>
    </ImagensContext.Provider>
  )
}
