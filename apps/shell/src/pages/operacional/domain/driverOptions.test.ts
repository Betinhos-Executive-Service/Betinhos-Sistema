import { expect, it } from 'vitest'
import { motoristaOptions } from './driverOptions'
import { reserva } from './fixtures'

const now = new Date('2026-10-05T08:00:00-03:00')
const ana = { id: 'a', nome: 'Ana', apelido: 'Aninha', celular: '' }
const beto = { id: 'b', nome: 'Beto', apelido: '', celular: '' }

it('inclui no início o motorista atual que não está na lista', () => {
  const r = reserva({ hora: '10:00', motoristaId: 'x', motorista: 'Carlos Júnior' })
  const options = motoristaOptions(r, [ana], [r], now)
  expect(options[0]).toMatchObject({ value: 'x', label: 'Carlos Júnior', subtitle: 'Motorista atual (fora da lista de motoristas)' })
  expect(options).toHaveLength(2)
})

it('usa rótulo padrão quando a reserva não traz o nome e não duplica quem já está na lista', () => {
  const semNome = reserva({ hora: '10:00', motoristaId: 'x', motorista: '' })
  expect(motoristaOptions(semNome, [ana], [semNome], now)[0].label).toBe('Motorista atual')
  const dentro = reserva({ hora: '10:00', motoristaId: 'a' })
  expect(motoristaOptions(dentro, [ana], [dentro], now)).toHaveLength(1)
})

it('avisa conflito, próxima saída ou livre', () => {
  const alvo = reserva({ hora: '10:00', motoristaId: null, motorista: '' })
  const doAna = reserva({ hora: '10:15', motoristaId: 'a' })
  const doBeto = reserva({ hora: '14:00', motoristaId: 'b' })
  const options = motoristaOptions(alvo, [ana, beto, { id: 'c', nome: 'Caio', apelido: '', celular: '' }], [alvo, doAna, doBeto], now)
  expect(options.map((o) => o.subtitle)).toEqual(['Conflito: saída às 10:15', 'Próximo às 14:00', 'Livre'])
})
