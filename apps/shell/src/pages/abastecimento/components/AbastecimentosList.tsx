import type { ReactNode } from 'react'
import { StatusBadge, Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import { fmtDataHora, fmtKm, fmtKmPorLitro, fmtLitros, fmtMoeda, fmtPrecoLitro } from '../domain/formato'
import type { Linha } from '../domain/lista'
import { ORIGEM_ROTULO } from '../domain/types'

type Props = { list: Linha[]; view?: TableView; quickFilters?: TableQuickFilters; footer?: ReactNode; empty?: ReactNode; loading?: boolean }
const num = (texto: string) => <span className="ab-num">{texto}</span>
const ORIGEM_TONE = { ctf: 'info', ticket: 'info', app: 'success', credito: 'neutral' } as const

export function AbastecimentosTable({ list, view, quickFilters, footer, empty, loading }: Props) {
  const columns: TableColumn<Linha>[] = [
    { key: 'data', header: 'Data', label: 'Data', sortable: true, defaultWidth: 150, cell: (a) => num(fmtDataHora(a.data)) },
    { key: 'veiculo', header: 'Veículo', label: 'Veículo', sortable: true, defaultWidth: 120, cell: (a) => <span className="ab-dupla"><strong>{a.placa || '—'}</strong>{a.veiculoId ? null : <span>Sem cadastro</span>}</span> },
    { key: 'motorista', header: 'Motorista', label: 'Motorista', sortable: true, defaultWidth: 170, cell: (a) => a.motorista || '—' },
    { key: 'litros', header: 'Litros', label: 'Litros', sortable: true, align: 'end', defaultWidth: 90, cell: (a) => num(fmtLitros(a.litros)) },
    { key: 'valor', header: 'Valor', label: 'Valor', sortable: true, align: 'end', defaultWidth: 110, cell: (a) => num(fmtMoeda(a.valor)) },
    { key: 'precoLitro', header: 'Preço/L', label: 'Preço/L', sortable: true, align: 'end', defaultWidth: 100, cell: (a) => num(fmtPrecoLitro(a.precoLitro)) },
    { key: 'kmPorLitro', header: 'km/l', label: 'km/l', sortable: true, align: 'end', defaultWidth: 90, cell: (a) => num(fmtKmPorLitro(a.kmPorLitro)) },
    { key: 'origem', header: 'Origem', label: 'Origem', sortable: true, defaultWidth: 120, cell: (a) => <StatusBadge tone={ORIGEM_TONE[a.origem]}>{ORIGEM_ROTULO[a.origem]}</StatusBadge> },
    { key: 'posto', header: 'Posto', label: 'Posto', sortable: true, defaultWidth: 200, cell: (a) => a.posto || '—' },
    { key: 'odometro', header: 'Odômetro', label: 'Odômetro', sortable: true, align: 'end', defaultWidth: 110, defaultHidden: true, cell: (a) => num(fmtKm(a.odometro)) },
  ]
  return <Table className="ab-table" columns={columns} rows={list} rowKey={(a) => a.id} rowActions={() => []} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
}

export function AbastecimentosCards({ list }: { list: Linha[] }) {
  return (
    <ul className="ab-cards-lista" aria-label="Abastecimentos">
      {list.map((a) => (
        <li key={a.id} className="ab-card surface">
          <div className="ab-card__topo"><strong>{a.placa || '—'}</strong><StatusBadge tone={ORIGEM_TONE[a.origem]}>{ORIGEM_ROTULO[a.origem]}</StatusBadge></div>
          <span className="ab-muted">{fmtDataHora(a.data)}{a.motorista ? ` · ${a.motorista}` : ''}</span>
          <span className="ab-num">{fmtLitros(a.litros)} · {fmtMoeda(a.valor)} · {fmtPrecoLitro(a.precoLitro)}{a.kmPorLitro != null ? ` · ${fmtKmPorLitro(a.kmPorLitro)}` : ''}</span>
          {a.posto ? <span className="ab-muted">{a.posto}</span> : null}
        </li>
      ))}
    </ul>
  )
}
