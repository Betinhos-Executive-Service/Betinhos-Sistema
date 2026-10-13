// domain/pendencias.test.ts
import { describe, expect, it } from 'vitest'
import { contarKpis, filtrarPendencias, indexarVigentes, montarChecklist, montarPendencias, urgentes } from './pendencias'
import type { DocEmitido, Dono, TipoDoc } from './types'

const HOJE = '2026-10-13'
const tipo = (over: Partial<TipoDoc>): TipoDoc => ({ id: 't', codigo: 'X', nome: 'X', categoria: 'pessoas', temValidade: true, validadePadraoMeses: null, obrigatorioPara: [], ordem: 0, ativo: true, ...over })
const dono = (over: Partial<Dono>): Dono => ({ id: 'd', categoria: 'pessoas', nome: 'Ana', detalhe: 'Motorista', obrigKey: 100000000, ativo: true, email: '', ...over })
const doc = (over: Partial<DocEmitido>): DocEmitido => ({ id: 'x', tipoId: 't', donoId: 'd', categoria: 'pessoas', numero: '', emissao: null, validade: null, situacao: 'vigente', pasta: '', observacao: '', ultimoMarco: null, modificadoEm: null, ...over })

const CNH = tipo({ id: 'cnh', codigo: 'CNH', nome: 'CNH', obrigatorioPara: [100000000], ordem: 1 })
const ASO = tipo({ id: 'aso', codigo: 'ASO', nome: 'ASO', obrigatorioPara: [100000000, 100000001], ordem: 2, validadePadraoMeses: 12 })
const RG = tipo({ id: 'rg', codigo: 'RG', nome: 'RG', temValidade: false, obrigatorioPara: [100000000], ordem: 3 })
const CRLV = tipo({ id: 'crlv', codigo: 'CRLV', nome: 'CRLV', categoria: 'frota', obrigatorioPara: [100000002], ordem: 1 })

describe('pendências', () => {
  it('vigente mais recente vence empate de dois vigentes', () => {
    const map = indexarVigentes([doc({ id: 'a', validade: '2026-01-01' }), doc({ id: 'b', validade: '2027-01-01' }), doc({ id: 'c', validade: '2028-01-01', situacao: 'substituido' })])
    expect(map.get('d|t')?.id).toBe('b')
  })

  it('lista vencidos, vencendo e faltantes; ignora desligado, ok e não obrigatório', () => {
    const ana = dono({ id: 'ana', nome: 'Ana' })
    const bia = dono({ id: 'bia', nome: 'Bia', obrigKey: 100000001, detalhe: 'Administrativo' })
    const caio = dono({ id: 'caio', nome: 'Caio', ativo: false })
    const carro = dono({ id: 'car', categoria: 'frota', nome: 'ABC1D23', obrigKey: 100000002 })
    const docs = [
      doc({ id: 'cnh-ana', tipoId: 'cnh', donoId: 'ana', validade: '2026-10-10' }),
      doc({ id: 'aso-ana', tipoId: 'aso', donoId: 'ana', validade: '2026-11-20' }),
      doc({ id: 'aso-bia', tipoId: 'aso', donoId: 'bia', validade: '2027-06-01' }),
      doc({ id: 'crlv-car', tipoId: 'crlv', donoId: 'car', categoria: 'frota', validade: '2026-10-18' }),
    ]
    const lista = montarPendencias([CNH, ASO, RG, CRLV], [ana, bia, caio, carro], docs, HOJE)
    expect(lista.map((p) => `${p.dono.id}:${p.tipo.codigo}:${p.estado}`)).toEqual([
      'ana:CNH:vencido',
      'car:CRLV:vence7',
      'ana:RG:faltando',
      'ana:ASO:vence60',
    ])
    expect(contarKpis(lista)).toEqual({ vencido: 1, vence7: 1, vence30: 0, vence60: 1, faltando: 1 })
    expect(urgentes(contarKpis(lista))).toBe(2)
  })

  it('checklist da ficha: ordem do tipo, vigente, histórico e opcional', () => {
    const ana = dono({ id: 'ana', obrigKey: 100000001 })
    const docs = [
      doc({ id: 'aso-1', tipoId: 'aso', donoId: 'ana', validade: '2025-10-01', situacao: 'substituido' }),
      doc({ id: 'aso-2', tipoId: 'aso', donoId: 'ana', validade: '2026-10-25' }),
    ]
    const itens = montarChecklist(ana, [RG, ASO, CNH, CRLV], docs, HOJE)
    expect(itens.map((i) => `${i.tipo.codigo}:${i.estado}`)).toEqual(['CNH:opcional', 'ASO:vence30', 'RG:opcional'])
    expect(itens[1].vigente?.id).toBe('aso-2')
    expect(itens[1].historico.map((d) => d.id)).toEqual(['aso-1'])
  })

  it('filtro por aba, KPI, tipo e busca sem acento', () => {
    const ana = dono({ id: 'ana', nome: 'Ana Júlia' })
    const lista = montarPendencias([CNH, RG], [ana], [doc({ tipoId: 'cnh', donoId: 'ana', validade: '2026-10-01' })], HOJE)
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: null, tipo: null, q: 'julia' })).toHaveLength(2)
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: 'faltando', tipo: null, q: '' }).map((p) => p.tipo.codigo)).toEqual(['RG'])
    expect(filtrarPendencias(lista, { aba: 'pessoas', kpi: null, tipo: 'cnh', q: '' })).toHaveLength(1)
    expect(filtrarPendencias(lista, { aba: 'frota', kpi: null, tipo: null, q: '' })).toHaveLength(0)
  })
})
