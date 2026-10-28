// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
  render(<AssignmentFields form={form} setForm={() => {}} employees={employees} teams={[{ id: 't1', name: 'Comercial', memberIds: ['e1', 'e2', 'e3'] }]} />)
  const principal = screen.getByRole('group', { name: 'Principal' })
  expect([...principal.querySelectorAll('.assignment-person-name')].map((n) => n.textContent)).toEqual(['Renan'])
  const consultores = screen.getByRole('group', { name: 'Consultores' })
  expect([...consultores.querySelectorAll('.assignment-person-name')].map((n) => n.textContent)).toEqual(['Carlinhos', 'Deborah Keila de Paula'])
})
