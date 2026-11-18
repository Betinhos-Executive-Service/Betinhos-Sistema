// apps/shell/src/lib/xlsx.ts
// Planilha .xlsx mínima gerada no navegador (uma aba, texto inline, número, moeda, negrito). Sem dependência além do fflate.
// O pagamento-fornecedores tem gerador próprio (lib/excel.js) acoplado aos serviços; este é o genérico do shell.
import { strToU8, zipSync } from 'fflate'

export type Celula = string | number | null | { valor: number; formato: 'moeda' } | { valor: string; negrito: true }
export type Planilha = { aba: string; colunas: { titulo: string; largura?: number }[]; linhas: Celula[][] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const coluna = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : coluna(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))
// Estilos: 0 padrão, 1 moeda, 2 negrito.
const ESTILO = { moeda: 1, negrito: 2 } as const

function celula(c: Celula, ref: string): string {
  if (c === null || c === '') return ''
  if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
  if (typeof c === 'string') return `<c r="${ref}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`
  if ('formato' in c) return `<c r="${ref}" s="${ESTILO.moeda}"><v>${c.valor}</v></c>`
  return `<c r="${ref}" t="inlineStr" s="${ESTILO.negrito}"><is><t>${esc(c.valor)}</t></is></c>`
}

export function gerarXlsx(p: Planilha): Uint8Array {
  const todas: Celula[][] = [p.colunas.map((c) => ({ valor: c.titulo, negrito: true as const })), ...p.linhas]
  const rows = todas.map((linha, r) => `<row r="${r + 1}">${linha.map((c, i) => celula(c, `${coluna(i)}${r + 1}`)).join('')}</row>`).join('')
  const cols = p.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 16}" customWidth="1"/>`).join('')
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook ${ns} xmlns:r="${rel}"><sheets><sheet name="${esc(p.aba.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet ${ns}><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet ${ns}><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`),
  })
}

export function baixarXlsx(nome: string, p: Planilha) {
  const url = URL.createObjectURL(new Blob([gerarXlsx(p) as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
