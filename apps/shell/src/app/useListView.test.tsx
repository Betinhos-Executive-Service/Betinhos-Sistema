// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider, emptyFilters, type FilterField, type TableFilters, type ViewColumnDef } from '@betinhos/ui'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Host } from '../host'
import { encodeTableFilters } from './filtersUrl'
import { useListView } from './useListView'

const COLUMNS: ViewColumnDef[] = [{ key: 'nome', label: 'Nome' }]
const FIELDS: FilterField[] = [{ key: 'nome', label: 'Nome', kind: 'text' }]
const nome = (value: string): TableFilters => ({ ...emptyFilters(), quick: { nome: { type: 'condition', id: 'q', field: 'nome', op: 'contains', value } } })
const linkTo = (value: string) => `#/lista?f=${encodeTableFilters(nome(value))}`
const valorDe = (filters: TableFilters) => (filters.quick.nome as { value?: string } | undefined)?.value
const fColuna = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('f') ?? ''

const MOCK: Host = { mode: 'mock' }
/** Dataverse que recusa tudo: a lista de visões falha por inteiro (permissão, rede). */
const OFFLINE = { mode: 'dataverse', clientUrl: 'https://x.invalid', client: { request: async () => { throw new Error('Sem permissão para ler as visões.') } }, metadata: {} } as unknown as Host

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
const setup = (host: Host) => renderHook(() => useListView({ host, tela: 'lista-teste', columns: COLUMNS, fields: FIELDS, ready: true, builtins: () => [], defaultName: 'Lista' }), { wrapper })

/** O que o navegador faz ao abrir outro link da mesma tela: troca o hash e avisa. */
const abrirLink = (hash: string) => act(() => {
  history.replaceState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
})

beforeEach(() => { history.replaceState(null, '', '#/lista') })
afterEach(cleanup)

describe('useListView: filtro do link', () => {
  it('aplica o f= mesmo quando a lista de visões falha, e mostra o erro', async () => {
    history.replaceState(null, '', linkTo('Ana'))
    const { result } = setup(OFFLINE)
    await waitFor(() => expect(result.current.view.status).toBe('error'))
    await waitFor(() => expect(valorDe(result.current.filters)).toBe('Ana'))
    expect(fColuna()).toBe(encodeTableFilters(nome('Ana')))
    await waitFor(() => expect(document.body.textContent).toContain('Sem permissão para ler as visões.'))
  })

  it('lê o f= novo quando outro link abre a mesma lista sem remontar', async () => {
    history.replaceState(null, '', linkTo('Ana'))
    const { result } = setup(MOCK)
    await waitFor(() => expect(valorDe(result.current.filters)).toBe('Ana'))
    abrirLink(linkTo('Bruno'))
    await waitFor(() => expect(valorDe(result.current.filters)).toBe('Bruno'))
    expect(fColuna()).toBe(encodeTableFilters(nome('Bruno')))
  })

  it('a própria escrita do f= não volta como link novo (sem laço, sem desfazer o que a pessoa fez)', async () => {
    history.replaceState(null, '', linkTo('Ana'))
    const { result } = setup(MOCK)
    await waitFor(() => expect(valorDe(result.current.filters)).toBe('Ana'))
    act(() => result.current.view.setConfig((c) => ({ ...c, filters: nome('Carla') })))
    await waitFor(() => expect(fColuna()).toBe(encodeTableFilters(nome('Carla'))))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(valorDe(result.current.filters)).toBe('Carla')
    expect(fColuna()).toBe(encodeTableFilters(nome('Carla')))
  })

  it('link sem filtro ou com f= inválido não apaga a grade', async () => {
    history.replaceState(null, '', linkTo('Ana'))
    const { result } = setup(MOCK)
    await waitFor(() => expect(valorDe(result.current.filters)).toBe('Ana'))
    abrirLink('#/lista?f=lixo')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(valorDe(result.current.filters)).toBe('Ana')
  })
})
