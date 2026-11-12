import { moneyFields, type Composition } from './compositions'
import { viewValueKey, type CatalogField, type ViewDefinition } from './views'

const moneyIds = new Set<string>(moneyFields.map(({ key }) => key))
const encoder = new TextEncoder()
const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
const columnName = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : `${columnName(Math.floor(index / 26) - 1)}${columnName(index % 26)}`

/**
 * Linhas da página ainda não carregadas (registra os ids em `seen`).
 * null quando a página não trouxe linha nova e não é a última (só linhas já vistas, ou vazia com próxima página):
 * o Dataverse repetiu a página e paginar mais entraria em loop.
 */
export function freshPageRecords(seen: Set<string>, page: { records: Composition[]; nextLink: string | null }) {
  const fresh: Composition[] = []
  for (const record of page.records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    fresh.push(record)
  }
  return !fresh.length && (page.records.length || page.nextLink) ? null : fresh
}

export async function collectCompositionPages(load: (link?: string) => Promise<{ records: Composition[]; nextLink: string | null }>) {
  const records: Composition[] = []
  const seen = new Set<string>()
  let link: string | null = null
  do {
    const page = await load(link ?? undefined)
    const fresh = freshPageRecords(seen, page)
    if (!fresh) throw new Error('O Dataverse devolveu de novo linhas que já tinham vindo. A extração foi interrompida para não gerar uma planilha incompleta; tente novamente.')
    records.push(...fresh)
    link = page.nextLink
  } while (link)
  return records
}

function departureDate(value: string) {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function crc32(bytes: Uint8Array) {
  let crc = -1
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ -1) >>> 0
}

function zip(files: Record<string, string>) {
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  const write16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true)
  const write32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true)
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name)
    const bytes = encoder.encode(content)
    const crc = crc32(bytes)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x800)
    write32(localView, 14, crc); write32(localView, 18, bytes.length); write32(localView, 22, bytes.length)
    write16(localView, 26, nameBytes.length); local.set(nameBytes, 30)
    parts.push(local, bytes)
    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20)
    write16(centralView, 8, 0x800); write32(centralView, 16, crc)
    write32(centralView, 20, bytes.length); write32(centralView, 24, bytes.length)
    write16(centralView, 28, nameBytes.length); write32(centralView, 42, offset)
    central.set(nameBytes, 46)
    directory.push(central)
    offset += local.length + bytes.length
  }
  const directoryLength = directory.reduce((size, part) => size + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  write32(endView, 0, 0x06054b50); write16(endView, 8, directory.length); write16(endView, 10, directory.length)
  write32(endView, 12, directoryLength); write32(endView, 16, offset)
  const output = new Uint8Array(offset + directoryLength + end.length)
  let position = 0
  for (const part of [...parts, ...directory, end]) { output.set(part, position); position += part.length }
  return new Blob([output.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function cell(address: string, value: unknown, style: number, numeric = false) {
  if (numeric && Number.isFinite(Number(value))) return `<c r="${address}" s="${style}"><v>${Number(value)}</v></c>`
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}

export function compositionWorkbook(rows: Composition[], definition: ViewDefinition, catalog: CatalogField[], viewName: string) {
  const columns = definition.columns.map(({ id }) => ({ id, label: catalog.find((field) => field.id === id)?.label ?? moneyFields.find((field) => field.key === id)?.label ?? ({ client: 'Cliente', route: 'Trajeto', date: 'Data de saída' } as Record<string, string>)[id] ?? id }))
  if (!columns.length) throw new Error('A view não possui colunas para exportar.')
  const lastColumn = columnName(columns.length - 1)
  const widths = columns.map(({ id, label }, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(48, Math.max(16, id === 'client' || id === 'route' ? 32 : label.length + 5))}" customWidth="1"/>`).join('')
  const sheetRows = [
    `<row r="1" ht="35" customHeight="1">${cell('A1', 'COMPOSIÇÃO DE PREÇOS', 1)}</row>`,
    `<row r="2" ht="27" customHeight="1">${cell('A2', `${viewName}  •  ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}  •  ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`, 2)}</row>`,
    `<row r="3" ht="10" customHeight="1"/>`,
    `<row r="4" ht="28" customHeight="1">${columns.map(({ label }, index) => cell(`${columnName(index)}4`, label, 3)).join('')}</row>`,
  ]
  rows.forEach((row, index) => {
    const rowNumber = index + 5
    const alternate = index % 2 === 1
    const cells = columns.map(({ id }, col) => {
      const address = `${columnName(col)}${rowNumber}`
      if (moneyIds.has(id)) return cell(address, row.values[id as keyof typeof row.values], alternate ? 6 : 5, true)
      const value = id === 'client' ? row.client : id === 'route' ? row.route : id === 'date' ? departureDate(row.departureAt) : (() => {
        const key = viewValueKey(id, definition, catalog)
        return row.viewFields?.[`${key}@OData.Community.Display.V1.FormattedValue`] ?? row.viewFields?.[key]
      })()
      return cell(address, value, alternate ? 4 : 0)
    }).join('')
    sheetRows.push(`<row r="${rowNumber}" ht="22" customHeight="1">${cells}</row>`)
  })
  const lastRow = Math.max(4, rows.length + 4)
  const merges = columns.length > 1 ? `<mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>` : ''
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths}</cols><sheetData>${sheetRows.join('')}</sheetData><autoFilter ref="A4:${lastColumn}${lastRow}"/>${merges}</worksheet>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red](&quot;R$&quot; #,##0.00)"/></numFmts><fonts count="3"><font><sz val="11"/><color rgb="FF253548"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173453"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24527C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FA"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="4" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  return zip({ '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>', '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>', 'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Composições" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>', 'xl/styles.xml': styles, 'xl/worksheets/sheet1.xml': sheet })
}
