import { useMemo, type ReactNode } from 'react'
import { acessosDoMock } from './acessos'
import { AcessosContext } from './AcessosProvider'

/** Provider para testes: perfis no mesmo texto do `?acessos=` do mock (ex.: `rh:operador,acessos`). */
export function ComAcessos({ perfis, children }: { perfis: string; children: ReactNode }) {
  const value = useMemo(() => ({ status: 'pronto' as const, acessos: acessosDoMock(perfis), recarregar: () => {} }), [perfis])
  return <AcessosContext.Provider value={value}>{children}</AcessosContext.Provider>
}
