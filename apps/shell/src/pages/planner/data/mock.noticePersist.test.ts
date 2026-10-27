// Avisos no mock: a cópia local guarda os avisos de todos e a leitura sobrevive ao recarregar.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuote, loadState, markNotificationRead, resetState, saveState, withDailyNotifications, type MockState } from './mock'

const values = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) })
afterAll(() => { vi.unstubAllGlobals() })

const input = { client: 'Tenaris', notes: 'GRU', deadline: '2026-10-27', actorEmployeeId: 'employee-renan', financeIds: ['employee-fin', 'employee-fin2'], today: '2026-10-27' }
// O hook guarda só os avisos do usuário atual (loadNotifications filtra por destinatário).
const onlyFor = (state: MockState, id: string): MockState => ({ ...state, notifications: withDailyNotifications(loadState()).notifications!.filter((n) => n.recipientEmployeeId === id) })

describe('avisos persistidos no mock', () => {
  beforeEach(() => { values.clear(); resetState() })

  it('salvar com a lista filtrada não apaga os avisos dos outros membros', () => {
    createQuote(loadState(), input)
    saveState(onlyFor(loadState(), 'employee-fin'))
    expect(loadState().notifications!.some((n) => n.recipientEmployeeId === 'employee-fin2' && n.type === 'quote_urgent')).toBe(true)
  })

  it('aviso marcado como lido continua lido depois de recarregar', () => {
    createQuote(loadState(), input)
    const mine = onlyFor(loadState(), 'employee-fin')
    const target = mine.notifications!.find((n) => n.type === 'quote_urgent')!
    markNotificationRead(mine, target.id)
    // Outra ação salva a cópia confirmada do hook, que ainda tem o aviso como não lido.
    saveState(mine)
    const reloaded = withDailyNotifications(loadState()).notifications!.filter((n) => n.dedupeKey === target.dedupeKey)
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0].readAt).not.toBe('')
  })

  it('aviso diário marcado como lido continua lido depois de recarregar', () => {
    const mine = onlyFor(loadState(), 'employee-renan')
    const target = mine.notifications!.find((n) => n.dedupeKey && !n.readAt)
    if (!target) return
    markNotificationRead(mine, target.id)
    saveState(mine)
    const reloaded = withDailyNotifications(loadState()).notifications!.filter((n) => n.dedupeKey === target.dedupeKey)
    expect(reloaded.map((n) => Boolean(n.readAt))).toEqual([true])
  })
})
