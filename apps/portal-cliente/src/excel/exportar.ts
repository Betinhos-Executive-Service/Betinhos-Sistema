import { dataHora } from '../domain/formato'
import { DIAS_TACITA, statusInfo } from '../domain/regras'
import type { Servico } from '../domain/types'

// Layout provisório: será trocado pelo modelo do Excel mensal que o financeiro envia à Tenaris.
const COLUNAS = [
  { titulo: 'Nº serviço', largura: 12 }, { titulo: 'Pedido Tenaris', largura: 16 }, { titulo: 'CR', largura: 26 },
  { titulo: 'Data', largura: 17 }, { titulo: 'Origem', largura: 36 }, { titulo: 'Destino', largura: 36 },
  { titulo: 'Passageiros', largura: 30 }, { titulo: 'Status', largura: 22 }, { titulo: 'Valor (R$)', largura: 12, moeda: true },
  { titulo: 'Aprovado por', largura: 22 }, { titulo: 'Aprovado em', largura: 17 },
]
export const CABECALHO = COLUNAS.map((c) => c.titulo)

export function linhasExcel(servicos: Servico[]): (string | number)[][] {
  return [
    CABECALHO,
    ...servicos.map((s) => [
      s.numero, s.pedidoCliente, s.cr, dataHora(s.saida), s.origem, s.destino, s.passageiros.join(', '),
      statusInfo(s.status).rotulo, s.valorTotal, s.aprovadoPor ?? (s.status === 'aprovado_tacito' ? `Automática (${DIAS_TACITA} dias úteis)` : ''),
      s.aprovadoEm ? dataHora(s.aprovadoEm) : '',
    ]),
  ]
}

/** Gera o .xlsx no navegador e baixa. O exceljs só é carregado aqui, no clique. */
export async function exportarExcel(servicos: Servico[], nomeArquivo: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  const aba = livro.addWorksheet('Serviços')
  aba.addRows(linhasExcel(servicos))
  aba.getRow(1).font = { bold: true }
  COLUNAS.forEach((c, i) => {
    const coluna = aba.getColumn(i + 1)
    coluna.width = c.largura
    if (c.moeda) coluna.numFmt = '#,##0.00'
  })
  aba.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await livro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
