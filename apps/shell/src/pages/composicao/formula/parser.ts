import type { UnresolvedFormulaNode } from './ast'
import { FormulaError } from './errors'
import { lexFormula, type Token } from './lexer'

const MAX_DEPTH = 32

export function parseFormula(source: string): UnresolvedFormulaNode {
  const tokens = lexFormula(source)
  let cursor = 0
  const current = () => tokens[cursor]
  const consume = (type: Token['type']) => {
    const token = current()
    if (token.type !== type) throw new FormulaError('FORMULA_SYNTAX', `Esperado ${type} na posição ${token.position}.`, { position: token.position })
    cursor += 1
    return token
  }

  const parsePrimary = (depth: number): UnresolvedFormulaNode => {
    if (depth > MAX_DEPTH) throw new FormulaError('EXPRESSION_TOO_COMPLEX', `A fórmula excede ${MAX_DEPTH} níveis.`)
    const token = current()
    if (token.type === 'number') { cursor += 1; return { kind: 'literal', value: token.value! } }
    if (token.type === 'reference') { cursor += 1; return { kind: 'reference', name: token.value! } }
    if (token.type === 'leftParen') {
      cursor += 1
      const node = parseExpression(depth + 1)
      consume('rightParen')
      return node
    }
    throw new FormulaError('FORMULA_SYNTAX', `Valor ou referência esperado na posição ${token.position}.`, { position: token.position })
  }

  const parseUnary = (depth: number): UnresolvedFormulaNode => {
    const token = current()
    if (token.type === 'plus' || token.type === 'minus') {
      cursor += 1
      return { kind: 'unary', operator: token.type === 'plus' ? '+' : '-', operand: parseUnary(depth + 1) }
    }
    return parsePrimary(depth)
  }

  const parsePercentage = (depth: number): UnresolvedFormulaNode => {
    let node = parseUnary(depth)
    if (current().type === 'percent') { cursor += 1; node = { kind: 'percent', operand: node } }
    return node
  }

  const parseTerm = (depth: number): UnresolvedFormulaNode => {
    let node = parsePercentage(depth)
    while (current().type === 'multiply' || current().type === 'divide') {
      const operator = current().type === 'multiply' ? '*' : '/'
      cursor += 1
      node = { kind: 'binary', operator, left: node, right: parsePercentage(depth) }
    }
    return node
  }

  const parseExpression = (depth: number): UnresolvedFormulaNode => {
    let node = parseTerm(depth)
    while (current().type === 'plus' || current().type === 'minus') {
      const operator = current().type === 'plus' ? '+' : '-'
      cursor += 1
      node = { kind: 'binary', operator, left: node, right: parseTerm(depth) }
    }
    return node
  }

  consume('equals')
  const result = parseExpression(0)
  consume('eof')
  return result
}

