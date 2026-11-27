import { describe, expect, it } from 'vitest'
import { erroAntecedencia, faleComBetinhos, motivoNaoCancela, PRAZOS_PADRAO, resolverPrazos, textoAntecedencia, textoPrazoCancelar } from './prazos'

const T0 = Date.parse('2026-11-25T12:00:00Z')
const emH = (h: number) => new Date(T0 + h * 3_600_000).toISOString()

describe('resolverPrazos', () => {
  it('vazio ou inválido vale o padrão (4 h e 2 h); 0 é sem limite', () => {
    expect(resolverPrazos(null)).toEqual({ antecedenciaPedidoH: 4, prazoCancelarH: 2, contato: '' })
    expect(resolverPrazos({ antecedenciaPedido: null, prazoCancelar: 'x', contato: 5 })).toEqual(PRAZOS_PADRAO)
    expect(resolverPrazos({ antecedenciaPedido: 721, prazoCancelar: -1 })).toEqual(PRAZOS_PADRAO)
    expect(resolverPrazos({ antecedenciaPedido: 0, prazoCancelar: 0, contato: '  (12) 9  ' })).toEqual({ antecedenciaPedidoH: 0, prazoCancelarH: 0, contato: '(12) 9' })
  })
})

describe('textos', () => {
  it('contato vazio mostra só "Fale com a Betinhos."', () => {
    expect(faleComBetinhos('')).toBe('Fale com a Betinhos.')
    expect(faleComBetinhos('(12) 99999-0000.')).toBe('Fale com a Betinhos: (12) 99999-0000.')
    expect(textoAntecedencia(PRAZOS_PADRAO)).toBe('Pedidos com pelo menos 4 h de antecedência.')
    expect(textoAntecedencia({ ...PRAZOS_PADRAO, antecedenciaPedidoH: 0 })).toBeNull()
    expect(textoPrazoCancelar(PRAZOS_PADRAO)).toBe('Você cancela até 2 h antes da saída.')
    expect(textoPrazoCancelar({ ...PRAZOS_PADRAO, prazoCancelarH: 0 })).toBe('Você cancela até a hora da saída.')
  })
})

describe('erroAntecedencia', () => {
  it('exatamente no limite passa; um minuto antes bloqueia com o contato; 0 libera', () => {
    expect(erroAntecedencia(T0 + 4 * 3_600_000, T0, PRAZOS_PADRAO)).toBeNull()
    expect(erroAntecedencia(T0 + 4 * 3_600_000 - 60_000, T0, { ...PRAZOS_PADRAO, contato: 'WhatsApp 123' })).toMatch(/menos de 4 h.*Fale com a Betinhos: WhatsApp 123\./)
    expect(erroAntecedencia(T0 + 1, T0, { ...PRAZOS_PADRAO, antecedenciaPedidoH: 0 })).toBeNull()
  })
})

describe('motivoNaoCancela', () => {
  it('Solicitado, Confirmado e Programado cancelam dentro do prazo', () => {
    for (const status of ['solicitado', 'confirmado', 'programado'] as const) expect(motivoNaoCancela({ status, saida: emH(3) }, T0, PRAZOS_PADRAO)).toBeNull()
  })
  it('em execução, concluído e cancelado nunca; em análise também não', () => {
    for (const status of ['em_execucao', 'concluido', 'cancelado', 'em_analise'] as const) expect(motivoNaoCancela({ status, saida: emH(100) }, T0, PRAZOS_PADRAO)).toMatch(/não pode mais ser cancelado.*Fale com a Betinhos\./)
  })
  it('depois do prazo bloqueia com o motivo e o contato; no limite ainda cancela; 0 = sem prazo', () => {
    expect(motivoNaoCancela({ status: 'confirmado', saida: emH(2) }, T0, PRAZOS_PADRAO)).toBeNull()
    expect(motivoNaoCancela({ status: 'confirmado', saida: emH(1.9) }, T0, { ...PRAZOS_PADRAO, contato: '(12) 9' })).toMatch(/2 h antes da saída e já passou.*Fale com a Betinhos: \(12\) 9\./)
    expect(motivoNaoCancela({ status: 'confirmado', saida: emH(1) }, T0, { ...PRAZOS_PADRAO, prazoCancelarH: 0 })).toBeNull()
    expect(motivoNaoCancela({ status: 'confirmado', saida: emH(-1) }, T0, { ...PRAZOS_PADRAO, prazoCancelarH: 0 })).toMatch(/saída já passou.*Fale com a Betinhos\./)
  })
})
