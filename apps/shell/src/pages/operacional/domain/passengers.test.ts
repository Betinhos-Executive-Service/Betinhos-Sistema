import { describe, expect, it } from 'vitest'
import { reserva } from './fixtures'
import { parsePassengerText, passengerList } from './passengers'
import { phoneDigits, telHref, whatsappHref } from './phone'
import { applyOverrides, changedIds, freshnessLabel } from './refresh'

describe('passageiros', () => {
  it('interpreta o texto livre', () => {
    expect(parsePassengerText('Ana Souza - (11) 98888-7777\nBruno; Carla Dias: +55 21 3333-4444')).toEqual([
      { nome: 'Ana Souza', telefone: '(11) 98888-7777' },
      { nome: 'Bruno', telefone: '' },
      { nome: 'Carla Dias', telefone: '+55 21 3333-4444' },
    ])
  })
  it('interpreta o formato do legado, com o telefone entre parênteses no fim', () => {
    expect(parsePassengerText('Ana Souza - (11 98888-7777)\r\nBruno (+55 21 3333-4444)')).toEqual([
      { nome: 'Ana Souza', telefone: '11 98888-7777' },
      { nome: 'Bruno', telefone: '+55 21 3333-4444' },
    ])
  })
  it('prefere filhos, depois lookups, depois texto; telefone vem do texto pelo nome', () => {
    const r = reserva({ passageirosTexto: 'Ana Souza - 11988887777', passageirosLookup: [{ id: 'p9', nome: 'Zé' }] })
    expect(passengerList(r, [{ id: 's1', ordem: 1, nome: 'Ana  Souza', enderecoSaida: 'Rua A, 10' }])).toEqual([
      { key: 's1', nome: 'Ana  Souza', telefone: '11988887777', endereco: 'Rua A, 10', origem: 'servico' },
    ])
    expect(passengerList(r, [])[0]).toMatchObject({ key: 'p9', nome: 'Zé', origem: 'lookup' })
    expect(passengerList({ ...r, passageirosLookup: [] })[0]).toMatchObject({ nome: 'Ana Souza', origem: 'texto' })
  })
})

describe('telefone', () => {
  it('normaliza para DDI 55', () => {
    expect(phoneDigits('(11) 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('+55 21 3333-4444')).toBe('552133334444')
    expect(phoneDigits('011 98888-7777')).toBe('5511988887777')
    expect(phoneDigits('123')).toBeNull()
    expect(telHref('11 98888-7777')).toBe('tel:+5511988887777')
    expect(whatsappHref('11 98888-7777')).toBe('https://wa.me/5511988887777')
    expect(whatsappHref('')).toBeNull()
  })
})

describe('frescor e otimismo', () => {
  const t = new Date('2026-10-05T11:00:00-03:00')
  it('rótulo de frescor', () => {
    expect(freshnessLabel(null, t)).toBe('Carregando…')
    expect(freshnessLabel(new Date(t.getTime() - 30_000), t)).toBe('Atualizado agora')
    expect(freshnessLabel(new Date(t.getTime() - 125_000), t)).toBe('Atualizado há 2 min')
  })
  it('marca linhas novas ou alteradas, mas não na primeira carga', () => {
    const a = reserva({ hora: '08:00' }), b = reserva({ hora: '09:00' })
    expect(changedIds([], [a, b]).size).toBe(0)
    expect([...changedIds([a], [{ ...a, status: 'Concluído', statusValue: 1 }, b])]).toEqual([a.id, b.id])
    expect(changedIds([a], [a]).size).toBe(0)
  })
  it('aplica overrides otimistas sem mutar a lista', () => {
    const a = reserva({ hora: '08:00' })
    const list = [a]
    const result = applyOverrides(list, new Map([[a.id, { status: 'Concluído' }]]))
    expect(result[0].status).toBe('Concluído')
    expect(list[0].status).toBe('Confirmado')
    expect(applyOverrides(list, new Map())).toBe(list)
  })
})
