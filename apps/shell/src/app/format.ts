const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dateOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

export const formatMoney = (value: number | null) => (value == null ? '—' : money.format(value))
export const formatDateTime = (value: Date | null) => (value ? dateTime.format(value).replace(',', '') : '—')
export const formatDate = (value: Date | null) => (value ? dateOnly.format(value) : '—')

/** `aaaa-mm-dd` (ou datetime ISO, só os 10 primeiros) → `dd/mm/aaaa` sem passar por Date (evita deslocar o dia pelo fuso). */
export const formatDay = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

export const digitsOnly = (s: string) => s.replace(/\D/g, '')
