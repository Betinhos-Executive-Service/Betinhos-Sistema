import { describe, expect, it } from 'vitest'
import { MULTA_STATUS } from '../../funcionarios/data/schema'
import { ANEXO_DESPESA, ENTITY_SET, LIMITE, MANUT, MULTA, PAGAMENTO, PAGAMENTO_MANUT, STATUS_OPTIONS, TONE, label } from './schema'

describe('schema da manutenção', () => {
  it('202410001 é "Agendado" (era "Aprovado"; mesmo valor)', () => {
    expect(MANUT.AGENDADO).toBe(202410001)
    expect(label(STATUS_OPTIONS.manutencao, MANUT.AGENDADO)).toBe('Agendado')
    expect(Object.keys(MANUT)).not.toContain('APROVADO')
  })

  it('pagamento tem Dinheiro próprio e anexo da despesa usa os códigos do App', () => {
    expect(PAGAMENTO).toEqual({ CARTAO: 202410000, PEDIDO_COMPRA: 202410001, PIX: 202410002, DINHEIRO: 202410003 })
    expect(PAGAMENTO_MANUT.map((o) => o.label)).toEqual(['Cartão de crédito', 'Pedido de compra', 'Pix', 'Dinheiro'])
    expect(ANEXO_DESPESA).toEqual({ PENDENTE: 100000001, ENVIADO: 100000002, FALHOU: 100000003 })
  })

  it('limites de texto (MaxLength do DEV) e entity sets usados nos binds', () => {
    expect(LIMITE).toEqual({ comentarioAprovador: 100, comentarioAoMotorista: 1000, estabelecimento: 100, servicoRealizado: 100, comentarioColaborador: 4000, descricao: 4000 })
    expect(ENTITY_SET).toMatchObject({ veiculos: 'cr40f_veiculoses', manutencoes: 'cr40f_manutencoeses', funcionarios: 'cr40f_funcionarioses', despesas: 'cr40f_despesaoperacionals' })
  })
})

describe('rótulos da multa', () => {
  it('são os das etapas, na ordem do passo a passo, com a opção Cancelada', () => {
    expect(STATUS_OPTIONS.multa.map((o) => o.label)).toEqual(['1. Identificar o responsável', '2. Indicar no órgão', '3. Pagar', '4. Acertar', 'Encerrada', 'Em recurso', 'Cancelada', 'Descontado (antigo)'])
    expect(label(STATUS_OPTIONS.multa, MULTA.CANCELADA)).toBe('Cancelada')
    expect(TONE.multa[MULTA.CANCELADA]).toBe('neutral')
  })

  it('funcionários usam a mesma lista', () => {
    expect(MULTA_STATUS).toBe(STATUS_OPTIONS.multa)
  })
})
