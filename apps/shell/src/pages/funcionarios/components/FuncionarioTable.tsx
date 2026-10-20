import { Table, type TableColumn, type TableQuickFilters, type TableView } from '@betinhos/ui'
import type { ReactNode } from 'react'
import { ASO_VALIDADE_MESES, rotuloCurto } from '../data/alerts'
import { addMonths, formatBR } from '../data/dates'
import { contato } from '../data/lista'
import { FUNCAO, optionLabel } from '../data/schema'
import type { FuncionarioView } from '../data/types'
import { AlertBadge, Avatar, StatusBadge } from './Badges'

type Props = {
  rows: FuncionarioView[]
  onOpen: (id: string) => void
  loading?: boolean
  view?: TableView
  quickFilters?: TableQuickFilters
  footer?: ReactNode
  empty?: ReactNode
}

const muted = <span className="muted">—</span>

/** Lista de colaboradores na tabela do Design System; clicar na linha abre a ficha. */
export function FuncionarioTable({ rows, onOpen, loading, view, quickFilters, footer, empty }: Props) {
  const columns: TableColumn<FuncionarioView>[] = [
    {
      key: 'nome', header: 'Colaborador', label: 'Colaborador', sortable: true, defaultWidth: 280, width: 'minmax(220px, 2fr)', cell: (row) => {
        const nome = String(row.values.cr40f_nomecompleto ?? '')
        const aniversario = row.alertas.find((alerta) => alerta.kind === 'aniversario')
        return (
          <div className="person">
            <Avatar name={nome} src={row.fotoThumb} />
            <div>
              <strong>{nome || 'Sem nome'}</strong>
              <span className="muted">{String(row.values.new_apelido ?? '')}{aniversario && <> · <AlertBadge alerta={aniversario} /></>}</span>
            </div>
          </div>
        )
      },
    },
    { key: 'funcao', header: 'Função', label: 'Função', sortable: true, defaultWidth: 150, cell: (row) => optionLabel(FUNCAO, row.values.cr40f_funcao) },
    { key: 'status', header: 'Status', label: 'Status', sortable: true, defaultWidth: 130, cell: (row) => <StatusBadge value={row.values.cr40f_status} /> },
    { key: 'contato', header: 'Contato', label: 'Contato', sortable: true, defaultWidth: 160, cell: (row) => <span className="nowrap">{contato(row) || '—'}</span> },
    { key: 'veiculo', header: 'Veículo atual', label: 'Veículo atual', sortable: true, defaultWidth: 140, cell: (row) => row.veiculo?.label ?? muted },
    {
      key: 'cnh', header: 'CNH', label: 'CNH', sortable: true, defaultWidth: 150, cell: (row) => {
        const cnh = row.alertas.find((alerta) => alerta.kind === 'cnh')
        return <span className="nowrap">{cnh ? <AlertBadge alerta={cnh} text={rotuloCurto(cnh)} /> : formatBR(row.values.cr40f_validadedacnh as string) || muted}</span>
      },
    },
    {
      key: 'aso', header: 'ASO vence', label: 'ASO vence', sortable: true, defaultWidth: 150, cell: (row) => {
        const aso = row.alertas.find((alerta) => alerta.kind === 'aso')
        const data = row.values.cr40f_datadoaso as string | null
        return <span className="nowrap">{aso ? <AlertBadge alerta={aso} text={rotuloCurto(aso)} /> : data ? formatBR(addMonths(data, ASO_VALIDADE_MESES)) : muted}</span>
      },
    },
    { key: 'admissao', header: 'Admissão', label: 'Admissão', sortable: true, defaultWidth: 120, cell: (row) => <span className="nowrap">{formatBR(row.values.cr40f_datadeadmissao as string) || muted}</span> },
  ]
  return <Table className="func-table" columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={(row) => onOpen(row.id)} loading={loading} view={view} quickFilters={quickFilters} footer={footer} empty={empty} />
}
