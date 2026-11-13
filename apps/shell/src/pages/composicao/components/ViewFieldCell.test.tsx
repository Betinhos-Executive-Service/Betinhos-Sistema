// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewFieldCell } from './ViewFieldCell'
import type { CatalogField } from '../data/views'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const field: CatalogField = { id: 'r1.cr40f_id', label: 'ID', table: 'cr40f_ordens', tableLabel: 'Ordens', attribute: 'cr40f_id', primaryIdAttribute: 'cr40f_ordensid', primaryNameAttribute: 'cr40f_id', path: ['cr40f_ordens'], relationships: [{ from: 'cr40f_ordensid', to: 'cr40f_ordem' }], type: 'String', available: true }

describe('célula de coluna dinâmica', () => {
  it('abre a coluna primária da tabela relacionada pelo GUID, mantendo o código visível', () => {
    const openForm = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { openForm } })
    render(<ViewFieldCell field={field} value="OS-1741" valueKey="r1.cr40f_id" viewFields={{ 'r1.cr40f_ordensid': 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa' }} baseRecordId="base-id" />)
    expect(screen.getByRole('tooltip').textContent).toContain('Ordens')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Ordens: OS-1741' }))
    expect(openForm).toHaveBeenCalledWith({ entityName: 'cr40f_ordens', entityId: 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa' })
  })

  it('usa o Formulário Geral ao clicar no ID primário da Geral', () => {
    const navigateTo = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo, openForm: vi.fn(async () => undefined) } })
    const general = { ...field, table: 'cr40f_reservadeveculos', tableLabel: 'Geral' }
    render(<ViewFieldCell field={general} value="OS-1741" valueKey="r1.cr40f_id" viewFields={{ 'r1.cr40f_ordensid': 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa' }} baseRecordId="base-id" />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Geral: OS-1741' }))
    expect(navigateTo).toHaveBeenCalledOnce()
  })

  it('lookup de tabela sem tela no shell abre o registro no painel lateral do model-driven', () => {
    const navigateTo = vi.fn(async () => undefined)
    vi.stubGlobal('Xrm', { Navigation: { navigateTo } })
    const motorista = { ...field, id: 'cr40f_motorista', label: 'Motorista', table: 'cr40f_composicao', attribute: 'cr40f_motorista', path: [], relationships: [], type: 'Lookup' }
    const id = 'e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa'
    render(<ViewFieldCell field={motorista} value={id} formatted="Mauricio Amaral" valueKey="cr40f_motorista" viewFields={{ '_cr40f_motorista_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'cr40f_solicitantes' }} baseRecordId="base-id" />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Motorista: Mauricio Amaral' }))
    expect(navigateTo).toHaveBeenCalledWith({ pageType: 'entityrecord', entityName: 'cr40f_solicitantes', entityId: id }, { target: 2, position: 2, width: { value: 50, unit: '%' } })
  })

  it('lookup sem a tabela do registro fica só como texto', () => {
    const motorista = { ...field, label: 'Motorista', attribute: 'cr40f_motorista', path: [], relationships: [], type: 'Lookup' }
    render(<ViewFieldCell field={motorista} value="e8b7c267-b4a9-4e0c-91c3-c5a72b6965fa" formatted="Mauricio Amaral" valueKey="cr40f_motorista" baseRecordId="base-id" />)
    expect(screen.getByText('Mauricio Amaral')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('mostra booleano e data em formato legível', () => {
    const { rerender } = render(<ViewFieldCell field={{ ...field, type: 'Boolean', attribute: 'cr40f_programado' }} value={false} valueKey="r1.cr40f_programado" baseRecordId="base-id" />)
    expect(screen.getByText('Não')).toBeTruthy()
    rerender(<ViewFieldCell field={{ ...field, type: 'DateTime', attribute: 'cr40f_visualizacao' }} value="2026-07-28T15:29:00" valueKey="r1.cr40f_visualizacao" baseRecordId="base-id" />)
    expect(screen.getByText('28/07/2026 15:29')).toBeTruthy()
  })
})
