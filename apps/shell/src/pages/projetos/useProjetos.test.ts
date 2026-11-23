// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockAtualizacoes, createMockProjetos } from './data/mock'
import type { Source } from './data/source'
import { useProjetos } from './useProjetos'

const source = (over: Partial<Source> = {}): Source => ({
  mock: true,
  load: async () => ({ projetos: createMockProjetos(), atualizacoes: createMockAtualizacoes() }),
  create: async () => 'x', update: async () => undefined,
  addAtualizacao: async () => { throw new Error('não usado') }, baixarAnexo: async () => new Blob(),
  ...over,
})

const fonte = source()
const falha = source({ load: async () => { throw new Error('sem acesso') } })

describe('useProjetos', () => {
  it('carrega e ordena por nome', async () => {
    const { result } = renderHook(() => useProjetos(fonte))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const nomes = result.current.projetos.map((p) => p.nome)
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    expect(result.current.atualizacoes.length).toBeGreaterThan(0)
  })

  it('falha na primeira carga mostra o erro sem marcar como carregado', async () => {
    const { result } = renderHook(() => useProjetos(falha))
    await waitFor(() => expect(result.current.error).toBe('sem acesso'))
    expect(result.current.loaded).toBe(false)
  })

  it('upsert e addAtualizacao refletem o salvo sem recarregar', async () => {
    const { result } = renderHook(() => useProjetos(fonte))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const p = { ...result.current.projetos[0], nome: 'Zeta novo' }
    act(() => result.current.upsert(p))
    expect(result.current.projetos.at(-1)?.nome).toBe('Zeta novo')
    const antes = result.current.atualizacoes.length
    act(() => result.current.addAtualizacao({ id: 'n1', projetoId: p.id, data: '2026-11-23T10:00:00', autor: 100000000, texto: 'ok', prova: false, anexos: [] }))
    expect(result.current.atualizacoes).toHaveLength(antes + 1)
  })
})
