import { useMemo } from 'react'
import { Button, EmptyState, SearchBox, StatusBadge, TableTitle, ViewBar } from '@betinhos/ui'
import type { Host } from '../../../host'
import { LazyFooter, useLazySlice } from '../../../app/LazyList'
import { VirtualTable } from '../../../app/VirtualTable'
import { useDebouncedText } from '../../../app/search'
import { filterRows } from '../../../app/filterRows'
import { useListView } from '../../../app/useListView'
import { useQueryTexto } from '../../../nav/queryState'
import { FotoVeiculo } from '../components/FotoVeiculo'
import { brl } from '../data/format'
import { CATEGORIA, label, VEICULO, VEICULO_STATUS } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData } from '../data/types'
import { custoVeiculo, ultimos12Meses } from '../domain/indicadores'
import { TELA_VEICULOS, VEICULO_COLUMNS, VEICULO_DEFAULT_FILTERS, VEICULO_FIELDS, VEICULO_SORT, matchesVeiculoKeyword, readVeiculo, sortVeiculos, veiculoBuiltins, veiculoLegacy, type LinhaVeiculo } from '../domain/listas'
import { motoristaAtual, possesAbertas, rotuloMotoristaAtual } from '../domain/motoristaAtual'
import { buildPendencias } from '../domain/pendencias'
import { useAuditoria } from '../../../app/auditoria/AuditoriaProvider'

const MOCK_HOST: Host = { mode: 'mock' }
const byVeiculo = (linha: LinhaVeiculo) => linha.veiculo.id

export function Veiculos({ data, today, source, host = MOCK_HOST, onOpenVeiculo }: { data: FrotaData; source: DataSource; host?: Host; today: string; onOpenVeiculo: (id: string) => void }) {
  const auditoria = useAuditoria()
  // Visões, colunas e filtros (DS §10.9.1/§10.9.2); a Visão padrão mostra só os ativos. Busca em `q`, filtros em `f=`.
  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_veiculos', ids: data.veiculos.map((v) => v.id) },
    tela: TELA_VEICULOS,
    columns: VEICULO_COLUMNS,
    defaultSort: VEICULO_SORT,
    defaultFilters: VEICULO_DEFAULT_FILTERS,
    fields: VEICULO_FIELDS,
    ready: true,
    builtins: veiculoBuiltins,
    legacy: { keys: ['status'], read: veiculoLegacy },
  })
  const [busca, setBusca] = useQueryTexto('q')
  // A lista filtra 200 ms depois da última tecla.
  const termo = useDebouncedText(busca)

  const linhas = useMemo<LinhaVeiculo[]>(() => {
    const periodo = ultimos12Meses(today)
    const pendencias = buildPendencias(data, today)
    const abertas = possesAbertas(data.posses)
    return data.veiculos.map((veiculo) => ({
      veiculo,
      motorista: rotuloMotoristaAtual(motoristaAtual(veiculo, abertas)),
      pendencias: pendencias.filter((item) => item.veiculo?.id === veiculo.id).length,
      custo: custoVeiculo(data.manutencoes, veiculo.id, periodo),
    }))
  }, [data, today])

  const visiveis = useMemo(
    () => extra.sort(sortVeiculos(filterRows(linhas, filters, allFields, extra.read(readVeiculo, byVeiculo)).filter((linha) => matchesVeiculoKeyword(linha, termo)), view.config.sort), view.config.sort, byVeiculo),
    [linhas, filters, termo, view.config.sort],
  )
  // Rolagem infinita (sem paginação visível): trocar filtro, busca ou ordenação volta ao primeiro lote.
  const lazyKey = useMemo(() => JSON.stringify({ filters, termo, sort: view.config.sort }), [filters, termo, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visiveis, lazyKey)

  return (
    <div className="frota-lista">
      <div role="toolbar" aria-label="Comandos de veículos">
        <ViewBar onAudit={() => auditoria({ entity: 'cr40f_veiculos', onOpenRecord: onOpenVeiculo })} view={view} columns={VEICULO_COLUMNS} catalog={extra.catalog} filters={{ fields: allFields }}>
          <SearchBox className="frota-busca" size="compact" aria-label="Buscar veículo" placeholder="Buscar placa, modelo ou motorista" value={busca} onChange={setBusca} />
        </ViewBar>
      </div>
      <VirtualTable<LinhaVeiculo>
        rows={slice}
        rowKey={(linha) => linha.veiculo.id}
        onRowClick={(linha) => onOpenVeiculo(linha.veiculo.id)}
        view={{ config: view.config, onChange: view.setConfig, extraCell: extra.cell }}
        quickFilters={quickFilters}
        footer={<span className="frota-muted">{visiveis.length} de {linhas.length}</span>}
        empty={<EmptyState compact align="start" title="Nenhum veículo com estes filtros" action={<Button variant="secondary" size="compact" onClick={() => { clearFilters(); setBusca('') }}>Limpar filtros</Button>} />}
        columns={[
          { key: 'foto', header: <span className="frota-sr-only">Foto</span>, label: 'Foto', defaultWidth: 84, width: '84px', hideBelow: 'mobile', cell: ({ veiculo }) => <FotoVeiculo source={source} id={veiculo.id} alt={`Foto do veículo ${veiculo.placa}`} /> },
          { key: 'placa', header: 'Placa', label: 'Placa', sortable: true, defaultWidth: 200, width: 'minmax(150px, 1.2fr)', cell: ({ veiculo }) => <TableTitle title={veiculo.placa || 'Sem placa'} meta={[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || undefined} /> },
          { key: 'categoria', header: 'Categoria', label: 'Categoria', sortable: true, defaultWidth: 130, hideBelow: 'compact', cell: ({ veiculo }) => label(CATEGORIA, veiculo.categoria) },
          { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 130, width: 'minmax(96px, .7fr)', cell: ({ veiculo }) => <StatusBadge tone={veiculo.status === VEICULO.ATIVO ? 'success' : veiculo.status === null ? 'warning' : 'neutral'}>{label(VEICULO_STATUS, veiculo.status, 'Sem status')}</StatusBadge> },
          { key: 'motorista', header: 'Motorista atual', label: 'Motorista atual', sortable: true, defaultWidth: 200, hideBelow: 'mobile', cell: ({ motorista }) => motorista || '—' },
          { key: 'pendencias', header: 'Pendências', label: 'Pendências', sortable: true, defaultWidth: 120, width: 'minmax(90px, .6fr)', cell: ({ pendencias }) => (pendencias > 0 ? <StatusBadge tone="danger">{pendencias}</StatusBadge> : '—') },
          { key: 'custo', header: 'Manutenção (12 meses)', label: 'Manutenção (12 meses)', sortable: true, defaultWidth: 190, align: 'end', hideBelow: 'compact', cell: ({ custo }) => (
            <span className="frota-nowrap">
              {custo.qtd === 0 ? '—' : custo.qtd === custo.semValor ? null : brl(custo.total)}
              {custo.semValor > 0 && <span className="frota-muted">{custo.qtd === custo.semValor ? '' : ' · '}{custo.semValor} sem valor</span>}
            </span>
          ) },
        ]}
      />
      <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} />
    </div>
  )
}
