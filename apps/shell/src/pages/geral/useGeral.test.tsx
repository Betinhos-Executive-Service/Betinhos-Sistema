// @vitest-environment jsdom
import { act, configure, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOCK_ROW_COUNT } from './data/mock'
import { createSource, type Source } from './data/source'
import { SAVED_VISIBLE_MS } from './domain/edit'
import type { Filter } from './domain/filters'
import { useGeral } from './useGeral'

// O mock sem latência (`latency: 0`); com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const F = '@OData.Community.Display.V1.FormattedValue'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const idOf = (row: { cr40f_reservadeveculosid?: unknown }) => String(row.cr40f_reservadeveculosid)

describe('useGeral', () => {
  it('carrega a visão padrão, seleciona e ordena', async () => {
    const { result } = renderHook(() => useGeral(createSource({ mode: 'mock' }, { latency: 0 })))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.view?.padrao).toBe(true)
    expect(result.current.columns[0].attribute).toBe('cr40f_id')
    expect(result.current.attributes?.get('cr40f_status')?.type).toBe('Picklist')
    act(() => result.current.toggle(idOf(result.current.rows[0])))
    expect(result.current.selected.size).toBe(1)
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.selected.size).toBe(0))
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

const open = async (source: Source) => {
  const hook = renderHook(() => useGeral(source))
  await waitFor(() => expect(hook.result.current.rows.length).toBe(100))
  return hook
}

describe('useGeral: rolagem infinita', () => {
  it('abre com 100 linhas, mais páginas e total, e acumula sem repetir ids', async () => {
    const { result } = await open(createSource({ mode: 'mock' }, { latency: 0 }))
    expect(result.current.more).toBe(true)
    expect(result.current.pagesLoaded).toBe(1)
    await waitFor(() => expect(result.current.total).toBe(MOCK_ROW_COUNT))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    expect(result.current.loadingMore).toBe(false)
    expect(result.current.more).toBe(true)
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(MOCK_ROW_COUNT))
    expect(result.current.more).toBe(false)
    expect(result.current.pagesLoaded).toBe(3)
    const ids = result.current.rows.map(idOf)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('loadMore sem mais páginas não chama a fonte', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const page = vi.fn(base.page)
    const { result } = await open({ ...base, page })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.more).toBe(false))
    const calls = page.mock.calls.length
    act(() => result.current.loadMore())
    await sleep(20)
    expect(page.mock.calls.length).toBe(calls)
  })

  it('trocar a ordenação volta a 100 linhas e à página 1', async () => {
    const { result } = await open(createSource({ mode: 'mock' }, { latency: 0 }))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    act(() => result.current.toggle(idOf(result.current.rows[0])))
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.pagesLoaded).toBe(1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows.length).toBe(100)
    expect(result.current.selected.size).toBe(0)
  })

  it('reload com duas páginas carregadas mantém 200 linhas e a seleção dos ids presentes', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const page = vi.fn(base.page)
    const { result } = await open({ ...base, page })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    const chosen = idOf(result.current.rows[150])
    act(() => result.current.toggle(chosen))
    act(() => result.current.toggle('id-que-nao-existe-mais'))
    const calls = page.mock.calls.length
    act(() => result.current.reload())
    await waitFor(() => expect(page.mock.calls.length).toBe(calls + 2))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(page.mock.calls.slice(calls).map((c) => c[0].page)).toEqual([1, 2])
    expect(result.current.rows.length).toBe(200)
    expect(result.current.pagesLoaded).toBe(2)
    expect([...result.current.selected]).toEqual([chosen])
  })

  it('toggleAll marca e desmarca todas as linhas carregadas', async () => {
    const { result } = await open(createSource({ mode: 'mock' }, { latency: 0 }))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    act(() => result.current.toggleAll())
    expect(result.current.selected.size).toBe(200)
    act(() => result.current.toggleAll())
    expect(result.current.selected.size).toBe(0)
  })

  it('descarta a resposta de uma ordem antiga que chega depois', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const spy: Source = {
      ...base,
      page: vi.fn(async (req) => {
        // A primeira ordem (a da visão) demora; a ordem nova responde na hora.
        if (req.sort == null) await gate
        return base.page(req)
      }),
    }
    const { result } = renderHook(() => useGeral(spy))
    await waitFor(() => expect(spy.page).toHaveBeenCalled())
    act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: true }))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    const ordered = result.current.rows.map((r) => String(r.cr40f_id))
    expect([...ordered].sort().reverse()).toEqual(ordered)
    await act(async () => { release(); await sleep(20) })
    expect(result.current.rows.map((r) => String(r.cr40f_id))).toEqual(ordered)
    expect(result.current.pagesLoaded).toBe(1)
  })

  it('cookie repetido para a carga com erro, sem duplicar, e retryLoadMore limpa o erro', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    let stuck = true
    const page = vi.fn(async (req: Parameters<Source['page']>[0]) => {
      const result = await base.page(req)
      return { ...result, cookie: stuck ? 'fixo' : `c${req.page}` }
    })
    const { result } = await open({ ...base, page })
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.loadError).toBe('A consulta não avançou. Tente atualizar.'))
    expect(result.current.rows.length).toBe(100)
    expect(result.current.loadingMore).toBe(false)
    expect(result.current.pagesLoaded).toBe(1)
    // Com erro pendente, loadMore não pede de novo.
    const calls = page.mock.calls.length
    act(() => result.current.loadMore())
    expect(page.mock.calls.length).toBe(calls)
    stuck = false
    act(() => result.current.retryLoadMore())
    await waitFor(() => expect(result.current.rows.length).toBe(200))
    expect(result.current.loadError).toBeNull()
    expect(new Set(result.current.rows.map(idOf)).size).toBe(200)
  })

  it('sem total na resposta, a contagem chega em paralelo sem travar a lista', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const count = vi.fn(async () => 220)
    const { result } = await open({ ...base, page: async (req) => ({ ...(await base.page(req)), total: null }), count })
    await waitFor(() => expect(result.current.total).toBe(220))
    expect(count).toHaveBeenCalledTimes(1)
  })

  describe('filtros e estado da URL', () => {
    const CANCELADO = 202410002
    const status: Filter = { kind: 'choice', op: 'in', values: [CANCELADO] }
    const make = () => createSource({ mode: 'mock' }, { latency: 0 })

    it('filtro de status reduz as linhas e limpar volta a 100', async () => {
      const { result } = renderHook(() => useGeral(make()))
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      await waitFor(() => expect(result.current.attributes).not.toBeNull())
      act(() => result.current.toggle(idOf(result.current.rows[0])))
      expect(result.current.selected.size).toBe(1)
      act(() => result.current.setFilter('cr40f_status', status))
      await waitFor(() => expect(result.current.rows.length).toBeLessThan(100))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.rows.length).toBeGreaterThan(0)
      expect(result.current.rows.every((r) => r.cr40f_status === CANCELADO)).toBe(true)
      expect(result.current.selected.size).toBe(0)
      expect(result.current.total).toBe(result.current.rows.length)
      act(() => result.current.clearFilters())
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      expect(result.current.filters).toEqual({})
    })

    it('setFilter com null ou filtro vazio remove o filtro sem recarregar', async () => {
      const source = make()
      const page = vi.fn(source.page)
      const { result } = renderHook(() => useGeral({ ...source, page }))
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      await waitFor(() => expect(result.current.attributes).not.toBeNull())
      act(() => result.current.setFilter('cr40f_status', status))
      await waitFor(() => expect(result.current.rows.length).toBeLessThan(100))
      act(() => result.current.setFilter('cr40f_status', { kind: 'choice', op: 'in', values: [] }))
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      expect(result.current.filters).toEqual({})
      const calls = page.mock.calls.length
      act(() => result.current.setFilter('cr40f_status', null))
      act(() => result.current.clearFilters())
      await sleep(50)
      expect(page.mock.calls.length).toBe(calls)
    })

    it('trocar de visão limpa os filtros', async () => {
      const { result } = renderHook(() => useGeral(make()))
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      act(() => result.current.setFilter('cr40f_status', status))
      expect(Object.keys(result.current.filters)).toEqual(['cr40f_status'])
      act(() => result.current.selectView('mock-hoje'))
      expect(result.current.filters).toEqual({})
    })

    it('estado inicial da URL aplica visão, busca, ordem e filtros', async () => {
      const initial = { view: 'mock-sem-motorista', q: 'OS-1', sort: { attribute: 'cr40f_id', alias: null, descending: true }, filters: { cr40f_status: status } }
      const { result } = renderHook(() => useGeral(make(), { initial }))
      await waitFor(() => expect(result.current.view?.id).toBe('mock-sem-motorista'))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.query).toBe('OS-1')
      expect(result.current.sort).toEqual(initial.sort)
      expect(result.current.filters).toEqual(initial.filters)
      expect(result.current.rows.every((r) => r.cr40f_status === CANCELADO && String(r.cr40f_id).includes('OS-1'))).toBe(true)
      const ids = result.current.rows.map((r) => String(r.cr40f_id))
      expect([...ids].sort().reverse()).toEqual(ids)
    })

    it('com filtro inicial a primeira consulta espera a metadata e já sai filtrada', async () => {
      const source = make()
      const page = vi.fn(source.page)
      const { result } = renderHook(() => useGeral({ ...source, page }, { initial: { filters: { cr40f_status: status } } }))
      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(page).toHaveBeenCalledTimes(1)
      expect(page.mock.calls[0][0].fetchxml).toContain('cr40f_status')
      expect(result.current.rows.every((r) => r.cr40f_status === CANCELADO)).toBe(true)
    })

    it('visão inexistente na URL cai na padrão e mantém o resto', async () => {
      const { result } = renderHook(() => useGeral(make(), { initial: { view: 'nao-existe', q: 'OS-10' } }))
      await waitFor(() => expect(result.current.view?.padrao).toBe(true))
      expect(result.current.query).toBe('OS-10')
    })

    it('onStateChange recebe visão, busca, ordem e filtros uma vez por mudança', async () => {
      const onStateChange = vi.fn()
      const { result } = renderHook(() => useGeral(make(), { onStateChange }))
      await waitFor(() => expect(result.current.rows.length).toBe(100))
      await waitFor(() => expect(onStateChange).toHaveBeenCalled())
      expect(onStateChange).toHaveBeenCalledTimes(1)
      expect(onStateChange).toHaveBeenLastCalledWith({ view: 'mock-agenda' })
      act(() => result.current.setQuery('OS-10'))
      act(() => result.current.setSort({ attribute: 'cr40f_id', alias: null, descending: false }))
      act(() => result.current.setFilter('cr40f_status', status))
      await waitFor(() => expect(onStateChange).toHaveBeenCalledTimes(4))
      expect(onStateChange).toHaveBeenLastCalledWith({
        view: 'mock-agenda', q: 'OS-10', sort: { attribute: 'cr40f_id', alias: null, descending: false }, filters: { cr40f_status: status },
      })
      await sleep(50)
      expect(onStateChange).toHaveBeenCalledTimes(4)
    })
  })
})
