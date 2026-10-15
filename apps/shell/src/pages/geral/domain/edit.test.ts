import { describe, expect, it } from 'vitest'
import { SAVED_VISIBLE_MS, buildPatch, reduceCell, validateEdit } from './edit'

describe('validateEdit', () => {
  it('aceita valores válidos e recusa os inválidos com mensagem', () => {
    expect(validateEdit('text', 'Rota A')).toBeNull()
    expect(validateEdit('text', 'x'.repeat(4001))).toBe('Texto acima de 4000 caracteres.')
    expect(validateEdit('money', -1)).toBe('Valor não pode ser negativo.')
    expect(validateEdit('money', null)).toBeNull()
    expect(validateEdit('datetime', '2026-10-08T16:00')).toBeNull()
    expect(validateEdit('datetime', '2026-13-99T99:99')).toBe('Data ou hora inválida.')
    expect(validateEdit('datetime', '')).toBeNull()
    expect(validateEdit('choice', 202410001)).toBeNull()
    expect(validateEdit('lookup', { id: 'a', nome: 'João' })).toBeNull()
    expect(validateEdit('readonly', 'x')).toBe('Este campo não pode ser editado aqui.')
  })
})

describe('buildPatch', () => {
  it('grava só o campo, no formato do tipo', () => {
    expect(buildPatch('text', 'cr40f_trajeto', ' Rota A ')).toEqual({ patch: { cr40f_trajeto: 'Rota A' } })
    expect(buildPatch('text', 'cr40f_trajeto', '')).toEqual({ patch: { cr40f_trajeto: null } })
    expect(buildPatch('choice', 'cr40f_status', 202410001)).toEqual({ patch: { cr40f_status: 202410001 } })
    expect(buildPatch('choice', 'cr40f_status', null)).toEqual({ patch: { cr40f_status: null } })
    expect(buildPatch('money', 'cr40f_cotao', 1234.567)).toEqual({ patch: { cr40f_cotao: 1234.57 } })
    expect(buildPatch('boolean', 'cr40f_receber', true)).toEqual({ patch: { cr40f_receber: true } })
    expect(buildPatch('datetime', 'cr40f_dataehorriodesada', '2026-10-08T16:00')).toEqual({ patch: { cr40f_dataehorriodesada: '2026-10-08T19:00:00.000Z' } })
    expect(buildPatch('datetime', 'cr40f_dataehorriodesada', '')).toEqual({ patch: { cr40f_dataehorriodesada: null } })
  })
  it('lookup usa bind da metadata e limpar vira DELETE da referência', () => {
    const bind = { nav: 'cr40f_Motorista', set: 'cr40f_funcionarioses' }
    expect(buildPatch('lookup', 'cr40f_motorista', { id: '{ABC-1}', nome: 'João' }, bind)).toEqual({ patch: { 'cr40f_Motorista@odata.bind': '/cr40f_funcionarioses(abc-1)' } })
    expect(buildPatch('lookup', 'cr40f_motorista', null, bind)).toEqual({ clearLookup: true })
    expect(buildPatch('lookup', 'cr40f_motorista', { id: 'x', nome: 'y' })).toBeNull()
    expect(buildPatch('readonly', 'cr40f_id', 'x')).toBeNull()
  })
})

describe('reduceCell', () => {
  it('idle -> saving -> saved -> idle, e erro mantém até reset', () => {
    const saving = reduceCell({ kind: 'idle' }, { type: 'save' })
    expect(saving).toEqual({ kind: 'saving' })
    const saved = reduceCell(saving, { type: 'ok', at: 1000 })
    expect(saved).toEqual({ kind: 'saved', at: 1000 })
    expect(reduceCell(saved, { type: 'settle' })).toEqual({ kind: 'idle' })
    const failed = reduceCell(saving, { type: 'fail', message: 'Sem permissão.' })
    expect(failed).toEqual({ kind: 'error', message: 'Sem permissão.' })
    expect(reduceCell(failed, { type: 'settle' })).toEqual(failed)
    expect(reduceCell(failed, { type: 'reset' })).toEqual({ kind: 'idle' })
    expect(reduceCell(failed, { type: 'save' })).toEqual({ kind: 'saving' })
    expect(SAVED_VISIBLE_MS).toBe(1500)
  })
})
