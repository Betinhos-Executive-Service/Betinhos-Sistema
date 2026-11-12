import { moneyFields, type MoneyField } from '../data/compositions'
import type { FormulaNode, UnresolvedFormulaNode } from './ast'
import { FormulaError } from './errors'

const normalizedFieldNames = new Map<string, MoneyField>()
moneyFields.forEach(({ key, label }) => {
  normalizedFieldNames.set(key.toLocaleLowerCase('pt-BR'), key)
  normalizedFieldNames.set(label.toLocaleLowerCase('pt-BR'), key)
})

export function resolveMoneyField(name: string): MoneyField {
  const field = normalizedFieldNames.get(name.trim().toLocaleLowerCase('pt-BR'))
  if (!field) throw new FormulaError('UNKNOWN_FIELD', `Campo desconhecido: ${name}.`, { field: name })
  return field
}

export function normalizeAst(node: UnresolvedFormulaNode): FormulaNode {
  if (node.kind === 'reference') return { kind: 'reference', field: resolveMoneyField(node.name) }
  if (node.kind === 'literal') return node
  if (node.kind === 'percent') return { ...node, operand: normalizeAst(node.operand) }
  if (node.kind === 'unary') return { ...node, operand: normalizeAst(node.operand) }
  return { ...node, left: normalizeAst(node.left), right: normalizeAst(node.right) }
}

const precedence = (node: FormulaNode) => node.kind === 'binary' ? (node.operator === '+' || node.operator === '-' ? 1 : 2) : node.kind === 'unary' ? 3 : node.kind === 'percent' ? 4 : 5

function print(node: FormulaNode, parentPrecedence = 0): string {
  const own = precedence(node)
  let text: string
  if (node.kind === 'literal') text = node.value
  else if (node.kind === 'reference') text = `[${node.field}]`
  else if (node.kind === 'unary') text = `${node.operator}${print(node.operand, own)}`
  else if (node.kind === 'percent') text = `${print(node.operand, own)}%`
  else text = `${print(node.left, own)}${node.operator}${print(node.right, own + (node.operator === '-' || node.operator === '/' ? 1 : 0))}`
  return own < parentPrecedence ? `(${text})` : text
}

export function canonicalExpression(node: FormulaNode) { return `=${print(node)}` }

export function friendlyExpression(expression: string) {
  return expression.replace(/\[([^\]]+)\]/gu, (_, name: string) => {
    const field = moneyFields.find(({ key }) => key === name)
    return field ? `[${field.label}]` : `[${name}]`
  })
}

