const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/** `R$ 1.234,56` (o Intl usa espaço inseparável depois do R$; normalizado para espaço comum). */
export function brl(n: number): string {
  return moeda.format(n).replace(/ /g, ' ')
}

export function data(iso: string): string {
  return fmtData.format(new Date(iso))
}

export function dataHora(iso: string): string {
  const d = new Date(iso)
  return `${fmtData.format(d)} ${fmtHora.format(d)}`
}

/** yyyy-mm-dd → dd/mm/aaaa, sem passar por fuso. */
export function diaBr(dia: string): string {
  const [a, m, d] = dia.split('-')
  return `${d}/${m}/${a}`
}
