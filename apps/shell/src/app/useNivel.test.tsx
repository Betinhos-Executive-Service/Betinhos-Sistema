// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AcessosContext } from './AcessosProvider'
import { ComAcessos } from './ComAcessos'
import { useAcessoColunas, usePodeExcluir } from './useNivel'

const com = (perfis: string) => ({ children }: { children: ReactNode }) => <ComAcessos perfis={perfis}>{children}</ComAcessos>

describe('useNivel', () => {
  it('sem provider vale o padrão (admin)', () => {
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos')).result.current).toBe(true)
  })

  it('segue o perfil do provider', () => {
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper: com('financeiro:operador') }).result.current).toBe(false)
    expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper: com('financeiro:gestor') }).result.current).toBe(true)
    const colunas = renderHook(() => useAcessoColunas('cr40f_funcionarios'), { wrapper: com('rh:operador') }).result.current
    expect(colunas('cr40f_numerodocpf')).toEqual({ ler: false, editar: false })
    expect(colunas('cr40f_datadeadmissao')).toEqual({ ler: true, editar: true })
  })

  it('carregando ou erro: nada sensível (NENHUM)', () => {
    for (const valor of [{ status: 'carregando' as const }, { status: 'erro' as const }]) {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <AcessosContext.Provider value={{ ...valor, recarregar: () => {} } as never}>{children}</AcessosContext.Provider>
      )
      expect(renderHook(() => usePodeExcluir('cr40f_composicaodeprecos'), { wrapper }).result.current).toBe(false)
    }
  })
})
