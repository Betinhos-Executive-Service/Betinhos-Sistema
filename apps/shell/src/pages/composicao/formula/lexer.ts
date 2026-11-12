import { FormulaError } from './errors'

export type Token = {
  type: 'equals' | 'number' | 'reference' | 'plus' | 'minus' | 'multiply' | 'divide' | 'percent' | 'leftParen' | 'rightParen' | 'eof'
  value?: string
  position: number
}

const MAX_EXPRESSION_LENGTH = 4000
const MAX_TOKENS = 256

export function lexFormula(source: string): Token[] {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaError('EXPRESSION_TOO_COMPLEX', `A fórmula excede ${MAX_EXPRESSION_LENGTH} caracteres.`)
  }

  const tokens: Token[] = []
  let index = 0
  const push = (token: Token) => {
    tokens.push(token)
    if (tokens.length > MAX_TOKENS) throw new FormulaError('EXPRESSION_TOO_COMPLEX', `A fórmula excede ${MAX_TOKENS} tokens.`)
  }

  while (index < source.length) {
    const char = source[index]
    if (/\s/u.test(char)) { index += 1; continue }
    const simple: Record<string, Token['type']> = {
      '=': 'equals', '+': 'plus', '-': 'minus', '*': 'multiply', '/': 'divide',
      '%': 'percent', '(': 'leftParen', ')': 'rightParen',
    }
    if (simple[char]) { push({ type: simple[char], position: index }); index += 1; continue }

    if (char === '[') {
      const end = source.indexOf(']', index + 1)
      if (end < 0) throw new FormulaError('FORMULA_SYNTAX', 'Referência sem fechamento "]".', { position: index })
      const value = source.slice(index + 1, end).trim()
      if (!value) throw new FormulaError('FORMULA_SYNTAX', 'Referência de campo vazia.', { position: index })
      push({ type: 'reference', value, position: index })
      index = end + 1
      continue
    }

    if (/\d/u.test(char)) {
      const start = index
      let separatorSeen = false
      while (index < source.length) {
        const current = source[index]
        if (/\d/u.test(current)) { index += 1; continue }
        if ((current === '.' || current === ',') && !separatorSeen && /\d/u.test(source[index + 1] ?? '')) {
          separatorSeen = true
          index += 1
          continue
        }
        break
      }
      const raw = source.slice(start, index)
      push({ type: 'number', value: raw.replace(',', '.'), position: start })
      continue
    }

    throw new FormulaError('FORMULA_SYNTAX', `Caractere inválido "${char}".`, { position: index })
  }

  push({ type: 'eof', position: source.length })
  return tokens
}

