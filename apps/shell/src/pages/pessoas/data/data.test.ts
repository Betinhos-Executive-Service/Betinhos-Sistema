import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { HIST_TOP, guid, loadServicosDaPessoa, mapPessoa, pessoasPath, pessoasSearchFilter, searchClientes } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const P = 'aaaaaaaa-0000-4000-8000-000000000001'
const R = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`

function client(handler: (path: string) => Row[]): DataverseClient {
  return {
    apiUrl: '', create: vi.fn(), update: vi.fn(), remove: vi.fn(),
    getAll: vi.fn(async (path: string) => handler(decodeURIComponent(path))),
    request: vi.fn(async (path: string) => ({ value: handler(decodeURIComponent(path)) })),
  } as unknown as DataverseClient
}

describe('consultas de pessoas', () => {
  it('mapeia lookup, datas só-dia e texto "null" de flow', () => {
    const p = mapPessoa({ cr40f_bancodedadosid: P.toUpperCase(), cr40f_nomedopassageiro: 'Ana', _cr40f_cliente_value: 'C1', [`_cr40f_cliente_value${F}`]: 'Lumen', cr40f_telefone: 'null', cr40f_datadenascimento: '1990-05-02', cr40f_idioma: 202410001 })
    expect(p).toMatchObject({ id: P, nome: 'Ana', clienteId: 'c1', cliente: 'Lumen', telefone: '', nascimento: '1990-05-02', idioma: 202410001 })
    expect(mapPessoa({ cr40f_bancodedadosid: P }).cliente).toBe('')
  })

  it('busca clientes pelo começo do nome, escapando aspas e limitando a 25', async () => {
    const c = client(() => [{ cr40f_clientes1id: 'X', cr40f_nomedocliente: "D'Ávila" }])
    const r = await searchClientes(c, 'cr40f_clientes1s', "D'Á")
    expect(r).toEqual([{ id: 'x', nome: "D'Ávila" }])
    const path = decodeURIComponent((c.request as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(path).toContain("startswith(cr40f_nomedocliente,'D''Á')")
    expect(path).toContain('$top=25')
  })

  it('histórico junta reservas diretas e as de Serviços por Passageiro, sem repetir e com papel; consultas juntas, recentes primeiro e com $top', async () => {
    const c = client((path) => {
      if (path.startsWith('cr40f_servicosporpassageiros')) return [{ _cr40f_geral_value: R(1) }, { _cr40f_geral_value: R(2) }, { _cr40f_geral_value: null }]
      if (path.includes('cr40f_reservadeveculosid eq')) return [{ cr40f_reservadeveculosid: R(2), cr40f_id: 'OS-2' }]
      return [{ cr40f_reservadeveculosid: R(1), cr40f_id: 'OS-1', _cr40f_solicitante_value: P }]
    })
    const pending = loadServicosDaPessoa(c, { reserva: 'cr40f_reservadeveculoses', passageiro: 'cr40f_servicosporpassageiros' }, P)
    // As duas primeiras consultas saem antes de qualquer resposta (em paralelo).
    const first = (c.request as ReturnType<typeof vi.fn>).mock.calls.map((call) => decodeURIComponent(call[0] as string))
    expect(first).toHaveLength(2)
    expect(first[0]).toContain('$orderby=cr40f_dataehorriodesada desc')
    expect(first[0]).toContain(`$top=${HIST_TOP}`)
    expect(first[1]).toContain(`$top=${HIST_TOP}`)
    const { servicos, limitado } = await pending
    expect(servicos.map((s) => `${s.codigo}:${s.papel}`)).toEqual(['OS-1:Solicitante', 'OS-2:Passageiro'])
    expect(limitado).toBe(false)
  })

  it('histórico avisa quando a pessoa tem mais serviços do que a ficha lê', async () => {
    const c = client((path) => (path.startsWith('cr40f_servicosporpassageiros') ? [] : Array.from({ length: HIST_TOP }, (_, i) => ({ cr40f_reservadeveculosid: R(i + 1), cr40f_id: `OS-${i}` }))))
    const { limitado } = await loadServicosDaPessoa(c, { reserva: 'cr40f_reservadeveculoses', passageiro: 'cr40f_servicosporpassageiros' }, P)
    expect(limitado).toBe(true)
  })

  it('recusa id que não é GUID antes de montar o filtro', async () => {
    expect(() => guid("x' or 1 eq 1")).toThrow('Identificador inválido')
  })

  it('busca no servidor: nome com contains, e-mail com startswith, junto do filtro de ativos', () => {
    expect(pessoasSearchFilter("  d'ávila  ana ")).toBe("(startswith(cr40f_email,'d''ávila') or contains(cr40f_nomedopassageiro,'d''ávila')) and (startswith(cr40f_email,'ana') or contains(cr40f_nomedopassageiro,'ana'))")
    expect(pessoasSearchFilter('a')).toBeNull()
    expect(decodeURIComponent(pessoasPath('cr40f_bancodedadoses', pessoasSearchFilter('ana')))).toContain("$filter=statecode eq 0 and (startswith(cr40f_email,'ana') or contains(cr40f_nomedopassageiro,'ana'))")
  })
})
