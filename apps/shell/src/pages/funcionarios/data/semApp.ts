import type { FieldValue } from './types'

export const FUNCAO_MOTORISTA = 202410000

export const emailMicrosoft = (values: Record<string, FieldValue>) =>
  typeof values.cr40f_emailmicrosoft === 'string' ? values.cr40f_emailmicrosoft.trim().toLowerCase() : ''

/** Motorista sem acesso ao app: sem e-mail Microsoft ou sem systemuser habilitado com esse e-mail (`ativos` em minúsculas). */
export function semApp(values: Record<string, FieldValue>, ativos: ReadonlySet<string>) {
  if (values.cr40f_funcao !== FUNCAO_MOTORISTA) return false
  const email = emailMicrosoft(values)
  return !email || !ativos.has(email)
}
