import { describe, expect, it } from 'vitest'
import { detectarPendencias } from '../domain/detect'
import { createMockPendencias } from './mock'
import { mapReserva, opsChunkPath, reservasPath } from './queries'
import { createSource } from './source'

const F = '@OData.Community.Display.V1.FormattedValue'
const G = '11111111-1111-1111-1111-111111111111'

describe('queries', () => {
  it('mapReserva usa FormattedValues e a CP expandida', () => {
    const r = mapReserva({
      cr40f_reservadeveculosid: G, cr40f_id: 'RES-1', cr40f_dataehorriodesada: '2026-10-01T12:00:00Z', cr40f_status: 202410008,
      cr40f_statusdefaturamento: 202410010, [`cr40f_statusdefaturamento${F}`]: 'Pago',
      _cr40f_financeiro_value: G, [`_cr40f_financeiro_value${F}`]: 'OP-9', _cr40f_cliente_value: G, [`_cr40f_cliente_value${F}`]: 'Lumen',
      _new_composicaodepreco_value: G, nav_cp: { new_status: 100000001, new_valortotal: 450 },
    }, 'nav_cp')
    expect(r).toMatchObject({ codigo: 'RES-1', cliente: 'Lumen', opCodigo: 'OP-9', fatLabel: 'Pago', fatStatus: 202410010, cpId: G, cpStatus: 100000001, cpValor: 450 })
    expect(r.saida?.toISOString()).toBe('2026-10-01T12:00:00.000Z')
  })

  it('monta o filtro das reservas e o de OPs em bloco', () => {
    const p = decodeURIComponent(reservasPath('set', new Date('2026-01-01T00:00:00Z'), 'nav_cp'))
    expect(p).toContain('cr40f_dataehorriodesada ge 2026-01-01')
    expect(p).toContain('_cr40f_financeiro_value ne null')
    expect(p).toContain('cr40f_statusdefaturamento eq 202410008')
    expect(p).toContain('$expand=nav_cp($select=new_status,new_valortotal)')
    expect(decodeURIComponent(reservasPath('set', null))).not.toContain('cr40f_dataehorriodesada ge')
    expect(decodeURIComponent(opsChunkPath('ops', [G, G]))).toContain(`cr40f_financeiroid eq ${G} or cr40f_financeiroid eq ${G}`)
  })
})

describe('mock', () => {
  it('produz um caso de cada tipo', () => {
    const d = createMockPendencias(new Date())
    expect(detectarPendencias(d.ops, d.reservas, d.pagantes).map((p) => p.tipo).sort())
      .toEqual(['mensal-sem-op', 'op-paga-desalinhada', 'op-sem-pagamento-reserva-paga', 'pago-sem-op-paga', 'rateio-nao-fecha'])
  })

  it('sincronizar aplicar remove o tipo 1; simular não altera', async () => {
    const source = createSource({ mode: 'mock' } as never)
    const tipos = async () => { const d = await source.load(null); return detectarPendencias(d.ops, d.reservas, d.pagantes).map((p) => p.tipo) }
    const sim = await source.sincronizar('mock-op-p1', 'simular')
    expect(sim.aplicadas).toBe(false)
    expect(sim.mudancas.length).toBeGreaterThan(0)
    expect(await tipos()).toContain('op-paga-desalinhada')
    const ap = await source.sincronizar('mock-op-p1', 'aplicar')
    expect(ap.aplicadas).toBe(true)
    expect(await tipos()).not.toContain('op-paga-desalinhada')
  })

  it('fecharMes cria a OP, vincula as reservas e remove o tipo 4', async () => {
    const source = createSource({ mode: 'mock' } as never)
    const pend = async () => { const d = await source.load(null); return detectarPendencias(d.ops, d.reservas, d.pagantes) }
    const t4 = (await pend()).find((p) => p.tipo === 'mensal-sem-op')!
    const r = await source.fecharMes(t4.clienteId, t4.mes!)
    expect(r).toMatchObject({ reservas: 2, valor: 900 })
    expect(r.opId).toBeTruthy()
    expect((await pend()).map((p) => p.tipo)).not.toContain('mensal-sem-op')
    await expect(source.fecharMes(t4.clienteId, t4.mes!)).rejects.toThrow()
  })
})
