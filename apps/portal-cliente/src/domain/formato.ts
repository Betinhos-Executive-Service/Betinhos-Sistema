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

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' })
/** `quinta-feira, 26/11/2026 às 09:00` (Brasília). */
export function diaSemanaDataHora(iso: string): string {
  const d = new Date(iso)
  return `${fmtDiaSemana.format(d)}, ${fmtData.format(d)} às ${fmtHora.format(d)}`
}

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
/** Atalhos de data a partir de hoje (`AAAA-MM-DD`): Hoje, Amanhã e o primeiro dia útil depois de amanhã ("Seg 30"). */
export function atalhosDeData(hoje: string): { rotulo: string; valor: string }[] {
  const dia = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) + n * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  let n = 2
  while ([0, 6].includes(dia(n).getUTCDay())) n++
  const util = dia(n)
  return [
    { rotulo: 'Hoje', valor: hoje },
    { rotulo: 'Amanhã', valor: iso(dia(1)) },
    { rotulo: `${DIAS_CURTOS[util.getUTCDay()]} ${String(util.getUTCDate()).padStart(2, '0')}`, valor: iso(util) },
  ]
}
