import { situacaoLabel, valorFechamento } from './regras'
import type { Linha } from './types'

// Layout PROVISÓRIO até chegar o modelo da Juliana: uma linha por serviço e o total no fim.
// Planilha XML do Excel (SpreadsheetML 2003): abre direto no Excel, sem biblioteca no bundle.

const COLUNAS = ['Serviço', 'Pedido Tenaris', 'Data', 'CR', 'Trajeto', 'Situação', 'Valor (R$)'] as const

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const texto = (v: string) => `<Cell><Data ss:Type="String">${xml(v)}</Data></Cell>`
const numero = (v: number) => `<Cell ss:StyleID="brl"><Data ss:Type="Number">${v.toFixed(2)}</Data></Cell>`
const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '')

export function planilhaFechamento(linhas: Linha[], titulo: string): string {
  const total = linhas.reduce((s, l) => s + valorFechamento(l), 0)
  const corpo = linhas.map((l) => `<Row>${[l.codigo, l.pedido, dataBR(l.data), l.cr, l.trajeto, situacaoLabel(l.situacao)].map(texto).join('')}${numero(valorFechamento(l))}</Row>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style><Style ss:ID="brl"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>',
    `<Worksheet ss:Name="${xml(titulo.slice(0, 31))}"><Table>`,
    `<Row ss:StyleID="h">${COLUNAS.map(texto).join('')}</Row>`,
    ...corpo,
    `<Row ss:StyleID="h">${texto('Total')}${texto('')}${texto('')}${texto('')}${texto('')}${texto(`${linhas.length} serviços`)}${numero(total)}</Row>`,
    '</Table></Worksheet></Workbook>',
  ].join('\n')
}

/** `fechamento-tenaris-2026-10.xls`. */
export const nomeArquivo = (cliente: string, mes: string) =>
  `fechamento-${cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${mes}.xls`

export function baixarPlanilha(conteudo: string, nome: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/vnd.ms-excel;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
