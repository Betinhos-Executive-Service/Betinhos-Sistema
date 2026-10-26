// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUDIT_LIMIT, type Protecao } from '../domain/protecao'
import type { AttributeInfo } from '../domain/types'
import { ProtecaoContext, ProtecaoLock } from './ProtecaoLock'

const F = '@OData.Community.Display.V1.FormattedValue'
const STATUS: AttributeInfo = { logicalName: 'cr40f_status', type: 'Picklist', label: 'Status', updatable: true, targets: [], options: [{ value: 202410001, label: 'Confirmado' }, { value: 202410008, label: 'Concluído' }] }
const SNAPSHOT = JSON.stringify({ cr40f_status: '202410001' })
const COM_HISTORICO: Protecao = {
  audits: [{ changedata: JSON.stringify({ changedAttributes: [{ logicalName: 'cr40f_status', oldValue: '202410001', newValue: '202410008' }] }), createdon: '2026-10-23T19:27:00Z', [`_userid_value${F}`]: 'Keila, Deborah' }],
  snapshot: SNAPSHOT,
}

afterEach(() => { cleanup(); vi.useRealTimers() })

function setup(load: ((id: string) => Promise<Protecao>) | null = vi.fn(async () => COM_HISTORICO)) {
  render(
    <ProtecaoContext.Provider value={load}>
      <div data-testid="fora">fora</div>
      <ProtecaoLock id="os-1" attribute="cr40f_status" label="Status" atual="Concluído" info={STATUS} />
    </ProtecaoContext.Provider>,
  )
  return { load, trigger: screen.queryByRole('button', { name: /Status: campo protegido/ }) }
}

// O painel usa `popover`; o jsdom não o mostra (sem showPopover), por isso `hidden: true`.
// O painel usa `popover`, que o jsdom deixa fora da árvore acessível (sem showPopover): busca pelo rótulo.
const dialog = (label = 'Status') => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="Histórico de ${label}"]`)

describe('ProtecaoLock', () => {
  it('fora da Geral (sem provider) não mostra o cadeado', () => {
    expect(setup(null).trigger).toBeNull()
  })

  it('clique abre com carregando e depois valor atual, anterior, data, autor e o valor da Tenaris; busca uma vez', async () => {
    let resolve!: (p: Protecao) => void
    const load = vi.fn(() => new Promise<Protecao>((r) => { resolve = r }))
    const { trigger } = setup(load)
    fireEvent.click(trigger!)
    expect(trigger!.getAttribute('aria-expanded')).toBe('true')
    expect(dialog()!.textContent).toContain('Buscando histórico')
    await act(async () => resolve(COM_HISTORICO))
    const text = dialog()!.textContent!
    for (const part of ['Valor atualConcluído', 'AntesConfirmado', 'Alterado em23/10/2026 16:27', 'PorKeila, Deborah', 'A Tenaris manda hojeConfirmado']) expect(text).toContain(part)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('os-1')
  })

  it('Esc fecha e devolve o foco ao cadeado; clique fora fecha', async () => {
    const { trigger } = setup()
    trigger!.focus()
    fireEvent.click(trigger!)
    await act(async () => undefined)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger!)
    await act(async () => undefined)
    fireEvent.pointerDown(screen.getByTestId('fora'))
    expect(dialog()).toBeNull()
  })

  it('hover do mouse abre depois da pausa e fecha ao sair; toque não abre por hover', async () => {
    vi.useFakeTimers()
    const { trigger } = setup()
    fireEvent.pointerEnter(trigger!, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(500) })
    expect(dialog()).toBeNull()
    fireEvent.pointerEnter(trigger!, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(250) })
    expect(dialog()).not.toBeNull()
    fireEvent.pointerLeave(trigger!, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(200) })
    expect(dialog()).toBeNull()
  })

  it('aberto por clique, sair com o mouse não fecha; o clique não chega à linha', async () => {
    const onRowClick = vi.fn()
    render(
      <ProtecaoContext.Provider value={async () => COM_HISTORICO}>
        <div onClick={onRowClick} onDoubleClick={onRowClick}><ProtecaoLock id="os-2" attribute="cr40f_status" label="Status 2" atual="Concluído" info={STATUS} /></div>
      </ProtecaoContext.Provider>,
    )
    const trigger = screen.getByRole('button', { name: /Status 2: campo protegido/ })
    fireEvent.click(trigger)
    fireEvent.doubleClick(trigger)
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    expect(dialog('Status 2')).not.toBeNull()
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('sem permissão de auditoria mostra o aviso, o valor atual e o da Tenaris', async () => {
    const { trigger } = setup(async () => ({ audits: 'sem-permissao', snapshot: SNAPSHOT }))
    fireEvent.click(trigger!)
    await act(async () => undefined)
    const text = dialog()!.textContent!
    expect(text).toContain('Seu perfil não tem acesso à auditoria')
    expect(text).toContain('Valor atualConcluído')
    expect(text).toContain('A Tenaris manda hojeConfirmado')
    expect(text).not.toContain('Alterado em')
  })

  it('sem histórico do campo e sem snapshot', async () => {
    const { trigger } = setup(async () => ({ audits: [], snapshot: null }))
    fireEvent.click(trigger!)
    await act(async () => undefined)
    expect(dialog()!.textContent).toContain('Nenhuma alteração deste campo na auditoria.')
    expect(dialog()!.textContent).not.toContain('Tenaris manda')
  })

  it('histórico cortado no limite não afirma que não houve alteração', async () => {
    const outros = Array.from({ length: AUDIT_LIMIT }, () => ({ changedata: JSON.stringify({ changedAttributes: [{ logicalName: 'new_visualizacaodomotorista', oldValue: 'a', newValue: 'b' }] }), createdon: '2026-10-26T10:00:00Z' }))
    const { trigger } = setup(async () => ({ audits: outros, snapshot: null }))
    fireEvent.click(trigger!)
    await act(async () => undefined)
    expect(dialog()!.textContent).toContain(`anterior às últimas ${AUDIT_LIMIT} mudanças`)
  })

  it('erro na busca aparece no popover', async () => {
    const { trigger } = setup(async () => { throw new Error('HTTP 500') })
    fireEvent.click(trigger!)
    await act(async () => undefined)
    expect(dialog()!.textContent).toContain('Não foi possível carregar o histórico. HTTP 500')
  })
})
