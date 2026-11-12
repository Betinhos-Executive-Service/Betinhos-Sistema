import Big from 'big.js'
import { FormulaError } from './errors'

Big.DP = 20
Big.RM = Big.roundHalfUp

export type Decimal = Big

export function decimal(value: string | number) {
  try { return new Big(String(value)) }
  catch { throw new FormulaError('FORMULA_SYNTAX', `Número inválido: ${value}.`) }
}

export function decimalString(value: Big, precision = 2) {
  return value.round(precision, Big.roundHalfUp).toFixed(precision)
}

