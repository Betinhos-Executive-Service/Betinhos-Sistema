import type { MoneyField } from '../data/compositions'
import type { FormulaNode } from './ast'

export function formulaDependencies(node: FormulaNode) {
  const dependencies = new Set<MoneyField>()
  const visit = (current: FormulaNode) => {
    if (current.kind === 'reference') dependencies.add(current.field)
    else if (current.kind === 'unary' || current.kind === 'percent') visit(current.operand)
    else if (current.kind === 'binary') { visit(current.left); visit(current.right) }
  }
  visit(node)
  return dependencies
}

