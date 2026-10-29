// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { createMetadata, DataverseClient } from '@betinhos/dataverse'
import { createDataverseSource } from './dataverse'
import { capasEmCache, carregarCapas } from './capas'

vi.mock('@betinhos/ui/error-logger', () => ({ logAppError: vi.fn() }))

const NOW = new Date('2026-10-29T18:00:00Z')

/** Respostas por prefixo do caminho; `erro` faz aquela consulta falhar. */
function fakeClient(respostas: Record<string, unknown>) {
  const calls: string[] = []
  const responder = async (path: string) => {
    calls.push(path)
    const chave = Object.keys(respostas).find((k) => path.startsWith(k))
    if (!chave) return { value: [] }
    if (respostas[chave] === 'erro') throw new Error(`falhou ${chave}`)
    return respostas[chave]
  }
  const client = {
    apiUrl: '',
    request: responder,
    getAll: async (path: string) => ((await responder(path)) as { value: unknown[] }).value,
  } as unknown as DataverseClient
  // Entity set = lógico + 's' (o suficiente para o teste).
  const metadata = { entity: async (logical: string) => ({ entitySetName: `${logical}s` }) } as unknown as ReturnType<typeof createMetadata>
  return { client, metadata, calls }
}

describe('fonte Dataverse', () => {
  it('nome: WhoAmI → e-mail do usuário → apelido do funcionário (aspas escapadas)', async () => {
    const { client, metadata, calls } = fakeClient({
      WhoAmI: { UserId: 'U1' },
      'systemusers(u1)': { internalemailaddress: "o'neil@x.com" },
      'cr40f_funcionarioss?': { value: [{ new_apelido: 'Renan M' }] },
    })
    const source = createDataverseSource(client, metadata)
    expect(await source.primeiroNome()).toBe('Renan')
    expect(await source.usuarioId()).toBe('u1')
    expect(calls).toContain("cr40f_funcionarioss?$select=new_apelido&$filter=cr40f_emailmicrosoft eq 'o''neil@x.com' and statecode eq 0&$top=1")
    expect(calls.filter((c) => c === 'WhoAmI')).toHaveLength(1)
  })

  it('compartilhados: falha parcial vira aviso e o resto carrega', async () => {
    const { client, metadata, calls } = fakeClient({
      'cr40f_comunicadohomes?': { value: [{ cr40f_comunicadohomeid: 'c1', cr40f_titulo: 'Aviso', cr40f_prioridade: 100000001 }] },
      'cr40f_plannertarefas?': 'erro',
    })
    const dados = await createDataverseSource(client, metadata).compartilhados(NOW)
    expect(dados.comunicados).toEqual([{ id: 'c1', titulo: 'Aviso', corpo: '', prioridade: 'attention' }])
    expect(dados.tarefas).toEqual([])
    expect(dados.erro).toBe('Tarefas do Planner indisponíveis')
    expect(calls.find((c) => c.startsWith('cr40f_comunicadohomes?'))).toContain(`cr40f_inicio le ${NOW.toISOString()} and cr40f_fim ge ${NOW.toISOString()}`)
  })

  it('visões: cada uma consulta só as suas tabelas; erro nomeia a consulta', async () => {
    const { client, metadata, calls } = fakeClient({ 'leads?': 'erro', 'asyncoperations?': { value: [{ statuscode: 31 }] } })
    const source = createDataverseSource(client, metadata)
    const ti = await source.visao('ti_marketing', NOW)
    expect(ti.erro).toBe('leads indisponível')
    expect(ti.indicadores[0]!.valor).toBe('01')
    expect(calls.map((c) => c.split('?')[0])).toEqual(['asyncoperations', 'leads', 'campaigns'])

    calls.length = 0
    await source.visao('operacao', NOW)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('$expand=cr40f_Motorista($select=cr40f_tipodevinculo)')

    calls.length = 0
    const fin = await source.visao('financeiro', NOW)
    expect(fin.erro).toBeNull()
    expect(calls.map((c) => c.split('?')[0]).sort()).toEqual(['cr40f_fluxocaixalancamentos', 'cr40f_reservadeveculoss', 'cr40f_reservadeveculoss', 'cr40f_servicosporpassageiros'])

    calls.length = 0
    await source.visao('gestao', NOW)
    expect(calls.map((c) => c.split('?')[0]).sort()).toEqual(['cr40f_composicaodeprecoss', 'cr40f_plannertarefas', 'cr40f_reservadeveculoss'])
  })

  it('notícias: não ocultas, não expiradas, 24 mais recentes', async () => {
    const { client, metadata, calls } = fakeClient({ 'cr40f_noticiaexternas?': { value: [{ cr40f_noticiaexternaid: 'n1', cr40f_titulo: 'T' }] } })
    expect((await createDataverseSource(client, metadata).noticias(NOW)).map((n) => n.id)).toEqual(['n1'])
    expect(calls[0]).toContain(`$filter=cr40f_oculta ne true and cr40f_expira_em ge ${NOW.toISOString()}&$orderby=cr40f_publicado_em desc&$top=24`)
  })
})

describe('capas do Radar', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  const resposta = (image: unknown) => new Response(JSON.stringify({ data: { image } }), { status: 200 })

  it('busca as que faltam em paralelo, guarda no cache e não busca de novo', async () => {
    const fetchImpl = vi.fn(async (url: string) => resposta(url.includes('a.com') ? { url: 'https://img/a.jpg' } : 'javascript:x')) as unknown as typeof fetch
    const recebidas: Record<string, string | null> = {}
    await carregarCapas(['https://a.com', 'https://b.com', 'https://a.com'], (u, s) => { recebidas[u] = s }, new AbortController().signal, fetchImpl)
    expect(recebidas).toEqual({ 'https://a.com': 'https://img/a.jpg', 'https://b.com': null })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(capasEmCache(['https://a.com', 'https://b.com', 'https://c.com'])).toEqual({ 'https://a.com': 'https://img/a.jpg', 'https://b.com': null })

    await carregarCapas(['https://a.com'], () => undefined, new AbortController().signal, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('falha de rede não entra no cache; cache vencido (7 dias) é ignorado', async () => {
    const falha = vi.fn(async () => { throw new Error('rede') }) as unknown as typeof fetch
    await carregarCapas(['https://a.com'], () => undefined, new AbortController().signal, falha)
    expect(capasEmCache(['https://a.com'])).toEqual({})
    localStorage.setItem('bt-inicio-capas', JSON.stringify({ 'https://v.com': { src: 'https://img', em: Date.now() - 8 * 86400000 } }))
    expect(capasEmCache(['https://v.com'])).toEqual({})
  })

  it('cota esgotada (429) não vira "sem capa" no cache', async () => {
    const cota = vi.fn(async () => new Response('', { status: 429 })) as unknown as typeof fetch
    const recebidas: string[] = []
    await carregarCapas(['https://a.com'], (u) => { recebidas.push(u) }, new AbortController().signal, cota)
    expect(recebidas).toEqual([])
    expect(capasEmCache(['https://a.com'])).toEqual({})
  })

  it('no máximo 4 buscas ao mesmo tempo, na ordem recebida', async () => {
    let ativas = 0, pico = 0
    const ordem: string[] = []
    const lento = vi.fn(async (url: string) => {
      ordem.push(decodeURIComponent(url.split('url=')[1].split('&')[0]))
      pico = Math.max(pico, ++ativas)
      await new Promise((r) => setTimeout(r, 5))
      ativas--
      return resposta(null)
    }) as unknown as typeof fetch
    const urls = Array.from({ length: 10 }, (_, i) => `https://n${i}.com`)
    await carregarCapas(urls, () => undefined, new AbortController().signal, lento)
    expect(pico).toBe(4)
    expect(ordem).toEqual(urls)
  })
})
