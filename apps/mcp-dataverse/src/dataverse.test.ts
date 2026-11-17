import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataverseError, DataverseSession, buildQuery, odataLiteral } from './dataverse'
import { baseRoute, env, entityRow, json, mockFetch, tokenReply } from './helpers.test-util'
import { errorResult } from './format'

afterEach(() => vi.unstubAllGlobals())

describe('buildQuery', () => {
  it('codifica com %20, ignora vazios e mantém o $', () => {
    expect(buildQuery({ $select: 'a,b', $filter: "name eq 'x y'", $top: 5, $orderby: '', $expand: undefined })).toBe(
      "?$select=a%2Cb&$filter=name%20eq%20'x%20y'&$top=5".replace('a%2Cb', encodeURIComponent('a,b')).replace("'x%20y'", encodeURIComponent("'x y'")),
    )
  })
  it('sem parâmetros devolve vazio', () => {
    expect(buildQuery({})).toBe('')
  })
})

describe('odataLiteral', () => {
  it('texto entre aspas, escapando aspas simples; GUID e número sem aspas', () => {
    expect(odataLiteral("o'brien")).toBe("'o''brien'")
    expect(odataLiteral('f9a9d2b2-4818-430f-9630-01e6629a0dc3')).toBe('f9a9d2b2-4818-430f-9630-01e6629a0dc3')
    expect(odataLiteral(3)).toBe('3')
    expect(odataLiteral(true)).toBe('true')
  })
})

describe('DataverseSession.entity', () => {
  it('resolve pelo nome lógico e guarda em cache (uma chamada de metadata)', async () => {
    const calls = mockFetch(baseRoute(() => undefined))
    const s = new DataverseSession(env, 'rt')
    const a = await s.entity('DEV', 'cr40f_reserva')
    const b = await s.entity('DEV', 'CR40F_RESERVAS')
    expect(a.entitySet).toBe('cr40f_reservas')
    expect(b).toBe(a)
    expect(calls.filter((c) => c.url.includes('EntityDefinitions'))).toHaveLength(1)
  })

  it('resolve pelo EntitySetName quando o nome lógico não existe (404)', async () => {
    const calls = mockFetch((call) => {
      if (call.url.includes('login.microsoftonline.com')) return tokenReply()
      if (call.url.includes("LogicalName='cr40f_reservas'")) return json({ error: { code: '0x80060888', message: 'não existe' } }, 404)
      if (call.url.includes('EntitySetName%20eq')) return json({ value: [entityRow('cr40f_reserva', 'cr40f_reservas')] })
      return json({}, 500)
    })
    const info = await new DataverseSession(env, 'rt').entity('DEV', 'cr40f_reservas')
    expect(info.logicalName).toBe('cr40f_reserva')
    expect(calls.some((c) => decodeURIComponent(c.url).includes("EntitySetName eq 'cr40f_reservas'"))).toBe(true)
  })

  it('tabela inexistente dá erro 404 claro', async () => {
    mockFetch((call) => (call.url.includes('login.') ? tokenReply() : call.url.includes('EntitySetName%20eq') ? json({ value: [] }) : json({ error: { code: 'x', message: 'm' } }, 404)))
    await expect(new DataverseSession(env, 'rt').entity('DEV', 'nada')).rejects.toMatchObject({ status: 404, code: 'tabela_nao_encontrada' })
  })
})

describe('DataverseSession.api', () => {
  it('manda Bearer, cabeçalhos OData e as anotações do Prefer', async () => {
    const calls = mockFetch(baseRoute(() => json({ value: [] })))
    await new DataverseSession(env, 'rt').api('PROD', 'GET', 'cr40f_reservas')
    const dv = calls.find((c) => c.url.startsWith('https://prod.crm.test/api/data/v9.2/'))!
    expect(dv.headers.Authorization).toBe('Bearer at-1')
    expect(dv.headers.Prefer).toContain('OData.Community.Display.V1.FormattedValue')
    expect(dv.headers.Prefer).toContain('Microsoft.Dynamics.CRM.lookuplogicalname')
  })

  it('reaproveita o token em cache e renova 5 minutos antes de expirar', async () => {
    let now = 1_000_000
    const calls = mockFetch(baseRoute(() => json({ ok: 1 })))
    const s = new DataverseSession(env, 'rt', () => now)
    await s.api('DEV', 'GET', 'WhoAmI')
    await s.api('DEV', 'GET', 'WhoAmI')
    expect(calls.filter((c) => c.url.includes('login.'))).toHaveLength(1)
    now += 3600_000 - 299_000 // faltam 4m59s
    await s.api('DEV', 'GET', 'WhoAmI')
    expect(calls.filter((c) => c.url.includes('login.'))).toHaveLength(2)
  })

  it('token é por ambiente e usa o refresh token girado na troca seguinte', async () => {
    const calls = mockFetch(baseRoute(() => json({})))
    const s = new DataverseSession(env, 'rt-0')
    await s.api('DEV', 'GET', 'WhoAmI')
    await s.api('TEST', 'GET', 'WhoAmI')
    const bodies = calls.filter((c) => c.url.includes('login.')).map((c) => new URLSearchParams(c.body))
    expect(bodies[0].get('refresh_token')).toBe('rt-0')
    expect(bodies[1].get('refresh_token')).toBe('rt-2')
    expect(bodies[1].get('scope')).toBe('https://test.crm.test/.default offline_access')
  })

  it('401 renova o token uma vez e repete', async () => {
    let first = true
    const calls = mockFetch((call) => {
      if (call.url.includes('login.')) return tokenReply()
      if (first) {
        first = false
        return json({ error: { code: '0x1', message: 'expirou' } }, 401)
      }
      return json({ ok: true })
    })
    const r = await new DataverseSession(env, 'rt').api('DEV', 'GET', 'WhoAmI')
    expect(r.data).toEqual({ ok: true })
    expect(calls.filter((c) => c.url.includes('login.'))).toHaveLength(2)
  })

  it('401 repetido vira erro (sem laço)', async () => {
    mockFetch((call) => (call.url.includes('login.') ? tokenReply() : json({ error: { code: 'c', message: 'negado' } }, 401)))
    await expect(new DataverseSession(env, 'rt').api('DEV', 'GET', 'x')).rejects.toMatchObject({ status: 401 })
  })

  it('recusa URL de outro host (nextLink forjado) sem enviar token', async () => {
    const calls = mockFetch(baseRoute(() => json({})))
    await expect(new DataverseSession(env, 'rt').api('DEV', 'GET', 'https://evil.test/api/data/v9.2/x')).rejects.toMatchObject({ code: 'url_invalida' })
    expect(calls).toHaveLength(0)
  })

  it('aceita nextLink do próprio ambiente', async () => {
    mockFetch(baseRoute(() => json({ value: [1] })))
    const r = await new DataverseSession(env, 'rt').api('DEV', 'GET', 'https://dev.crm.test/api/data/v9.2/cr40f_reservas?$skiptoken=1')
    expect(r.data.value).toEqual([1])
  })
})

describe('erros do Dataverse', () => {
  it('traz HTTP, código e mensagem e não vaza token', async () => {
    mockFetch((call) =>
      call.url.includes('login.')
        ? tokenReply()
        : json({ error: { code: '0x80040265', message: 'Falha com Bearer eyJhbGciOi.abc.def no meio' } }, 400),
    )
    const error = await new DataverseSession(env, 'rt').api('DEV', 'GET', 'x').catch((e) => e)
    expect(error).toBeInstanceOf(DataverseError)
    const result = errorResult(error)
    expect(result.isError).toBe(true)
    const text = result.content[0].text
    expect(text).toContain('400')
    expect(text).toContain('0x80040265')
    expect(text).not.toContain('eyJhbGciOi')
    expect(text).not.toContain('at-1')
  })

  it('corpo que não é JSON vira mensagem de texto', async () => {
    mockFetch((call) => (call.url.includes('login.') ? tokenReply() : new Response('Bad gateway', { status: 502 })))
    await expect(new DataverseSession(env, 'rt').api('DEV', 'GET', 'x')).rejects.toMatchObject({ status: 502, message: 'Bad gateway' })
  })
})
