export type FormulaErrorCode =
  | 'FORMULA_SYNTAX'
  | 'UNKNOWN_FIELD'
  | 'SELF_REFERENCE'
  | 'CIRCULAR_REFERENCE'
  | 'DIVIDE_BY_ZERO'
  | 'EXPRESSION_TOO_COMPLEX'
  | 'FIELD_NOT_WRITABLE'
  | 'CONCURRENCY_CONFLICT'
  | 'UNAUTHORIZED_TARGET'
  | 'ENGINE_VERSION_UNSUPPORTED'
  | 'METADATA_MISMATCH'

export class FormulaError extends Error {
  constructor(
    public readonly code: FormulaErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'FormulaError'
  }
}

export function formulaErrorMessage(error: unknown) {
  if (error instanceof FormulaError) return error.message
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('error' in error && error.error && typeof error.error === 'object' && 'message' in error.error && typeof error.error.message === 'string') return error.error.message
  }
  return 'Não foi possível salvar. Confira a resposta da operação no Dataverse.'
}
