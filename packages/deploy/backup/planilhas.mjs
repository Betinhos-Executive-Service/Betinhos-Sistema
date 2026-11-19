// Planilhas do time: um CSV por tabela (abre no Excel com dois cliques), a partir da pasta de exportar-dataverse.mjs.
// Lookups e choices saem pelo nome, datas em Brasília (dd/mm/aaaa HH:mm), números com vírgula; colunas sempre vazias e
// anotações da Web API ficam de fora. Os dados completos (ids, valores crus) continuam nos .ndjson.gz.
//
//   node planilhas.mjs <pasta-da-exportacao> <pasta-saida>
import { once } from 'node:events'
import { createReadStream, createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { createGunzip } from 'node:zlib'

const FORMATADO = '@OData.Community.Display.V1.FormattedValue'
const FUSO = 'America/Sao_Paulo'
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/
const CODIGOS = /^-?\d+(,-?\d+)*$/
const formatoData = (timeZone) => new Intl.DateTimeFormat('pt-BR', {
  timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const fmtData = formatoData(FUSO)
const fmtUtc = formatoData('UTC')

// _cr40f_cliente_value → cr40f_cliente (nome da coluna de lookup).
export const colunaDe = (chave) => /^_(.+)_value$/.exec(chave)?.[1] ?? chave

// Valor legível de uma coluna do registro (sem anotações). numerica (da metadata) = dinheiro ou número: sempre cru.
export function valorLegivel(registro, chave, semFuso = false, numerica = false) {
  const cru = registro[chave]
  const formatado = registro[`${chave}${FORMATADO}`]
  if (cru === null || cru === undefined) return ''
  // Lookup pelo nome; sem nome (a Web API não formata alguns, como owninguser) fica vazio: o GUID não diz nada ao time.
  if (chave !== colunaDe(chave)) return formatado ?? ''
  // Choice (inclusive múltipla) e sim/não: o rótulo. Dinheiro e número ficam crus (continuam somáveis).
  if (formatado !== undefined && !numerica) {
    const choice = Number.isInteger(cru) && !/^[\d.,\s-]+$/.test(formatado)
    const multipla = typeof cru === 'string' && CODIGOS.test(cru)
    if (typeof cru === 'boolean' || choice || multipla) return String(formatado)
  }
  if (typeof cru === 'number') return String(cru).replace('.', ',')
  if (typeof cru === 'string' && DATA_HORA.test(cru)) return (semFuso ? fmtUtc : fmtData).format(new Date(cru)).replace(',', '')
  const d = typeof cru === 'string' && SO_DATA.exec(cru)
  if (d) return `${d[3]}/${d[2]}/${d[1]}`
  return typeof cru === 'object' ? JSON.stringify(cru) : String(cru)
}

// Célula CSV com ;. Texto que o Excel leria como fórmula (=, +, -, @) ganha apóstrofo: o cadastro público grava texto livre.
export function celula(valor) {
  let v = String(valor)
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(,\d+)?$/.test(v)) v = `'${v}`
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export async function* registros(arquivo) {
  const linhas = createInterface({ input: createReadStream(arquivo).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const linha of linhas) if (linha) yield JSON.parse(linha)
}

// Nome de arquivo seguro no Windows: "Serviço (cr40f_servico).csv".
export const nomeArquivo = (nome, logico) => `${String(nome ?? logico).replace(/[\\/:*?"<>|]/g, '-').trim() || logico}${nome && nome !== logico ? ` (${logico})` : ''}.csv`

// A chave primária (GUID) fica fora da planilha; continua no .ndjson.gz.
export async function planilhaDaTabela(arquivoNdjson, arquivoCsv, { rotulos = {}, chavePrimaria, semFuso = [], numericas = [] } = {}) {
  const utc = new Set(semFuso)
  const num = new Set(numericas)
  const valor = (r, c) => valorLegivel(r, c, utc.has(c), num.has(c))
  // 1ª passada: colunas com algum valor.
  const colunas = []
  const vistas = new Set()
  for await (const r of registros(arquivoNdjson)) {
    for (const chave of Object.keys(r)) {
      if (chave.includes('@') || chave === chavePrimaria || vistas.has(chave) || valor(r, chave) === '') continue
      vistas.add(chave)
      colunas.push(chave)
    }
  }
  if (!colunas.length) return 0
  // Ordem alfabética do cabeçalho: a Web API devolve as colunas sem ordem útil.
  const titulo = (c) => rotulos[colunaDe(c)] ?? colunaDe(c)
  colunas.sort((x, y) => titulo(x).localeCompare(titulo(y), 'pt-BR'))
  const saida = createWriteStream(arquivoCsv)
  const escrever = async (texto) => { if (!saida.write(texto)) await once(saida, 'drain') }
  await escrever(`﻿${colunas.map((c) => celula(titulo(c))).join(';')}\r\n`)
  let total = 0
  for await (const r of registros(arquivoNdjson)) {
    await escrever(`${colunas.map((c) => celula(valor(r, c))).join(';')}\r\n`)
    total++
  }
  saida.end()
  await once(saida, 'close')
  return total
}

async function principal(pasta, destino) {
  if (!pasta || !destino) {
    console.error('uso: node planilhas.mjs <pasta-da-exportacao> <pasta-saida>')
    process.exit(2)
  }
  const manifesto = JSON.parse(readFileSync(join(pasta, 'manifesto.json'), 'utf8'))
  mkdirSync(destino, { recursive: true })
  let feitas = 0
  for (const t of manifesto.tabelas) {
    if (!t.registros) continue
    try {
      await planilhaDaTabela(join(pasta, 'tabelas', `${t.tabela}.ndjson.gz`), join(destino, nomeArquivo(t.nome, t.tabela)), { rotulos: t.colunas, chavePrimaria: t.chave ?? `${t.tabela}id`, semFuso: t.semFuso, numericas: t.numericas })
      feitas++
    } catch (erro) {
      // A planilha é conveniência: falhar numa não impede o backup (o .ndjson.gz continua no pacote).
      console.log(`::warning::planilha de ${t.tabela} falhou (${String(erro.message ?? erro).slice(0, 200)})`)
    }
  }
  console.log(`Planilhas: ${feitas}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await principal(process.argv[2], process.argv[3])
}
