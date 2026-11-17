import { Plus, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Button, EmptyState, SearchBox, SegmentedControl, TableTitle, ViewBar } from '@betinhos/ui'
import type { Host } from '../../../host'
import { LazyFooter, useLazySlice } from '../../../app/LazyList'
import { ListaAgrupada, useRowGroups } from '../../../app/ListaAgrupada'
import { VirtualTable } from '../../../app/VirtualTable'
import { useDebouncedText } from '../../../app/search'
import { filterRows } from '../../../app/filterRows'
import { useListView } from '../../../app/useListView'
import { lerOpcao, useQueryTexto } from '../../../nav/queryState'
import { patchHashQuery, useHashQuery } from '../../../nav/useHashRoute'
import { useMedia } from '../../operacional/useMedia'
import { useNotify } from '../components/Toasts'
import { StatusBadge } from '../components/Ui'
import { formatBR, todaySP } from '../data/dates'
import { KIND_LABEL, KIND_TABLE } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Kind, Ref } from '../data/types'
import { errorMessage } from '../data/xrm'
import { linhas, type Linha } from '../domain/linhas'
import { EXTRA, LARGURAS, MULTA_FILTROS_PADRAO, MULTA_VISAO_PADRAO, PESSOA, REGISTRO_SORT, matchesRegistroKeyword, readRegistro, registroBuiltins, registroColumns, registroFields, registroLegacy, sortRegistros, telaRegistros } from '../domain/listas'
import { CATEGORIAS_MANUT } from '../domain/manutencaoCatalogo'
import { urgenciaDoPrazo } from '../domain/multaEstado'
import { useAuditoria } from '../../../app/auditoria/AuditoriaProvider'

const PLURAL: Record<Kind, string> = { manutencao: 'Manutenções', multa: 'Multas', colisao: 'Colisões' }
const LEGACY_KEYS = ['status', 'veiculo', 'pessoa', 'categoria', 'de', 'ate'] as const
const MOCK_HOST: Host = { mode: 'mock' }

function opcoes(refs: (Ref | null)[]) {
  const mapa = new Map(refs.filter((item): item is Ref => item !== null && item.label !== '').map((item) => [item.id, item.label]))
  return [...mapa.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

const categoriasTexto = (valores: number[]) => valores.map((value) => CATEGORIAS_MANUT.find((option) => option.value === value)?.label).filter(Boolean).join(' · ')

/**
 * `onNovo`: a tela abre a gaveta própria de criação (Manutenções); sem ele, "Novo registro" abre o formulário nativo.
 * `visaoInicial`: visão pronta (ex.: `pronta:encaixar`) aplicada uma vez ao carregar; `onVisaoAplicada` avisa para limpar o link.
 */
type Props = { kinds: Kind[]; data: FrotaData; source: DataSource; host?: Host; onOpen: (kind: Kind, id: string) => void; onReload: () => void; loading?: boolean; onNovo?: () => void; visaoInicial?: string; onVisaoAplicada?: () => void }

/** Abas de registros; cada tipo tem sua lista (visões, colunas e filtros próprios). */
export function Registros(props: Props) {
  const kind = lerOpcao(useHashQuery(), 'tipo', props.kinds, props.kinds[0])
  return <Lista key={kind} kind={kind} {...props} />
}

function Lista({ kind, kinds, data, source, host = MOCK_HOST, onOpen, onReload, loading = false, onNovo, visaoInicial, onVisaoAplicada }: Props & { kind: Kind }) {
  const size = useMedia('(max-width: 820px)') ? 'touch' : 'default'
  const auditoria = useAuditoria()
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
    defaultFilters: kind === 'multa' ? MULTA_FILTROS_PADRAO : undefined,
    defaultName: kind === 'multa' ? MULTA_VISAO_PADRAO : undefined,
    fields,
    ready: true,
    builtins: () => registroBuiltins(kind),
    legacy: { keys: LEGACY_KEYS, read: (q) => registroLegacy(q, kind, opcoesRefs) },
  })

  // Link antigo (ex.: `?sub=encaixar`): abre a visão pedida uma vez, quando as visões carregam.
  const visaoAplicada = useRef(false)
  useEffect(() => {
    if (!visaoInicial || visaoAplicada.current || view.status !== 'ready' || !view.views.some((v) => v.id === visaoInicial)) return
    visaoAplicada.current = true
    view.select(visaoInicial)
    onVisaoAplicada?.()
  }, [visaoInicial, view, onVisaoAplicada])

  const read = useMemo(() => extra.read(readRegistro, (linha: Linha) => linha.id), [extra])
  const visiveis = useMemo(
    () => extra.sort(sortRegistros(filterRows(todas, filters, allFields, read).filter((linha) => matchesRegistroKeyword(linha, termo)), kind, view.config.sort), view.config.sort, (linha) => linha.id),
    [todas, filters, fields, termo, kind, view.config.sort, read],
  )
  // Rolagem infinita (sem paginação visível): trocar filtro, busca ou ordenação volta ao primeiro lote.
  const lazyKey = useMemo(() => JSON.stringify({ filters, termo, sort: view.config.sort }), [filters, termo, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visiveis, lazyKey)
  const groups = useRowGroups(visiveis, view.config.group, allFields, read)

  function trocar(next: Kind) {
    patchHashQuery({ tipo: next === kinds[0] ? null : next, f: null })
  }

  async function novo() {
    if (onNovo) {
      onNovo()
      return
    }
    try {
      await source.openForm(kind)
    } catch (reason) {
      notify('error', errorMessage(reason))
      return
    }
    onReload()
  }

  const footer = <span className="frota-muted">{visiveis.length} de {todas.length}</span>
  const titulo = (key: string) => columns.find((c) => c.key === key)?.label ?? key
  const hoje = todaySP()
  const largura = (key: string, padrao: number) => LARGURAS[kind][key] ?? padrao
  const table = (rows: Linha[], tableFooter?: ReactNode) => (
    <VirtualTable<Linha>
      rows={rows}
      rowKey={(linha) => linha.id}
      onRowClick={(linha) => onOpen(linha.kind, linha.id)}
      view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true, extraCell: extra.cell }}
      quickFilters={quickFilters}
      footer={tableFooter}
      empty={<EmptyState compact align="start" title={`Nenhum registro de ${KIND_LABEL[kind].toLowerCase()} com estes filtros`} action={<Button variant="secondary" size="compact" onClick={() => { clearFilters(); setBusca('') }}>Limpar filtros</Button>} />}
      columns={[
        { key: 'descricao', header: titulo('descricao'), label: titulo('descricao'), sortable: true, defaultWidth: largura('descricao', 300), width: 'minmax(180px, 2fr)', cell: (linha) => <TableTitle title={linha.titulo} meta={linha.categorias.length > 0 ? categoriasTexto(linha.categorias) : undefined} /> },
        { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: largura('data', 120), width: 'minmax(92px, .6fr)', cell: (linha) => <span className="frota-nowrap">{formatBR(linha.dia)}</span> },
        { key: 'veiculo', header: titulo('veiculo'), label: titulo('veiculo'), sortable: true, defaultWidth: largura('veiculo', 120), width: 'minmax(90px, .7fr)', hideBelow: 'mobile', cell: (linha) => <span className="frota-nowrap">{linha.veiculo?.label || '—'}</span> },
        { key: 'pessoa', header: PESSOA[kind], label: PESSOA[kind], sortable: true, defaultWidth: largura('pessoa', 190), hideBelow: 'mobile', cell: (linha) => linha.pessoa?.label || '—' },
        ...(kind === 'multa' ? [] : [{ key: 'extra', header: EXTRA[kind], label: EXTRA[kind], defaultWidth: 160, hideBelow: 'compact' as const, cell: (linha: Linha) => <span className="frota-nowrap">{linha.extra}</span> }]),
        { key: 'status', header: titulo('status'), label: titulo('status'), sortable: true, defaultWidth: largura('status', 160), width: 'minmax(110px, .8fr)', cell: (linha) => <StatusBadge kind={linha.kind} value={linha.status} /> },
        ...(kind === 'multa' ? [
          { key: 'proximoPasso', header: 'Próximo passo', label: 'Próximo passo', sortable: true, defaultWidth: largura('proximoPasso', 190), width: 'minmax(140px, 1fr)', hideBelow: 'compact' as const, cell: (linha: Linha) => linha.proximoPasso || '—' },
          { key: 'proximoPrazo', header: 'Próximo prazo', label: 'Próximo prazo', sortable: true, defaultWidth: largura('proximoPrazo', 130), width: 'minmax(100px, .7fr)', cell: (linha: Linha) => (linha.proximoPrazo
            ? <span className="frota-prazo frota-nowrap" data-urgencia={urgenciaDoPrazo(linha.proximoPrazo, (linha.situacoes ?? []).includes('prazo-vencido'), hoje)}>{formatBR(linha.proximoPrazo)}</span>
            : <span className="frota-muted">—</span>) },
        ] : []),
      ]}
    />
  )

  return (
    <div className="frota-lista">
      <div role="toolbar" aria-label="Comandos de registros">
        <ViewBar pinnable onAudit={() => auditoria({ entity: KIND_TABLE[kind], onOpenRecord: (id) => onOpen(kind, id) })} view={view} columns={columns} catalog={extra.catalog} filters={{ fields: allFields }}
          search={<SearchBox size={size} aria-label="Buscar registro" placeholder={kind === 'multa' ? 'Buscar código, descrição, placa ou pessoa' : 'Buscar descrição, placa ou pessoa'} value={busca} onChange={setBusca} />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={loading} onClick={onReload} />
            <Button size={size} icon={<Plus size={16} />} onClick={() => void novo()}>Novo registro</Button>
          </>}>
          {kinds.length > 1 && <SegmentedControl aria-label="Tipo de registro" options={kinds.map((item) => ({ value: item, label: PLURAL[item] }))} value={kind} onChange={trocar} />}
        </ViewBar>
      </div>
      {groups ? (
        <ListaAgrupada groups={groups} group={view.config.group} lazyKey={lazyKey} table={table} footer={footer} />
      ) : (
        <>
          {table(slice, footer)}
          <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} />
        </>
      )}
    </div>
  )
}
