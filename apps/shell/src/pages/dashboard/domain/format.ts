/** Igual ao `normL` do legado: sem acento e minúsculo. */
export const normL = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** Igual ao `stL` do legado: só minúsculo (mantém acento). */
export const stL = (s: unknown) => String(s ?? '').toLowerCase()
/** Número com casas fixas e vírgula decimal. */
export const dec = (v: number, casas: number) => v.toFixed(casas).replace('.', ',')
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const brl = (v: number | null | undefined) => (v == null ? '—' : BRL.format(v))
/** Moeda curta do legado (`brlS`): R$ 1,23M, R$ 4,5k ou o valor cheio. */
export function brlS(v: number | null | undefined) {
  if (v == null) return '—'
  if (v >= 1e6) return `R$\u00a0${dec(v / 1e6, 2)}M`
  if (v >= 1e3) return `R$\u00a0${dec(v / 1e3, 1)}k`
  return brl(v)
}
/** Soma de um campo numérico das linhas (linha "Total" das tabelas mensais). */
export const somar = <T,>(rows: T[], valor: (r: T) => number) => rows.reduce((t, r) => t + valor(r), 0)
export const int = (v: number) => v.toLocaleString('pt-BR')
/** "1 dia", "3 dias" (número formatado). */
export const plural = (n: number, um: string, varios: string) => `${int(n)} ${n === 1 ? um : varios}`
