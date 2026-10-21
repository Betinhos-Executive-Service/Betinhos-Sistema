import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { FIRST_PAGE, andFilter, getAllWithFirstPage, odataSearchFilter, searchRows, searchTerms } from './pagedLoad'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('odataSearchFilter', () => {
  it('startswith nos códigos, contains só nos textos; E entre palavras, OU entre campos', () => {
    expect(odataSearchFilter('OP-12 lumen', { startsWith: ['cr40f_idfinanceiro'], contains: ['new_clientedaop'] }))
      .toBe("(startswith(cr40f_idfinanceiro,'OP-12') or contains(new_clientedaop,'OP-12')) and (startswith(cr40f_idfinanceiro,'lumen') or contains(new_clientedaop,'lumen'))")
    expect(odataSearchFilter('PAG-50', { startsWith: ['cr40f_id'] })).toBe("startswith(cr40f_id,'PAG-50')")
  })

  it('escapa aspas, ignora palavras de 1 letra e limita a 4 palavras', () => {
    expect(odataSearchFilter("d'avila", { contains: ['cr40f_nome'] })).toBe("contains(cr40f_nome,'d''avila')")
    expect(searchTerms('  a bb c dd ee ff gg ')).toEqual(['bb', 'dd', 'ee', 'ff'])
    expect(odataSearchFilter('a', { contains: ['cr40f_nome'] })).toBeNull()
    expect(odataSearchFilter('   ', { contains: ['cr40f_nome'] })).toBeNull()
    expect(odataSearchFilter('ana', {})).toBeNull()
  })

  it('junta com o filtro base da lista', () => {
    expect(andFilter('statecode eq 0', null)).toBe('statecode eq 0')
    expect(andFilter('statecode eq 0', "startswith(cr40f_id,'P')")).toBe("statecode eq 0 and startswith(cr40f_id,'P')")
  })
})

function client(getAll: () => Promise<Row[]>, request: () => Promise<{ value: Row[] }>) {
  return { apiUrl: '', getAll: vi.fn(getAll), request: vi.fn(request), create: vi.fn(), update: vi.fn(), remove: vi.fn() } as unknown as DataverseClient
}

describe('getAllWithFirstPage', () => {
  it('pede a primeira página (maxpagesize 100) em paralelo com a carga completa e a entrega antes', async () => {
    const full = deferred<Row[]>()
    const c = client(() => full.promise, async () => ({ value: [{ id: 1 }] }))
    const onFirst = vi.fn()
    const all = getAllWithFirstPage(c, 'pessoas?$select=x', onFirst)
    expect(c.getAll).toHaveBeenCalledWith('pessoas?$select=x')
    expect(c.request).toHaveBeenCalledWith('pessoas?$select=x', { maxPageSize: FIRST_PAGE })
    await tick()
    expect(onFirst).toHaveBeenCalledWith([{ id: 1 }])
    full.resolve([{ id: 1 }, { id: 2 }])
    await expect(all).resolves.toEqual([{ id: 1 }, { id: 2 }])
  })

  it('ignora a primeira página que chega depois da completa, e a falha só dela', async () => {
    const first = deferred<{ value: Row[] }>()
    const c = client(async () => [{ id: 1 }, { id: 2 }], () => first.promise)
    const onFirst = vi.fn()
    await getAllWithFirstPage(c, 'x', onFirst)
    first.resolve({ value: [{ id: 1 }] })
    await tick()
    expect(onFirst).not.toHaveBeenCalled()

    const c2 = client(async () => [{ id: 3 }], async () => { throw new Error('página 1 falhou') })
    await expect(getAllWithFirstPage(c2, 'x', onFirst)).resolves.toEqual([{ id: 3 }])
  })

  it('erro da carga completa chega a quem chamou (a primeira página já pode ter aparecido)', async () => {
    const full = deferred<Row[]>()
    const c = client(() => full.promise, async () => ({ value: [{ id: 1 }] }))
    const onFirst = vi.fn()
    const all = getAllWithFirstPage(c, 'x', onFirst)
    await tick()
    full.reject(new Error('rede caiu'))
    await expect(all).rejects.toThrow('rede caiu')
    expect(onFirst).toHaveBeenCalledTimes(1)
  })

  it('sem quem receba a primeira página, só a carga completa', async () => {
    const c = client(async () => [], async () => ({ value: [] }))
    await getAllWithFirstPage(c, 'x')
    expect(c.request).not.toHaveBeenCalled()
  })

  it('searchRows limita com $top', async () => {
    const c = client(async () => [], async () => ({ value: [{ id: 9 }] }))
    await expect(searchRows(c, 'ops?$filter=x')).resolves.toEqual([{ id: 9 }])
    expect(c.request).toHaveBeenCalledWith('ops?$filter=x&$top=50')
  })
})
