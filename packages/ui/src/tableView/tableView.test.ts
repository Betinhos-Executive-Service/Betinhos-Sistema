import { describe, expect, it } from 'vitest'
import {
  defaultConfig, moveColumn, normalizeConfig, parseConfig, resizeColumn, sameConfig, serializeConfig, toggleColumn, toggleSort, visibleColumns,
  type ViewColumnDef,
} from './config'
import { buildEntries, createMemoryViewStore, pickInitial, type StoredView } from './store'

const defs: ViewColumnDef[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'status', label: 'Status' },
  { key: 'obs', label: 'Observação', defaultHidden: true },
]
const keys = (c: { columns: { key: string }[] }) => c.columns.map((x) => x.key)

describe('defaultConfig', () => {
  it('segue a ordem do código e respeita defaultHidden', () => {
    const config = defaultConfig(defs, { key: 'nome', dir: 'asc' })
    expect(keys(config)).toEqual(['nome', 'cliente', 'status', 'obs'])
    expect(visibleColumns(config).map((c) => c.key)).toEqual(['nome', 'cliente', 'status'])
    expect(config.sort).toEqual({ key: 'nome', dir: 'asc' })
  })
})

describe('normalizeConfig', () => {
  const fallback = defaultConfig(defs, { key: 'nome', dir: 'asc' })

  it('descarta coluna que sumiu e acrescenta coluna nova no fim com a visibilidade da padrão', () => {
    const raw = { v: 1, columns: [{ key: 'nome', visible: true }, { key: 'antiga', visible: true }, { key: 'status', visible: true, width: 200 }], sort: null, filters: {} }
    const config = normalizeConfig(raw, defs, fallback)
    expect(keys(config)).toEqual(['nome', 'status', 'cliente', 'obs'])
    expect(config.columns.find((c) => c.key === 'cliente')?.visible).toBe(true)
    expect(config.columns.find((c) => c.key === 'obs')?.visible).toBe(false)
    expect(config.columns.find((c) => c.key === 'status')?.width).toBe(200)
  })

  it('força a primeira coluna do código visível e em primeiro', () => {
    const raw = { v: 1, columns: [{ key: 'status', visible: true }, { key: 'nome', visible: false }], sort: null, filters: {} }
    const config = normalizeConfig(raw, defs, fallback)
    expect(config.columns[0]).toEqual({ key: 'nome', visible: true })
  })

  it('descarta largura inválida, coluna repetida e ordenação por coluna inexistente', () => {
    const raw = { v: 1, columns: [{ key: 'nome', width: 40 }, { key: 'nome', visible: false }, { key: 'cliente', width: 5000 }], sort: { key: 'sumiu', dir: 'asc' }, filters: { status: 1 } }
    const config = normalizeConfig(raw, defs, fallback)
    expect(config.columns.filter((c) => c.key === 'nome')).toEqual([{ key: 'nome', visible: true }])
    expect(config.columns.find((c) => c.key === 'cliente')).toEqual({ key: 'cliente', visible: true })
    expect(config.sort).toEqual(fallback.sort)
    expect(config.filters).toEqual({ status: 1 })
  })

  it('versão desconhecida, texto inválido ou lixo voltam à padrão', () => {
    expect(normalizeConfig({ v: 2, columns: [] }, defs, fallback)).toBe(fallback)
    expect(normalizeConfig(parseConfig('{quebrado'), defs, fallback)).toBe(fallback)
    expect(normalizeConfig('texto', defs, fallback)).toBe(fallback)
  })

  it('sobrevive à ida e volta pelo texto gravado', () => {
    const config = resizeColumn(toggleColumn(fallback, defs, 'obs'), 'cliente', 260)
    expect(normalizeConfig(parseConfig(serializeConfig(config)), defs, fallback)).toEqual(config)
  })
})

describe('operações de coluna', () => {
  const base = defaultConfig(defs)

  it('move entre posições, mas nunca para a frente da primeira coluna', () => {
    expect(keys(moveColumn(base, defs, 'status', 1))).toEqual(['nome', 'status', 'cliente', 'obs'])
    expect(keys(moveColumn(base, defs, 'status', 0))).toEqual(['nome', 'status', 'cliente', 'obs'])
    expect(keys(moveColumn(base, defs, 'cliente', 99))).toEqual(['nome', 'status', 'obs', 'cliente'])
    expect(moveColumn(base, defs, 'nome', 2)).toBe(base)
  })

  it('não oculta a primeira coluna nem a última visível', () => {
    expect(toggleColumn(base, defs, 'nome')).toBe(base)
    const soNome = toggleColumn(toggleColumn(base, defs, 'cliente'), defs, 'status')
    expect(visibleColumns(soNome).map((c) => c.key)).toEqual(['nome'])
    expect(toggleColumn(toggleColumn(base, defs, 'obs'), defs, 'obs')).toEqual(base)
  })

  it('prende a largura entre 90 e 1200 e null volta ao padrão', () => {
    expect(resizeColumn(base, 'cliente', 20).columns[1].width).toBe(90)
    expect(resizeColumn(base, 'cliente', 9000).columns[1].width).toBe(1200)
    expect(resizeColumn(resizeColumn(base, 'cliente', 300), 'cliente', null)).toEqual(base)
  })

  it('ordenação: coluna nova começa crescente, a mesma alterna', () => {
    const asc = toggleSort(base, 'status')
    expect(asc.sort).toEqual({ key: 'status', dir: 'asc' })
    expect(toggleSort(asc, 'status').sort).toEqual({ key: 'status', dir: 'desc' })
    expect(toggleSort(toggleSort(asc, 'status'), 'status').sort).toEqual({ key: 'status', dir: 'asc' })
  })

  it('sameConfig ignora a ordem das chaves dos filtros', () => {
    const a = { ...base, filters: { a: 1, b: [1, 2] } }
    const b = { ...base, filters: { b: [1, 2], a: 1 } }
    expect(sameConfig(a, b)).toBe(true)
    expect(sameConfig(a, { ...base, filters: { a: 2, b: [1, 2] } })).toBe(false)
    expect(sameConfig(base, resizeColumn(base, 'nome', 200))).toBe(false)
  })
})

describe('buildEntries e pickInitial', () => {
  const fallback = defaultConfig(defs)
  const cfg = serializeConfig(toggleColumn(fallback, defs, 'cliente'))
  const stored: StoredView[] = [
    { id: 'p2', name: 'Zeta', publica: true, mine: false, ordem: 2, config: cfg },
    { id: 'm1', name: 'Minha B', publica: false, mine: true, config: cfg },
    { id: 'p1', name: 'Alfa', publica: true, mine: false, ordem: 1, config: 'quebrado' },
    { id: 'o1', name: 'De outro usuário', publica: false, mine: false, config: cfg },
    { id: 'm0', name: 'Minha A', publica: false, mine: true, config: cfg },
  ]

  it('ordena padrão, públicas por ordem e minhas por nome; esconde pessoais de outros', () => {
    const entries = buildEntries(stored, defs, fallback, false)
    expect(entries.map((e) => e.id)).toEqual(['padrao', 'p1', 'p2', 'm0', 'm1'])
    expect(entries.map((e) => e.scope)).toEqual(['padrao', 'publica', 'publica', 'pessoal', 'pessoal'])
    expect(entries.find((e) => e.id === 'p1')?.config).toEqual(fallback)
  })

  it('só gestor edita pública; ninguém edita a padrão', () => {
    const comum = buildEntries(stored, defs, fallback, false)
    const gestor = buildEntries(stored, defs, fallback, true)
    expect(comum.filter((e) => e.canEdit).map((e) => e.id)).toEqual(['m0', 'm1'])
    expect(gestor.filter((e) => e.canEdit).map((e) => e.id)).toEqual(['p1', 'p2', 'm0', 'm1'])
  })

  it('volta à padrão quando a última visão usada não existe mais', () => {
    const entries = buildEntries(stored, defs, fallback, false)
    expect(pickInitial(entries, 'm1').id).toBe('m1')
    expect(pickInitial(entries, 'apagada').id).toBe('padrao')
    expect(pickInitial(entries, null).id).toBe('padrao')
  })
})

describe('createMemoryViewStore', () => {
  it('cria, renomeia, regrava e exclui visões pessoais por tela', async () => {
    const store = createMemoryViewStore()
    const view = await store.create('pessoas', 'Ativos', '{}')
    await store.create('frota', 'Outra tela', '{}')
    expect((await store.list('pessoas')).map((v) => v.name)).toEqual(['Ativos'])
    await store.update(view.id, { name: 'Só ativos', config: '{"v":1}' })
    expect(await store.list('pessoas')).toEqual([{ ...view, name: 'Só ativos', config: '{"v":1}' }])
    await store.remove(view.id)
    expect(await store.list('pessoas')).toEqual([])
    await expect(store.remove(view.id)).rejects.toThrow('Visão não encontrada.')
  })

  it('só publica com permissão de gestor', async () => {
    const comum = createMemoryViewStore()
    const v = await comum.create('pessoas', 'X', '{}')
    await expect(comum.publish(v.id)).rejects.toThrow('Só gestores publicam visões.')
    const gestor = createMemoryViewStore([], { canPublish: true })
    const g = await gestor.create('pessoas', 'Y', '{}')
    await gestor.publish(g.id)
    expect((await gestor.list('pessoas'))[0]).toMatchObject({ publica: true, mine: false })
  })
})

describe('moveVisibleColumn', () => {
  it('conta só as visíveis e deixa as ocultas no lugar', async () => {
    const { moveVisibleColumn } = await import('./config')
    const base = defaultConfig(defs) // obs oculta no fim
    const withObs = moveColumn(base, defs, 'obs', 1) // nome, obs(oculta), cliente, status
    expect(keys(moveVisibleColumn(withObs, defs, 'status', 1))).toEqual(['nome', 'obs', 'status', 'cliente'])
    expect(keys(moveVisibleColumn(base, defs, 'cliente', 9))).toEqual(['nome', 'status', 'cliente', 'obs'])
    expect(moveVisibleColumn(base, defs, 'nome', 2)).toBe(base)
  })
})
