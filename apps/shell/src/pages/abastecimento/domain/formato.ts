const casas = (n: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n, maximumFractionDigits: n })
const n0 = casas(0), n1 = casas(1)
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export const fmtLitros = (v: number | null) => (v == null ? '—' : `${n1.format(v)} L`)
export const fmtMoeda = (v: number | null) => (v == null ? '—' : moeda.format(v))
export const fmtPrecoLitro = (v: number | null) => (v == null ? '—' : `${moeda.format(Math.round(v * 100) / 100)}/L`)
export const fmtKmPorLitro = (v: number | null) => (v == null ? '—' : `${n1.format(v)} km/l`)
export const fmtKm = (v: number | null) => (v == null ? '—' : `${n0.format(v)} km`)
export const fmtDataHora = (d: Date | null) => (d ? dataHora.format(d).replace(',', '') : '—')
export const fmtData = (d: Date | null) => (d ? dataCurta.format(d) : '—')
/** "2026-10" → "out/2026". */
export const fmtMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('. de ', '/').replace('.', '') }
