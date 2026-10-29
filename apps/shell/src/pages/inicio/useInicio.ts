import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logAppError } from '@betinhos/ui/error-logger'
import { lerOpcao } from '../../nav/queryState'
import { patchHashQuery, useHashQuery } from '../../nav/useHashRoute'
import type { Source } from './data/source'
import { capasEmCache, carregarCapas } from './data/capas'
import { tarefasVisiveis, urlSegura } from './domain/inicio'
import { VISOES, type DadosCompartilhados, type DadosVisao, type Noticia, type Visao } from './domain/types'

/** Primeira falha da carga espera isto e tenta de novo uma vez (o Dataverse às vezes recusa a primeira rajada). */
export const ESPERA_NOVA_TENTATIVA = 750

export type Escopo = 'todas' | 'minhas'

const agora = () => new Date()

export function useInicio(source: Source, now: () => Date = agora) {
  const query = useHashQuery()
  const visao = lerOpcao<Visao>(query, 'visao', VISOES, 'operacao')
  const escopo = lerOpcao<Escopo>(query, 'tarefas', ['minhas', 'todas'], 'minhas')

  const [nome, setNome] = useState('')
  const [usuario, setUsuario] = useState('')
  const [compartilhados, setCompartilhados] = useState<DadosCompartilhados | null>(null)
  const [dados, setDados] = useState<DadosVisao | null>(null)
  const [noticias, setNoticias] = useState<Noticia[] | null>(null)
  const [erroNoticias, setErroNoticias] = useState<string | null>(null)
  const [capas, setCapas] = useState<Record<string, string | null>>({})
  const [carregando, setCarregando] = useState(true)
  const cachePorVisao = useRef(new Map<Visao, DadosVisao>())
  const pedido = useRef(0)

  useEffect(() => {
    void source.primeiroNome().then(setNome)
    source.usuarioId().then(setUsuario).catch(() => setUsuario(''))
  }, [source])

  const carregar = useCallback(async (alvo: Visao, forcar: boolean) => {
    const id = ++pedido.current
    if (forcar) cachePorVisao.current.clear()
    const emCache = cachePorVisao.current.get(alvo)
    setCarregando(true)
    try {
      const buscar = () => Promise.all([source.compartilhados(now()), emCache ? Promise.resolve(emCache) : source.visao(alvo, now())])
      let [comp, vis] = await buscar()
      if (comp.erro || vis.erro) {
        await new Promise((r) => setTimeout(r, ESPERA_NOVA_TENTATIVA))
        if (id !== pedido.current) return
        ;[comp, vis] = await buscar()
      }
      if (id !== pedido.current) return
      if (!vis.erro) cachePorVisao.current.set(alvo, vis)
      setCompartilhados(comp)
      setDados(vis)
    } catch (error) {
      void logAppError(error, { action: 'carregar-pagina-inicial', phase: 'load', component: 'Inicio' })
      if (id === pedido.current) {
        setCompartilhados({ comunicados: [], tarefas: [], erro: 'Falha ao conectar ao Dataverse' })
        setDados({ visao: alvo, indicadores: [], aReceber: [], erro: null })
      }
    } finally {
      if (id === pedido.current) setCarregando(false)
    }
  }, [source, now])

  const pedidoNoticias = useRef(0)
  const carregarNoticias = useCallback(async () => {
    const id = ++pedidoNoticias.current
    setErroNoticias(null)
    try {
      const lista = await source.noticias(now())
      if (id === pedidoNoticias.current) setNoticias(lista)
    } catch (error) {
      void logAppError(error, { action: 'carregar-noticias', phase: 'load', component: 'Noticias' })
      if (id !== pedidoNoticias.current) return
      setNoticias([])
      setErroNoticias('Notícias indisponíveis')
    }
  }, [source, now])

  useEffect(() => { void carregar(visao, false) }, [carregar, visao])
  useEffect(() => { void carregarNoticias() }, [carregarNoticias])

  // Capas: cache local na hora; as que faltam, todas em paralelo assim que as notícias chegam.
  useEffect(() => {
    if (!noticias?.length || source.mock) return
    const urls = noticias.flatMap((n) => urlSegura(n.url) ?? [])
    setCapas((atual) => ({ ...capasEmCache(urls), ...atual }))
    const controller = new AbortController()
    void carregarCapas(urls, (url, src) => setCapas((atual) => ({ ...atual, [url]: src })), controller.signal)
    return () => controller.abort()
  }, [noticias, source])

  const atualizar = useCallback(() => {
    setNoticias(null)
    void carregar(visao, true)
    void carregarNoticias()
  }, [carregar, carregarNoticias, visao])

  const tarefas = useMemo(() => tarefasVisiveis(compartilhados?.tarefas ?? [], escopo, usuario), [compartilhados, escopo, usuario])
  const erro = [compartilhados?.erro, dados?.erro, erroNoticias].filter(Boolean).join(' · ') || null

  return {
    mock: source.mock,
    visao,
    setVisao: (v: Visao) => patchHashQuery({ visao: v === 'operacao' ? null : v }),
    escopo,
    setEscopo: (e: Escopo) => patchHashQuery({ tarefas: e === 'minhas' ? null : e }),
    nome,
    comunicado: compartilhados?.comunicados[0] ?? null,
    // O painel mostra 3 de cada; o contador traz o total.
    atrasadas: tarefas.filter((t) => t.prazo === 'atrasada'),
    hoje: tarefas.filter((t) => t.prazo === 'hoje'),
    // Indicadores de outra visão (troca em andamento) não aparecem: mostram carregando.
    dados: dados?.visao === visao ? dados : null,
    carregando,
    noticias,
    capas,
    erro,
    atualizar,
  }
}

export type Inicio = ReturnType<typeof useInicio>
