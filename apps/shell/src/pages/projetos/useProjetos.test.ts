// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockAtualizacoes, createMockEtapas, createMockProjetos } from './data/mock'
import type { Source } from './data/source'
import { useProjetos } from './useProjetos'

const naoUsado = async () => { throw new Error('não usado') }
const source = (over: Partial<Source> = {}): Source => ({
  mock: true,
  load: async () => ({ projetos: createMockProjetos(), etapas: createMockEtapas(), atualizacoes: createMockAtualizacoes() }),
  createProjeto: naoUsado, updateProjeto: async () => undefined, createEtapa: naoUsado, updateEtapa: async () => undefined,
  addAtualizacao: naoUsado, baixarAnexo: async () => new Blob(), perfil: async () => 'renan',
  ...over,
})

const fonte = source()
const falha = source({ load: async () => { throw new Error('sem acesso') } })

describe('useProjetos', () => {
  it('carrega projetos (por nome), etapas e atualizações', async () => {
    const { result } = renderHook(() => useProjetos(fonte))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const nomes = result.current.projetos.map((p) => p.nome)
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    expect(result.current.etapas.length).toBeGreaterThan(0)
    expect(result.current.atualizacoes.length).toBeGreaterThan(0)
  })

  it('falha na primeira carga mostra o erro sem marcar como carregado', async () => {
    const { result } = renderHook(() => useProjetos(falha))
    await waitFor(() => expect(result.current.error).toBe('sem acesso'))
    expect(result.current.loaded).toBe(false)
  })

  it('upsert, upsertEtapa e addAtualizacao refletem o salvo sem recarregar', async () => {
    const { result } = renderHook(() => useProjetos(fonte))
    await waitFor(() => expect(result.current.loaded).toBe(true))
    const p = { ...result.current.projetos[0], nome: 'Zeta novo' }
    act(() => result.current.upsert(p))
    expect(result.current.projetos.at(-1)?.nome).toBe('Zeta novo')
    const e = { ...result.current.etapas[0], nome: 'Renomeada' }
    act(() => result.current.upsertEtapa(e))
    expect(result.current.etapas.find((x) => x.id === e.id)?.nome).toBe('Renomeada')
    const antes = result.current.atualizacoes.length
    act(() => result.current.addAtualizacao({ id: 'n1', projetoId: p.id, etapaId: null, data: '2026-11-23T10:00:00', autor: 100000000, texto: 'ok', prova: false, transcricao: '', anexos: [] }))
    expect(result.current.atualizacoes).toHaveLength(antes + 1)
  })
})
