import { describe, expect, it } from 'vitest'
import { keywordIndex, searchWords } from '../../../app/search'
import { linhaKeywordText } from './lista'
import type { Linha } from './types'

const linha = (patch: Partial<Linha> = {}): Linha => ({
  id: 'v1', validacaoId: 'v1', reservaId: 'r1', codigo: 'OS-100', data: '2026-10-05', trajeto: 'Aeroporto para Fábrica', cliente: { id: 'c1', nome: 'Cliente Exemplo' },
  cr: 'CR-77', pedido: 'PED-9', situacao: 'liberado', valorLiberado: 1234.5, valorAnterior: null, valorComposicao: 1234.5, composicao: [], observacao: 'Pedágio incluso',
  liberadoEm: '2026-10-06', prazoTacita: '2026-10-16', aprovadoEm: null, aprovadoPor: '', fechamento: 'pendente',
  ultimaMensagem: { id: 'm1', validacaoId: 'v1', lado: 'cliente', autor: 'Fulano', motivo: 'valor', texto: 'Valor acima do combinado', criadaEm: '2026-10-07T12:00:00Z' }, ...patch,
})
const busca = (l: Linha, q: string) => keywordIndex(linhaKeywordText).matches(l, searchWords(q))

describe('busca da validação do cliente', () => {
  it('AND entre palavras, sem acento nem caixa, em campos da linha e fora dela', () => {
    const l = linha()
    expect(busca(l, 'os-100 fabrica')).toBe(true)
    expect(busca(l, 'LIBERADO 05/10/2026')).toBe(true)
    expect(busca(l, 'cr-77 pedagio')).toBe(true)
    expect(busca(l, 'cliente acima combinado')).toBe(true)
    expect(busca(l, '1.234,50')).toBe(true)
    expect(busca(l, '16/10/2026 ped-9')).toBe(true)
    expect(busca(l, 'os-100 aprovado')).toBe(false)
  })
})
