/**
 * Prazo opcional do projeto: um dia, a semana N de um mês ou o mês inteiro.
 * Guardado em `cr40f_projeto.cr40f_prazo` (último dia do período, só data) e `cr40f_prazotipo`.
 * Semana N = de segunda a domingo, cortada no mês (dez/2026: S1 1–6, S2 7–13 … S5 28–31).
 * Toda conta é em UTC sobre `aaaa-mm-dd`, sem fuso.
 */
export type PrazoTipo = 'dia' | 'semana' | 'mes'
export type Prazo = { tipo: PrazoTipo; /** `aaaa-mm-dd`, último dia do período. */ fim: string }
export type Situacao = 'atrasado' | 'perto' | 'ok'
export type Semana = { n: number; ini: number; fim: number }

const PRAZO_TIPO: Record<PrazoTipo, number> = { dia: 100000000, semana: 100000001, mes: 100000002 }
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Dias antes do fim em que o prazo fica "perto" (âmbar). */
const PERTO: Record<PrazoTipo, number> = { mes: 7, semana: 3, dia: 2 }
const DIA = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDe = (ano: number, mes0: number, dia: number) => `${ano}-${pad(mes0 + 1)}-${pad(dia)}`
const partes = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const utc = (iso: string) => { const [a, m, d] = partes(iso); return Date.UTC(a, m - 1, d) }
export const diasNoMes = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
/** 0 = segunda … 6 = domingo. */
export const diaDaSemana = (ano: number, mes0: number, dia: number) => (new Date(Date.UTC(ano, mes0, dia)).getUTCDay() + 6) % 7

/** Hoje em America/Sao_Paulo, `aaaa-mm-dd`. */
export const hojeIso = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)

export function semanasDoMes(ano: number, mes0: number): Semana[] {
  const total = diasNoMes(ano, mes0)
  const semanas: Semana[] = []
  for (let ini = 1; ini <= total;) {
    const fim = Math.min(total, ini + 6 - diaDaSemana(ano, mes0, ini))
    semanas.push({ n: semanas.length + 1, ini, fim })
    ini = fim + 1
  }
  return semanas
}

export const prazoDia = (iso: string): Prazo => ({ tipo: 'dia', fim: iso })
export const prazoMes = (ano: number, mes0: number): Prazo => ({ tipo: 'mes', fim: isoDe(ano, mes0, diasNoMes(ano, mes0)) })
export function prazoSemana(ano: number, mes0: number, n: number): Prazo {
  const s = semanasDoMes(ano, mes0)[n - 1]
  if (!s) throw new Error(`Semana ${n} não existe em ${MESES[mes0]}/${ano}.`)
  return { tipo: 'semana', fim: isoDe(ano, mes0, s.fim) }
}

/** Semana do mês que termina no fim do prazo (só para prazo de semana). */
function semanaDoPrazo(p: Prazo): Semana | null {
  const [a, m, d] = partes(p.fim)
  return semanasDoMes(a, m - 1).find((s) => d >= s.ini && d <= s.fim) ?? null
}

/** "dez/2026", "Sem 2 de dez · 7–13" ou "12/12" (com o ano quando não é o de hoje). */
export function rotuloPrazo(p: Prazo, hoje = hojeIso()): string {
  const [a, m, d] = partes(p.fim)
  if (p.tipo === 'mes') return `${MESES[m - 1]}/${a}`
  if (p.tipo === 'semana') {
    const s = semanaDoPrazo(p)
    const ano = a === partes(hoje)[0] ? '' : `/${a}`
    return s ? `Sem ${s.n} de ${MESES[m - 1]}${ano} · ${s.ini}–${s.fim}` : `${pad(d)}/${pad(m)}`
  }
  return a === partes(hoje)[0] ? `${pad(d)}/${pad(m)}` : `${pad(d)}/${pad(m)}/${a}`
}

const diasAte = (p: Prazo, hoje = hojeIso()) => Math.round((utc(p.fim) - utc(hoje)) / DIA)

export function situacaoPrazo(p: Prazo, hoje = hojeIso()): Situacao {
  const dias = diasAte(p, hoje)
  if (dias < 0) return 'atrasado'
  return dias <= PERTO[p.tipo] ? 'perto' : 'ok'
}

/** "faltam 5 d", "falta 1 d", "vence hoje" ou "atrasado 3 d". */
export function faltaPrazo(p: Prazo, hoje = hojeIso()): string {
  const dias = diasAte(p, hoje)
  if (dias === 0) return 'vence hoje'
  if (dias < 0) return `atrasado ${-dias} d`
  return dias === 1 ? 'falta 1 d' : `faltam ${dias} d`
}

/** Colunas do Dataverse → prazo. Data sem tipo vale como dia; sem data = sem prazo. */
export function lerPrazo(data: unknown, tipo: unknown): Prazo | null {
  const fim = typeof data === 'string' ? data.slice(0, 10) : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return null
  const achado = (Object.keys(PRAZO_TIPO) as PrazoTipo[]).find((k) => PRAZO_TIPO[k] === Number(tipo))
  return { tipo: achado ?? 'dia', fim }
}

export const gravarPrazo = (p: Prazo | null) => ({ cr40f_prazo: p?.fim ?? null, cr40f_prazotipo: p ? PRAZO_TIPO[p.tipo] : null })

export const mesmoPrazo = (a: Prazo | null, b: Prazo | null) => a?.tipo === b?.tipo && a?.fim === b?.fim

/** Ordem do quadro: prazo mais cedo primeiro; sem prazo por último. */
export function compararPrazo(a: Prazo | null, b: Prazo | null): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0
  return a.fim < b.fim ? -1 : a.fim > b.fim ? 1 : 0
}
