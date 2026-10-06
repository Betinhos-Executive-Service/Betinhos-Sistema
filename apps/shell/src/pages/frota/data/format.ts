const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const NAO_INFORMADO = 'Não informado'

export function brl(value: number | null) {
  return value == null ? NAO_INFORMADO : money.format(value)
}
