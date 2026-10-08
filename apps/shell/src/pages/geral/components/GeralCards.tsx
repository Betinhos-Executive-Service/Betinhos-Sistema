import type { Row } from '@betinhos/dataverse'
import { Button, Checkbox, Skeleton, StatusBadge } from '@betinhos/ui'
import { statusTone } from '../domain/cells'
import { formatCell } from '../domain/format'
import { rowKey } from '../domain/layout'
import { ID_ATTRIBUTE, type AttributeMap, type Column } from '../domain/types'

type Props = {
  rows: Row[]
  /** Colunas visíveis da visão: o card só mostra o que a visão tem. */
  columns: Column[]
  attributes: AttributeMap | null
  loading: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  /** Abre o serviço no Formulário Geral. */
  onOpen: (id: string) => void
  /** Abre a sheet de edição dos campos. */
  onEdit: (id: string) => void
}

const SKELETON_CARDS = 4
const STATUS = 'cr40f_status'
const DATA = 'cr40f_dataehorriodesada'

/** Lista de serviços no celular: um card por linha com o essencial e o botão que abre a edição por campo. */
export function GeralCards({ rows, columns, attributes, loading, selected, onToggle, onOpen, onEdit }: Props) {
  const find = (attribute: string) => columns.find((c) => !c.alias && c.attribute === attribute)
  const has = {
    status: find(STATUS), data: find(DATA), cliente: find('cr40f_cliente'), motorista: find('cr40f_motorista'), trajeto: find('cr40f_trajeto'),
  }
  const valueOf = (row: Row, column: Column | undefined) => (column ? formatCell('readonly', row, rowKey(column, attributes?.get(column.key))) : '—')

  if (loading && rows.length === 0) {
    return (
      <ul className="gr-cards" aria-label="Carregando serviços" aria-busy="true">
        {Array.from({ length: SKELETON_CARDS }, (_, i) => <li key={i} className="gr-card" aria-hidden="true"><Skeleton height={16} width="40%" /><Skeleton height={14} /><Skeleton height={14} width="70%" /></li>)}
      </ul>
    )
  }

  return (
    <ul className="gr-cards" aria-label="Serviços">
      {rows.map((row) => {
        const id = String(row[ID_ATTRIBUTE])
        const name = formatCell('readonly', row, 'cr40f_id')
        const statusRaw = has.status ? row[STATUS] : null
        const data = has.data ? formatCell('datetime', row, rowKey(has.data, attributes?.get(has.data.key))) : null
        // Só decide "sem motorista" com a metadata carregada: antes dela o lookup nem tem chave conhecida.
        const motoristaKey = has.motorista && attributes ? rowKey(has.motorista, attributes.get(has.motorista.key)) : null
        return (
          <li key={id} className={selected.has(id) ? 'gr-card is-selected' : 'gr-card'}>
            <div className="gr-card__head">
              <span className="gr-card__check">
                <Checkbox label={<span className="gr-sr">Selecionar serviço {name}</span>} checked={selected.has(id)} onChange={() => onToggle(id)} />
              </span>
              <button type="button" className="gr-open" aria-label={`Abrir serviço ${name} no Formulário Geral`} onClick={() => onOpen(id)}>{name}</button>
              {typeof statusRaw === 'number' ? <StatusBadge tone={statusTone(STATUS, statusRaw)}>{formatCell('readonly', row, STATUS)}</StatusBadge> : null}
            </div>
            {data != null ? <p className="gr-card__line"><strong>{data}</strong></p> : null}
            {has.cliente ? <p className="gr-card__line">{valueOf(row, has.cliente)}</p> : null}
            {motoristaKey != null ? (
              <p className="gr-card__line">
                {row[motoristaKey] == null ? <StatusBadge tone="warning">Sem motorista</StatusBadge> : <>Motorista: <strong>{formatCell('readonly', row, motoristaKey)}</strong></>}
              </p>
            ) : null}
            {has.trajeto ? <p className="gr-card__line gr-card__route">{valueOf(row, has.trajeto)}</p> : null}
            <Button variant="secondary" size="touch" fullWidth onClick={() => onEdit(id)}>Editar campos</Button>
          </li>
        )
      })}
    </ul>
  )
}
