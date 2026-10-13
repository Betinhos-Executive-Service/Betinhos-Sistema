import { describe, expect, it } from 'vitest'
import { READONLY, cellKind, statusTone } from './cells'
import { formatCell, formatMoney, fromDateTimeLocal, parseMoney, toDateTimeLocal } from './format'
import type { AttributeInfo, Column } from './types'

const col = (attribute: string, alias: string | null = null): Column => ({ key: alias ? `${alias}.${attribute}` : attribute, attribute, alias, entity: null, width: 100 })
const info = (type: string, updatable = true): AttributeInfo => ({ logicalName: 'x', type, label: 'X', updatable, targets: [], options: [] })
const F = '@OData.Community.Display.V1.FormattedValue'

describe('cellKind', () => {
  it('mapeia tipos editáveis', () => {
    expect(cellKind(col('cr40f_status'), info('Picklist'))).toBe('choice')
    expect(cellKind(col('cr40f_motorista'), info('Lookup'))).toBe('lookup')
    expect(cellKind(col('cr40f_dataehorriodesada'), info('DateTime'))).toBe('datetime')
    expect(cellKind(col('cr40f_trajeto'), info('String'))).toBe('text')
    expect(cellKind(col('cr40f_destino'), info('Memo'))).toBe('memo')
    expect(cellKind(col('cr40f_cotao'), info('Money'))).toBe('money')
    expect(cellKind(col('cr40f_receber'), info('Boolean'))).toBe('boolean')
  })
  it('só leitura: lista fixa, não atualizável, sem metadata, link-entity e tipos desconhecidos', () => {
    expect(cellKind(col('cr40f_id'), info('String'))).toBe('readonly')
    expect(cellKind(col('cr40f_passageirosetelefonedecontato'), info('Memo'))).toBe('readonly')
    expect(cellKind(col('new_linkdovoucher'), info('String'))).toBe('readonly')
    expect(cellKind(col('createdon'), info('DateTime', false))).toBe('readonly')
    expect(cellKind(col('cr40f_x'), undefined)).toBe('readonly')
    expect(cellKind(col('new_valortotal', 'a_1'), info('Money'))).toBe('readonly')
    expect(cellKind(col('ownerid'), info('Owner'))).toBe('readonly')
    expect(READONLY.has('cr40f_endereodesada')).toBe(true)
    expect(cellKind(col('cr40f_criadopor'), info('Lookup'))).toBe('readonly')
    expect(cellKind(col('cr40f_modificadopor'), info('Lookup'))).toBe('readonly')
  })
})

describe('statusTone', () => {
  it('status de operação e faturamento têm tom por valor', () => {
    expect(statusTone('cr40f_status', 202410001)).toBe('success')     // Confirmado
    expect(statusTone('cr40f_status', 202410002)).toBe('danger')      // Cancelado
    expect(statusTone('cr40f_status', 100000001)).toBe('warning')     // Requer Análise
    expect(statusTone('cr40f_status', 202410006)).toBe('info')        // Em Execução
    expect(statusTone('cr40f_statusdefaturamento', 202410010)).toBe('success') // Pago
    expect(statusTone('cr40f_statusdefaturamento', 202410012)).toBe('danger')  // Pagamento em atraso
    expect(statusTone('cr40f_statusdefaturamento', 202410005)).toBe('warning') // Pendente
    expect(statusTone('cr40f_tipodeveiculo', 1)).toBe('neutral')
    expect(statusTone('cr40f_status', null)).toBe('neutral')
  })
})

describe('format', () => {
  it('formatCell usa o valor formatado e trata vazios', () => {
    const row = { cr40f_status: 1, [`cr40f_status${F}`]: 'Confirmado', cr40f_receber: true, [`cr40f_receber${F}`]: 'Sim', cr40f_trajeto: null }
    expect(formatCell('choice', row, 'cr40f_status')).toBe('Confirmado')
    expect(formatCell('boolean', row, 'cr40f_receber')).toBe('Sim')
    expect(formatCell('text', row, 'cr40f_trajeto')).toBe('—')
    expect(formatCell('lookup', row, '_cr40f_motorista_value')).toBe('—')
  })
  it('data/hora vai e volta no fuso de São Paulo', () => {
    expect(toDateTimeLocal('2026-10-08T19:00:00Z')).toBe('2026-10-08T16:00')
    expect(fromDateTimeLocal('2026-10-08T16:00')).toBe('2026-10-08T19:00:00.000Z')
    expect(toDateTimeLocal(null)).toBe('')
    expect(fromDateTimeLocal('')).toBeNull()
    expect(fromDateTimeLocal('abc')).toBeNull()
    expect(formatCell('datetime', { d: '2026-10-08T19:00:00Z' }, 'd')).toBe('08/10/2026 16:00')
  })
  it('dinheiro em BRL', () => {
    expect(formatMoney(1234.5)).toBe('R$ 1.234,50')
    expect(formatMoney(null)).toBe('—')
    expect(parseMoney('R$ 1.234,50')).toBe(1234.5)
    expect(parseMoney('1234.5')).toBe(1234.5)
    // Sem vírgula, grupos de três depois do ponto são milhar (digitação pt-BR); com uma casa ou duas, é decimal.
    expect(parseMoney('1.500')).toBe(1500)
    expect(parseMoney('1.234')).toBe(1234)
    expect(parseMoney('1.234.567')).toBe(1234567)
    expect(parseMoney('1.234,50')).toBe(1234.5)
    expect(parseMoney('1.5')).toBe(1.5)
    expect(parseMoney('12.50')).toBe(12.5)
    expect(parseMoney('0.500')).toBe(0.5)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(formatCell('money', { v: 10 }, 'v')).toBe('R$ 10,00')
  })
})
