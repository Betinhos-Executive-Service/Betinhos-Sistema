// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { columnLabel, parseLayout, rowKey } from './layout'
import type { AttributeInfo } from './types'

const LAYOUT = `<grid name="resultset" jump="cr40f_id" select="1" icon="1" preview="1"><row name="result" id="cr40f_reservadeveculosid">
<cell name="cr40f_id" width="100" /><cell name="cr40f_status" width="120" /><cell name="cr40f_motorista" width="150" />
<cell name="a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal" width="110" /><cell name="createdon" width="130" ishidden="1" />
</row></grid>`

const info = (type: string, label: string): AttributeInfo => ({ logicalName: 'x', type, label, updatable: true, targets: [], options: [] })

describe('layout', () => {
  it('lê colunas na ordem, com largura, alias e sem as ocultas', () => {
    expect(parseLayout(LAYOUT)).toEqual([
      { key: 'cr40f_id', attribute: 'cr40f_id', alias: null, entity: null, width: 100 },
      { key: 'cr40f_status', attribute: 'cr40f_status', alias: null, entity: null, width: 120 },
      { key: 'cr40f_motorista', attribute: 'cr40f_motorista', alias: null, entity: null, width: 150 },
      { key: 'a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal', attribute: 'new_valortotal', alias: 'a_2b630d980aca46fc8dedc3c3ffe23fcf', entity: null, width: 110 },
    ])
  })

  it('layout inválido vira lista vazia', () => {
    expect(parseLayout('')).toEqual([])
    expect(parseLayout('<grid>')).toEqual([])
  })

  it('chave da linha: lookup usa _x_value; link usa alias.atributo', () => {
    const [id, , motorista, total] = parseLayout(LAYOUT)
    expect(rowKey(id, info('String', 'ID'))).toBe('cr40f_id')
    expect(rowKey(motorista, info('Lookup', 'Motorista'))).toBe('_cr40f_motorista_value')
    expect(rowKey(total, undefined)).toBe('a_2b630d980aca46fc8dedc3c3ffe23fcf.new_valortotal')
  })

  it('rótulo vem da metadata e cai no nome lógico', () => {
    const [id, , , total] = parseLayout(LAYOUT)
    expect(columnLabel(id, info('String', 'ID'))).toBe('ID')
    expect(columnLabel(total, undefined)).toBe('new_valortotal')
  })
})
