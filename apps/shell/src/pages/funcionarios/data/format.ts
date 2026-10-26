export function digitsOnly(value: string) {
  return value.replace(/\D+/g, '')
}

export function formatCpf(value: string) {
  const d = digitsOnly(value).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function isValidCpf(value: string) {
  const d = digitsOnly(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

/** Padrão já usado na base: "+55 12 99223-7000". */
export function formatPhone(value: string) {
  let d = digitsOnly(value)
  if (!d) return ''
  if (!d.startsWith('55') && d.length <= 11) d = `55${d}`
  d = d.slice(0, 13)
  const ddd = d.slice(2, 4)
  const number = d.slice(4)
  if (!ddd) return `+${d}`
  if (!number) return `+55 ${ddd}`
  const split = number.length > 8 ? 5 : 4
  return number.length > split ? `+55 ${ddd} ${number.slice(0, split)}-${number.slice(split)}` : `+55 ${ddd} ${number}`
}

export function isValidPhone(value: string) {
  const d = digitsOnly(value)
  return d.length === 12 || d.length === 13
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Texto simples -> HTML em parágrafos (campo rich text do Dataverse). */
export function plainToRichText(text: string) {
  const esc = (line: string) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = text.trim().split(/\r?\n/)
  return text.trim() ? lines.map((line) => `<p>${esc(line) || '<br>'}</p>`).join('') : ''
}

/** Converte o rich text do Dataverse em texto puro sem executar nada (DOMParser não roda scripts). */
export function richTextToPlain(html: string | null | undefined) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), 'text/html')
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Exibição "(12) 99713-5174"; aceita com ou sem +55 e formata enquanto digita. */
export function formatCelular(value: string) {
  let d = digitsOnly(value)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d && `(${d}`
  const n = d.slice(2)
  const split = n.length === 9 ? 5 : 4
  return n.length >= 8 ? `(${d.slice(0, 2)}) ${n.slice(0, split)}-${n.slice(split)}` : `(${d.slice(0, 2)}) ${n}`
}
