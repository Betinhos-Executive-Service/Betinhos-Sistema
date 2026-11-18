// @vitest-environment jsdom
import { act, configure, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TableFilters } from '@betinhos/ui'
import { createSource, type Source } from './data/source'
import { GROUPS_LIMIT_MESSAGE } from './domain/grouping'
import { ID_ATTRIBUTE } from './domain/types'
import { useGeral } from './useGeral'
import { useGeralViewState } from './useGeralViewState'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

const STATUS = { key: 'cr40f_status' }
const gate = () => { let open!: () => void; const wait = new Promise<void>((resolve) => { open = resolve }); return { wait, open } }

async function agrupado(wrap: (base: Source) => Source = (s) => s) {
  const base = createSource({ mode: 'mock' }, { latency: 0 })
  const source = wrap(base)
  const hook = renderHook(() => useGeral(source))
  await waitFor(() => expect(hook.result.current.rows.length).toBe(100))
  act(() => hook.result.current.setGroup(STATUS))
  await waitFor(() => expect(hook.result.current.buckets?.length).toBeGreaterThan(1))
  return hook
}
const open = async (hook: Awaited<ReturnType<typeof agrupado>>, index: number) => {
  const id = hook.result.current.buckets![index].id
  act(() => hook.result.current.toggleGroup(id))
  await waitFor(() => expect(hook.result.current.groupLoads.get(id)?.loading).toBe(false))
  return id
}

describe('useGeral: releitura dos grupos', () => {
  it('mescla com o estado atual: grupo aberto durante a espera continua aberto', async () => {
    const hold = gate()
    let slow = false
    const hook = await agrupado((base) => ({ ...base, groups: async (req) => { if (slow) await hold.wait; return base.groups(req) } }))
    const first = await open(hook, 0)
    slow = true
    act(() => hook.result.current.reload())
    const second = hook.result.current.buckets![1].id
    act(() => hook.result.current.toggleGroup(second))
    await waitFor(() => expect(hook.result.current.groupLoads.get(second)?.ids.length).toBeGreaterThan(0))
    hold.open()
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect([...hook.result.current.groupLoads.keys()].sort()).toEqual([first, second].sort())
    expect(hook.result.current.groupLoads.get(second)?.ids.length).toBeGreaterThan(0)
    expect(hook.result.current.groupLoads.get(first)?.ids.length).toBeGreaterThan(0)
  })

  it('falha na releitura tira o "carregando" do grupo que estava a caminho', async () => {
    const hold = gate()
    let stall = false
    let fail = false
    const hook = await agrupado((base) => ({
      ...base,
      groups: async (req) => { if (fail) throw new Error('Falhou'); return base.groups(req) },
      page: async (req) => { if (stall && req.group) await hold.wait; return base.page(req) },
    }))
    const id = hook.result.current.buckets![0].id
    stall = true
    act(() => hook.result.current.toggleGroup(id))
    await waitFor(() => expect(hook.result.current.groupLoads.get(id)?.loading).toBe(true))
    fail = true
    act(() => hook.result.current.reload())
    await waitFor(() => expect(hook.result.current.pageError).toBe('Falhou'))
    expect(hook.result.current.groupLoads.get(id)?.loading).toBe(false)
    hold.open()
  })

  it('lê os grupos abertos em paralelo', async () => {
    let measuring = false
    let running = 0
    let peak = 0
    const hook = await agrupado((base) => ({
      ...base,
      page: async (req) => {
        if (!measuring || !req.group) return base.page(req)
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 20))
        running -= 1
        return base.page(req)
      },
    }))
    await open(hook, 0)
    await open(hook, 1)
    measuring = true
    act(() => hook.result.current.reload())
    await waitFor(() => expect(hook.result.current.loading).toBe(false))
    expect(peak).toBe(2)
  })
})

describe('useGeral: agregado recusado', () => {
  it('avisa, tira o agrupamento e volta para a lista sem agrupar', async () => {
    const base = createSource({ mode: 'mock' }, { latency: 0 })
    const source: Source = { ...base, groups: async () => { throw new Error(GROUPS_LIMIT_MESSAGE) } }
    const { result } = renderHook(() => useGeral(source))
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    act(() => result.current.setGroup(STATUS))
    await waitFor(() => expect(result.current.groupNotice).toBe(GROUPS_LIMIT_MESSAGE))
    await waitFor(() => expect(result.current.group).toBeNull())
    await waitFor(() => expect(result.current.rows.length).toBe(100))
    expect(result.current.pageError).toBeNull()
    act(() => result.current.setGroup(STATUS))
    expect(result.current.groupNotice).toBeNull()
  })
})

describe('useGeral: edição na coluna agrupada', () => {
  it('relê os grupos para a linha ir ao grupo novo', async () => {
    const groups = vi.fn()
    const hook = await agrupado((base) => ({ ...base, groups: async (req) => { groups(); return base.groups(req) } }))
    const id = await open(hook, 0)
    const rowId = hook.result.current.groupLoads.get(id)!.ids[0]
    const row = hook.result.current.rows.find((r) => String(r[ID_ATTRIBUTE]) === rowId)!
    const antes = groups.mock.calls.length
    const status = hook.result.current.columns.find((c) => c.attribute === 'cr40f_status')!
    await act(async () => { await hook.result.current.save(String(row[ID_ATTRIBUTE]), status, 202410002) })
    await waitFor(() => expect(groups.mock.calls.length).toBe(antes + 1))
    // Outra coluna não relê os grupos.
    const trajeto = hook.result.current.columns.find((c) => c.attribute === 'cr40f_trajeto')!
    await act(async () => { await hook.result.current.save(String(row[ID_ATTRIBUTE]), trajeto, 'Rota') })
    expect(groups.mock.calls.length).toBe(antes + 1)
  })
})

describe('agrupamento e visões', () => {
  it('reloadViews (Salvar e Salvar como) mantém o agrupamento; trocar de visão o limpa', async () => {
    const hook = await agrupado()
    const view = hook.result.current.view!
    await act(async () => { await hook.result.current.reloadViews(view.id) })
    expect(hook.result.current.group).toEqual(STATUS)
    await act(async () => { await hook.result.current.reloadViews() })
    expect(hook.result.current.group).toEqual(STATUS)
    act(() => hook.result.current.selectView(view.id))
    expect(hook.result.current.group).toBeNull()
  })

  it('o agrupamento não marca a visão como alterada', async () => {
    const hook = await agrupado()
    const g = hook.result.current
    const filters = g.filters as TableFilters
    const state = renderHook(({ group }) => useGeralViewState({
      views: g.views, view: g.view, viewsError: null, columns: g.columns, attributes: g.attributes, prefs: null, setPrefs: () => undefined,
      sort: null, setSort: () => undefined, filters, setFilters: () => undefined, group, setGroup: () => undefined,
      selectView: () => undefined, reloadViews: async () => undefined, createView: async () => 'x', updateView: async () => undefined,
      renameView: async () => undefined, deleteView: async () => undefined, manutencoesAlteradas: false, resetManutencoes: () => undefined, kv: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    }), { initialProps: { group: null as typeof STATUS | null } })
    expect(state.result.current.state.dirty).toBe(false)
    state.rerender({ group: STATUS })
    expect(state.result.current.state.config.group).toEqual(STATUS)
    expect(state.result.current.state.dirty).toBe(false)
  })
})
