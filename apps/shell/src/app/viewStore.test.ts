import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { createDataverseViewStore, withBuiltinViews, VIEW_ENTITY_SET } from './viewStore'

const USER = 'AAAA0000-0000-0000-0000-000000000001'
const TEAM = 'bbbb0000-0000-0000-0000-000000000002'
const OTHER = 'cccc0000-0000-0000-0000-000000000003'

function fakeClient(roles: string[] = []) {
  const request = vi.fn(async (path: string) => {
    if (path === 'WhoAmI') return { UserId: USER }
    if (path.startsWith('teams?')) return { value: [{ teamid: TEAM }] }
    if (path.startsWith(`${VIEW_ENTITY_SET}?`)) {
      return {
        value: [
          { cr40f_visaodetabelaid: 'v1', cr40f_name: 'Minha', cr40f_configuracao: '{"v":1}', cr40f_ordem: null, _ownerid_value: USER.toLowerCase() },
          { cr40f_visaodetabelaid: 'v2', cr40f_name: 'Para todos', cr40f_configuracao: '{}', cr40f_ordem: 2, _ownerid_value: TEAM },
          { cr40f_visaodetabelaid: 'v3', cr40f_name: 'De outra pessoa', cr40f_configuracao: '{}', cr40f_ordem: null, _ownerid_value: OTHER },
        ],
      }
    }
    if (path.includes('systemuserroles_association')) return { value: roles.map((name) => ({ name })) }
    throw new Error(`caminho inesperado ${path}`)
  })
  const client = { apiUrl: '', request, getAll: vi.fn(), create: vi.fn(async () => '{dddd0000-0000-0000-0000-000000000004}'), update: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
  return client as unknown as DataverseClient & { request: typeof request; create: typeof client.create; update: typeof client.update }
}

describe('createDataverseViewStore', () => {
  it('lista as visões da tela marcando as minhas e as públicas (dona é a equipe)', async () => {
    const client = fakeClient()
    const list = await createDataverseViewStore(client).list("pessoas'x")
    expect(list.map((v) => [v.id, v.mine, v.publica, v.ordem])).toEqual([['v1', true, false, undefined], ['v2', false, true, 2], ['v3', false, false, undefined]])
    expect(client.request.mock.calls.some(([p]) => String(p).includes("cr40f_tela eq 'pessoas''x'"))).toBe(true)
  })

  it('cria, regrava e publica atribuindo à equipe', async () => {
    const client = fakeClient()
    const store = createDataverseViewStore(client)
    const created = await store.create('pessoas', 'Nova', '{"v":1}')
    expect(created).toMatchObject({ id: 'dddd0000-0000-0000-0000-000000000004', mine: true, publica: false })
    expect(client.create).toHaveBeenCalledWith(VIEW_ENTITY_SET, { cr40f_name: 'Nova', cr40f_tela: 'pessoas', cr40f_configuracao: '{"v":1}', cr40f_publica: false })
    await store.update('v1', { name: 'Outro' })
    expect(client.update).toHaveBeenLastCalledWith(VIEW_ENTITY_SET, 'v1', { cr40f_name: 'Outro' })
    await store.publish('v1')
    expect(client.update).toHaveBeenLastCalledWith(VIEW_ENTITY_SET, 'v1', { 'ownerid@odata.bind': `/teams(${TEAM})`, cr40f_publica: true })
  })

  it('só gestor de visões ou administrador publica', async () => {
    expect(await createDataverseViewStore(fakeClient(['Acesso-Betinhos-MDA'])).canPublish()).toBe(false)
    expect(await createDataverseViewStore(fakeClient(['Gestor de visões'])).canPublish()).toBe(true)
    expect(await createDataverseViewStore(fakeClient(['System Administrator'])).canPublish()).toBe(true)
  })
})

describe('withBuiltinViews', () => {
  it('põe as visões prontas como públicas no topo e recusa alterar ou excluir', async () => {
    const store = withBuiltinViews(createDataverseViewStore(fakeClient()), () => [{ id: 'ativos', name: 'Ativos', publica: true, mine: false, config: '{}' }])
    const list = await store.list('pessoas')
    expect(list[0]).toMatchObject({ id: 'pronta:ativos', publica: true, mine: false })
    await expect(store.update('pronta:ativos', { name: 'x' })).rejects.toThrow('Visões prontas não podem ser alteradas')
    await expect(store.remove('pronta:ativos')).rejects.toThrow()
    await expect(store.update('v1', { name: 'ok' })).resolves.toBeUndefined()
  })
})
