import { toCsv } from '../../../app/csv'
import { formatDate } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import { valorOp, type Op, type OpChoices } from './types'

const data = (value: Date | null) => (value ? formatDate(value) : null)

/** CSV das OPs selecionadas, com as colunas da lista e os passageiros completos (Excel pt-BR). */
export function opsCsv(rows: Op[], choices: OpChoices) {
  return toCsv(
    ['OP', 'Cliente', 'Primeiro serviço', 'Último serviço', 'Passageiros', 'Valor', 'Status', 'Criada em'],
    rows.map((op) => [op.codigo, op.cliente, data(op.primeiroServico), data(op.ultimoServico), op.passageiros, valorOp(op), label(choices.status, op.status, ''), data(op.criadoEm)]),
  )
}

/** Números das OPs que já têm código (o Copiar cola um por linha). */
export const opsNumeros = (rows: Op[]) => rows.map((op) => op.codigo).filter(Boolean)
