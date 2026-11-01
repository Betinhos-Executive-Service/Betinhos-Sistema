/** Leitura de texto dos extratos: CSV com `;`, `,` ou tab, números e datas pt-BR. */

/** Separador mais frequente na primeira linha com conteúdo (fora de aspas). */
export function detectarSeparador(texto: string): ';' | ',' | '\t' {
  const linha = texto.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const fora = linha.replace(/"[^"]*"/g, '')
  const conta = (c: string) => fora.split(c).length - 1
  const candidatos: [';' | ',' | '\t', number][] = [[';', conta(';')], ['\t', conta('\t')], [',', conta(',')]]
  return candidatos.sort((a, b) => b[1] - a[1])[0][0]
}

/** CSV em linhas e colunas; aspas duplas escapam o separador e quebras de linha (`""` = aspa literal). Linhas vazias saem. */
export function parseCsv(texto: string, separador = detectarSeparador(texto)): string[][] {
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === separador) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo); campo = ''
      if (linha.some((v) => v.trim())) linhas.push(linha.map((v) => v.trim()))
      linha = []
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((v) => v.trim())) linhas.push(linha.map((v) => v.trim()))
  return linhas
}

/**
 * Número pt-BR ("1.234,56", "R$ 45,90", "45,9 L") ou com ponto decimal ("45.90"). Só ponto em grupos de três
 * ("123.456") é milhar. Vazio ou sem dígitos → null.
 */
export function parseNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null
  const s = (texto ?? '').replace(/[^\d,.\-]/g, '')
  if (!/\d/.test(s)) return null
  let normal: string
  if (s.includes(',')) normal = s.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) normal = s.replace(/\./g, '')
  else normal = s
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

const DIA_EXCEL_ZERO = Date.UTC(1899, 11, 30)

/**
 * Data do extrato: "dd/mm/aaaa", "dd/mm/aa", "aaaa-mm-dd", com hora opcional ("HH:mm" ou "HH:mm:ss") na mesma
 * célula ou em `hora`. Número de série do Excel (planilha sem formato) também vale. Inválida → null.
 */
export function parseData(texto: string | number | null | undefined, hora = ''): Date | null {
  if (texto == null || texto === '') return null
  if (typeof texto === 'number') return numeroExcelParaData(texto, hora)
  const s = texto.trim()
  const serial = /^\d{5}(\.\d+)?$/.test(s) ? Number(s) : null
  if (serial != null) return numeroExcelParaData(serial, hora)
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s)
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s)
  let ano: number, mes: number, dia: number, hh = 0, mm = 0, ss = 0
  if (br) {
    dia = Number(br[1]); mes = Number(br[2]); ano = Number(br[3]); if (ano < 100) ano += 2000
    hh = Number(br[4] ?? 0); mm = Number(br[5] ?? 0); ss = Number(br[6] ?? 0)
  } else if (iso) {
    ano = Number(iso[1]); mes = Number(iso[2]); dia = Number(iso[3])
    hh = Number(iso[4] ?? 0); mm = Number(iso[5] ?? 0); ss = Number(iso[6] ?? 0)
  } else return null
  const h = lerHora(hora)
  if (h) [hh, mm, ss] = h
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hh > 23 || mm > 59) return null
  const d = new Date(ano, mes - 1, dia, hh, mm, ss)
  return d.getMonth() === mes - 1 && d.getDate() === dia ? d : null
}

function numeroExcelParaData(serial: number, hora: string) {
  if (serial < 20000 || serial > 80000) return null
  const utc = new Date(DIA_EXCEL_ZERO + Math.round(serial * 86400000))
  const d = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes())
  const h = lerHora(hora)
  if (h) d.setHours(h[0], h[1], 0, 0)
  return d
}

/** Hora do extrato: "HH:mm", "HH:mm:ss" ou fração de dia do Excel (0,4375 = 10:30; planilha sem formato de hora). */
function lerHora(texto: string): [number, number, number] | null {
  const s = texto.trim()
  const h = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s)
  if (h) return [Number(h[1]), Number(h[2]), Number(h[3] ?? 0)]
  if (/^0?[.,]\d+$/.test(s)) {
    const minutos = Math.round(Number(s.replace(',', '.')) * 1440) % 1440
    return [Math.floor(minutos / 60), minutos % 60, 0]
  }
  return null
}

/** Minúsculas, sem acento nem pontuação, espaços únicos: para casar cabeçalhos e nomes. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** Placa só com letras e números maiúsculos ("abc-1d23" → "ABC1D23"). */
export const normalizarPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
