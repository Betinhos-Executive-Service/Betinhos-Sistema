// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { lerArquivo, lerXlsx, paraTabela } from './arquivo'

const xlsx = (sheet: string, shared: string[] = []) => zipSync({
  'xl/workbook.xml': strToU8('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extrato" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet7.xml"/></Relationships>'),
  'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`),
  'xl/worksheets/sheet7.xml': strToU8(sheet),
})

describe('arquivo', () => {
  it('lê CSV em UTF-8 com BOM e Windows-1252', async () => {
    const t = await lerArquivo(new File(['﻿Data;Placa\n01/10/2026;ABC1D23\n'], 'ctf.csv', { type: 'text/csv' }))
    expect(t).toEqual({ cabecalho: ['Data', 'Placa'], linhas: [['01/10/2026', 'ABC1D23']] })
    const latin = new Uint8Array([0x50, 0x6f, 0x73, 0x74, 0x6f, 0x3b, 0x56, 0x65, 0xed, 0x63, 0x75, 0x6c, 0x6f, 0x0a, 0x41, 0x3b, 0x42, 0x0a]) // "Posto;Veículo\nA;B\n" em 1252
    expect((await lerArquivo(new File([latin], 'ticket.csv'))).cabecalho).toEqual(['Posto', 'Veículo'])
  })
  it('lê a primeira aba do XLSX com textos compartilhados, inline e números', async () => {
    const sheet = '<worksheet><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Litros</t></is></c></row>'
      + '<row r="2"><c r="A2"><v>46296</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>45.5</v></c></row>'
      + '</sheetData></worksheet>'
    const bytes = xlsx(sheet, ['Data', 'Placa', 'ABC1D23'])
    expect(lerXlsx(bytes)).toEqual([['Data', 'Placa', 'Litros'], ['46296', 'ABC1D23', '45.5']])
    const t = await lerArquivo(new File([bytes], 'extrato.xlsx'))
    expect(t.linhas).toEqual([['46296', 'ABC1D23', '45.5']])
  })
  it('pula linhas de título antes do cabeçalho e recusa arquivo sem dados', () => {
    expect(paraTabela([['Extrato CTF'], [], ['Data', 'Placa', ''], ['01/10/2026', 'X'], ['', '']])).toEqual({ cabecalho: ['Data', 'Placa', 'Coluna 3'], linhas: [['01/10/2026', 'X', '']] })
    expect(() => paraTabela([['Data', 'Placa']])).toThrow('só tem o cabeçalho')
    expect(() => paraTabela([['x']])).toThrow('cabeçalho')
  })
})
