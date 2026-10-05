import { describe, expect, it } from 'vitest'
import { dateRange, planSave, rodizio, weekendOf, type Edicao, type Registro } from './escala'

const reg = (motoristaId: string, data: string, status: Registro['status'], id: string | null = `${motoristaId}-${data}`): Registro =>
  ({ id, motoristaId, data, status, motivo: status === 'indisponivel' ? 'medico' : null, observacao: '' })

describe('weekendOf', () => {
  it('leva dias úteis ao próximo sábado e domingo ao sábado anterior', () => {
    expect(weekendOf(new Date(2026, 9, 5))).toBe('2026-10-10') // segunda
    expect(weekendOf(new Date(2026, 9, 10))).toBe('2026-10-10') // sábado
    expect(weekendOf(new Date(2026, 9, 11))).toBe('2026-10-10') // domingo
  })
})

describe('planSave', () => {
  it('cria, atualiza, exclui e ignora edição sem mudança', () => {
    const registros = [reg('a', '2026-10-10', 'trabalha'), reg('b', '2026-10-10', 'folga'), reg('c', '2026-10-10', 'plantao')]
    const edits = new Map<string, Edicao>([
      ['a|2026-10-10', null],
      ['b|2026-10-10', { status: 'plantao', motivo: null, observacao: '' }],
      ['c|2026-10-10', { status: 'plantao', motivo: null, observacao: '' }],
      ['d|2026-10-11', { status: 'indisponivel', motivo: 'ferias', observacao: 'Viagem' }],
    ])
    const ops = planSave(registros, edits)
    expect(ops.map((o) => o.tipo)).toEqual(['excluir', 'atualizar', 'criar'])
    expect(ops[2]).toMatchObject({ registro: { motoristaId: 'd', data: '2026-10-11', motivo: 'ferias' } })
  })

  it('descarta o motivo quando o status não é Indisponível', () => {
    const ops = planSave([], new Map<string, Edicao>([['a|2026-10-10', { status: 'trabalha', motivo: 'medico', observacao: '' }]]))
    expect(ops[0]).toMatchObject({ tipo: 'criar', registro: { motivo: null } })
  })
})

describe('rodizio', () => {
  const motoristas = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' }, { id: 'c', nome: 'Caio' }]

  it('conta cada fim de semana uma vez e ignora folga, dias úteis e datas futuras', () => {
    const registros = [
      reg('a', '2026-10-10', 'trabalha'), reg('a', '2026-10-11', 'plantao'), // mesmo fim de semana
      reg('a', '2026-10-03', 'trabalha'),
      reg('a', '2026-10-17', 'trabalha'), // depois da referência
      reg('b', '2026-10-10', 'folga'),
      reg('b', '2026-10-07', 'trabalha'), // quarta
      reg('c', '2026-08-01', 'trabalha'), // fora das 8 semanas, dentro do ano
    ]
    const linhas = rodizio(motoristas, registros, '2026-10-10')
    expect(linhas.map((l) => [l.motorista.id, l.ultimas8, l.ano])).toEqual([['b', 0, 0], ['c', 0, 1], ['a', 2, 2]])
    expect(linhas.find((l) => l.motorista.id === 'a')?.acimaDaMedia).toBe(true)
  })
})

describe('dateRange', () => {
  it('inclui as pontas e atravessa o mês', () => {
    expect(dateRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
  })
})
