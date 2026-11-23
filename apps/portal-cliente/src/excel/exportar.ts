import { dataHora } from '../domain/formato'
import { DIAS_TACITA, statusInfo } from '../domain/regras'
import { statusPedidoInfo } from '../domain/pedidos'
import type { Pedido, Servico } from '../domain/types'

// Layout provisório: será trocado pelo modelo do Excel mensal que o financeiro envia à Tenaris.
const COLUNAS: Coluna[] = [
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

type Coluna = { titulo: string; largura: number; moeda?: boolean }

const COLUNAS_PEDIDOS: Coluna[] = [
  { titulo: 'Código', largura: 12 }, { titulo: 'Saída', largura: 17 }, { titulo: 'Origem', largura: 36 }, { titulo: 'Destino', largura: 36 },
  { titulo: 'Passageiros', largura: 30 }, { titulo: 'Situação', largura: 14 }, { titulo: 'Motorista', largura: 24 }, { titulo: 'Placa', largura: 10 },
  { titulo: 'Veículo', largura: 18 }, { titulo: 'Observação', largura: 40 }, { titulo: 'Pedido em', largura: 17 },
]

export function linhasExcelPedidos(pedidos: Pedido[]): (string | number)[][] {
  return [
    COLUNAS_PEDIDOS.map((c) => c.titulo),
    ...pedidos.map((p) => [
      p.numero, p.saida ? dataHora(p.saida) : '', p.origem, p.destino, p.passageiros.join(', '), statusPedidoInfo(p.status).rotulo,
      p.motorista ?? '', p.placa ?? '', p.veiculo ?? '', p.observacao ?? '', p.criadoEm ? dataHora(p.criadoEm) : '',
    ]),
  ]
}

/** Gera o .xlsx no navegador e baixa. O exceljs só é carregado aqui, no clique. */
async function baixarXlsx(linhas: (string | number)[][], colunas: Coluna[], nomeAba: string, nomeArquivo: string): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const livro = new ExcelJS.Workbook()
  const aba = livro.addWorksheet(nomeAba)
  aba.addRows(linhas)
  aba.getRow(1).font = { bold: true }
  colunas.forEach((c, i) => {
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

export const exportarExcel = (servicos: Servico[], nomeArquivo: string) => baixarXlsx(linhasExcel(servicos), COLUNAS, 'Serviços', nomeArquivo)
export const exportarPedidos = (pedidos: Pedido[], nomeArquivo: string) => baixarXlsx(linhasExcelPedidos(pedidos), COLUNAS_PEDIDOS, 'Pedidos', nomeArquivo)
