import { describe, expect, it } from 'vitest'
import { collectCompositionPages, compositionWorkbook } from './composition-export'
import { initialCompositions } from './compositions'
import type { CatalogField, ViewDefinition } from './views'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ViewFieldCell } from '../components/ViewFieldCell'
import { readViewField } from './view-field-read'

async function entries(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const result: Record<string, string> = {}
  let at = 0
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength))
    const start = at + 30 + nameLength
    result[name] = new TextDecoder().decode(bytes.slice(start, start + size))
    at = start + size
  }
  return result
}

describe('compositionWorkbook', () => {
  it('busca todas as páginas além das primeiras 100 linhas', async () => {
    const rows = Array.from({ length: 123 }, (_, index) => ({ ...initialCompositions[0], id: String(index) }))
    const links: (string | undefined)[] = []
    const loaded = await collectCompositionPages(async (link) => {
      links.push(link)
      return link ? { records: rows.slice(100), nextLink: null } : { records: rows.slice(0, 100), nextLink: '?page=2' }
    })
    expect(links).toEqual([undefined, '?page=2'])
    expect(loaded).toHaveLength(123)
  })

  it('interrompe a exportação com erro claro quando o Dataverse devolve de novo as mesmas linhas', async () => {
    let page = 1
    const load = async () => ({ records: [initialCompositions[0]], nextLink: `?page=${++page}` })
    await expect(collectCompositionPages(load)).rejects.toThrow('A extração foi interrompida para não gerar uma planilha incompleta')
    expect(page).toBe(3)
  })

  it('interrompe a exportação quando o Dataverse devolve página vazia apontando para outra página', async () => {
    let calls = 0
    const load = async (link?: string) => (++calls, link ? { records: [], nextLink: '?page=2' } : { records: [initialCompositions[0]], nextLink: '?page=2' })
    await expect(collectCompositionPages(load)).rejects.toThrow('A extração foi interrompida')
    expect(calls).toBe(2)
  })

  it('aceita a última página vazia (total múltiplo do tamanho da página)', async () => {
    const loaded = await collectCompositionPages(async (link) => link ? { records: [], nextLink: null } : { records: [initialCompositions[0]], nextLink: '?page=2' })
    expect(loaded).toHaveLength(1)
  })

  it('não duplica linhas que reaparecem em outra página', async () => {
    const [first, second, third] = initialCompositions
    const loaded = await collectCompositionPages(async (link) => link
      ? { records: [second, third], nextLink: null }
      : { records: [first, second], nextLink: '?page=2' })
    expect(loaded.map((row) => row.id)).toEqual([first.id, second.id, third.id])
  })

  it('gera XLSX com colunas da view, filtro, congelamento e valores monetários numéricos', async () => {
    const definition: ViewDefinition = { columns: [{ id: 'client', width: 120, pinned: true }, { id: 'new_valortotal', width: 120, pinned: false }], filters: [], sort: [] }
    const row = { ...initialCompositions[0], client: '=HYPERLINK("https://example.com")', values: { ...initialCompositions[0].values, new_valortotal: '123.45' } }
    const workbook = compositionWorkbook([row], definition, [], 'Minha view')
    expect(workbook.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const files = await entries(workbook)
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml')
    expect(files['xl/worksheets/sheet1.xml']).toContain('autoFilter ref="A4:B5"')
    expect(files['xl/worksheets/sheet1.xml'].indexOf('<autoFilter')).toBeLessThan(files['xl/worksheets/sheet1.xml'].indexOf('<mergeCells'))
    expect(files['xl/worksheets/sheet1.xml']).toContain('ySplit="4"')
    expect(files['xl/worksheets/sheet1.xml']).toContain('Minha view  •  1 registro')
    expect(files['xl/worksheets/sheet1.xml']).toContain('=HYPERLINK(&quot;https://example.com&quot;)')
    expect(files['xl/worksheets/sheet1.xml']).toContain('<c r="B5" s="5"><v>123.45</v></c>')
    expect(files['xl/styles.xml']).toContain('R$')
    expect(files['xl/styles.xml']).toContain('<cellStyles count="1">')
  })

  it('lookup direto, escolha e booleano da composição saem no Excel com o mesmo texto da grade', async () => {
    const F = '@OData.Community.Display.V1.FormattedValue'
    const base = { table: 'cr40f_composicaodeprecos', path: [], available: true }
    const catalog: CatalogField[] = [
      { ...base, id: 'cr40f_servicorelacionadogeral', attribute: 'cr40f_servicorelacionadogeral', label: 'Serviço Relacionado (Geral)', type: 'Lookup' },
      { ...base, id: 'new_status', attribute: 'new_status', label: 'Status', type: 'Picklist' },
      { ...base, id: 'cr40f_faturado', attribute: 'cr40f_faturado', label: 'Faturado', type: 'Boolean' },
    ]
    const definition: ViewDefinition = { columns: catalog.map(({ id }) => ({ id, width: 120, pinned: false })), filters: [], sort: [] }
    // Forma devolvida pelo FetchXML da "Visualização Padrão 2" no DEV: o lookup só vem como `_<atributo>_value`.
    const viewFields = {
      _cr40f_servicorelacionadogeral_value: 'a49df940-ef76-f111-ab0e-00224838156e',
      [`_cr40f_servicorelacionadogeral_value${F}`]: 'OS-1716',
      '_cr40f_servicorelacionadogeral_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'cr40f_reservadeveculos',
      new_status: 100000000, [`new_status${F}`]: 'Aprovada',
      cr40f_faturado: false,
    }
    const sheet = (await entries(compositionWorkbook([{ ...initialCompositions[0], viewFields }], definition, catalog, 'Visualização Padrão 2')))['xl/worksheets/sheet1.xml']
    const excel = ['A5', 'B5', 'C5'].map((address) => /<t xml:space="preserve">([^<]*)<\/t>/.exec(sheet.slice(sheet.indexOf(`r="${address}"`)))?.[1])
    const grid = catalog.map((field) => {
      const { value, formatted } = readViewField(viewFields, field.attribute)
      return renderToStaticMarkup(createElement('span', null, ViewFieldCell({ field, value, formatted, viewFields, valueKey: field.attribute, baseRecordId: 'x' }))).replace(/<[^>]+>/g, '')
    })
    expect(excel).toEqual(['OS-1716', 'Aprovada', 'Não'])
    expect(grid).toEqual(excel)
    expect(sheet).not.toContain('a49df940')
  })
})
