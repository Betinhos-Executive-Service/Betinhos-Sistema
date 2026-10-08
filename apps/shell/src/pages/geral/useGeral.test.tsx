// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createSource } from './data/source'
import { useGeral } from './useGeral'

describe('useGeral', () => {
  it('carrega a visão padrão, pagina e ordena', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    expect(result.current.view?.padrao).toBe(true)
    expect(result.current.columns[0].attribute).toBe('cr40f_id')
    expect(result.current.attributes?.get('cr40f_status')?.type).toBe('Picklist')
    act(() => result.current.goTo(2))
    await waitFor(() => expect(result.current.page).toBe(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.length).toBeGreaterThan(0)
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.page).toBe(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const ids = result.current.rows.map((r) => String(r.cr40f_id))
    expect([...ids].sort().reverse()).toEqual(ids)
  })

  it('salva com estados gravando/salvo e erro restaurando o valor', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    const row = result.current.rows[0]
    const id = String(row.cr40f_reservadeveculosid)
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    let ok = false
    await act(async () => { ok = await result.current.save(id, trajeto, 'Rota nova') })
    expect(ok).toBe(true)
    expect(result.current.cells.get(`${id}|cr40f_trajeto`)?.kind).toBe('saved')
    expect(result.current.rows[0].cr40f_trajeto).toBe('Rota nova')

    const bloqueada = result.current.rows.find((r) => r.cr40f_id === 'OS-1013')
    expect(bloqueada).toBeTruthy()
    const bid = String(bloqueada!.cr40f_reservadeveculosid)
    const antes = bloqueada!.cr40f_trajeto
    await act(async () => { ok = await result.current.save(bid, trajeto, 'Não vai') })
    expect(ok).toBe(false)
    expect(result.current.cells.get(`${bid}|cr40f_trajeto`)).toEqual({ kind: 'error', message: 'Sem permissão para alterar este serviço.' })
    expect(result.current.rows.find((r) => r.cr40f_id === 'OS-1013')?.cr40f_trajeto).toBe(antes)
  })

  it('validação barra antes do servidor', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' })))
    await waitFor(() => expect(result.current.rows.length).toBe(50))
    const id = String(result.current.rows[0].cr40f_reservadeveculosid)
    const cotacao = result.current.columns.find((c) => c.attribute === 'cr40f_cotao')!
    let ok = true
    await act(async () => { ok = await result.current.save(id, cotacao, -5) })
    expect(ok).toBe(false)
    expect(result.current.cells.get(`${id}|cr40f_cotao`)).toEqual({ kind: 'error', message: 'Valor não pode ser negativo.' })
  })
})
