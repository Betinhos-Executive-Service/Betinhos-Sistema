import { useCallback, useEffect, useRef, useState } from 'react'
import { message, type Carga, type Source } from './data/source'
import { porData } from './domain/regras'
import type { Cartao, Transacao } from './domain/types'
import { byNome } from '../equipamentos/domain/cadastros'

type State = Carga & { loaded: boolean; error: string | null }
const upsertIn = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item])

/** Transações, cartões e motoristas carregados juntos (token contra respostas fora de ordem); gravações refletem sem recarregar. */
export function useConciliacao(source: Source) {
  const [state, setState] = useState<State>({ transacoes: [], cartoes: [], motoristas: [], loaded: false, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ transacoes: [...c.transacoes].sort(porData), cartoes: [...c.cartoes].sort(byNome), motoristas: c.motoristas, loaded: true, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  const upsertTransacao = useCallback((t: Transacao) => {
    token.current += 1
    setState((s) => ({ ...s, transacoes: upsertIn(s.transacoes, t).sort(porData) }))
  }, [])
  /** Renomear o cartão também atualiza o nome nas transações dele. */
  const upsertCartao = useCallback((c: Cartao) => {
    token.current += 1
    setState((s) => ({
      ...s, cartoes: upsertIn(s.cartoes, c).sort(byNome),
      transacoes: s.transacoes.map((t) => (t.cartaoId === c.id ? { ...t, cartaoNome: c.nome } : t)),
    }))
  }, [])

  return { ...state, reload, upsertTransacao, upsertCartao }
}
