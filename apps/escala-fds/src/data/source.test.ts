import { describe, expect, it } from 'vitest'
import { janelaPara, mapMarcacao, marcacaoPayload } from './source'

describe('source', () => {
  it('janela = segunda a domingo', () => {
    expect(janelaPara('2026-10-12')).toEqual({ inicio: '2026-10-12', fim: '2026-10-18' })
  })

  it('Folga/Indisponível legados chegam desmarcados, com o id preservado', () => {
    const row = { cr40f_escalafdsid: 'AAA-1', _cr40f_motorista_value: 'm1', cr40f_data: '2026-10-18', cr40f_status: 100000002 }
    expect(mapMarcacao(row)).toEqual({ id: 'aaa-1', motoristaId: 'm1', data: '2026-10-18', situacao: null })
    expect(mapMarcacao({ ...row, cr40f_status: 100000001 })?.situacao).toBe('plantao')
    expect(mapMarcacao({ ...row, _cr40f_motorista_value: null })).toBeNull()
  })

  it('payload de marcação grava o valor do choice e o lookup do motorista', () => {
    expect(marcacaoPayload({ id: null, motoristaId: 'm1', data: '2026-10-17', situacao: 'trabalha' }, 'cr40f_funcionarioses', 'Danilo')).toEqual({
      cr40f_name: 'Danilo · 17/10/2026',
      cr40f_data: '2026-10-17',
      cr40f_status: 100000000,
      'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(m1)',
    })
  })
})
