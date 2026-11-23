const TZ = 'America/Sao_Paulo'
const valido = (iso: string) => !Number.isNaN(new Date(iso).getTime())

/** `HH:mm` em São Paulo. */
export const horaCurta = (iso: string) => (valido(iso) ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '')

/** `dd/mm/aaaa` em São Paulo; texto só com a data (aaaa-mm-dd) vale como está. */
export function dataCurta(valor: string | null | undefined): string {
  if (!valor) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`
  return valido(valor) ? new Date(valor).toLocaleDateString('pt-BR', { timeZone: TZ }) : ''
}

export const dataHora = (iso: string | null | undefined) => (iso && valido(iso) ? `${dataCurta(iso)} às ${horaCurta(iso)}` : '')
