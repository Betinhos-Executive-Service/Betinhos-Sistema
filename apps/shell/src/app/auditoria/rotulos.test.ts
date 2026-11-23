import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '@betinhos/ui'
import { auditLabels, auditScope, withLabels } from './source'

const evento = (id: string): AuditEvent => ({ id: `e-${id}`, at: '2026-11-23T12:00:00Z', user: 'Ana', operation: 'update', action: 'Alterou', record: { id, name: 'Registro sem nome' }, changes: [] })

describe('rótulos da auditoria', () => {
  const labels = auditLabels([{ id: 'A1', codigo: 'OP-401', cliente: 'Lumen' }, { id: 'b2', codigo: 'OP-402', cliente: '' }, { id: 'c3', codigo: '', cliente: '' }], (op) => [op.codigo, op.cliente])

  it('junta as partes preenchidas e pula linha sem rótulo', () => {
    expect(labels).toEqual({ a1: 'OP-401 · Lumen', b2: 'OP-402' })
  })

  it('troca o nome do registro pelo rótulo da lista', () => {
    const [com, sem] = withLabels([evento('a1'), evento('zz')], labels)
    expect(com.record?.name).toBe('OP-401 · Lumen')
    expect(sem.record?.name).toBe('Registro sem nome')
  })

  it('nomeia a seleção no topo', () => {
    expect(auditScope({ entity: 'x' })).toBe('Alterações recentes')
    expect(auditScope({ entity: 'x', ids: ['a1'], labels })).toBe('OP-401 · Lumen')
    expect(auditScope({ entity: 'x', ids: ['a1', 'b2'], labels })).toBe('OP-401, OP-402')
    expect(auditScope({ entity: 'x', ids: ['a1', 'b2', 'a1', 'b2', 'a1'], labels })).toBe('OP-401, OP-402, OP-401 e mais 2')
    expect(auditScope({ entity: 'x', ids: ['a1', 'c3'], labels })).toBe('2 registros')
  })
})
