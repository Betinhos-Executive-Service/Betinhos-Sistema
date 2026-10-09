import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConjuntoExtra, ParteExtra, Source } from './data/source'
import type { Dados } from './domain/types'

export const INTERVALO_MS = 60_000
/** Conjuntos do estágio 2, na ordem em que aparecem em `pendentes`. */
const EXTRAS: readonly ConjuntoExtra[] = ['pagantes', 'despesas']
const NENHUM: ReadonlySet<ConjuntoExtra> = new Set()

type Estado = { chave: string; dados: Dados | null; carregando: boolean; erro: string | null; atualizadoEm: Date | null }
type Extras = { chave: string; partes: Partial<Record<ConjuntoExtra, ParteExtra>> }
const mensagem = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

export type OpcoesDashboard = { /** Conjuntos do estágio 2 que a aba ativa usa. */ conjuntosExtras?: ReadonlySet<ConjuntoExtra> }

/**
 * Carga em dois estágios por janela. Estágio 1 (sempre): reservas, CPs, cadastros, manutenções, multas, ocorrências e Infleet.
 * Estágio 2 (sob demanda): pagantes e despesas, na primeira vez que a aba que os usa abre; ficam guardados e só são refeitos
 * na recarga de 60 s (ou em "Atualizar") enquanto essa aba está ativa. Conjunto não carregado = `[]` e listado em `pendentes`.
 * Recarga com a aba visível, sem empilhar consultas, e proteção contra resposta fora de ordem nos dois estágios.
 */
export function useDashboard(source: Source, desde: string, ate: string, opcoes: OpcoesDashboard = {}) {
  const chave = `${desde}|${ate}`
  const ativos = opcoes.conjuntosExtras ?? NENHUM
  const ativosKey = EXTRAS.filter((c) => ativos.has(c)).join(',')
  const [estado, setEstado] = useState<Estado>({ chave: '', dados: null, carregando: true, erro: null, atualizadoEm: null })
  const [extras, setExtras] = useState<Extras>({ chave: '', partes: {} })
  const token = useRef(0)
  const ultima = useRef(0)
  /** Há carga em andamento da janela atual: o relógio e a volta da aba esperam; "Atualizar" e a troca de janela substituem. */
  const emVoo = useRef(false)
  /** Por conjunto do estágio 2: token da última consulta, janela em voo e instante da última resposta. */
  const tokenExtra = useRef<Record<ConjuntoExtra, number>>({ pagantes: 0, despesas: 0 })
  const vooExtra = useRef<Partial<Record<ConjuntoExtra, string>>>({})
  const carregadoExtra = useRef<Partial<Record<ConjuntoExtra, { chave: string; em: number }>>>({})
  const ativosRef = useRef(ativosKey)
  ativosRef.current = ativosKey

  const carregarExtra = useCallback(async (conjunto: ConjuntoExtra) => {
    const atual = ++tokenExtra.current[conjunto]
    vooExtra.current[conjunto] = chave
    let parte: ParteExtra | null = null
    try {
      parte = await source.carregarExtra(conjunto, desde, ate)
    } catch (reason) {
      console.warn(`Dashboard: ${conjunto} não carregou.`, mensagem(reason))
    }
    if (atual !== tokenExtra.current[conjunto]) return
    delete vooExtra.current[conjunto]
    carregadoExtra.current[conjunto] = { chave, em: Date.now() }
    // Falha na recarga mantém os dados já mostrados da mesma janela (como o estágio 1); sem dados anteriores vira s/dado.
    setExtras((e) => {
      const anteriores = e.chave === chave ? e.partes : {}
      const nova = parte ?? anteriores[conjunto] ?? { campos: {}, indisponivel: true }
      return { chave, partes: { ...anteriores, [conjunto]: nova } }
    })
  }, [source, desde, ate, chave])

  /** Estágio 1; com `comExtras`, também o estágio 2 da aba ativa (o que não estiver em voo, salvo `forcar`). */
  const carregar = useCallback(async (comExtras: boolean, forcar: boolean) => {
    if (comExtras) {
      for (const c of EXTRAS) if (ativosRef.current.split(',').includes(c) && (forcar || vooExtra.current[c] !== chave)) void carregarExtra(c)
    }
    const atual = ++token.current
    emVoo.current = true
    setEstado((s) => ({ ...s, carregando: true, erro: null }))
    try {
      const dados = await source.carregar(desde, ate)
      if (atual !== token.current) return
      ultima.current = Date.now()
      setEstado({ chave, dados, carregando: false, erro: null, atualizadoEm: new Date() })
    } catch (reason) {
      if (atual !== token.current) return
      setEstado((s) => ({ ...s, carregando: false, erro: mensagem(reason) }))
    } finally {
      if (atual === token.current) emVoo.current = false
    }
  }, [source, desde, ate, chave, carregarExtra])

  const atualizar = useCallback(() => carregar(true, true), [carregar])

  // Troca de janela: só o estágio 1 aqui; o estágio 2 da aba ativa sai pelo efeito abaixo, em paralelo.
  useEffect(() => { void carregar(false, false) }, [carregar])

  // Aba que usa o estágio 2: carrega o que falta nesta janela; o que já veio e passou de 60 s é atualizado em segundo plano.
  useEffect(() => {
    for (const c of EXTRAS) {
      if (!ativosKey.split(',').includes(c) || vooExtra.current[c] === chave) continue
      const feito = carregadoExtra.current[c]
      if (!feito || feito.chave !== chave || Date.now() - feito.em >= INTERVALO_MS) void carregarExtra(c)
    }
  }, [ativosKey, chave, carregarExtra])

  useEffect(() => {
    const visivel = () => document.visibilityState === 'visible'
    const id = window.setInterval(() => { if (visivel() && !emVoo.current) void carregar(true, false) }, INTERVALO_MS)
    const aoVoltar = () => { if (visivel() && !emVoo.current && Date.now() - ultima.current >= INTERVALO_MS) void carregar(true, false) }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [carregar])

  const base = estado.chave === chave ? estado.dados : null
  const partes = extras.chave === chave ? extras.partes : null
  const dados = useMemo<Dados | null>(() => {
    if (!base) return null
    const p = partes ?? {}
    const falhas = EXTRAS.filter((c) => p[c]?.indisponivel)
    return {
      ...base, ...p.pagantes?.campos, ...p.despesas?.campos,
      indisponiveis: [...base.indisponiveis.filter((c) => !EXTRAS.includes(c as ConjuntoExtra)), ...falhas],
      pendentes: EXTRAS.filter((c) => !p[c]),
    }
  }, [base, partes])

  return { dados, carregando: estado.carregando, erro: estado.erro, atualizadoEm: estado.atualizadoEm, atualizar }
}
