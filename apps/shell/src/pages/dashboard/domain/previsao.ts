import { soma } from './base'
import { brlS } from './format'
import { DIA_MS, diasNoMes, fmtDia, hojeBR, inicioMs, parseDia } from './periodo'
import type { Reserva } from './types'

/** Previsão do legado. Detalhe preservado: o fim do filtro vale até 23:59:59.000 e "hoje" até 23:59:59.999. */
export function previsao(rv: Reserva[], inicio: string, fim: string, now: Date) {
  const hoje = hojeBR(now)
  const { y, m, d } = parseDia(hoje)
  const anoIni = inicioMs(`${y}-01-01`)
  const anoFim = inicioMs(`${y}-12-31`) + DIA_MS - 1000
  const mesIni = inicioMs(fmtDia(y, m, 1))
  const hojeIni = inicioMs(hoje)
  const hojeFim = hojeIni + DIA_MS - 1
  const selIni = inicioMs(inicio)
  const selFim = inicioMs(fim) + DIA_MS - 1000
  const anual = selIni === anoIni && selFim >= hojeFim
  const estado = selIni > hojeFim ? 'future' : selFim < hojeIni ? 'closed' : 'open'
  const rotulo = anual ? 'Previsão anual' : 'Previsão até fim do mês'
  if (estado === 'closed') return { rotulo, texto: 'período encerrado' }
  if (estado === 'future') return { rotulo, texto: 'sem base futura' }

  const runIni = anual ? anoIni : Math.max(selIni, mesIni)
  const dentro = (r: Reserva, ini: number) => Number.isFinite(r.saidaMs) && r.saidaMs >= ini && r.saidaMs <= hojeFim && r.saidaMs <= selFim
  const atual = soma(rv.filter((r) => dentro(r, selIni)))
  const corrida = soma(rv.filter((r) => dentro(r, runIni)))
  if (!corrida) return { rotulo, texto: 'sem base realizada' }

  const decorridos = Math.max(1, Math.floor((hojeIni - runIni) / DIA_MS) + 1)
  const alvo = anual ? Math.round((anoFim - anoIni) / DIA_MS) + 1 : diasNoMes(y, m)
  const restantes = anual ? Math.max(0, alvo - decorridos) : Math.max(0, alvo - d)
  return { rotulo, texto: brlS(atual + (corrida / decorridos) * restantes) }
}
