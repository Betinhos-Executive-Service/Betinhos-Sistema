import type { MoneyField } from '../data/compositions'

export type FormulaNode =
  | { kind: 'literal'; value: string }
  | { kind: 'reference'; field: MoneyField }
  | { kind: 'unary'; operator: '+' | '-'; operand: FormulaNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode }
  | { kind: 'percent'; operand: FormulaNode }

export type UnresolvedFormulaNode =
  | { kind: 'literal'; value: string }
  | { kind: 'reference'; name: string }
  | { kind: 'unary'; operator: '+' | '-'; operand: UnresolvedFormulaNode }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: UnresolvedFormulaNode; right: UnresolvedFormulaNode }
  | { kind: 'percent'; operand: UnresolvedFormulaNode }

