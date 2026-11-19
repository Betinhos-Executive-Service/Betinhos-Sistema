// Excel (.xlsx) mínimo sem dependência: o job do backup roda node puro, sem pnpm install. Cada aba é texto (inlineStr),
// com cabeçalho em negrito congelado, filtro e larguras fixas. O .xlsx é um zip de XML; o zip sai com deflate do zlib.
import { crc32, deflateRawSync } from 'node:zlib'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // Caracteres de controle (e U+FFFE/U+FFFF) quebram o XML (texto livre do cadastro pode trazer).
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
// O Excel aceita até 32.767 caracteres por célula; acima disso pede para reparar o arquivo.
const LIMITE_CELULA = 32_767

const coluna = (i) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

// Zip (sem senha) de [{ nome, dados: Buffer }].
export function zip(arquivos) {
  const locais = []
  const centrais = []
  let posicao = 0
  for (const { nome, dados } of arquivos) {
    const n = Buffer.from(nome)
    const comprimido = deflateRawSync(dados)
    const crc = crc32(dados)
    const cabecalho = (assinatura, extra) => {
      const b = Buffer.alloc(extra ? 46 : 30)
      let o = 0
      b.writeUInt32LE(assinatura, o); o += 4
      if (extra) { b.writeUInt16LE(20, o); o += 2 }
      b.writeUInt16LE(20, o); b.writeUInt16LE(0x0800, o + 2); b.writeUInt16LE(8, o + 4); b.writeUInt32LE(0x00210000, o + 6); o += 10
      b.writeUInt32LE(crc, o); b.writeUInt32LE(comprimido.length, o + 4); b.writeUInt32LE(dados.length, o + 8); o += 12
      b.writeUInt16LE(n.length, o); o += 4
      if (extra) b.writeUInt32LE(posicao, o + 10)
      return b
    }
    centrais.push(cabecalho(0x02014b50, true), n)
    locais.push(cabecalho(0x04034b50, false), n, comprimido)
    posicao += 30 + n.length + comprimido.length
  }
  const central = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(central.length, 12); fim.writeUInt32LE(posicao, 16)
  return Buffer.concat([...locais, central, fim])
}

function planilha({ colunas, linhas }) {
  const celula = (r, c, v, estilo) => `<c r="${coluna(c)}${r}" t="inlineStr"${estilo ? ` s="${estilo}"` : ''}><is><t xml:space="preserve">${esc(String(v ?? '').slice(0, LIMITE_CELULA))}</t></is></c>`
  const cabecalho = `<row r="1">${colunas.map((c, i) => celula(1, i, c.titulo, 1)).join('')}</row>`
  const corpo = linhas.map((l, j) => `<row r="${j + 2}">${l.map((v, i) => (v ? celula(j + 2, i, v) : '')).join('')}</row>`).join('')
  const ultima = `${coluna(colunas.length - 1)}${linhas.length + 1}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 18}" customWidth="1"/>`).join('')}</cols><sheetData>${cabecalho}${corpo}</sheetData><autoFilter ref="A1:${ultima}"/></worksheet>`
}

// abas: [{ nome, colunas: [{ titulo, largura }], linhas: [[texto]] }] → Buffer do .xlsx.
export function xlsx(abas) {
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const pkg = 'http://schemas.openxmlformats.org/package/2006'
  const arquivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${tipo}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${tipo}.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${tipo}.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}"><sheets>${abas.map((a, i) => `<sheet name="${esc(a.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${abas.map((a, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(a.nome.slice(0, 31))}'!$A$1:$${coluna(a.colunas.length - 1)}$${a.linhas.length + 1}</definedName>`).join('')}</definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${pkg}/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    // Estilo 0: texto com quebra de linha, alinhado ao topo. Estilo 1: cabeçalho em negrito com fundo.
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF001A3D"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, planilha(a)]),
  ]
  return zip(arquivos.map(([nome, texto]) => ({ nome, dados: Buffer.from(texto) })))
}
