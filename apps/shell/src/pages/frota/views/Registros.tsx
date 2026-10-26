import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Button, EmptyState, SearchBox, SegmentedControl, StatusBadge as Badge, Table, TableTitle, ViewBar } from '@betinhos/ui'
import type { Host } from '../../../host'
import { LazyFooter, useLazySlice } from '../../../app/LazyList'
import { useDebouncedText } from '../../../app/search'
import { filterRows } from '../../../app/filterRows'
import { useListView } from '../../../app/useListView'
import { lerOpcao, useQueryTexto } from '../../../nav/queryState'
import { patchHashQuery, useHashQuery } from '../../../nav/useHashRoute'
import { useNotify } from '../components/Toasts'
import { StatusBadge } from '../components/Ui'
import { formatBR } from '../data/dates'
import { KIND_LABEL, KIND_TABLE } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { linhas, type Linha } from '../domain/linhas'
import { EXTRA, PESSOA, REGISTRO_SORT, matchesRegistroKeyword, readRegistro, registroBuiltins, registroColumns, registroFields, registroLegacy, sortRegistros, telaRegistros } from '../domain/listas'
import { CATEGORIAS_MANUT } from '../domain/manutencaoCatalogo'
import { TERMO_TOM } from '../domain/termoMulta'

const PLURAL: Record<Kind, string> = { manutencao: 'Manutenções', multa: 'Multas', colisao: 'Colisões' }
const LEGACY_KEYS = ['status', 'veiculo', 'pessoa', 'categoria', 'de', 'ate'] as const
const MOCK_HOST: Host = { mode: 'mock' }

function opcoes(refs: (Ref | null)[]) {
  const mapa = new Map(refs.filter((item): item is Ref => item !== null && item.label !== '').map((item) => [item.id, item.label]))
  return [...mapa.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

const categoriasTexto = (valores: number[]) => valores.map((value) => CATEGORIAS_MANUT.find((option) => option.value === value)?.label).filter(Boolean).join(' · ')

type Props = { kinds: Kind[]; data: FrotaData; source: DataSource; host?: Host; onOpen: (kind: Kind, id: string) => void; onReload: () => void }

/** Abas de registros; cada tipo tem sua lista (visões, colunas e filtros próprios). */
export function Registros(props: Props) {
  const kind = lerOpcao(useHashQuery(), 'tipo', props.kinds, props.kinds[0])
  return <Lista key={kind} kind={kind} {...props} />
}

function Lista({ kind, kinds, data, source, host = MOCK_HOST, onOpen, onReload }: Props & { kind: Kind }) {
  const notify = useNotify()
  const [busca, setBusca] = useQueryTexto('q')
  // A lista filtra 200 ms depois da última tecla.
  const termo = useDebouncedText(busca)

  const todas = useMemo(() => linhas(kind, data), [kind, data])
  const opcoesRefs = useMemo(() => ({ veiculos: opcoes(todas.map((linha) => linha.veiculo)), pessoas: opcoes(todas.map((linha) => linha.pessoa)) }), [todas])
  const fields = useMemo(() => registroFields(kind, opcoesRefs), [kind, opcoesRefs])
  const columns = useMemo(() => registroColumns(kind), [kind])

  // Visões, colunas e filtros (DS §10.9.1/§10.9.2) por tipo; busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: KIND_TABLE[kind], ids: todas.map((linha) => linha.id) },
    tela: telaRegistros(kind),
    columns,
    defaultSort: REGISTRO_SORT,
    fields,
    ready: true,
    builtins: () => registroBuiltins(kind),
    legacy: { keys: LEGACY_KEYS, read: (q) => registroLegacy(q, kind, opcoesRefs) },
  })

  const visiveis = useMemo(
    () => extra.sort(sortRegistros(filterRows(todas, filters, allFields, extra.read(readRegistro, (linha) => linha.id)).filter((linha) => matchesRegistroKeyword(linha, termo)), kind, view.config.sort), view.config.sort, (linha) => linha.id),
    [todas, filters, fields, termo, kind, view.config.sort],
  )
  // Rolagem infinita (sem paginação visível): trocar filtro, busca ou ordenação volta ao primeiro lote.
  const lazyKey = useMemo(() => JSON.stringify({ filters, termo, sort: view.config.sort }), [filters, termo, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visiveis, lazyKey)

  function trocar(next: Kind) {
    patchHashQuery({ tipo: next === kinds[0] ? null : next, f: null })
  }

  async function novo() {
    try {
      await source.openForm(kind)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onReload()
  }

  return (
    <div className="frota-lista">
      <div role="toolbar" aria-label="Comandos de registros">
        <ViewBar view={view} columns={columns} catalog={extra.catalog} filters={{ fields: allFields }}>
          {kinds.length > 1 && <SegmentedControl size="compact" aria-label="Tipo de registro" options={kinds.map((item) => ({ value: item, label: PLURAL[item] }))} value={kind} onChange={trocar} />}
          <SearchBox className="frota-busca" size="compact" aria-label="Buscar registro" placeholder="Buscar descrição, placa ou pessoa" value={busca} onChange={setBusca} />
          <Button size="compact" variant="action" icon={<Plus size={16} />} onClick={() => void novo()}>Novo registro</Button>
        </ViewBar>
      </div>
      <Table<Linha>
        rows={slice}
        rowKey={(linha) => linha.id}
        onRowClick={(linha) => onOpen(linha.kind, linha.id)}
        view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }}
        quickFilters={quickFilters}
        footer={<span className="frota-muted">{visiveis.length} de {todas.length}{kind === 'multa' && todas.some((linha) => linha.termoIndisponivel) ? ' · Coluna Termo indisponível: não foi possível ler os termos' : ''}</span>}
        empty={<EmptyState compact align="start" title={`Nenhum registro de ${KIND_LABEL[kind].toLowerCase()} com estes filtros`} action={<Button variant="secondary" size="compact" onClick={() => { clearFilters(); setBusca('') }}>Limpar filtros</Button>} />}
        columns={[
          { key: 'descricao', header: 'Descrição', label: 'Descrição', sortable: true, defaultWidth: 300, width: 'minmax(180px, 2fr)', cell: (linha) => <TableTitle title={linha.titulo} meta={linha.categorias.length > 0 ? categoriasTexto(linha.categorias) : undefined} /> },
          { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 120, width: 'minmax(92px, .6fr)', cell: (linha) => <span className="frota-nowrap">{formatBR(linha.dia)}</span> },
          { key: 'veiculo', header: 'Veículo', label: 'Veículo', sortable: true, defaultWidth: 120, width: 'minmax(90px, .7fr)', hideBelow: 'mobile', cell: (linha) => <span className="frota-nowrap">{linha.veiculo?.label || '—'}</span> },
          { key: 'pessoa', header: PESSOA[kind], label: PESSOA[kind], sortable: true, defaultWidth: 190, hideBelow: 'mobile', cell: (linha) => linha.pessoa?.label || '—' },
          ...(kind === 'multa' ? [{ key: 'termo', header: 'Termo', label: 'Termo', sortable: true, defaultWidth: 180, width: 'minmax(120px, .9fr)', hideBelow: 'compact' as const, cell: (linha: Linha) => (linha.termoStatus ? <Badge tone={TERMO_TOM[linha.termoStatus]}>{linha.termo}</Badge> : <span className="frota-muted">—</span>) }] : []),
          { key: 'extra', header: EXTRA[kind], label: EXTRA[kind], defaultWidth: 160, hideBelow: 'compact', cell: (linha) => <span className="frota-nowrap">{linha.extra}</span> },
          { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 160, width: 'minmax(110px, .8fr)', cell: (linha) => <StatusBadge kind={linha.kind} value={linha.status} /> },
        ]}
      />
      <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} />
    </div>
  )
}
