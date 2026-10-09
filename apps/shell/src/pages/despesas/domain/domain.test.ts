import { describe, expect, it } from 'vitest'
import { createMockDespesas } from '../data/mock'
import { BUILTIN_VIEWS, EMPTY_FILTERS, VIEWS_KEY, filterDespesas, loadViews, matchView, newView, opcoes, parseStoredFilters, saveViews } from './filters'
import { mimeDoArquivo, temPrevia, tipoPrevia } from './arquivo'
import { resumo } from './resumo'
import { ANEXO, FINANCEIRO, OPERACIONAL, semComprovante, withFallback } from './status'
import type { Despesa } from './types'

const list = createMockDespesas(new Date(2026, 9, 9, 12))
const memoryKV = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }

describe('filtros de despesas', () => {
  it('filtra por status, categoria, motorista e alertas', () => {
    const corrigir = filterDespesas(list, { ...EMPTY_FILTERS, operacional: [OPERACIONAL.corrigir] })
    expect(corrigir.length).toBe(2)
    expect(corrigir.every((d) => d.statusOperacional === OPERACIONAL.corrigir)).toBe(true)
    expect(filterDespesas(list, { ...EMPTY_FILTERS, financeiro: [FINANCEIRO.aguardando] }).every((d) => d.statusFinanceiro === FINANCEIRO.aguardando)).toBe(true)
    expect(filterDespesas(list, { ...EMPTY_FILTERS, categoria: ['cat-2'] }).every((d) => d.categoria === 'Pedágio')).toBe(true)
    expect(filterDespesas(list, { ...EMPTY_FILTERS, motorista: ['mot-1'] }).every((d) => d.motorista === 'Carlos Oliveira')).toBe(true)
    expect(filterDespesas(list, { ...EMPTY_FILTERS, alertas: ['duplicidade'] }).map((d) => d.id)).toEqual(['mock-desp-7', 'mock-desp-12'])
    expect(filterDespesas(list, { ...EMPTY_FILTERS, alertas: ['sem-comprovante'] }).every(semComprovante)).toBe(true)
  })

  it('busca por palavras sem acento em vários campos', () => {
    expect(filterDespesas(list, { ...EMPTY_FILTERS, query: 'imigrantes ribeiro' }).every((d) => d.estabelecimento === 'Ecovias Imigrantes' && d.motorista === 'Ana Ribeiro')).toBe(true)
    expect(filterDespesas(list, { ...EMPTY_FILTERS, query: 'desp-5003' }).map((d) => d.id)).toEqual(['mock-desp-3'])
    expect(filterDespesas(list, { ...EMPTY_FILTERS, query: 'sao paulo' }).length).toBeGreaterThan(0)
  })

  it('opções de categoria e motorista vêm do que carregou, em ordem alfabética', () => {
    const { categorias, motoristas } = opcoes(list)
    expect(categorias.map((c) => c.label)).toEqual(['Alimentação', 'Combustível', 'Estacionamento', 'Hospedagem', 'Lavagem', 'Pedágio'])
    expect(motoristas[0]).toEqual({ value: 'mot-2', label: 'Ana Ribeiro' })
  })
})

describe('visões', () => {
  it('reconhece a visão pronta pelos filtros e salva visão pessoal', () => {
    expect(matchView(BUILTIN_VIEWS, { ...EMPTY_FILTERS, financeiro: [FINANCEIRO.aguardando] })?.id).toBe('aguardando')
    const kv = memoryKV()
    const view = newView('  Pedágios  ', { ...EMPTY_FILTERS, categoria: ['cat-2'] }, 1)
    saveViews(kv, { views: [view], last: view.id })
    expect(loadViews(kv)).toEqual({ views: [{ ...view, nome: 'Pedágios' }], last: view.id })
  })

  it('descarta visão salva com filtro inválido', () => {
    expect(parseStoredFilters({ periodo: '7' })).toBeNull()
    expect(parseStoredFilters({ periodo: '90', alertas: ['outro'] })).toBeNull()
    expect(parseStoredFilters({ periodo: '90', categoria: [1] })).toBeNull()
    const kv = memoryKV()
    kv.setItem(VIEWS_KEY, JSON.stringify({ views: [{ id: 'x', nome: 'X', filters: { periodo: 'nunca' } }, { id: 'todas', nome: 'Dup', filters: {} }], last: 'x' }))
    expect(loadViews(kv).views).toEqual([])
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
    expect(temPrevia('foto.jpg')).toBe(true)
    expect(temPrevia('planilha.xlsx')).toBe(false)
  })
})
