import { describe, expect, it } from 'vitest'
import { matchesFilters, readFilters, emptyFilters, type FilterCondition, type TableFilters } from '@betinhos/ui'
import { createMockPagantes, MOCK_CHOICES } from './pagantes/data/mock'
import { matchesKeyword as pagantesKeyword, paganteFields, readPagante } from './pagantes/domain/lista'
import { createMockOps } from './ops/data/mock'
import { FALLBACK_OP_CHOICES } from './ops/domain/status'
import { matchesKeyword as opsKeyword, opFields, readOp } from './ops/domain/lista'
import { PENDENCIA_FIELDS, readPendencia } from './pendencias/domain/lista'
import { INFRACAO_FIELDS, readInfracao } from './infracoes/domain/lista'
import { despesaFields, readDespesa } from './despesas/domain/lista'
import { readTreinamento, type Linha } from './treinamentos/domain/lista'

/** Filtro rápido de texto na coluna `field` (o mesmo formato que a barra de filtros grava). */
const quick = (field: string, op: FilterCondition['op'], value: string): TableFilters => ({
  ...emptyFilters(),
  quick: { [field]: { type: 'condition', id: 'q', field, op, value } },
})
const apply = <T,>(rows: T[], filters: TableFilters, fields: Parameters<typeof readFilters>[1], read: (row: T, key: string) => unknown) =>
  rows.filter((row) => matchesFilters(row, readFilters(filters, fields), fields, read))

const now = new Date('2026-10-07T12:00:00-03:00')

describe('coluna composta: o filtro lê só o campo da coluna', () => {
  const pagantes = createMockPagantes(now)
  const pg = pagantes.find((p) => p.pessoa && p.codigo)!
  const pgFields = paganteFields(MOCK_CHOICES)

  it('Pagante "igual a" e "termina com" acham a linha (antes liam "Nome PG-0001")', () => {
    const eq = apply(pagantes, quick('pessoa', 'eq', pg.pessoa), pgFields, readPagante)
    expect(eq.map((p) => p.id)).toContain(pg.id)
    expect(eq.every((p) => p.pessoa === pg.pessoa)).toBe(true)
    const ends = apply(pagantes, quick('pessoa', 'ends', pg.pessoa.slice(-4)), pgFields, readPagante)
    expect(ends.map((p) => p.id)).toContain(pg.id)
  })

  it('o código do pagante não entra no filtro de Pagante, mas a busca por palavras continua achando por ele', () => {
    expect(apply(pagantes, quick('pessoa', 'contains', pg.codigo), pgFields, readPagante)).toEqual([])
    expect(pagantes.filter((p) => pagantesKeyword(p, pg.codigo, undefined, MOCK_CHOICES)).map((p) => p.id)).toContain(pg.id)
  })

  const ops = createMockOps(now, 0)
  const opFilterFields = opFields(FALLBACK_OP_CHOICES)
  const op = ops.find((o) => o.cliente)!

  it('OP "não contém <cliente>" não tira as OPs desse cliente; "igual a" usa o código', () => {
    const semCliente = apply(ops, quick('op', 'not-contains', op.cliente), opFilterFields, readOp)
    expect(semCliente.map((o) => o.id)).toContain(op.id)
    expect(apply(ops, quick('op', 'eq', op.codigo), opFilterFields, readOp).map((o) => o.id)).toEqual([op.id])
  })

  it('a busca por palavras de OPs continua achando por cliente e por código', () => {
    expect(ops.filter((o) => opsKeyword(o, op.cliente, FALLBACK_OP_CHOICES)).map((o) => o.id)).toContain(op.id)
    expect(ops.filter((o) => opsKeyword(o, op.codigo, FALLBACK_OP_CHOICES)).map((o) => o.id)).toContain(op.id)
  })

  it('Pendências, Infrações e Despesas também leem só o campo da coluna', () => {
    const pend = { tipo: 'sem-op', opCodigo: 'OP-77', reservaCodigos: ['OS-1', 'OS-2'] } as unknown as Parameters<typeof readPendencia>[0]
    expect(readPendencia(pend, 'op')).toBe('OP-77')
    expect(readPendencia({ ...pend, opCodigo: '' }, 'op')).toBe('OS-1')
    expect(apply([pend], quick('op', 'eq', 'OP-77'), PENDENCIA_FIELDS, readPendencia)).toHaveLength(1)

    const inf = { codigo: '123-45', descricao: 'Estacionar em local proibido', enquadramento: 'Art. 181' } as unknown as Parameters<typeof readInfracao>[0]
    const lerInf = (row: typeof inf, key: string) => readInfracao(row, key, () => 0)
    expect(apply([inf], quick('infracao', 'eq', '123-45'), INFRACAO_FIELDS, lerInf)).toHaveLength(1)
    expect(apply([inf], quick('infracao', 'contains', 'proibido'), INFRACAO_FIELDS, lerInf)).toHaveLength(0)

    const desp = { estabelecimento: 'Posto Modelo', nome: 'Abastecimento' } as unknown as Parameters<typeof readDespesa>[0]
    const dFields = despesaFields({ operacional: [], financeiro: [] } as never, { categorias: [], motoristas: [] })
    expect(apply([desp], quick('despesa', 'eq', 'Posto Modelo'), dFields, readDespesa)).toHaveLength(1)
    expect(readDespesa({ ...desp, estabelecimento: '' } as typeof desp, 'despesa')).toBe('Abastecimento')
  })
})

describe('Treinamentos: dia da publicação em São Paulo', () => {
  const linha = (publicadoEm: string) => ({ publicadoEm }) as unknown as Linha
  it('publicação às 22:30 de 10/11 em São Paulo conta como 10/11 (em UTC já é 11/11)', () => {
    expect(readTreinamento(linha('2026-11-11T01:30:00Z'), 'publicadoEm')).toBe('2026-11-10')
  })
  it('meio-dia UTC fica no mesmo dia e texto só com a data vale como está', () => {
    expect(readTreinamento(linha('2026-10-05T12:00:00Z'), 'publicadoEm')).toBe('2026-10-05')
    expect(readTreinamento(linha('2026-10-05'), 'publicadoEm')).toBe('2026-10-05')
  })
  it('texto que não é data não quebra a lista', () => {
    expect(readTreinamento(linha('sem data válida'), 'publicadoEm')).toBe('sem data v')
  })
  it('sem publicação não há dia', () => {
    expect(readTreinamento(linha(''), 'publicadoEm')).toBeNull()
  })
})
