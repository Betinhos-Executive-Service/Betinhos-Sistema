import { describe, expect, it } from 'vitest'
import { classificar, motivoBloqueio, type Candidato } from './portal'

const base: Candidato = {
  id: 'r1', codigo: 'OS-1', cliente: { id: 'c1', nome: 'Tenaris' }, portalHabilitado: true, composicaoConcluida: true, valor: 100, cancelado: false, validacao: null,
}
const c = (patch: Partial<Candidato>): Candidato => ({ ...base, ...patch })

describe('motivoBloqueio', () => {
  it('pronto quando cliente tem portal e composição concluída', () => expect(motivoBloqueio(base)).toBeNull())
  it('composição pendente', () => expect(motivoBloqueio(c({ composicaoConcluida: false }))).toBe('composicao'))
  it('cliente sem portal', () => expect(motivoBloqueio(c({ portalHabilitado: false }))).toBe('sem_portal'))
  it('sem cliente', () => expect(motivoBloqueio(c({ cliente: null, portalHabilitado: false }))).toBe('sem_cliente'))
  it('cancelado vence os demais', () => expect(motivoBloqueio(c({ cancelado: true, composicaoConcluida: false }))).toBe('cancelado'))
  it('já liberado em qualquer status ativo', () => {
    for (const status of ['liberado', 'em_duvida', 'respondido', 'aprovado', 'aprovado_tacito'] as const)
      expect(motivoBloqueio(c({ validacao: { id: 'v', status } }))).toBe('ja_liberado')
  })
  it('retirado pode ser liberado de novo', () => expect(motivoBloqueio(c({ validacao: { id: 'v', status: 'retirado' } }))).toBeNull())
})

describe('classificar', () => {
  it('seleção mista: 2 prontos, 1 sem composição, 1 sem portal; total só dos prontos', () => {
    const r = classificar([c({ id: 'a', valor: 0.1 }), c({ id: 'b', valor: 0.2 }), c({ id: 'x', composicaoConcluida: false, valor: 999 }), c({ id: 'y', portalHabilitado: false })])
    expect(r.prontos.map((p) => p.id)).toEqual(['a', 'b'])
    expect(r.bloqueados.map((b) => [b.candidato.id, b.motivo])).toEqual([['x', 'composicao'], ['y', 'sem_portal']])
    expect(r.total).toBe(0.3)
  })
})
