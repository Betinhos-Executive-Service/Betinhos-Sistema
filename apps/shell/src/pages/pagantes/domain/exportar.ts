import { toCsv } from '../../../app/csv'
import { formatDate } from './messages'
import { label } from './status'
import type { ChoiceSet, Pagante } from './types'

const data = (value: Date | null) => (value ? formatDate(value) : null)

/** CSV das linhas selecionadas, com as colunas da lista (Excel pt-BR). */
export function pagantesCsv(rows: Pagante[], choices: ChoiceSet) {
  return toCsv(
    ['Pagante', 'PAG', 'OP', 'Valor', 'Forma', 'Pagamento', 'Recibo', 'Criado em'],
    rows.map((p) => [p.pessoa, p.codigo, p.op, p.valor, label(choices.forma, p.forma, ''), label(choices.status, p.status, ''), label(choices.recibo, p.recibo, ''), data(p.criadoEm)]),
  )
}
