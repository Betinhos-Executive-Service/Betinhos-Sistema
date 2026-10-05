import { describe, expect, it } from 'vitest'
import { conflictFor, findConflicts } from './conflicts'
import { buildAttention } from './alerts'
import { groupByHour } from './bands'
import { reserva } from './fixtures'

const now = new Date('2026-10-05T11:00:00-03:00')

describe('conflitos', () => {
  it('saídas consecutivas do mesmo motorista com menos de 30 min', () => {
    const a = reserva({ hora: '08:00' }), b = reserva({ hora: '08:29' }), c = reserva({ hora: '08:59' }), d = reserva({ hora: '08:10', motoristaId: 'm2' })
    expect(findConflicts([a, b, c, d])).toEqual([{ motoristaId: 'm1', firstId: a.id, secondId: b.id, gap: 29 }])
  })
  it('ignora cancelados e sem horário', () => {
    expect(findConflicts([reserva({ hora: '08:00' }), reserva({ hora: '08:10', status: 'Cancelado' }), reserva({})])).toEqual([])
  })
  it('acha o serviço conflitante para um motorista candidato', () => {
    const a = reserva({ hora: '08:20', motoristaId: 'm2' })
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:00:00-03:00'), 'x')?.id).toBe(a.id)
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:50:00-03:00'), 'x')).toBeNull()
    expect(conflictFor([a], 'm2', new Date('2026-10-05T08:00:00-03:00'), a.id)).toBeNull()
  })
})

describe('fila de atenção', () => {
  it('prioriza sem motorista, depois atraso/aberto, depois conflito, sem repetir serviço', () => {
    const semMotorista = reserva({ hora: '11:20', motoristaId: null, motorista: '' })
    const atrasado = reserva({ hora: '10:48', status: 'Solicitado', motoristaId: 'm3' })
    const aberto = reserva({ hora: '11:15', status: 'Pré-reserva', motoristaId: 'm4' })
    const c1 = reserva({ hora: '14:00', motoristaId: 'm5' }), c2 = reserva({ hora: '14:20', motoristaId: 'm5' })
    const tranquilo = reserva({ hora: '16:00', motoristaId: 'm6' })
    const items = buildAttention([semMotorista, atrasado, aberto, c1, c2, tranquilo], now)
    expect(items.map((i) => [i.reservaId, i.priority, i.action, i.reason])).toEqual([
      [semMotorista.id, 1, 'atribuir', 'Sem motorista'],
      [atrasado.id, 2, 'ligar', 'Atrasado 12 min'],
      [aberto.id, 2, 'ligar', 'Ainda não confirmado'],
      [c2.id, 3, 'ver', 'Saídas com 20 min de intervalo'],
    ])
  })
  it('atrasado sem motorista pede atribuição', () => {
    const r = reserva({ hora: '10:00', status: 'Solicitado', motoristaId: null })
    expect(buildAttention([r], now)[0]).toMatchObject({ priority: 2, action: 'atribuir' })
  })
})

describe('agrupamento por hora', () => {
  it('agrupa por hora cheia, separa concluídos e deixa sem horário no fim', () => {
    const a = reserva({ hora: '08:30' }), b = reserva({ hora: '08:05' }), c = reserva({ hora: '09:10' }), d = reserva({}), e = reserva({ hora: '07:00', status: 'Concluído' })
    const { groups, concluded } = groupByHour([a, b, c, d, e], now)
    expect(groups.map((g) => [g.label, g.items.map((r) => r.id)])).toEqual([
      ['08:00', [b.id, a.id]], ['09:00', [c.id]], ['Sem horário', [d.id]],
    ])
    expect(concluded.map((r) => r.id)).toEqual([e.id])
  })
})
