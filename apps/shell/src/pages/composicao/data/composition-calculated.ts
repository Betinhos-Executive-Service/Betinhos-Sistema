import Big from 'big.js'
import { decimalString } from '../formula/decimal'
import type { DecimalString, MoneyField } from './compositions'

// Espelho das colunas calculadas do Dataverse (FormulaDefinition de new_subtotal e new_valortotal),
// para o Subtotal e o Total mudarem na hora em que a célula muda. Arco Metropolitano entra uma vez
// (migration 20261111-1500-subtotal-arco-uma-vez no Sistema).
const SUBTOTAL: MoneyField[] = [
  'cr40f_valorhoramotorista', 'cr40f_valortempodeespera', 'cr40f_valordadiaria', 'new_valorlocacao',
  'cr40f_valoradequacaoderota', 'cr40f_valoradequacaoderotaporkmrodado', 'cr40f_valordesviosentrecidades',
  'cr40f_valorpassageirosadicionais', 'cr40f_valorarcometropolitano',
  'cr40f_valorayrtonsenna', 'cr40f_valorrodoanel',
]
const TOTAL_EXTRAS: MoneyField[] = ['new_valorpedagios', 'new_valorpassagens', 'new_valorestacionamento', 'cr40f_valorcombustivel']

function sum(values: Partial<Record<MoneyField, DecimalString>>, fields: MoneyField[], start = new Big(0)) {
  return fields.reduce((total, field) => {
    try { return total.plus(values[field] || 0) } catch { return total }
  }, start)
}

export function withCalculatedTotals<T extends Partial<Record<MoneyField, DecimalString>>>(values: T): T & Pick<Record<MoneyField, DecimalString>, 'new_subtotal' | 'new_valortotal'> {
  const subtotal = sum(values, SUBTOTAL)
  return { ...values, new_subtotal: decimalString(subtotal), new_valortotal: decimalString(sum(values, TOTAL_EXTRAS, subtotal)) }
}
