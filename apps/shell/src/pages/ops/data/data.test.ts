import type { DataverseClient, Row } from '@betinhos/dataverse'
import { describe, expect, it, vi } from 'vitest'
import { valorOp } from '../domain/types'
import { loadValoresServicos } from './queries'

const OP1 = '11111111-1111-1111-1111-111111111111'
const OP2 = '22222222-2222-2222-2222-222222222222'
const OP3 = '33333333-3333-3333-3333-333333333333'
const S = (n: number) => `aaaaaaaa-0000-0000-0000-00000000000${n}`

function client(getAll: (path: string) => Promise<Row[]>): DataverseClient {
  return { apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() } as unknown as DataverseClient
}

describe('loadValoresServicos', () => {
  it('soma as composições por OP e deixa null quando falta valor em algum serviço', async () => {
    const c = client(async (path) => {
      if (path.startsWith('res?')) return [
        { cr40f_reservadeveculosid: S(1), _cr40f_financeiro_value: OP1 },
        { cr40f_reservadeveculosid: S(2), _cr40f_financeiro_value: OP1 },
        { cr40f_reservadeveculosid: S(3), _cr40f_financeiro_value: OP2 },
        { cr40f_reservadeveculosid: S(4), _cr40f_financeiro_value: OP2 },
      ]
      return [
        { new_valortotal: 1000, _cr40f_servicorelacionadogeral_value: S(1) },
        { new_valortotal: 246.66, _cr40f_servicorelacionadogeral_value: S(2) },
        { new_valortotal: 24.2, _cr40f_servicorelacionadogeral_value: S(2) },
        { new_valortotal: 500, _cr40f_servicorelacionadogeral_value: S(3) },
      ]
    })
    const valores = await loadValoresServicos(c, { reserva: 'res', composicao: 'comp' }, [OP1, OP2, OP3])
    expect(valores.get(OP1)).toBe(1270.86)
    expect(valores.get(OP2)).toBeNull()
    expect(valores.get(OP3)).toBeNull()
    expect(c.getAll).toHaveBeenCalledTimes(2)
    expect(vi.mocked(c.getAll).mock.calls[1][0]).toContain(encodeURIComponent(`cr40f_ServicoRelacionadoGeral/_cr40f_financeiro_value eq ${OP1}`))
  })
})

describe('valorOp', () => {
  it('usa o valor da OP e, sem ele, a soma dos serviços', () => {
    expect(valorOp({ valor: 10, valorServicos: 20 })).toBe(10)
    expect(valorOp({ valor: null, valorServicos: 20 })).toBe(20)
    expect(valorOp({ valor: null })).toBeNull()
  })
})
