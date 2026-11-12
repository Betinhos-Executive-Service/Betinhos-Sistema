import { describe, expect, it } from 'vitest'
import { booleanPresentation, formatViewDate, isPrimaryField, primaryRecordId } from './view-field-presentation'
import type { CatalogField } from './views'

const related: CatalogField = { id: 'r1.cr40f_id', label: 'ID', table: 'cr40f_ordens', attribute: 'cr40f_id', primaryIdAttribute: 'cr40f_ordensid', primaryNameAttribute: 'cr40f_id', path: ['cr40f_ordens'], relationships: [{ from: 'cr40f_ordensid', to: 'cr40f_ordem' }], type: 'String', available: true }

describe('apresentação de campos relacionados', () => {
  it('formata booleanos e datas sem exibir valores técnicos', () => {
    expect(booleanPresentation(false)).toEqual({ active: false, label: 'Não' })
    expect(booleanPresentation(true, 'Programado')).toEqual({ active: true, label: 'Programado' })
    expect(formatViewDate('2026-07-28')).toBe('28/07/2026')
    expect(formatViewDate('2026-07-28T15:29:00')).toBe('28/07/2026 15:29')
  })

  it('abre somente a coluna primária com a chave da relação correta', () => {
    const guid = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'
    expect(isPrimaryField(related)).toBe(true)
    expect(primaryRecordId(related, { 'r1.cr40f_ordensid': guid }, 'r1.cr40f_id')).toBe(guid)
    expect(primaryRecordId(related, { 'r1.cr40f_ordensid': 'OS-1741' }, 'r1.cr40f_id')).toBeNull()
    expect(isPrimaryField({ ...related, attribute: 'cr40f_descricao' })).toBe(false)
    expect(primaryRecordId({ ...related, path: [], table: 'cr40f_composicaodeprecos' }, {}, 'cr40f_id', guid)).toBe(guid)
  })
})
