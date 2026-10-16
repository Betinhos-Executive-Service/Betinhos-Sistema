import { describe, expect, it } from 'vitest'
import { createMockPessoas } from '../data/mock'
import { FALLBACK_CHOICES, STATUS, label, withFallback } from './choices'
import { duplicateIndex, duplicatesFor, emailKey, nameKey, phoneKey } from './duplicates'
import { matchesFilters, readFilters, type TableFilters } from '@betinhos/ui'
import { EMPTY_FILTERS, VIEWS_KEY, clienteOptions, loadViews, parseStoredFilters, type KV } from './filters'
import { builtinViews, fromLegacyFilters, legacyViewConfig, matchesKeyword, pessoaFields, readPessoa, sortPessoas } from './lista'
import type { Pessoa } from './types'
import { applyForm, buildPayload, emptyForm, isDirty, maskPhone, toForm, validateForm } from './form'
import { mergeServicos, resumo } from './history'
import { hojeSaoPaulo } from '../components/PessoaDrawer'

const list = createMockPessoas()
const byName = (n: string) => list.find((p) => p.nome === n)!
const cargo = (p: { cargo: number | null }) => label(FALLBACK_CHOICES.cargo, p.cargo)
const bind = { nav: 'cr40f_Cliente', set: 'cr40f_clientes1s' }

function memory(): KV {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) }, removeItem: (k) => { data.delete(k) } }
}

describe('duplicados', () => {
  it('normaliza celular, e-mail e nome', () => {
    expect(phoneKey('+55 (11) 99812-4410')).toBe('11998124410')
    expect(phoneKey('3456-7788')).toBeNull()
    expect(emailKey(' HELENA@Exemplo.com.br ')).toBe('helena@exemplo.com.br')
    expect(emailKey('sem-arroba')).toBeNull()
    expect(nameKey('  Mariána   ALBUQUERQUE ')).toBe('mariana albuquerque')
    expect(nameKey('Mariana')).toBeNull()
  })

  it('acha por celular, e-mail (sem caixa) e nome+cliente, sem marcar quem não repete', () => {
    const idx = duplicateIndex(list)
    const motivos = (n: string) => (idx.get(byName(n).id) ?? []).map((d) => `${d.nome}:${d.motivo}`).sort()
    expect(motivos('Mari Albuquerque')).toEqual(['Mariana Albuquerque:celular'])
    expect(motivos('Helena Prado Lima')).toEqual(['Helena Prado:e-mail'])
    expect(idx.get(list[0].id)?.map((d) => d.motivo).sort()).toEqual(['celular', 'nome e cliente'])
    expect(idx.has(byName('John Carter').id)).toBe(false)
  })

  it('no formulário ignora o próprio cadastro', () => {
    const p = byName('John Carter')
    expect(duplicatesFor(p, list)).toEqual([])
    expect(duplicatesFor({ ...p, id: '', telefone: '11 99812 4410' }, list).map((d) => d.nome)).toContain('Mariana Albuquerque')
  })
})

describe('lista (visões e filtros do Design System)', () => {
  const dups = new Set(duplicateIndex(list).keys())
  const clientes = clienteOptions(list)
  const fields = pessoaFields(FALLBACK_CHOICES, clientes)
  const apply = (filters: TableFilters) => list.filter((p) => matchesFilters(p, readFilters(filters, fields), fields, (x, key) => readPessoa(x as Pessoa, key, dups))).map((p) => p.nome)
  const viewFilters = (id: string) => (JSON.parse(builtinViews(FALLBACK_CHOICES).find((v) => v.id === id)!.config) as { filters: TableFilters }).filters

  it('busca sem acento por nome, cliente, celular sem máscara, e-mail e cargo', () => {
    const q = (query: string) => list.filter((p) => matchesKeyword(p, query, cargo(p))).map((p) => p.nome)
    expect(q('lumen')).toEqual(expect.arrayContaining(['Helena Prado', 'Juliana Costa']))
    expect(q('97777')).toEqual(['Juliana Costa'])
    expect(q('ricardo@exemplo')).toEqual(['Ricardo Menezes'])
    expect(q('assistente executiva')).toEqual(['Ricardo Menezes'])
    expect(q('saude')).toEqual(['Grupo Congresso Saúde'])
  })

  it('visões prontas filtram por status e duplicados', () => {
    expect(builtinViews(FALLBACK_CHOICES).map((v) => v.name)).toEqual(['Ativos', 'Passageiros frequentes', 'Solicitantes', 'Possíveis duplicados'])
    expect(apply(viewFilters('ativos'))).not.toContain('Paulo Tavares')
    expect(apply(viewFilters('duplicados')).length).toBe(dups.size)
    expect(clientes.map((c) => c.label)).toEqual(['Grupo Atlântico', 'Lumen Consultoria', 'Particular'])
  })

  it('filtros antigos (URL e visões do navegador) viram os novos', () => {
    const lumen = clientes.find((c) => c.label === 'Lumen Consultoria')!
    const f = fromLegacyFilters({ ...EMPTY_FILTERS, clienteId: lumen.value, status: STATUS.inativo }, FALLBACK_CHOICES, clientes)
    expect(f.quick.cliente).toMatchObject({ op: 'in', values: [lumen] })
    expect(apply(fromLegacyFilters({ ...EMPTY_FILTERS, status: STATUS.inativo }, FALLBACK_CHOICES, clientes))).toEqual(['Paulo Tavares'])
    expect(apply(fromLegacyFilters({ ...EMPTY_FILTERS, duplicados: true }, FALLBACK_CHOICES, clientes)).length).toBe(dups.size)
  })

  it('ordena pela coluna com vazios por último', () => {
    const nomes = sortPessoas(list, 'nome', 'desc', FALLBACK_CHOICES).map((p) => p.nome)
    expect(nomes).toEqual([...nomes].sort((a, b) => b.localeCompare(a, 'pt-BR')))
  })

  it('importação: lê as visões do navegador e descarta adulteradas', () => {
    const kv = memory()
    kv.setItem(VIEWS_KEY, JSON.stringify({ views: [{ id: 'x', nome: 'cliente ruim', filters: { clienteId: "x' or 1 eq 1" } }, { id: 'ativos', nome: 'pronta', filters: {} }, { id: 'y', nome: 'ok', filters: {} }] }))
    expect(loadViews(kv).views.map((x) => x.id)).toEqual(['y'])
    expect(parseStoredFilters({ classificacao: ['a'] })).toBeNull()
    expect(JSON.parse(legacyViewConfig(loadViews(kv).views[0].filters, FALLBACK_CHOICES, clientes))).toMatchObject({ v: 1, sort: { key: 'nome', dir: 'asc' } })
  })
})

describe('formulário', () => {
  it('máscara de celular aceita colar com +55', () => {
    expect(maskPhone('+55 11 99812-4410')).toBe('(11) 99812-4410')
    expect(maskPhone('1134567788')).toBe('(11) 3456-7788')
    expect(maskPhone('11')).toBe('(11')
  })

  it('valida nome, celular, e-mail, obrigatórios e nascimento', () => {
    const e = validateForm({ ...emptyForm(), nome: 'A', telefone: '123', email: 'x@', idioma: '', nascimento: '2999-01-01' }, new Date('2026-10-07'))
    expect(Object.keys(e).sort()).toEqual(['email', 'idioma', 'nascimento', 'nome', 'telefone'])
    expect(validateForm({ ...emptyForm(), nome: 'Ana Lima' })).toEqual({})
    const legado = { ...emptyForm(), nome: 'Ana Lima', telefone: 'ramal 22', email: 'sem email' }
    expect(validateForm({ ...legado, departamento: 'RH' }, new Date(), legado)).toEqual({})
    expect(Object.keys(validateForm({ ...legado, telefone: 'ramal 23' }, new Date(), legado))).toEqual(['telefone'])
  })

  it('cadastro manda só o preenchido; edição só o que mudou, inclusive limpar cliente', () => {
    const novo = buildPayload(null, { ...emptyForm(), nome: ' Ana Lima ', email: 'ANA@X.COM', clienteId: 'c1' }, bind)
    expect(novo).toEqual({ cr40f_nomedopassageiro: 'Ana Lima', cr40f_email: 'ana@x.com', cr40f_idioma: 202410000, cr40f_status: 202410000, 'cr40f_Cliente@odata.bind': '/cr40f_clientes1s(c1)' })
    const p = byName('Mariana Albuquerque')
    const base = toForm(p)
    expect(buildPayload(base, base, bind)).toEqual({})
    expect(buildPayload(base, { ...base, clienteId: '', clienteNome: '', departamento: '' }, bind)).toEqual({ cr40f_Cliente: null, cr40f_departamento: null })
    expect(isDirty(base, { ...base, clienteNome: 'outro rótulo' })).toBe(false)
    expect(applyForm(p, { ...base, email: ' NOVO@X.COM ' }).email).toBe('novo@x.com')
  })
})

describe('histórico', () => {
  const s = (id: string, dias: number, papel: 'Solicitante' | 'Passageiro') => ({ id, codigo: id, data: new Date(Date.UTC(2026, 9, 7) - dias * 86_400_000), destino: '', status: '', tipo: '', papel })
  it('junta papéis do mesmo serviço e ordena do mais recente', () => {
    const m = mergeServicos([s('a', 10, 'Passageiro'), s('b', 1, 'Solicitante'), s('a', 10, 'Solicitante')])
    expect(m.map((x) => x.id)).toEqual(['b', 'a'])
    expect(m[1].papeis).toEqual(['Passageiro', 'Solicitante'])
  })
  it('resume total, último, 90 dias e próximo', () => {
    const r = resumo(mergeServicos([s('futuro', -2, 'Passageiro'), s('a', 5, 'Passageiro'), s('b', 200, 'Passageiro')]), new Date(Date.UTC(2026, 9, 7)))
    expect(r.total).toBe(3)
    expect(r.ultimos90).toBe(1)
    expect(r.proximo?.toISOString().slice(0, 10)).toBe('2026-10-09')
    expect(r.primeiro?.toISOString().slice(0, 10)).toBe('2026-03-21')
  })
})

describe('data de cadastro', () => {
  it('usa o dia de São Paulo, não o UTC', () => {
    expect(hojeSaoPaulo(new Date('2026-10-08T01:30:00Z'))).toBe('2026-10-07')
  })
})

describe('rótulos', () => {
  it('cai no rótulo conhecido quando a metadata vem vazia', () => {
    expect(withFallback({ idioma: [] }).idioma).toEqual(FALLBACK_CHOICES.idioma)
  })
})
