import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { patchHashQuery, pushHashQuery, useHashQuery } from '../../../nav/useHashRoute'
import type { Ampliado } from '../domain/detalhes'
import type { ChipAnterior } from '../domain/comparar'
import type { ListaAlvo, TabelaDetalhe, Top } from '../domain/indicadores'
import type { Apoio, Chip } from '../domain/types'

/* Card ampliado: o número, gráfico ou alerta clicado cresce para um card com gráfico maior, tabela, comparativo, top 5 e o atalho para a lista. */

/** Conteúdo de um card de análise (gráfico e tabela já montados): abre ampliado sem consulta nova. */
export type GenericoAmpliado = {
  titulo: string; periodo: string; unidade: string
  valor?: string | null; sub?: string; hint?: string; chips: (Chip | ChipAnterior)[]; apoio: Apoio[]
  grafico?: ReactNode; tabela?: ReactNode
  /** Números do card em tabela simples (KPIs, que não têm tabela própria). */
  tabelaDados?: TabelaDetalhe
  /** Top 5 e atalho da lista, que a página acrescenta pelo recorte da aba (`extras`). */
  tops?: Top[]; lista?: ListaAlvo | null
}
/** Complemento de um card de análise ou KPI, calculado pela página com os dados carregados. */
export type ExtrasGenerico = Pick<GenericoAmpliado, 'tops' | 'lista'> & { periodo?: string }
export type Conteudo = { tipo: 'dominio'; dado: Ampliado } | { tipo: 'generico'; dado: GenericoAmpliado }
export type Retangulo = { top: number; left: number; width: number; height: number }
/** `el` é de onde o card cresce; `gatilho`, quem recebe o foco de volta ao fechar (o botão clicado, quando há). */
export type Origem = { id: string; rect: Retangulo | null; el: HTMLElement | null; gatilho: HTMLElement | null }

/** O card vive na URL (`detalhe=<id>`); `card:<título>` são os cards de análise, que se registram ao montar. */
export const PREFIXO_CARD = 'card:'
export const idDoCard = (titulo: string) => `${PREFIXO_CARD}${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

type Ctx = {
  abrir: (id: string, el?: HTMLElement | null) => void
  registrar: (id: string, dados: GenericoAmpliado) => void
  clientUrl: string | null
}
const DetalheContexto = createContext<Ctx | null>(null)

/** Abre o card pelo id (`cnh`, `faturamento`, `motorista:<key>`…); null fora do `DetalheProvider` (o gatilho não aparece). */
export const useDetalhe = () => useContext(DetalheContexto)?.abrir ?? null

/** Cards de análise: registra o conteúdo (gráfico e tabela) para o card ampliado e devolve o id do card (null fora do provider). */
export function useAmpliavel(titulo: string, dados: GenericoAmpliado) {
  const ctx = useContext(DetalheContexto)
  const id = idDoCard(titulo)
  const { registrar } = ctx ?? {}
  // Sem lista de dependências de propósito: o conteúdo é refeito a cada render do card e o card aberto acompanha as recargas.
  useEffect(() => { registrar?.(id, dados) })
  return ctx ? id : null
}

const importar = () => import('./CardAmpliado')
const CardAmpliado = lazy(importar)

export const retanguloDe = (el: HTMLElement): Retangulo => { const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height } }
const origemDe = (id: string) => [...document.querySelectorAll<HTMLElement>('[data-origem]')].find((e) => e.getAttribute('data-origem') === id) ?? null
const reduzido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * O card aberto vive na URL (`detalhe=<id>`) e o conteúdo é refeito a partir dos dados da página (`resolver`), então recarregar ou
 * compartilhar o link reabre o mesmo card. Abrir cria uma entrada no histórico (o Voltar do navegador fecha o card); fechar volta
 * nela quando foi o clique que abriu. O painel (chunk carregado sob demanda) cresce a partir do item clicado: um "fantasma" do tamanho
 * do item monta antes e só então a URL muda. `clientUrl` só no modo Dataverse (links "Abrir no Dataverse").
 */
export function DetalheProvider({ clientUrl, resolver, extras, children }: { clientUrl: string | null; resolver: (id: string) => Ampliado | null; extras?: (dado: GenericoAmpliado) => ExtrasGenerico | null; children: ReactNode }) {
  const id = useHashQuery().get('detalhe') || null
  const idRef = useRef(id)
  idRef.current = id
  const [origem, setOrigem] = useState<Origem | null>(null)
  const [pendente, setPendente] = useState<string | null>(null)
  const registro = useRef(new Map<string, GenericoAmpliado>())
  const [, atualizar] = useReducer((n: number) => n + 1, 0)

  // Carrega o chunk do card antes do primeiro clique.
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback
    const t = idle ? idle(() => void importar()) : window.setTimeout(() => void importar(), 1500)
    return () => { if (!idle) window.clearTimeout(t) }
  }, [])

  const dominio = useMemo(() => (id && !id.startsWith(PREFIXO_CARD) ? resolver(id) : null), [id, resolver])
  const registrado = id?.startsWith(PREFIXO_CARD) ? registro.current.get(id) ?? null : null
  const complemento = registrado ? extras?.(registrado) : null
  const generico = registrado ? { ...registrado, ...complemento, periodo: registrado.periodo || complemento?.periodo || '' } : null
  const atual: Conteudo | null = dominio ? { tipo: 'dominio', dado: dominio } : generico ? { tipo: 'generico', dado: generico } : null
  const ultimo = useRef<Conteudo | null>(null)
  if (atual) ultimo.current = atual

  const empurrar = useCallback((proximo: string) => pushHashQuery({ detalhe: proximo }, { btDetalhe: proximo }), [])
  const abrir = useCallback((proximo: string, el?: HTMLElement | null) => {
    const ativo = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    const gatilho = el ?? ativo
    const alvo = origemDe(proximo) ?? gatilho
    void importar()
    if (!alvo || reduzido()) { setOrigem(alvo ? { id: proximo, rect: null, el: alvo, gatilho } : null); empurrar(proximo); return }
    setOrigem({ id: proximo, rect: retanguloDe(alvo), el: alvo, gatilho })
    setPendente(proximo)
  }, [empurrar])
  const registrar = useCallback((cardId: string, dados: GenericoAmpliado) => {
    registro.current.set(cardId, dados)
    if (idRef.current === cardId) atualizar()
  }, [])
  const fechar = useCallback(() => {
    const aberto = idRef.current
    if (aberto && (history.state as { btDetalhe?: string } | null)?.btDetalhe === aberto) history.back()
    else patchHashQuery({ detalhe: null })
  }, [])
  const origemPronta = useCallback(() => {
    if (pendente) { empurrar(pendente); setPendente(null) }
  }, [pendente, empurrar])
  const saiu = useCallback(() => {
    const el = origem?.gatilho?.isConnected ? origem.gatilho : origem?.el
    setOrigem(null)
    ultimo.current = null
    if (el?.isConnected) (el.matches('button, a, [tabindex]') ? el : el.querySelector<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])') ?? el).focus({ preventScroll: true })
  }, [origem])

  const valor = useMemo(() => ({ abrir, registrar, clientUrl }), [abrir, registrar, clientUrl])
  const mostrar = id != null || origem != null
  return (
    <DetalheContexto.Provider value={valor}>
      {children}
      {mostrar ? (
        <Suspense fallback={null}>
          <CardAmpliado conteudo={atual ?? ultimo.current} aberto={atual != null} origem={origem} clientUrl={clientUrl} onFechar={fechar} onOrigemPronta={origemPronta} onSaiu={saiu} />
        </Suspense>
      ) : null}
    </DetalheContexto.Provider>
  )
}
