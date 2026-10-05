const DAY = 86_400_000
const TZ = 'America/Sao_Paulo'
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Minúsculas e sem acento, para a busca achar "joao" em "João". */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const digits = (text: string) => text.replace(/\D/g, '')

export function maskCpf(raw: string) {
  return digits(raw).slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** (11) 3333-4444 ou (11) 98765-4321; corrige o legado, que errava o fixo de 10 dígitos. */
export function maskPhone(raw: string) {
  const d = digits(raw).slice(0, 11)
  if (d.length < 3) return d
  const rest = d.slice(2)
  const split = rest.length > 8 ? 5 : 4
  return rest.length > split ? `(${d.slice(0, 2)}) ${rest.slice(0, split)}-${rest.slice(split)}` : `(${d.slice(0, 2)}) ${rest}`
}

export const maskUf = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
export const maskNota = (raw: string) => digits(raw).slice(0, 2)

/** "hoje", "ontem" ou "há N dias", contando dias de calendário em São Paulo. */
export function daysAgo(date: Date | null, now: Date) {
  if (!date) return ''
  const days = Math.round((Date.parse(keyFormat.format(now)) - Date.parse(keyFormat.format(date))) / DAY)
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`
}

export const formatMoney = (value: number) => moneyFormat.format(value)
export const formatDate = (date: Date) => dateFormat.format(date)
