// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { loadState, updateTask } from '../data/mock'
import { isMultaTask, multaFechada, multaHref, MULTA_TASK_DONE_BLOCKED } from './multaTaskFlow'

afterEach(() => localStorage.clear())

describe('tarefa de multa no Planner', () => {
  it('reconhece pelo lookup ou pela origem', () => {
    expect(isMultaTask({ multaId: 'u1' })).toBe(true)
    expect(isMultaTask({ sourceType: 'multa' })).toBe(true)
    expect(isMultaTask({ sourceType: 'quote' })).toBe(false)
  })

  it('link da multa no shell', () => {
    expect(multaHref('{AB-12}')).toBe('#/frota-multas?registro=multa:ab-12')
  })

  it('multa fechada: Encerrada, Descontado e Cancelada', () => {
    expect([202410005, 202410003, 202410007].every(multaFechada)).toBe(true)
    expect(multaFechada(202410006)).toBe(false)
    expect(multaFechada(null)).toBe(false)
  })

  it('no mock, concluir à mão a tarefa da multa é recusado', () => {
    expect(() => updateTask(loadState(), 'task-multa-1', { status: 'done' })).toThrow(MULTA_TASK_DONE_BLOCKED)
  })

  it('no mock, os demais campos da tarefa da multa continuam editáveis', () => {
    const next = updateTask(loadState(), 'task-multa-1', { status: 'doing' })
    expect(next.tasks.find((t) => t.id === 'task-multa-1')?.status).toBe('doing')
  })
})
