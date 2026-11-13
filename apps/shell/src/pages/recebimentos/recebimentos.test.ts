import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { agruparPorServico, metaRecebimento, ordenar, type Recebimento } from './domain'
import { contarPorReserva, loadRecebimentos, mapRecebimento } from './queries'

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const rec = (p: Partial<Recebimento>): Recebimento => ({ id: 'r', nome: 'a.jpg', url: 'https://example.com/a', midia: 'foto', reservaId: ID(1), ordem: null, enviadoEm: null, motorista: '', ...p })

describe('recebimentos: domínio', () => {
  it('mapeia a linha: link, tipo de mídia, motorista formatado e serviço em minúsculas', () => {
    const r = mapRecebimento({
      cr40f_anexorecebimento_v2id: 'x1', cr40f_nome: 'Comprovante 1', cr40f_nomearquivo: 'recebimento-1.mp4', cr40f_sharelink: '', cr40f_urlsharepoint: 'https://example.com/v',
      cr40f_dataenvio: '2026-11-12T12:00:00Z', cr40f_ordem: 2, cr40f_tipomidia: 100000001, _cr40f_reserva_value: ID(9).toUpperCase(),
      '_cr40f_enviadopor_value@OData.Community.Display.V1.FormattedValue': 'Carlos Souza',
    })
    expect(r).toMatchObject({ id: 'x1', nome: 'recebimento-1.mp4', url: 'https://example.com/v', midia: 'video', reservaId: ID(9), ordem: 2, motorista: 'Carlos Souza' })
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
