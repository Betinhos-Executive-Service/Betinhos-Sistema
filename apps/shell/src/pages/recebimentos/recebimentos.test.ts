import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { agruparPorServico, metaRecebimento, mostraStatus, ordenar, tomStatus, type Recebimento } from './domain'
import { mockContagemPorOp, mockRecebimentos } from './mock'
import { mockServicos } from '../pagantes/data/mock'
import { COMPROVANTES_COLUMN, temComprovante, usaComprovantes } from './colunaOp'
import { contarPorOp, contarPorReserva, fetchContagemPorOp, loadFinanceiro, loadRecebimentos, mapRecebimento } from './queries'

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const rec = (p: Partial<Recebimento>): Recebimento => ({ id: 'r', nome: 'a.jpg', url: 'https://example.com/a', midia: 'foto', reservaId: ID(1), ordem: null, enviadoEm: null, motorista: '', tipo: '', status: null, statusTexto: '', ...p })

describe('recebimentos: domínio', () => {
  it('mapeia a linha: link, tipo de mídia, motorista formatado e serviço em minúsculas', () => {
    const r = mapRecebimento({
      cr40f_anexorecebimento_v2id: 'x1', cr40f_nome: 'Comprovante 1', cr40f_nomearquivo: 'recebimento-1.mp4', cr40f_sharelink: '', cr40f_urlsharepoint: 'https://example.com/v',
      cr40f_dataenvio: '2026-11-12T12:00:00Z', cr40f_ordem: 2, cr40f_tipomidia: 100000001, _cr40f_reserva_value: ID(9).toUpperCase(),
      '_cr40f_enviadopor_value@OData.Community.Display.V1.FormattedValue': 'Carlos Souza',
      cr40f_tipo: 100000001, 'cr40f_tipo@OData.Community.Display.V1.FormattedValue': 'Foto complementar',
      cr40f_status: 100000002, 'cr40f_status@OData.Community.Display.V1.FormattedValue': 'Falhou',
    })
    expect(r).toMatchObject({ id: 'x1', nome: 'recebimento-1.mp4', url: 'https://example.com/v', midia: 'video', reservaId: ID(9), ordem: 2, motorista: 'Carlos Souza', tipo: 'Foto complementar', status: 100000002, statusTexto: 'Falhou' })
    expect(tomStatus(r.status)).toBe('danger')
    expect(tomStatus(100000001)).toBe('neutral')
    expect(r.enviadoEm?.toISOString()).toBe('2026-11-12T12:00:00.000Z')
    expect(mapRecebimento({ cr40f_anexorecebimento_v2id: 'x2', cr40f_nome: 'nota.pdf', cr40f_tipomidia: 100000000 })).toMatchObject({ nome: 'nota.pdf', midia: 'pdf', url: null, ordem: null })
  })

  it('ordena pela ordem do App e, sem ordem, pelo envio', () => {
    const lista = [rec({ id: 'c', ordem: null, enviadoEm: new Date(3) }), rec({ id: 'b', ordem: 2 }), rec({ id: 'a', ordem: 1 }), rec({ id: 'd', ordem: null, enviadoEm: new Date(1) })]
    expect(ordenar(lista).map((r) => r.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('agrupa por serviço na ordem da ficha e deixa de fora o serviço sem comprovante', () => {
    const servicos = [{ id: ID(2).toUpperCase() }, { id: ID(3) }, { id: ID(1) }]
    const grupos = agruparPorServico(servicos, ordenar([rec({ id: 'x', reservaId: ID(1), ordem: 2 }), rec({ id: 'y', reservaId: ID(1), ordem: 1 }), rec({ id: 'z', reservaId: ID(2) })]))
    expect(grupos.map((g) => [g.servico.id.toLowerCase(), g.comprovantes.map((r) => r.id)])).toEqual([[ID(2), ['z']], [ID(1), ['y', 'x']]])
  })

  it('meta do cartão: data e hora do envio e motorista', () => {
    expect(metaRecebimento(rec({ enviadoEm: new Date('2026-11-12T09:05:00-03:00'), motorista: 'Carlos Souza' }))).toMatch(/12\/11\/2026.*09:05 · Carlos Souza/)
    expect(metaRecebimento(rec({}))).toBe('')
  })
})

describe('mostraStatus', () => {
  it('esconde Enviado (o normal) e status vazio; mostra os outros', () => {
    expect(mostraStatus({ status: 100000001, statusTexto: 'Enviado' })).toBe(false)
    expect(mostraStatus({ status: null, statusTexto: '' })).toBe(false)
    expect(mostraStatus({ status: 100000002, statusTexto: 'Falhou' })).toBe(true)
  })
})

describe('recebimentos: consultas', () => {
  const client = (rows: (path: string) => Record<string, unknown>[]) => ({ getAll: vi.fn(async (path: string) => rows(path)) })

  it('busca em blocos de 15 ids válidos, ordenados pela ordem do App', async () => {
    const c = client(() => [])
    await loadRecebimentos(c as unknown as DataverseClient, [...Array.from({ length: 20 }, (_, i) => ID(i + 1)), ID(1), 'lixo'])
    expect(c.getAll).toHaveBeenCalledTimes(2)
    const primeiro = decodeURIComponent(c.getAll.mock.calls[0][0])
    expect(primeiro).toContain('cr40f_anexorecebimento_v2s?$select=')
    expect(primeiro.match(/_cr40f_reserva_value eq/g)).toHaveLength(15)
  })

  it('conta por serviço', async () => {
    const c = client(() => [{ _cr40f_reserva_value: ID(1) }, { _cr40f_reserva_value: ID(1) }, { _cr40f_reserva_value: ID(2) }])
    expect(await contarPorReserva(c as unknown as DataverseClient, [ID(1), ID(2), ID(3)])).toEqual(new Map([[ID(1), 2], [ID(2), 1]]))
  })
})

describe('loadFinanceiro', () => {
  it('lê valor a receber, Receber e a forma de pagamento formatada do serviço', async () => {
    const request = vi.fn(async (_path: string): Promise<Record<string, unknown>> => ({ cr40f_valor_a_receber: 450.5, cr40f_receber: true, cr40f_formadepagamento: 202410002, 'cr40f_formadepagamento@OData.Community.Display.V1.FormattedValue': 'Pix' }))
    const client = { request } as unknown as DataverseClient
    expect(await loadFinanceiro(client, `{${ID(3).toUpperCase()}}`)).toEqual({ valorAReceber: 450.5, receber: true, formaPagamento: 'Pix' })
    expect(request.mock.calls[0][0]).toBe(`cr40f_reservadeveculoses(${ID(3)})?$select=cr40f_valor_a_receber,cr40f_receber,cr40f_formadepagamento`)
    request.mockResolvedValueOnce({})
    expect(await loadFinanceiro(client, ID(3))).toEqual({ valorAReceber: null, receber: null, formaPagamento: '' })
  })
})

describe('recebimentos: contagem por OP', () => {
  it('monta o FetchXML agregado: anexos → reserva, agrupado pela OP e filtrado pelas OPs do lote', () => {
    const xml = fetchContagemPorOp([ID(1), ID(2)])
    expect(xml).toContain('<fetch aggregate="true"><entity name="cr40f_anexorecebimento_v2">')
    expect(xml).toContain('aggregate="count"')
    expect(xml).toContain('<link-entity name="cr40f_reservadeveculos" from="cr40f_reservadeveculosid" to="cr40f_reserva"')
    expect(xml).toContain('<attribute name="cr40f_financeiro" alias="op_id" groupby="true"/>')
    expect(xml).toContain(`<condition attribute="cr40f_financeiro" operator="in"><value>${ID(1)}</value><value>${ID(2)}</value></condition>`)
  })

  it('consulta em lotes de 50 OPs, ignora ids inválidos e repetidos e devolve a contagem do agregado por OP', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => ID(i + 1))
    const getAll = vi.fn(async (path: string) => {
      const xml = decodeURIComponent(path.split('fetchXml=')[1])
      return xml.includes(ID(1)) ? [{ qtd: 3, op_id: ID(1).toUpperCase() }] : []
    })
    const contagem = await contarPorOp({ getAll } as unknown as DataverseClient, [...ids, ID(1), 'não-é-guid'])
    expect(getAll).toHaveBeenCalledTimes(3)
    expect(getAll.mock.calls[0][0]).toMatch(/^cr40f_anexorecebimento_v2s\?fetchXml=/)
    expect([...contagem]).toEqual([[ID(1), 3]])
  })

  it('no mock a OP soma os comprovantes dos serviços de exemplo dela', () => {
    const esperado = (id: string) => mockServicos(id, new Date()).reduce((n, s) => n + mockRecebimentos(s.id).length, 0)
    const ids = ['mock-op-1', 'mock-op-2', 'mock-op-3', 'mock-op-4', 'mock-op-5', 'mock-op-6']
    const contagem = mockContagemPorOp(ids)
    for (const id of ids) expect(contagem.get(id) ?? 0).toBe(esperado(id))
    expect(contagem.size).toBeGreaterThan(0)
  })

  it('o filtro Com/Sem compara a contagem carregada; a contagem só é buscada com a coluna visível ou usada', () => {
    const contagem = new Map([['abc', 2]])
    expect(temComprovante(contagem, 'ABC')).toBe(true)
    expect(temComprovante(contagem, 'outra')).toBe(false)
    const config = (visible: boolean, group?: { key: string }) => ({ v: 1, columns: [{ key: COMPROVANTES_COLUMN.key, visible }], sort: null, filters: {}, ...(group ? { group } : {}) }) as unknown as Parameters<typeof usaComprovantes>[0]
    const semFiltro = { quick: {}, advanced: { items: [] } } as unknown as Parameters<typeof usaComprovantes>[1]
    const comFiltro = { quick: { comprovantes: { type: 'condition', id: 'r', field: 'comprovantes', op: 'yes' } }, advanced: { items: [] } } as unknown as Parameters<typeof usaComprovantes>[1]
    expect(usaComprovantes(config(true), semFiltro)).toBe(true)
    expect(usaComprovantes(config(false), semFiltro)).toBe(false)
    expect(usaComprovantes(config(false), comFiltro)).toBe(true)
    expect(usaComprovantes(config(false, { key: 'comprovantes' }), semFiltro)).toBe(true)
  })
})
