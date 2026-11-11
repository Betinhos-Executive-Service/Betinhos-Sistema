import { describe, expect, it } from 'vitest'
import { createMockDespesas } from '../data/mock'
import { aplicarDecisao, decidivel, motivoValido, patchDecisao, proximaEsperando } from './decisao'
import { OPERACIONAL } from './status'

const list = createMockDespesas(new Date(2026, 9, 9, 12))
const esperando = list.filter((d) => d.aguardandoGestor).map((d) => d.id)

describe('decisão do gestor', () => {
  it('motivo vale a partir de 10 caracteres, sem contar espaços nas pontas', () => {
    expect(motivoValido('curto')).toBe(false)
    expect(motivoValido('   123456789   ')).toBe(false)
    expect(motivoValido('  1234567890  ')).toBe(true)
  })

  it('validar não grava motivo; devolver e cancelar gravam o motivo e zeram aguardandogestor', () => {
    expect(patchDecisao('validar', '')).toEqual({ cr40f_statusoperacional: OPERACIONAL.validado, new_aguardandogestor: false })
    expect(patchDecisao('devolver', '  Troque o comprovante.  ')).toEqual({
      cr40f_statusoperacional: OPERACIONAL.corrigir, new_motivodevolucao: 'Troque o comprovante.', new_aguardandogestor: false, new_justificativamotorista: null,
    })
    expect(patchDecisao('cancelar', 'Lançamento duplicado.')).toEqual({
      cr40f_statusoperacional: OPERACIONAL.cancelado, new_motivodevolucao: 'Lançamento duplicado.', new_aguardandogestor: false,
    })
    expect(Object.values(patchDecisao('validar', '')).includes('Recusado')).toBe(false)
  })

  it('aplicarDecisao reflete o mesmo efeito na despesa em memória', () => {
    const d = list.find((x) => x.aguardandoGestor && x.justificativaMotorista)!
    const agora = new Date(2026, 9, 9, 15)
    expect(aplicarDecisao(d, 'validar', '', agora)).toMatchObject({ statusOperacional: OPERACIONAL.validado, aguardandoGestor: false, alteradoEm: agora })
    expect(aplicarDecisao(d, 'devolver', 'Troque o comprovante.', agora)).toMatchObject({ statusOperacional: OPERACIONAL.corrigir, motivoDevolucao: 'Troque o comprovante.', justificativaMotorista: '', aguardandoGestor: false })
    expect(aplicarDecisao(d, 'cancelar', 'Indevida, pessoal.', agora)).toMatchObject({ statusOperacional: OPERACIONAL.cancelado, motivoDevolucao: 'Indevida, pessoal.', justificativaMotorista: d.justificativaMotorista })
    expect(d.aguardandoGestor).toBe(true)
  })

  it('só despesa em andamento é decidível', () => {
    expect(decidivel({ statusOperacional: OPERACIONAL.enviado })).toBe(true)
    expect(decidivel({ statusOperacional: OPERACIONAL.corrigir })).toBe(true)
    expect(decidivel({ statusOperacional: OPERACIONAL.validado })).toBe(false)
    expect(decidivel({ statusOperacional: OPERACIONAL.cancelado })).toBe(false)
  })

  it('próxima da fila: a seguinte na ordem, volta ao começo no fim, nunca a própria', () => {
    expect(esperando.length).toBe(2)
    const [a, b] = esperando
    expect(proximaEsperando(list, a)).toBe(b)
    expect(proximaEsperando(list, b)).toBe(a)
    expect(proximaEsperando(list.filter((d) => d.id !== b), a)).toBeNull()
    expect(proximaEsperando([], 'x')).toBeNull()
  })
})
