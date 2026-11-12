import { describe, expect, it } from 'vitest'
import { collectCompositionPages, compositionWorkbook } from './composition-export'
import { initialCompositions } from './compositions'
import type { ViewDefinition } from './views'

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
})
