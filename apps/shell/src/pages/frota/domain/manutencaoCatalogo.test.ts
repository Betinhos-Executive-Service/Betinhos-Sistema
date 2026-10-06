import { describe, expect, it } from 'vitest'
import { CATEGORIAS_MANUT, categoriasDe, lerMulti, ORIGEM, patchManual, patchReclassificar, SERVICOS_MANUT } from './manutencaoCatalogo'

describe('catálogo de manutenção', () => {
  it('tem valores únicos e todo serviço aponta para uma categoria existente', () => {
    const categorias = new Set(CATEGORIAS_MANUT.map((c) => c.value))
    expect(categorias.size).toBe(CATEGORIAS_MANUT.length)
    expect(new Set(SERVICOS_MANUT.map((s) => s.value)).size).toBe(SERVICOS_MANUT.length)
    expect(SERVICOS_MANUT.every((s) => categorias.has(s.categoria))).toBe(true)
  })

  it('deriva categorias sem repetir e na ordem do catálogo', () => {
    // pastilha (freios), óleo (motor), disco (freios)
    expect(categoriasDe([100000007, 100000000, 100000008])).toEqual([100000000, 100000001])
    expect(categoriasDe([])).toEqual([])
  })

  it('lê a escolha múltipla do Dataverse', () => {
    expect(lerMulti('100000000,100000007')).toEqual([100000000, 100000007])
    expect(lerMulti(null)).toEqual([])
    expect(lerMulti('')).toEqual([])
  })

  it('monta os patches de correção manual e de reclassificação', () => {
    expect(patchManual([100000012, 100000014])).toEqual({ new_servicosmanutencao: '100000012,100000014', new_categoriasmanutencao: '100000002', new_classificacaoorigem: ORIGEM.MANUAL, new_confiancaia: null })
    expect(patchReclassificar('Pneu careca')).toEqual({ new_classificacaoorigem: null, cr40f_descricao: 'Pneu careca' })
  })
})
