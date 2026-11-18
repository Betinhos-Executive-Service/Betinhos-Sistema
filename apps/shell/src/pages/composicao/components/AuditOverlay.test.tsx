// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuditOverlay } from './AuditOverlay'

vi.mock('../data/audit', () => ({
  loadAudit: vi.fn(async () => ({
    records: [{ auditid: 'a1', createdon: '2026-09-22T12:25:00Z', operation: 2, _objectid_value: 'c1', userid: { fullname: 'Operador' }, changedata: '{"changedAttributes":[{}]}' }],
    fieldNames: {},
    recordNames: { c1: 'CP-1741' },
  })),
  loadAuditDetails: vi.fn(async () => [{ field: 'Pedágios', before: '', after: '120,00' }]),
}))

afterEach(cleanup)

describe('visualização da auditoria', () => {
  it('permite abrir detalhes pelo teclado e comparar valores', async () => {
    render(<AuditOverlay ids={[]} onClose={vi.fn()} />)
    const open = await screen.findByRole('button', { name: /Ver auditoria de CP-1741/ })
    fireEvent.click(open)
    expect(await screen.findByText('Pedágios')).toBeTruthy()
    expect(screen.getByText('Vazio')).toBeTruthy()
    expect(screen.getByText('120,00')).toBeTruthy()
    expect(screen.getByText('Mostrando 1–1 de 1')).toBeTruthy()
  })

  it('filtra a lista e oferece limpar pesquisa', async () => {
    render(<AuditOverlay ids={[]} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: /Ver auditoria de CP-1741/ })
    fireEvent.change(screen.getByRole('textbox', { name: 'Pesquisar histórico' }), { target: { value: 'inexistente' } })
    expect(screen.getByText('Nenhum resultado para esta pesquisa')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Ver auditoria de CP-1741/ })).toBeTruthy())
  })
})
