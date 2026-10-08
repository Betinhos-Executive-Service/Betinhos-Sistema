// @vitest-environment jsdom
import { act, configure, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSource, type Source } from './data/source'
import { SAVED_VISIBLE_MS } from './domain/edit'
import { useGeral } from './useGeral'

// O mock sem latência (`latency: 0`); com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const F = '@OData.Community.Display.V1.FormattedValue'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const idOf = (row: { cr40f_reservadeveculosid?: unknown }) => String(row.cr40f_reservadeveculosid)

describe('useGeral', () => {
  it('carrega a visão padrão, pagina e ordena', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' }, { latency: 0 })))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.view?.padrao).toBe(true)
    expect(result.current.columns[0].attribute).toBe('cr40f_id')
    expect(result.current.attributes?.get('cr40f_status')?.type).toBe('Picklist')
    act(() => result.current.toggle(String(result.current.rows[0].cr40f_reservadeveculosid)))
    expect(result.current.selected.size).toBe(1)
    act(() => result.current.goTo(2))
    await waitFor(() => expect(result.current.page).toBe(2))
    expect(result.current.selected.size).toBe(0)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.length).toBeGreaterThan(0)
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.page).toBe(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const ids = result.current.rows.map((r) => String(r.cr40f_id))
    expect([...ids].sort().reverse()).toEqual(ids)
  })

  it('salva com estados gravando/salvo e erro restaurando o valor', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' }, { latency: 0 })))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
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
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' }, { latency: 0 })))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const id = String(result.current.rows[0].cr40f_reservadeveculosid)
    const cotacao = result.current.columns.find((c) => c.attribute === 'cr40f_cotao')!
    let ok = true
    await act(async () => { ok = await result.current.save(id, cotacao, -5) })
    expect(ok).toBe(false)
    expect(result.current.cells.get(`${id}|cr40f_cotao`)).toEqual({ kind: 'error', message: 'Valor não pode ser negativo.' })
  })
})

describe('useGeral: gravação', () => {
  it('escrita aceita e releitura que falha: mantém o valor otimista e marca salvo', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const source: Source = { ...base, reload: vi.fn().mockRejectedValue(new Error('rede caiu')) }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const id = idOf(result.current.rows[0])
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    let ok = false
    await act(async () => { ok = await result.current.save(id, trajeto, 'Rota nova') })
    expect(ok).toBe(true)
    expect(result.current.cells.get(`${id}|cr40f_trajeto`)?.kind).toBe('saved')
    expect(result.current.rows[0].cr40f_trajeto).toBe('Rota nova')
  })

  it('a releitura pede só colunas com metadata', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const reload = vi.fn(base.reload)
    const source: Source = {
      ...base,
      reload,
      views: async () => (await base.views()).map((v) => ({ ...v, layoutxml: v.layoutxml.replace('</row>', '<cell name="cr40f_sem_metadata" width="100" /></row>') })),
    }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.columns.some((c) => c.attribute === 'cr40f_sem_metadata')).toBe(true)
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    await act(async () => { await result.current.save(idOf(result.current.rows[0]), trajeto, 'Rota nova') })
    const keys = reload.mock.calls[0][1]
    expect(keys).toContain('cr40f_trajeto')
    expect(keys).toContain('_cr40f_motorista_value')
    expect(keys).not.toContain('cr40f_sem_metadata')
  })

  it('erro de escrita restaura só a chave editada, sem desfazer outra gravação da mesma linha', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const source: Source = {
      ...base,
      update: async (id, patch) => {
        if ('cr40f_trajeto' in patch) { await sleep(150); throw new Error('Não gravou') }
        return base.update(id, patch)
      },
    }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const id = idOf(result.current.rows[0])
    const antes = result.current.rows[0].cr40f_trajeto
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    const cotacao = result.current.columns.find((c) => c.attribute === 'cr40f_cotao')!
    await act(async () => {
      const falha = result.current.save(id, trajeto, 'Vai falhar')
      const certa = result.current.save(id, cotacao, 999)
      expect(await certa).toBe(true)
      expect(await falha).toBe(false)
    })
    expect(result.current.rows[0].cr40f_trajeto).toBe(antes)
    expect(result.current.rows[0].cr40f_cotao).toBe(999)
    expect(result.current.cells.get(`${id}|cr40f_trajeto`)).toEqual({ kind: 'error', message: 'Não gravou' })
  })

  it('célula alterada por flow na releitura também aparece como salva', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    let novo = 0
    const source: Source = {
      ...base,
      reload: async (id, keys) => ({ ...(await base.reload(id, keys)), cr40f_status: novo, [`cr40f_status${F}`]: 'Mudou' }),
    }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const id = idOf(result.current.rows[0])
    novo = result.current.rows[0].cr40f_status === 202410002 ? 202410001 : 202410002
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    await act(async () => { await result.current.save(id, trajeto, 'Rota nova') })
    expect(result.current.cells.get(`${id}|cr40f_status`)?.kind).toBe('saved')
    expect(result.current.rows[0].cr40f_status).toBe(novo)
    // Colunas que não mudaram ficam como estavam.
    expect(result.current.cells.get(`${id}|cr40f_cliente`)).toBeUndefined()
  })

  it('uma nova gravação na mesma célula cancela o fim do "salvo" anterior e o desmonte limpa tudo', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const { result, unmount } = renderHook(() => useGeral(base))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const id = idOf(result.current.rows[0])
    const trajeto = result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    const set = vi.spyOn(window, 'setTimeout')
    const clear = vi.spyOn(window, 'clearTimeout')
    try {
      await act(async () => { await result.current.save(id, trajeto, 'Rota 1') })
      const settle = () => set.mock.calls.flatMap((call, i) => (call[1] === SAVED_VISIBLE_MS ? [set.mock.results[i].value] : []))
      const first = settle().at(-1)
      expect(first).toBeDefined()
      clear.mockClear()
      let second: Promise<boolean> = Promise.resolve(false)
      act(() => { second = result.current.save(id, trajeto, 'Rota 2') })
      expect(clear).toHaveBeenCalledWith(first)
      await act(async () => { await second })
      const last = settle().at(-1)
      expect(last).not.toBe(first)
      clear.mockClear()
      unmount()
      expect(clear).toHaveBeenCalledWith(last)
    } finally { set.mockRestore(); clear.mockRestore() }
  })
})

describe('useGeral: atualização e ordem', () => {
  it('refresh relê a página atual sem voltar à primeira nem limpar a seleção', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const page = vi.fn(base.page)
    const source: Source = { ...base, page }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.goTo(2))
    await waitFor(() => expect(result.current.page).toBe(2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.toggle(idOf(result.current.rows[0])))
    const calls = page.mock.calls.length
    act(() => result.current.refresh())
    await waitFor(() => expect(page.mock.calls.length).toBeGreaterThan(calls))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(page.mock.calls.at(-1)?.[0].page).toBe(2)
    expect(result.current.page).toBe(2)
    expect(result.current.selected.size).toBe(1)
    // O botão Atualizar continua voltando à primeira página.
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.page).toBe(1))
    expect(result.current.selected.size).toBe(0)
  })

  it('começa sem ordenação própria e expõe a ordem da visão para o indicador', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const page = vi.fn(base.page)
    const source: Source = { ...base, page }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.sort).toBeNull()
    expect(page.mock.calls[0][0].sort).toBeNull()
    expect(result.current.defaultOrder).toEqual({ attribute: 'cr40f_dataehorriodesada', alias: null, descending: false })
  })
})
