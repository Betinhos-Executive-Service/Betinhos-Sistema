import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { gerarXlsx } from './xlsx'

describe('gerarXlsx', () => {
  const xml = (arq: Uint8Array, nome: string) => strFromU8(unzipSync(arq)[nome])
  const p = { aba: 'Descontos', colunas: [{ titulo: 'Colaborador' }, { titulo: 'Valor' }], linhas: [['Ana & Cia <fictício>', { valor: 33.33, formato: 'moeda' as const }], [{ valor: 'Total', negrito: true as const }, { valor: 1234.5, formato: 'moeda' as const }]] }

  it('tem as partes mínimas de um xlsx', () => {
    const arq = unzipSync(gerarXlsx(p))
    expect(Object.keys(arq).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml'].sort())
  })
  it('valor é número com estilo de moeda, não texto', () => {
    const s = xml(gerarXlsx(p), 'xl/worksheets/sheet1.xml')
    expect(s).toContain('<c r="B2" s="1"><v>33.33</v></c>')
    expect(xml(gerarXlsx(p), 'xl/styles.xml')).toContain('formatCode="&quot;R$&quot; #,##0.00"')
  })
  it('texto inline escapado e cabeçalho em negrito', () => {
    const s = xml(gerarXlsx(p), 'xl/worksheets/sheet1.xml')
    expect(s).toContain('<c r="A1" t="inlineStr" s="2"><is><t>Colaborador</t></is></c>')
    expect(s).toContain('Ana &amp; Cia &lt;fictício&gt;')
    expect(s).toContain('<c r="A3" t="inlineStr" s="2">')
  })
  it('nome da aba vai no workbook', () => {
    expect(xml(gerarXlsx(p), 'xl/workbook.xml')).toContain('<sheet name="Descontos" sheetId="1" r:id="rId1"/>')
  })
})
