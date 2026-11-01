import { strFromU8, unzipSync } from 'fflate'
import { parseCsv } from './parse'

/** Arquivo lido como tabela: a primeira linha é o cabeçalho; as demais têm o mesmo número de colunas. */
export type Tabela = { cabecalho: string[]; linhas: string[][] }

export const ACEITA = '.csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const TAMANHO_MAX = 10 * 1024 * 1024

/** CSV (UTF-8 ou Windows-1252) ou XLSX (primeira planilha). Sem cabeçalho ou sem linhas → erro com mensagem para a tela. */
export async function lerArquivo(file: File): Promise<Tabela> {
  const bytes = new Uint8Array(await lerBytes(file))
  const grade = /\.xlsx$/i.test(file.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b) ? lerXlsx(bytes) : parseCsv(decodificar(bytes))
  return paraTabela(grade)
}

export function paraTabela(grade: (string | number)[][]): Tabela {
  const texto = grade.map((l) => l.map((c) => (typeof c === 'number' ? String(c) : c)))
  const primeira = texto.findIndex((l) => l.filter((c) => c.trim()).length >= 2)
  if (primeira < 0) throw new Error('O arquivo não tem uma linha de cabeçalho com pelo menos duas colunas.')
  const cabecalho = texto[primeira].map((c, i) => c.trim() || `Coluna ${i + 1}`)
  const linhas = texto.slice(primeira + 1).filter((l) => l.some((c) => c.trim())).map((l) => cabecalho.map((_, i) => l[i] ?? ''))
  if (!linhas.length) throw new Error('O arquivo só tem o cabeçalho.')
  return { cabecalho, linhas }
}

/** FileReader: o jsdom dos testes não tem `File.arrayBuffer`. */
const lerBytes = (file: Blob) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as ArrayBuffer)
  reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo.'))
  reader.readAsArrayBuffer(file)
})

/** UTF-8 por padrão; extrato antigo exportado do Windows (acentos quebrados) cai para Windows-1252. */
function decodificar(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

const colunaIndice = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1 }

/**
 * XLSX mínimo: primeira planilha do workbook, textos compartilhados e inline, números como texto (datas sem formato
 * chegam como número de série e `parseData` resolve). Fórmulas entram pelo valor calculado salvo no arquivo.
 */
export function lerXlsx(bytes: Uint8Array): string[][] {
  const zip = unzipSync(bytes)
  const xml = (path: string) => { const f = zip[path]; return f ? new DOMParser().parseFromString(strFromU8(f), 'application/xml') : null }
  const textos = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
  const planilha = xml(primeiraPlanilha(zip))
  if (!planilha) throw new Error('Planilha não encontrada no arquivo XLSX.')
  const linhas: string[][] = []
  for (const row of planilha.getElementsByTagName('row')) {
    const linha: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') ?? ''
      const i = ref ? colunaIndice(ref) : linha.length
      const tipo = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let valor = v
      if (tipo === 's') valor = textos[Number(v)] ?? ''
      else if (tipo === 'inlineStr') valor = [...c.getElementsByTagName('t')].map((t) => t.textContent ?? '').join('')
      else if (tipo === 'b') valor = v === '1' ? 'Sim' : 'Não'
      while (linha.length < i) linha.push('')
      linha[i] = valor
    }
    linhas.push(linha)
  }
  return linhas
}

/** Caminho da primeira aba pela ordem do workbook (rels); sem rels, `sheet1.xml`. */
function primeiraPlanilha(zip: Record<string, Uint8Array>) {
  const workbook = zip['xl/workbook.xml'] && new DOMParser().parseFromString(strFromU8(zip['xl/workbook.xml']), 'application/xml')
  const rels = zip['xl/_rels/workbook.xml.rels'] && new DOMParser().parseFromString(strFromU8(zip['xl/_rels/workbook.xml.rels']), 'application/xml')
  const primeira = workbook?.getElementsByTagName('sheet')[0]
  const rid = primeira?.getAttribute('r:id') ?? primeira?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
  const alvo = rid ? [...(rels?.getElementsByTagName('Relationship') ?? [])].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target') : null
  if (!alvo) return 'xl/worksheets/sheet1.xml'
  return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`
}
