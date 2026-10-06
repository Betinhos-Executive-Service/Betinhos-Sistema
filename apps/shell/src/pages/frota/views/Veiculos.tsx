import { useMemo, useState } from 'react'
import { EmptyState, PageToolbar, SearchBox, StatusBadge, Table, TableTitle } from '@betinhos/ui'
import { FotoVeiculo } from '../components/FotoVeiculo'
import { SelectFilter } from '../components/Ui'
import { brl } from '../data/format'
import { CATEGORIA, label, VEICULO, VEICULO_STATUS } from '../data/schema'
import type { DataSource } from '../data/source'
import type { FrotaData, Veiculo } from '../data/types'
import { custoVeiculo, ultimos12Meses } from '../domain/indicadores'
import { buildPendencias } from '../domain/pendencias'

const SEM_STATUS = 'sem'

type Linha = { veiculo: Veiculo; pendencias: number; custo: ReturnType<typeof custoVeiculo> }

export function Veiculos({ data, today, source, onOpenVeiculo }: { data: FrotaData; source: DataSource; today: string; onOpenVeiculo: (id: string) => void }) {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState(String(VEICULO.ATIVO))

  const linhas = useMemo<Linha[]>(() => {
    const periodo = ultimos12Meses(today)
    const pendencias = buildPendencias(data, today)
    return data.veiculos.map((veiculo) => ({
      veiculo,
      pendencias: pendencias.filter((item) => item.veiculo?.id === veiculo.id).length,
      custo: custoVeiculo(data.manutencoes, veiculo.id, periodo),
    }))
  }, [data, today])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return linhas.filter(({ veiculo }) =>
      (!termo || [veiculo.placa, veiculo.marca, veiculo.modelo, veiculo.motorista?.label].some((valor) => valor?.toLowerCase().includes(termo)))
      && (!status || (status === SEM_STATUS ? veiculo.status === null : String(veiculo.status) === status)))
  }, [linhas, busca, status])

  return (
    <div className="frota-lista">
      <PageToolbar
        start={<>
          <SearchBox className="frota-busca" size="compact" aria-label="Buscar veículo" placeholder="Buscar placa, modelo ou motorista" value={busca} onChange={setBusca} />
          <SelectFilter label="Status do veículo" allLabel="Todos os status" options={[...VEICULO_STATUS.map((option) => ({ value: String(option.value), label: option.label })), { value: SEM_STATUS, label: 'Sem status' }]} value={status} onChange={setStatus} />
        </>}
        end={<span className="frota-muted">{visiveis.length} de {linhas.length}</span>}
      />
      <Table<Linha>
        rows={visiveis}
        rowKey={(linha) => linha.veiculo.id}
        onRowClick={(linha) => onOpenVeiculo(linha.veiculo.id)}
        empty={<EmptyState compact align="start" title="Nenhum veículo com estes filtros" />}
        columns={[
          { key: 'foto', header: <span className="frota-sr-only">Foto</span>, width: '84px', hideBelow: 'mobile', cell: ({ veiculo }) => <FotoVeiculo source={source} id={veiculo.id} alt={`Foto do veículo ${veiculo.placa}`} /> },
          { key: 'placa', header: 'Placa', width: 'minmax(150px, 1.2fr)', cell: ({ veiculo }) => <TableTitle title={veiculo.placa || 'Sem placa'} meta={[veiculo.marca, veiculo.modelo].filter(Boolean).join(' ') || undefined} /> },
          { key: 'categoria', header: 'Categoria', hideBelow: 'compact', cell: ({ veiculo }) => label(CATEGORIA, veiculo.categoria) },
          { key: 'status', header: 'Status', width: 'minmax(96px, .7fr)', cell: ({ veiculo }) => <StatusBadge tone={veiculo.status === VEICULO.ATIVO ? 'success' : veiculo.status === null ? 'warning' : 'neutral'}>{label(VEICULO_STATUS, veiculo.status, 'Sem status')}</StatusBadge> },
          { key: 'motorista', header: 'Motorista atual', hideBelow: 'mobile', cell: ({ veiculo }) => veiculo.motorista?.label || '—' },
          { key: 'pendencias', header: 'Pendências', width: 'minmax(90px, .6fr)', cell: ({ pendencias }) => (pendencias > 0 ? <StatusBadge tone="danger">{pendencias}</StatusBadge> : '—') },
          { key: 'custo', header: 'Custo (12 meses)', align: 'end', hideBelow: 'compact', cell: ({ custo }) => (
            <span className="frota-nowrap">
              {custo.qtd === 0 ? '—' : custo.qtd === custo.semValor ? null : brl(custo.total)}
              {custo.semValor > 0 && <span className="frota-muted">{custo.qtd === custo.semValor ? '' : ' · '}{custo.semValor} sem valor</span>}
            </span>
          ) },
        ]}
      />
    </div>
  )
}
