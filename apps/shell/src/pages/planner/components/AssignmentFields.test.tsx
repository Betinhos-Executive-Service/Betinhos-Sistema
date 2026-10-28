// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import AssignmentFields from './AssignmentFields'

afterEach(cleanup)

it('mostra o apelido do principal e dos consultores herdados da equipe', () => {
  const employees = [
    { id: 'e1', name: 'Renan Rodrigues Mendonça dos Santos', apelido: 'Renan' },
    { id: 'e2', name: 'Carlos Alberto de Paula Júnior', apelido: 'Carlinhos' },
    { id: 'e3', name: 'Deborah Keila de Paula', apelido: '' },
  ]
  const form = { assignmentMode: 'team', teamIds: ['t1'], primaryAssigneeId: 'e1', consultantIds: ['e2', 'e3'] }
  const { container } = render(<AssignmentFields form={form} setForm={() => {}} employees={employees} teams={[{ id: 't1', name: 'Comercial', memberIds: ['e1', 'e2', 'e3'] }]} />)
  const summary = container.querySelector('.assignment-summary')!
  expect(summary.getAttribute('title')).toBe('Principal: Renan · Consultores: Carlinhos, Deborah Keila de Paula')
  expect([...summary.querySelectorAll('.assignment-stack .avatar')].map((n) => n.textContent)).toEqual(['R', 'C', 'DK'])
  expect(summary.querySelector('.assignment-summary-text')?.textContent).toBe('Renan e 2 consultores')
})
