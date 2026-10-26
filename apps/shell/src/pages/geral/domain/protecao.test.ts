// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildFetch, parse } from './fetch'
import { camposProtegidos, isProtegido, textoDoValor, ultimaAlteracao, valorDaTenaris } from './protecao'
import type { AttributeInfo, Column } from './types'

const F = '@OData.Community.Display.V1.FormattedValue'
const col = (attribute: string, alias: string | null = null): Column => ({ key: alias ? `${alias}.${attribute}` : attribute, attribute, alias, entity: null, width: 100 })
const info = (type: string, options: AttributeInfo['options'] = []): AttributeInfo => ({ logicalName: 'x', type, label: 'X', updatable: true, targets: [], options })
const audit = (changes: unknown, createdon: string, por = 'Keila, Deborah') => ({ changedata: typeof changes === 'string' ? changes : JSON.stringify({ changedAttributes: changes }), createdon, _userid_value: 'u1', [`_userid_value${F}`]: por })

describe('camposProtegidos', () => {
  it('vazio, nulo ou não texto não protege nada', () => {
    expect(camposProtegidos(null).size).toBe(0)
    expect(camposProtegidos('').size).toBe(0)
    expect(camposProtegidos(' , ;').size).toBe(0)
    expect(camposProtegidos(42).size).toBe(0)
  })
  it('separa por vírgula, tira espaços e caixa', () => {
    expect([...camposProtegidos(' cr40f_trajeto ,CR40F_STATUS;cr40f_observaointerna,')]).toEqual(['cr40f_trajeto', 'cr40f_status', 'cr40f_observaointerna'])
  })
  it('passageiros fica de fora (é do plugin); campo desconhecido não acende cadeado em coluna nenhuma', () => {
    const row = { new_camposprotegidos: 'cr40f_trajeto,cr40f_passageirosetelefonedecontato,cr40f_inexistente' }
    expect(camposProtegidos(row.new_camposprotegidos).has('cr40f_passageirosetelefonedecontato')).toBe(false)
    expect(isProtegido(row, col('cr40f_trajeto'))).toBe(true)
    expect(isProtegido(row, col('cr40f_passageirosetelefonedecontato'))).toBe(false)
    expect(isProtegido(row, col('cr40f_destino'))).toBe(false)
    expect(isProtegido(row, col('cr40f_trajeto', 'a_1'))).toBe(false)
  })
})

describe('ultimaAlteracao', () => {
  it('pega a troca mais recente do campo e ignora changedata que não é JSON', () => {
    const audits = [
      audit('9040d53c-4cc7-f011-8543-000d3ac06738,8', '2026-10-24T10:00:00Z'),
      audit([{ logicalName: 'cr40f_status', oldValue: '202410005', newValue: '202410001' }], '2026-10-23T20:00:00Z', 'Outra Pessoa'),
      audit([{ logicalName: 'cr40f_trajeto', oldValue: 'São Paulo / Pindamonhangaba', newValue: 'Aerop. Guarulhos / Taubaté' }], '2026-10-23T19:27:00Z'),
      audit([{ logicalName: 'cr40f_trajeto', oldValue: 'antigo', newValue: 'São Paulo / Pindamonhangaba' }], '2026-10-20T10:00:00Z', 'Integração'),
    ]
    expect(ultimaAlteracao(audits, 'cr40f_trajeto')).toEqual({ antes: 'São Paulo / Pindamonhangaba', depois: 'Aerop. Guarulhos / Taubaté', em: '2026-10-23T19:27:00Z', por: 'Keila, Deborah' })
  })
  it('sem troca do campo, ou valor anterior vazio', () => {
    expect(ultimaAlteracao([audit([{ logicalName: 'cr40f_status', oldValue: '1', newValue: '2' }], '2026-10-23T19:27:00Z')], 'cr40f_trajeto')).toBeNull()
    expect(ultimaAlteracao([], 'cr40f_trajeto')).toBeNull()
    expect(ultimaAlteracao([audit([{ logicalName: 'cr40f_trajeto', oldValue: null, newValue: 'x' }], '2026-10-23T19:27:00Z')], 'cr40f_trajeto')?.antes).toBeNull()
  })
})

describe('valorDaTenaris e textoDoValor', () => {
  it('lê o snapshot por nome lógico; JSON inválido ou ausente vira null', () => {
    const snap = JSON.stringify({ cr40f_trajeto: 'São Paulo / Taubaté', cr40f_horrioprevistoderetorno: '' })
    expect(valorDaTenaris(snap, 'cr40f_trajeto')).toBe('São Paulo / Taubaté')
    expect(valorDaTenaris(snap, 'cr40f_horrioprevistoderetorno')).toBeNull()
    expect(valorDaTenaris('{quebrado', 'cr40f_trajeto')).toBeNull()
    expect(valorDaTenaris(null, 'cr40f_trajeto')).toBeNull()
  })
  it('formata choice, data (auditoria e ISO), booleano, dinheiro e lookup', () => {
    const status = info('Picklist', [{ value: 202410001, label: 'Confirmado' }])
    expect(textoDoValor('202410001', status)).toBe('Confirmado')
    expect(textoDoValor('999', status)).toBe('999')
    expect(textoDoValor('10/23/2026 19:27:00', info('DateTime'))).toBe('23/10/2026 16:27')
    expect(textoDoValor('2026-10-25T15:55:00Z', info('DateTime'))).toBe('25/10/2026 12:55')
    expect(textoDoValor('True', info('Boolean'))).toBe('Sim')
    expect(textoDoValor('False', info('Boolean'))).toBe('Não')
    expect(textoDoValor('1234.5', info('Money'))).toContain('1.234,50')
    expect(textoDoValor('cr40f_clientes1,564bdd2e', info('Lookup'))).toBe('Outro registro relacionado')
    expect(textoDoValor(null, info('String'))).toBe('—')
    expect(textoDoValor('Rua A', undefined)).toBe('Rua A')
  })
})

describe('buildFetch', () => {
  it('traz new_camposprotegidos uma vez só, sem misturar com all-attributes', () => {
    const fx = '<fetch><entity name="cr40f_reservadeveculos"><attribute name="cr40f_id" /></entity></fetch>'
    const base = { page: 1, pageSize: 50, cookie: null, sort: null, search: [] }
    const once = buildFetch(fx, base)
    expect(parse(buildFetch(once, base)).doc.querySelectorAll('entity > attribute[name="new_camposprotegidos"]').length).toBe(1)
    const all = '<fetch><entity name="cr40f_reservadeveculos"><all-attributes /></entity></fetch>'
    expect(parse(buildFetch(all, base)).doc.querySelectorAll('entity > attribute').length).toBe(0)
  })
})
