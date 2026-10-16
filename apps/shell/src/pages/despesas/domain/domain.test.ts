import { describe, expect, it } from 'vitest'
import { createMockDespesas } from '../data/mock'
import { matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { EMPTY_FILTERS, VIEWS_KEY, loadViews, opcoes, parseStoredFilters } from './filters'
import { builtinViews, despesaFields, fromLegacyFilters, legacyViewConfig, matchesKeyword, readDespesa, sortDespesas } from './lista'
import { mimeDoArquivo, tipoPrevia } from './arquivo'
import { resumo } from './resumo'
import { ANEXO, FALLBACK_CHOICES, FINANCEIRO, OPERACIONAL, semComprovante, withFallback } from './status'
import type { Despesa } from './types'

const list = createMockDespesas(new Date(2026, 9, 9, 12))
const memoryKV = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

const op = opcoes(list)
const fields = despesaFields(FALLBACK_CHOICES, op)
const apply = (filters: TableFilters) => list.filter((d) => matchesFilters(d, readFilters(filters, fields), fields, readDespesa))
const legacy = (patch: Partial<typeof EMPTY_FILTERS>) => apply(fromLegacyFilters({ ...EMPTY_FILTERS, ...patch }, FALLBACK_CHOICES, op))
const viewFilters = (id: string) => (JSON.parse(builtinViews(FALLBACK_CHOICES).find((v) => v.id === id)!.config) as { filters: TableFilters }).filters

describe('filtros de despesas', () => {
  it('filtra por status, categoria, motorista e alertas (filtros antigos convertidos)', () => {
    const corrigir = legacy({ operacional: [OPERACIONAL.corrigir] })
    expect(corrigir.length).toBe(2)
    expect(corrigir.every((d) => d.statusOperacional === OPERACIONAL.corrigir)).toBe(true)
    expect(legacy({ financeiro: [FINANCEIRO.aguardando] }).every((d) => d.statusFinanceiro === FINANCEIRO.aguardando)).toBe(true)
    expect(legacy({ categoria: ['cat-2'] }).every((d) => d.categoria === 'Pedágio')).toBe(true)
    expect(legacy({ motorista: ['mot-1'] }).every((d) => d.motorista === 'Carlos Oliveira')).toBe(true)
    expect(legacy({ alertas: ['duplicidade'] }).map((d) => d.id)).toEqual(['mock-desp-7', 'mock-desp-12'])
    expect(legacy({ alertas: ['sem-comprovante'] }).every(semComprovante)).toBe(true)
    // Vários alertas: todos precisam valer, como na barra antiga.
    expect(legacy({ alertas: ['duplicidade', 'sem-comprovante'] }).every((d) => d.possivelDuplicidade && semComprovante(d))).toBe(true)
  })

  it('busca por palavras sem acento em vários campos', () => {
    const q = (query: string) => list.filter((d) => matchesKeyword(d, query))
    expect(q('imigrantes ribeiro').every((d) => d.estabelecimento === 'Ecovias Imigrantes' && d.motorista === 'Ana Ribeiro')).toBe(true)
    expect(q('desp-5003').map((d) => d.id)).toEqual(['mock-desp-3'])
    expect(q('sao paulo').length).toBeGreaterThan(0)
  })

  it('opções de categoria e motorista vêm do que carregou, em ordem alfabética', () => {
    expect(op.categorias.map((c) => c.label)).toEqual(['Alimentação', 'Combustível', 'Estacionamento', 'Hospedagem', 'Lavagem', 'Pedágio'])
    expect(op.motoristas[0]).toEqual({ value: 'mot-2', label: 'Ana Ribeiro' })
  })

  it('ordena por valor e data com vazios por último', () => {
    const valores = sortDespesas(list, 'valor', 'desc', FALLBACK_CHOICES).map((d) => d.valor).filter((v) => v != null) as number[]
    expect(valores).toEqual([...valores].sort((a, b) => b - a))
    const datas = sortDespesas(list, 'data', 'asc', FALLBACK_CHOICES).map((d) => d.data?.getTime() ?? Infinity)
    expect(datas).toEqual([...datas].sort((a, b) => a - b))
  })
})

describe('visões', () => {
  it('visões prontas filtram como antes', () => {
    expect(builtinViews(FALLBACK_CHOICES).map((v) => v.name)).toEqual(['Aguardando pagamento', 'Precisa corrigir', 'Sem comprovante', 'Possível duplicidade', 'Suspeitas da IA'])
    expect(apply(viewFilters('aguardando')).every((d) => d.statusFinanceiro === FINANCEIRO.aguardando)).toBe(true)
    expect(apply(viewFilters('duplicidade')).map((d) => d.id)).toEqual(['mock-desp-7', 'mock-desp-12'])
  })

  it('importação: lê as visões do navegador, descarta inválidas e converte sem o período', () => {
    expect(parseStoredFilters({ periodo: '7' })).toBeNull()
    expect(parseStoredFilters({ periodo: '90', alertas: ['outro'] })).toBeNull()
    expect(parseStoredFilters({ periodo: '90', categoria: [1] })).toBeNull()
    const kv = memoryKV()
    kv.setItem(VIEWS_KEY, JSON.stringify({ views: [{ id: 'x', nome: 'X', filters: { periodo: 'nunca' } }, { id: 'todas', nome: 'Dup', filters: {} }, { id: 'v1', nome: ' Pedágios ', filters: { periodo: '30', categoria: ['cat-2'] } }] }))
    const views = loadViews(kv).views
    expect(views.map((v) => v.nome)).toEqual(['Pedágios'])
    const config = JSON.parse(legacyViewConfig(views[0].filters, FALLBACK_CHOICES, op))
    expect(config.filters.advanced.items[0]).toMatchObject({ field: 'categoria', op: 'in', values: [{ value: 'cat-2', label: 'Pedágio' }] })
  })
})

describe('resumo e status', () => {
  it('soma total, aguardando, sem comprovante e duplicidade', () => {
    const d = (p: Partial<Despesa>) => ({ ...list[0], possivelDuplicidade: false, statusAnexo: ANEXO.completo, statusFinanceiro: FINANCEIRO.pago, ...p })
    expect(resumo([
      d({ valor: 100, statusFinanceiro: FINANCEIRO.aguardando }),
      d({ valor: 50.5, statusAnexo: ANEXO.sem, possivelDuplicidade: true }),
      d({ valor: null, statusAnexo: null }),
    ])).toEqual({ qtd: 3, total: 150.5, aguardandoQtd: 1, aguardandoValor: 100, semComprovante: 2, duplicidade: 1 })
  })

  it('choices da metadata vencem; vazios caem nos rótulos de DEV', () => {
    const c = withFallback({ operacional: [{ value: 1, label: 'X' }], financeiro: [] })
    expect(c.operacional).toEqual([{ value: 1, label: 'X' }])
    expect(c.financeiro[1]).toEqual({ value: FINANCEIRO.aguardando, label: 'Aguardando pagamento' })
  })
})

describe('prévia de comprovante', () => {
  it('usa o Content-Type do OneDrive e, se genérico, a extensão', () => {
    expect(mimeDoArquivo('x.bin', 'image/png; charset=binary')).toBe('image/png')
    expect(mimeDoArquivo('Nota.PDF', 'application/octet-stream')).toBe('application/pdf')
    expect(mimeDoArquivo('cupom.jpeg', null)).toBe('image/jpeg')
    expect(mimeDoArquivo('qa.txt', '')).toBe('application/octet-stream')
  })

  it('só imagem e PDF têm prévia', () => {
    expect(tipoPrevia('image/webp')).toBe('imagem')
    expect(tipoPrevia('application/pdf')).toBe('pdf')
    expect(tipoPrevia('image/heic')).toBeNull()
  })
})
