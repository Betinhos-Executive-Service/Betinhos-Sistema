import { describe, expect, it } from 'vitest'
import { DRAFT_KEY, PENDING_KEY, clearDraft, clearPending, nextStep, readDraft, readPending, writeDraft, writePending, type KV, type Pending } from './submission'
import { emptyForm } from './form'

function memory() {
  const data = new Map<string, string>()
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
  return { kv, data }
}

describe('pendência', () => {
  const p: Pending = { recordId: 'r1', signature: 's', phase: 'record-created', fileName: 'cv.pdf' }
  it('decide o próximo passo', () => {
    expect(nextStep(null, 's', true)).toBe('create')
    expect(nextStep(p, 'outra', true)).toBe('create')
    expect(nextStep(p, 's', true)).toBe('upload')
    expect(nextStep(p, 's', false)).toBe('need-file')
    expect(nextStep({ ...p, fileName: '' }, 's', false)).toBe('done')
    expect(nextStep({ ...p, fileName: '' }, 's', true)).toBe('done')
    expect(nextStep({ ...p, phase: 'upload-completed', webUrl: 'https://s/x' }, 's', false)).toBe('link')
  })
  it('lê, grava e descarta pendência inválida', () => {
    const { kv, data } = memory()
    expect(writePending(kv, p)).toBe(true)
    expect(readPending(kv)).toEqual(p)
    const broken: KV = { getItem: () => null, setItem: () => { throw new Error('cheio') }, removeItem: () => {} }
    expect(writePending(broken, p)).toBe(false)
    kv.setItem(PENDING_KEY, '{"recordId":1}')
    expect(readPending(kv)).toBeNull()
    expect(data.has(PENDING_KEY)).toBe(false)
    kv.setItem(PENDING_KEY, 'não é json')
    expect(readPending(kv)).toBeNull()
    writePending(kv, p)
    clearPending(kv)
    expect(readPending(kv)).toBeNull()
  })
})

describe('rascunho', () => {
  it('restaura só os campos conhecidos', () => {
    const { kv } = memory()
    const base = emptyForm(100000000)
    expect(readDraft(kv, base)).toBeNull()
    writeDraft(kv, { ...base, nome: 'Ana' })
    expect(readDraft(kv, base)).toEqual({ ...base, nome: 'Ana' })
    kv.setItem(DRAFT_KEY, JSON.stringify({ nome: 'Bia', extra: 'x', nota: 5 }))
    expect(readDraft(kv, base)).toEqual({ ...base, nome: 'Bia' })
    kv.setItem(DRAFT_KEY, JSON.stringify({ status: '100000004' }))
    expect(readDraft(kv, base)).toBeNull()
    clearDraft(kv)
    expect(readDraft(kv, base)).toBeNull()
  })
})
