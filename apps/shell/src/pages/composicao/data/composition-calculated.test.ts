import { describe, expect, it } from 'vitest'
import { withCalculatedTotals } from './composition-calculated'

describe('withCalculatedTotals', () => {
  it('recalcula Subtotal e Total como o Dataverse', () => {
    const values = withCalculatedTotals({
      cr40f_valorhoramotorista: '100.10', cr40f_valorarcometropolitano: '10', new_ajuste: '999',
      cr40f_valorrepasseterceiro: '50', new_valorpedagios: '20.05', cr40f_valorcombustivel: '0.3',
      new_subtotal: '0.00', new_valortotal: '0.00',
    })
    expect(values.new_subtotal).toBe('110.10')
    expect(values.new_valortotal).toBe('130.45')
  })

  it('trata vazio e inválido como zero', () => {
    expect(withCalculatedTotals({ cr40f_valordadiaria: '', new_valorlocacao: 'x' }).new_valortotal).toBe('0.00')
  })
})
