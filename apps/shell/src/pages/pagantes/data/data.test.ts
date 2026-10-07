import { describe, expect, it, vi } from 'vitest'
import { DataverseError, type DataverseClient, type Row } from '@betinhos/dataverse'
import { loadContatos, loadPagantes, mapPagante, opFilter, pagantesPath, periodFilter } from './queries'
import { fakeGridControl } from './recibo'

const F = '@OData.Community.Display.V1.FormattedValue'

function client(getAll: (path: string) => Promise<Row[]>): DataverseClient {
  return { apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() } as unknown as DataverseClient
}

describe('consultas de pagantes', () => {
  it('filtra ativos pelo período e pela OP', () => {
    expect(periodFilter(null)).toBe('statecode eq 0')
    expect(periodFilter(new Date('2026-07-09T03:00:00.000Z'))).toBe('statecode eq 0 and createdon ge 2026-07-09T03:00:00.000Z')
    expect(opFilter('{ABC}')).toBe('statecode eq 0 and _cr40f_financeiro_value eq abc')
    expect(pagantesPath('cr40f_paganteses', 'statecode eq 0', 'full')).toContain('cr40f_statusgeracaolink')
    expect(pagantesPath('cr40f_paganteses', 'statecode eq 0', 'safe')).not.toContain('cr40f_statusgeracaolink')
  })

  it('mapeia lookups pelo valor formatado e datas', () => {
    const p = mapPagante({
      cr40f_pagantesid: 'AAA', cr40f_id: 'PAG-9', _cr40f_bancodedados_value: 'P1', [`_cr40f_bancodedados_value${F}`]: 'Ana Lima',
      _cr40f_financeiro_value: 'OP1', [`_cr40f_financeiro_value${F}`]: 'OP-77', cr40f_valor: 150.5, cr40f_status: 202410001,
      createdon: '2026-10-01T12:00:00Z', cr40f_statusgeracaolink: 202410003, cr40f_errogeracaolink: 'falhou',
    })
    expect(p).toMatchObject({ id: 'aaa', codigo: 'PAG-9', pessoaId: 'p1', pessoa: 'Ana Lima', opId: 'op1', op: 'OP-77', valor: 150.5, status: 202410001, link: { status: 202410003, erro: 'falhou' } })
    expect(p.criadoEm?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(p.email).toEqual({ status: null, erro: '', enviadoEm: null })
  })

  it('repete sem as colunas de envio quando o ambiente não as tem', async () => {
    const c = client(async (path) => {
      if (path.includes('cr40f_statusgeracaolink')) throw new DataverseError("Could not find a property named 'cr40f_statusgeracaolink'", 400)
      return [{ cr40f_pagantesid: 'x' }]
    })
    expect(await loadPagantes(c, 'cr40f_paganteses', 'statecode eq 0')).toHaveLength(1)
    expect(c.getAll).toHaveBeenCalledTimes(2)
  })

  it('não mascara outros erros', async () => {
    const c = client(async () => { throw new DataverseError('Acesso negado', 403) })
    await expect(loadPagantes(c, 'cr40f_paganteses', 'statecode eq 0')).rejects.toThrow('Acesso negado')
  })

  it('busca contatos em blocos de 15 ids únicos', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `ID${i}`)
    const c = client(async (path) => {
      const found = [...decodeURIComponent(path).matchAll(/cr40f_bancodedadosid eq (\w+)/g)].map((m) => m[1])
      return found.map((id) => ({ cr40f_bancodedadosid: id, cr40f_nomedopassageiro: `Nome ${id}`, cr40f_telefone: '11999990000' }))
    })
    const map = await loadContatos(c, 'cr40f_bancodedadoses', [...ids, 'ID0', ''])
    expect(c.getAll).toHaveBeenCalledTimes(2)
    expect(map.size).toBe(20)
    expect(map.get('id3')).toMatchObject({ nome: 'Nome id3', telefone: '11999990000' })
  })
})

describe('gerador de recibo', () => {
  it('simula a grade do model-driven com os pagantes escolhidos', () => {
    const refresh = vi.fn()
    const control = fakeGridControl('cr40f_pagantes', ['a1', 'b2'], refresh)
    const rows = control.getGrid().getSelectedRows()
    const seen: string[] = []
    rows.forEach((row) => { const e = row.getData().getEntity(); seen.push(`${e.getEntityName()}:${e.getId()}`) })
    expect(rows.getLength()).toBe(2)
    expect(seen).toEqual(['cr40f_pagantes:{a1}', 'cr40f_pagantes:{b2}'])
    control.refresh()
    expect(refresh).toHaveBeenCalled()
  })
})
