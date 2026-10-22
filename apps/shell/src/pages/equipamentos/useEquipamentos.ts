import { useCallback, useEffect, useRef, useState } from 'react'
import type { Carga, Source } from './data/source'
import { byNome } from './domain/cadastros'
import type { Equipamento, TipoEquipamento } from './domain/types'

type State = Carga & {
  /** `false` até a primeira carga terminar. */
  loaded: boolean
  loading: boolean
  error: string | null
}
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))
const byDescricao = (a: Equipamento, b: Equipamento) => a.descricao.localeCompare(b.descricao, 'pt-BR')

/** Itens, tipos e pessoas carregados juntos, com token contra respostas fora de ordem; upserts refletem o que foi salvo sem recarregar. */
export function useEquipamentos(source: Source) {
  const [state, setState] = useState<State>({ equipamentos: [], tipos: [], pessoas: [], loaded: false, loading: true, error: null })
  const token = useRef(0)

  const reload = useCallback(async () => {
    const current = ++token.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const c = await source.load()
      if (current !== token.current) return
      setState({ equipamentos: [...c.equipamentos].sort(byDescricao), tipos: [...c.tipos].sort(byNome), pessoas: c.pessoas, loaded: true, loading: false, error: null })
    } catch (reason) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, error: message(reason) }))
    }
  }, [source])

  useEffect(() => { void reload() }, [reload])

  // Gravação local vence uma recarga que já estava em voo (a resposta dela pode ser anterior ao que foi salvo):
  // o token muda, a resposta antiga é descartada e o indicador de carga para.
  const upsert = useCallback((e: Equipamento) => {
    token.current += 1
    setState((s) => ({
      ...s,
      loading: false,
      equipamentos: (s.equipamentos.some((x) => x.id === e.id) ? s.equipamentos.map((x) => (x.id === e.id ? e : x)) : [...s.equipamentos, e]).sort(byDescricao),
    }))
  }, [])

  /** Renomear o tipo também atualiza o nome nos itens. */
  const upsertTipo = useCallback((t: TipoEquipamento) => {
    token.current += 1
    setState((s) => ({
      ...s,
      loading: false,
      tipos: (s.tipos.some((x) => x.id === t.id) ? s.tipos.map((x) => (x.id === t.id ? t : x)) : [...s.tipos, t]).sort(byNome),
      equipamentos: s.equipamentos.map((e) => (e.tipoId === t.id ? { ...e, tipoNome: t.nome } : e)),
    }))
  }, [])

  /** Capa (caminho no SharePoint) na lista depois de enviar, trocar ou excluir foto no drawer (null = volta ao ícone do tipo). */
  const setCapa = useCallback((equipamentoId: string, capa: string | null) => {
    token.current += 1
    setState((s) => ({ ...s, loading: false, equipamentos: s.equipamentos.map((e) => (e.id === equipamentoId ? { ...e, capa } : e)) }))
  }, [])

  return { ...state, reload, upsert, upsertTipo, setCapa }
}
