import { describe, expect, it } from 'vitest'
import { gerarServicos } from '../api/mockDados'
import { CABECALHO, linhasExcel } from './exportar'

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
