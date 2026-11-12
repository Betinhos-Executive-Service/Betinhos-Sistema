import type { MoneyField } from '../data/compositions'
import type { FormulaNode } from './ast'
import { decimalString } from './decimal'
import { formulaDependencies } from './dependencies'
import { FormulaError } from './errors'
import { evaluateAst } from './evaluator'
import { canonicalExpression, normalizeAst } from './normalize'
import { parseFormula } from './parser'

export { FormulaError, formulaErrorMessage } from './errors'
export { friendlyExpression, resolveMoneyField } from './normalize'
export { decimal, decimalString } from './decimal'

export const FORMULA_ENGINE_VERSION = 1 as const

export type FormulaAnalysis = {
  ast: FormulaNode
  expression: string
  dependencies: Set<MoneyField>
}

export function formulaExpressionFromInput(source: string) {
  const trimmed = source.trim()
  if (trimmed.startsWith('=')) return trimmed
  return null
}

export function insertReferenceInFormula(source: string, label: string, start: number, end = start) {
  const safeStart = Math.max(0, Math.min(start, source.length))
  const safeEnd = Math.max(safeStart, Math.min(end, source.length))
  let value = `${source.slice(0, safeStart)}[${label}]${source.slice(safeEnd)}`
  let cursor = safeStart + label.length + 2
  if (!value.trimStart().startsWith('=')) {
    value = `=${value}`
    cursor += 1
  }
  return { value, cursor }
}

export function analyzeFormula(source: string): FormulaAnalysis {
  const ast = normalizeAst(parseFormula(source))
  return { ast, expression: canonicalExpression(ast), dependencies: formulaDependencies(ast) }
}

export function evaluateFormula(source: string, values: Record<MoneyField, string>, precision = 2) {
  const analysis = analyzeFormula(source)
  return { ...analysis, value: decimalString(evaluateAst(analysis.ast, values), precision) }
}

export function evaluateFormulaSet(
  formulas: Partial<Record<MoneyField, string>>,
  initialValues: Record<MoneyField, string>,
  precision = 2,
) {
  const analyses = new Map<MoneyField, FormulaAnalysis>()
  Object.entries(formulas).forEach(([field, expression]) => {
    if (expression) analyses.set(field as MoneyField, analyzeFormula(expression))
  })

  analyses.forEach((analysis, field) => {
    if (analysis.dependencies.has(field)) throw new FormulaError('SELF_REFERENCE', `A fórmula de ${field} referencia a própria célula.`, { field })
  })

  const order: MoneyField[] = []
  const visiting = new Set<MoneyField>()
  const visited = new Set<MoneyField>()
  const visit = (field: MoneyField, path: MoneyField[]) => {
    if (visited.has(field)) return
    if (visiting.has(field)) throw new FormulaError('CIRCULAR_REFERENCE', `Referência circular: ${[...path, field].join(' → ')}.`, { path: [...path, field] })
    visiting.add(field)
    const analysis = analyses.get(field)
    analysis?.dependencies.forEach((dependency) => { if (analyses.has(dependency)) visit(dependency, [...path, field]) })
    visiting.delete(field)
    visited.add(field)
    order.push(field)
  }
  analyses.forEach((_, field) => visit(field, []))

  const values = { ...initialValues }
  order.forEach((field) => { values[field] = decimalString(evaluateAst(analyses.get(field)!.ast, values), precision) })
  return { values, order, analyses }
}
