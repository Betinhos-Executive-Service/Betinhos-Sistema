import { useCallback, useEffect, useRef, useState } from 'react'
import type { Source } from './data/source'
import type { Agente, Execucao, Proposta } from './domain/types'

export const INTERVALO_POLLING_MS = 3000
export const LIMITE_POLLING_MS = 90_000
const HISTORICO = 10
const message = (r: unknown) => (r instanceof Error ? r.message : String(r))

type State = { atual: Execucao | null; propostas: Proposta[]; historico: Execucao[]; loading: boolean; polling: boolean; error: string | null }

/** Última execução do agente, suas propostas e o histórico; polling enquanto a execução estiver pendente ou processando. */
export function useAgente(source: Source, agente: Agente) {
  const [state, setState] = useState<State>({ atual: null, propostas: [], historico: [], loading: true, polling: false, error: null })
  const token = useRef(0)
  const pollingDesde = useRef<number | null>(null)

  const carregar = useCallback(async (execucaoId?: string) => {
    const current = ++token.current
    try {
      const historico = await source.historico(agente, HISTORICO)
      const atual = (execucaoId ? historico.find((e) => e.id === execucaoId) ?? (await source.buscar(execucaoId)) : historico[0]) ?? null
      const propostas = atual && atual.status === 'concluida' ? await source.propostas(atual.id) : []
      if (current !== token.current) return
      const emAndamento = atual?.status === 'pendente' || atual?.status === 'processando'
      setState({ atual, propostas, historico, loading: false, polling: emAndamento, error: null })
    } catch (r) {
      if (current !== token.current) return
      setState((s) => ({ ...s, loading: false, polling: false, error: message(r) }))
    }
  }, [source, agente])

  useEffect(() => { void carregar() }, [carregar])

  // Polling: a cada 3 s enquanto em andamento; para após 90 s com aviso.
  useEffect(() => {
    // Só agenda com a execução em andamento: logo após analisar, `atual` ainda é a anterior (concluída).
    const emAndamento = state.atual?.status === 'pendente' || state.atual?.status === 'processando'
    if (!state.polling || !state.atual || !emAndamento) { pollingDesde.current = null; return }
    pollingDesde.current ??= Date.now()
    const id = state.atual.id
    const timer = setTimeout(() => {
      if (Date.now() - (pollingDesde.current ?? Date.now()) > LIMITE_POLLING_MS) {
        setState((s) => ({ ...s, polling: false, error: 'A análise está demorando mais que o normal. Atualize a tela em instantes.' }))
        return
      }
      void carregar(id)
    }, INTERVALO_POLLING_MS)
    return () => clearTimeout(timer)
  }, [state.polling, state.atual, carregar])

  const analisar = useCallback(async (pergunta: string, origem: 'manual' | 'ao_abrir' = 'manual') => {
    const atual = state.atual
    if (atual && (atual.status === 'pendente' || atual.status === 'processando')) { setState((s) => ({ ...s, polling: true })); return }
    setState((s) => ({ ...s, polling: true, error: null }))
    try {
      const id = await source.criar(agente, pergunta.trim(), origem)
      await carregar(id)
    } catch (r) { setState((s) => ({ ...s, polling: false, error: message(r) })) }
  }, [source, agente, state.atual, carregar])

  const atualizarProposta = (p: Proposta) => setState((s) => ({ ...s, propostas: s.propostas.map((x) => (x.id === p.id ? p : x)) }))

  const aprovar = useCallback(async (p: Proposta) => {
    await source.executarAcao(p)
    await source.decidir(p, 'aprovada', '')
    atualizarProposta({ ...p, decisao: 'aprovada', decididoPor: 'Você', decididoEm: new Date() })
  }, [source])

  const descartar = useCallback(async (p: Proposta, motivo: string) => {
    if (!motivo.trim()) throw new Error('Informe o motivo do descarte.')
    await source.decidir(p, 'descartada', motivo.trim())
    atualizarProposta({ ...p, decisao: 'descartada', motivoDescarte: motivo.trim(), decididoPor: 'Você', decididoEm: new Date() })
  }, [source])

  const abrir = useCallback((execucaoId: string) => { void carregar(execucaoId) }, [carregar])

  const atualId = state.atual?.id
  const reload = useCallback(() => carregar(atualId), [carregar, atualId])

  return { ...state, analisar, aprovar, descartar, abrir, reload }
}
