import { describe, expect, it } from 'vitest'
import { gerarServicos } from '../api/mockDados'
import { contar, daAba, filtrarBase, mesesDisponiveis } from './filtros'
import { calcularPrazo } from './prazo'

const servicos = gerarServicos(new Date('2026-10-28T13:00:00Z'))
const todos = { mes: null, cr: null, busca: '' }

describe('filtros', () => {
  it('abas separam o que depende do cliente, da Betinhos e o que já foi aprovado', () => {
    expect(contar(servicos)).toEqual({ a_validar: 17, em_duvida: 4, aprovados: 9, todos: 30 })
    expect(daAba(servicos, 'a_validar').every((s) => s.status === 'liberado' || s.status === 'respondido')).toBe(true)
  })

  it('ordena pelo prazo da aprovação automática', () => {
    const prazos = daAba(servicos, 'a_validar').map((s) => s.prazoTacito)
    expect(prazos).toEqual([...prazos].sort())
  })

  it('filtra por CR e as contagens seguem o filtro', () => {
    const cr = servicos[0].cr
    const base = filtrarBase(servicos, { ...todos, cr })
    expect(contar(base).todos).toBe(servicos.filter((s) => s.cr === cr).length)
    expect(base.every((s) => s.cr === cr)).toBe(true)
  })

  it('busca sem acento e por várias palavras', () => {
    const r = filtrarBase(servicos, { ...todos, busca: 'patricia guarulhos' })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((s) => s.passageiros.includes('Patrícia Sato') && /Guarulhos/.test(s.origem + s.destino))).toBe(true)
  })

  it('lista os meses com rótulo em português', () => {
    expect(mesesDisponiveis(servicos)[0]).toEqual({ value: '2026-10', label: 'Outubro de 2026' })
  })
})

describe('calcularPrazo', () => {
  const agora = '2026-10-28T13:00:00Z'
  const um = (status: string) => servicos.find((s) => s.status === status)!

  it('em dúvida, o prazo fica parado', () => {
    expect(calcularPrazo(um('em_duvida'), agora)).toEqual({ texto: 'Prazo parado: aguardando a Betinhos', curto: false })
  })
  it('aprovado mostra a data e não marca atenção', () => {
    expect(calcularPrazo(um('aprovado'), agora)).toMatchObject({ texto: expect.stringMatching(/^Aprovado em \d{2}\/\d{2}\/\d{4}$/), curto: false })
  })
  it('a validar conta dias úteis e marca atenção com 1 dia ou menos', () => {
    const s = { ...um('liberado'), prazoTacito: '2026-10-29' }
    expect(calcularPrazo(s, agora)).toEqual({ texto: 'Aprovação automática em 1 dia útil', curto: true })
  })
})
