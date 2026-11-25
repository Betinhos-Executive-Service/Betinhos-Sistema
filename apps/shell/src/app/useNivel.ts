import { useCallback, useMemo } from 'react'
import type { Acessos } from './acessos'
import { acessosDe, useAcessos } from './AcessosProvider'
import { acessoColuna, podeExcluir, type AcessoColuna } from './nivel'

/** Acessos já resolvidos: carregando ou erro = NENHUM (nada de excluir nem de campo sensível até saber). */
export function useAcessosProntos(): Acessos {
  const valor = useAcessos()
  return useMemo(() => acessosDe(valor), [valor])
}

export function usePodeExcluir(tabela: string): boolean {
  const acessos = useAcessosProntos()
  return podeExcluir(acessos, tabela)
}

export function useAcessoColunas(tabela: string): (coluna: string) => AcessoColuna {
  const acessos = useAcessosProntos()
  return useCallback((coluna: string) => acessoColuna(acessos, tabela, coluna), [acessos, tabela])
}
