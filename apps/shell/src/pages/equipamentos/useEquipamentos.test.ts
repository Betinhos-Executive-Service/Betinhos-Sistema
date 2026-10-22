// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMockEquipamentos, createMockPessoas, createMockTipos } from './data/mock'
import type { Carga, Source } from './data/source'
import { useEquipamentos } from './useEquipamentos'

const carga = (): Carga => ({ equipamentos: createMockEquipamentos(), tipos: createMockTipos(), pessoas: createMockPessoas() })

describe('useEquipamentos', () => {
  it('recarga em voo não sobrescreve o que acabou de ser salvo', async () => {
    const pendentes: ((c: Carga) => void)[] = []
    const source = { load: () => new Promise<Carga>((resolve) => { pendentes.push(resolve) }) } as unknown as Source
    const { result } = renderHook(() => useEquipamentos(source))
    await act(async () => { pendentes[0](carga()) })
    expect(result.current.loaded).toBe(true)

    // Recarga começa (resposta antiga, ainda com "Monitor") e, antes dela voltar, o tipo é renomeado.
    act(() => { void result.current.reload() })
    expect(result.current.loading).toBe(true)
    const monitor = result.current.tipos.find((t) => t.nome === 'Monitor')!
    act(() => result.current.upsertTipo({ ...monitor, nome: 'Monitor LCD' }))
    expect(result.current.loading).toBe(false)
    await act(async () => { pendentes[1](carga()) })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tipos.find((t) => t.id === monitor.id)?.nome).toBe('Monitor LCD')
    expect(result.current.equipamentos.find((e) => e.tipoId === monitor.id)?.tipoNome).toBe('Monitor LCD')
  })
})
