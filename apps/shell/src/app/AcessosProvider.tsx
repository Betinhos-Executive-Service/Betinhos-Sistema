import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Host } from '../host'
import { NENHUM, TODOS, carregarAcessos, type Acessos } from './acessos'

export type EstadoAcessos = { status: 'carregando' } | { status: 'erro' } | { status: 'pronto'; acessos: Acessos; /** Alguma equipe não pôde ser lida: o menu pode estar incompleto. */ parcial?: boolean }
export type ValorAcessos = EstadoAcessos & { recarregar: () => void }

/** Sem provider (testes de tela isolada) vale "todos os perfis": o shell não é a fronteira de segurança. */
export const AcessosContext = createContext<ValorAcessos>({ status: 'pronto', acessos: TODOS, recarregar: () => {} })

export function AcessosProvider({ host, children }: { host: Host; children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAcessos>({ status: 'carregando' })
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true
    // Quem já tem os acessos lidos (releitura do aviso de leitura parcial) segue com eles: voltar a "carregando"
    // desmontaria a tela aberta, com o que estivesse digitado nela.
    setEstado((atual) => (atual.status === 'pronto' ? atual : { status: 'carregando' }))
    carregarAcessos(host).then(
      ({ acessos, parcial }) => { if (vivo) setEstado({ status: 'pronto', acessos, parcial }) },
      () => { if (vivo) setEstado((atual) => (atual.status === 'pronto' ? { ...atual, parcial: true } : { status: 'erro' })) },
    )
    return () => { vivo = false }
  }, [host, tentativa])

  const recarregar = useCallback(() => setTentativa((n) => n + 1), [])
  const valor = useMemo(() => ({ ...estado, recarregar }), [estado, recarregar])
  return <AcessosContext.Provider value={valor}>{children}</AcessosContext.Provider>
}

export const useAcessos = () => useContext(AcessosContext)

/** Enquanto carrega ou em erro, o que vale é "só o Base". */
export const acessosDe = (valor: ValorAcessos): Acessos => (valor.status === 'pronto' ? valor.acessos : NENHUM)
