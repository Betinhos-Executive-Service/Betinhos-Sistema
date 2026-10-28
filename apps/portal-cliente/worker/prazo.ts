// Prazo da aprovação tácita: 5 dias úteis (seg–sex, sem feriados nacionais), em America/Sao_Paulo.

export const DIAS_TACITA = 5

// America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo.
const OFFSET_MS = 3 * 60 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

/** Data local (yyyy-mm-dd) em America/Sao_Paulo. */
export const diaLocal = (ms: number) => new Date(ms - OFFSET_MS).toISOString().slice(0, 10)

const paraMs = (dia: string) => Date.parse(`${dia}T00:00:00Z`)
const paraDia = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em ms UTC. */
function pascoa(ano: number): number {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return Date.UTC(ano, mes - 1, dia)
}

const FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
const cacheFeriados = new Map<number, Set<string>>()

/** Feriados nacionais (lei): fixos + Sexta-feira Santa. Carnaval e Corpus Christi são ponto facultativo. */
export function feriados(ano: number): Set<string> {
  let s = cacheFeriados.get(ano)
  if (!s) {
    s = new Set([...FIXOS.map((md) => `${ano}-${md}`), paraDia(pascoa(ano) - 2 * DIA_MS)])
    cacheFeriados.set(ano, s)
  }
  return s
}

export function ehDiaUtil(dia: string): boolean {
  const semana = new Date(paraMs(dia)).getUTCDay()
  return semana !== 0 && semana !== 6 && !feriados(Number(dia.slice(0, 4))).has(dia)
}

/** Último dia (yyyy-mm-dd) para o cliente agir: o `dias`-ésimo dia útil depois do dia de `inicioMs` (o próprio dia não conta). */
export function prazoTacito(inicioMs: number, dias = DIAS_TACITA): string {
  let ms = paraMs(diaLocal(inicioMs))
  for (let contados = 0; contados < dias; ) {
    ms += DIA_MS
    if (ehDiaUtil(paraDia(ms))) contados++
  }
  return paraDia(ms)
}

/** Venceu quando o prazo já passou (hoje, em São Paulo, é depois do prazo). */
export const venceu = (prazo: string, agoraMs: number) => prazo < diaLocal(agoraMs)

/** Início do último dia útil anterior a hoje, à mesma hora (janela do resumo diário; na segunda cobre desde sexta). */
export function inicioJanelaResumo(agoraMs: number): number {
  let ms = agoraMs - DIA_MS
  while (!ehDiaUtil(diaLocal(ms))) ms -= DIA_MS
  return ms
}
