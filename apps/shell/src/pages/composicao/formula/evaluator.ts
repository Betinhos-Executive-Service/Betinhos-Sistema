import type { MoneyField } from '../data/compositions'
import type { FormulaNode } from './ast'
import { decimal, type Decimal } from './decimal'
import { FormulaError } from './errors'

export function evaluateAst(node: FormulaNode, values: Record<MoneyField, string>): Decimal {
  if (node.kind === 'literal') return decimal(node.value)
  if (node.kind === 'reference') return decimal(values[node.field] ?? '0')
  if (node.kind === 'unary') {
    const value = evaluateAst(node.operand, values)
    return node.operator === '-' ? value.times(-1) : value
  }
  if (node.kind === 'percent') return evaluateAst(node.operand, values).div(100)
  const left = evaluateAst(node.left, values)
  const right = evaluateAst(node.right, values)
  if (node.operator === '+') return left.plus(right)
  if (node.operator === '-') return left.minus(right)
  if (node.operator === '*') return left.times(right)
  if (right.eq(0)) throw new FormulaError('DIVIDE_BY_ZERO', 'Não é possível dividir por zero.')
  return left.div(right)
}

