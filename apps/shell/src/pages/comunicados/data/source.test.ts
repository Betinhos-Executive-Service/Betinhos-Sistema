import { describe, expect, it } from 'vitest'
import { createSource } from './source'
import { createMockSource } from './mock'

function hostFalso(opts: { falhasWhoAmI?: number; fullname?: string | null } = {}) {
  const urls: string[] = []
  let falhas = opts.falhasWhoAmI ?? 0
  const client = {
    getAll: async (url: string) => { urls.push(url); return [] },
    request: async (path: string) => {
      urls.push(path)
      if (path === 'WhoAmI') { if (falhas > 0) { falhas -= 1; throw new Error('rede') } return { UserId: '{AAAA-1}' } }
      return { fullname: opts.fullname ?? 'Renan Mendonça', internalemailaddress: 'renan@betinhos.com' }
    },
  }
  const entities = ['new_comunicadomotorista', 'new_comunicadodestinatario', 'cr40f_funcionarios', 'systemuser']
  const metadata = { entities: async () => new Map(entities.map((e) => [e, { entitySetName: `${e}s` }])) }
  return { urls, host: { mode: 'dataverse', client, metadata } as never }
}

describe('destinatariosDoMotorista (Dataverse)', () => {
  it('filtra pelo motorista e ordena pelo envio mais recente', async () => {
    const { host, urls } = hostFalso()
    await createSource(host).destinatariosDoMotorista('{ABCD0000-0000-0000-0000-000000000001}')
    expect(urls[0]).toContain('new_comunicadodestinatarios?$select=new_comunicadodestinatarioid')
    expect(urls[0]).toContain('$filter=_new_motorista_value eq abcd0000-0000-0000-0000-000000000001')
    expect(urls[0]).toContain('$orderby=new_enviadoem desc')
  })
})

describe('quemSou (Dataverse)', () => {
  it('lê o nome pelo WhoAmI e guarda em cache', async () => {
    const { host, urls } = hostFalso()
    const source = createSource(host)
    expect(await source.quemSou()).toBe('Renan Mendonça')
    expect(await source.quemSou()).toBe('Renan Mendonça')
    expect(urls.filter((u) => u === 'WhoAmI')).toHaveLength(1)
    expect(urls.some((u) => u.startsWith('systemusers(aaaa-1)?$select=fullname'))).toBe(true)
  })
  it('sem nome usa o e-mail; em erro devolve null e tenta de novo na próxima', async () => {
    expect(await createSource(hostFalso({ fullname: ' ' }).host).quemSou()).toBe('renan@betinhos.com')
    const source = createSource(hostFalso({ falhasWhoAmI: 1 }).host)
    expect(await source.quemSou()).toBeNull()
    expect(await source.quemSou()).toBe('Renan Mendonça')
  })
})

describe('mock', () => {
  it('motorista de exemplo tem 2 concluídos e 1 pendente; quemSou devolve usuário de teste', async () => {
    const source = createMockSource()
    const [lista, nome] = await Promise.all([source.destinatariosDoMotorista('dddddddd-0000-4000-8000-000000000001'), source.quemSou()])
    expect(lista).toHaveLength(3)
    expect(lista.filter((row) => row.cienteEm || row.lidoEm)).toHaveLength(2)
    expect(nome).toBe('Usuário de teste')
  })
})
