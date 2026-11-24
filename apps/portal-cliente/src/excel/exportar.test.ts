import { describe, expect, it } from 'vitest'
import { gerarPedidos, gerarServicos } from '../api/mockDados'
import { CABECALHO, linhasExcel, linhasExcelPedidos } from './exportar'

describe('linhasExcel', () => {
  it('gera cabeçalho e uma linha por serviço, com valor numérico e data em pt-BR', () => {
    const servicos = gerarServicos(new Date('2026-10-28T13:00:00Z')).slice(0, 3)
    const linhas = linhasExcel(servicos)
    expect(linhas[0]).toEqual(CABECALHO)
    expect(linhas).toHaveLength(4)
    expect(linhas[1][0]).toBe(servicos[0].numero)
    expect(linhas[1][8]).toBe(servicos[0].valorTotal)
    expect(String(linhas[1][3])).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})

describe('linhasExcelPedidos', () => {
  it('uma linha por pedido com situação, motorista e placa', () => {
    const pedidos = gerarPedidos(new Date('2026-11-23T13:00:00Z'))
    const linhas = linhasExcelPedidos(pedidos)
    expect(linhas).toHaveLength(pedidos.length + 1)
    expect(linhas[0]).toContain('Placa')
    const programado = pedidos.findIndex((p) => p.status === 'programado')
    expect(linhas[programado + 1]).toEqual(expect.arrayContaining(['Programado', pedidos[programado].motorista, pedidos[programado].placa]))
  })
})
