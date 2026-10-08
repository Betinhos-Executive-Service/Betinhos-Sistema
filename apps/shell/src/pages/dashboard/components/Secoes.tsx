import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** Seções do Resumo, na ordem da página e da barra de atalhos. */
export const SECOES = [
  { id: 'indicadores', titulo: 'Indicadores', descricao: 'Faturamento, volume, ticket e recebimentos do período.' },
  { id: 'alertas', titulo: 'Alertas', descricao: 'O que pede atenção: operação, qualidade dos dados, frota e pessoas.' },
  { id: 'producao', titulo: 'Produção', descricao: 'Frota própria e terceirizada, pedidos emergenciais e quem mais rodou.' },
  { id: 'faturamento', titulo: 'Faturamento', descricao: 'Total produzido, meta, ticket médio e status dos serviços.' },
  { id: 'clientes', titulo: 'Clientes', descricao: 'Faturamento mês a mês e os clientes com mais volume e receita.' },
  { id: 'frota', titulo: 'Frota', descricao: 'Custo de manutenção e situação da frota.' },
  { id: 'motoristas', titulo: 'Motoristas', descricao: 'Serviços de cada motorista, mês a mês.' },
] as const

export type SecaoId = (typeof SECOES)[number]['id']

export const idSecao = (id: SecaoId) => `dash-secao-${id}`
const numero = (id: SecaoId) => SECOES.findIndex((s) => s.id === id) + 1

/** Bloco numerado do Resumo: cabeçalho padronizado (número, título e descrição) e âncora para a barra de atalhos. */
export function Secao({ id, carregando, children }: { id: SecaoId; carregando?: boolean; children: ReactNode }) {
  const secao = SECOES.find((s) => s.id === id)!
  return (
    <section id={idSecao(id)} className="dash-secao" aria-labelledby={`${idSecao(id)}-titulo`} aria-busy={carregando || undefined}>
      <header className="dash-secao__head">
        <h2 className="dash-secao__titulo" tabIndex={-1}>
          <span className="dash-secao__numero" aria-hidden="true">{numero(id)}</span>
          <span id={`${idSecao(id)}-titulo`}>{secao.titulo}</span>
        </h2>
        <p className="dash-secao__descricao">{secao.descricao}</p>
      </header>
      {children}
    </section>
  )
}

/** Rolagem da página: a do `.bt-shell__main` dentro do shell; fora dele (testes), a janela. */
const raizDaRolagem = (el: Element) => el.closest('.bt-shell__main')

/**
 * Seção ativa da barra de atalhos. Com `IntersectionObserver`, acompanha a rolagem: ativa é a primeira seção, na ordem da
 * página, que aparece na faixa logo abaixo da barra fixa. Sem ele, só o clique muda a ativa.
 * Depois de um clique a escolhida fica travada até a pessoa rolar por conta própria (roda, toque ou teclado): a última seção
 * pode não alcançar o topo e a anterior, ainda visível, roubaria a marcação.
 */
export function useSecaoAtiva(barra: RefObject<HTMLElement | null>) {
  const [ativa, setAtiva] = useState<SecaoId>('indicadores')
  const travada = useRef<SecaoId | null>(null)

  useEffect(() => {
    const nav = barra.current
    if (!nav || typeof IntersectionObserver === 'undefined') return
    const raiz = raizDaRolagem(nav)
    const visiveis = new Set<string>()
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.add(e.target.id)
        else visiveis.delete(e.target.id)
      }
      if (travada.current) return
      const primeira = SECOES.find((s) => visiveis.has(idSecao(s.id)))
      if (primeira) setAtiva(primeira.id)
    }, { root: raiz, rootMargin: `-${nav.offsetHeight}px 0px -55% 0px` })
    for (const s of SECOES) {
      const el = document.getElementById(idSecao(s.id))
      if (el) obs.observe(el)
    }
    const soltar = () => { travada.current = null }
    const alvo: EventTarget = raiz ?? window
    alvo.addEventListener('wheel', soltar, { passive: true })
    alvo.addEventListener('touchstart', soltar, { passive: true })
    window.addEventListener('keydown', soltar)
    return () => {
      obs.disconnect()
      alvo.removeEventListener('wheel', soltar)
      alvo.removeEventListener('touchstart', soltar)
      window.removeEventListener('keydown', soltar)
    }
  }, [barra])

  const irPara = useCallback((id: SecaoId) => {
    const el = document.getElementById(idSecao(id))
    if (!el) return
    travada.current = id
    setAtiva(id)
    const suave = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
    // O foco vai para o título da seção, sem nova rolagem: leitor de tela e teclado continuam dali.
    el.querySelector<HTMLElement>('.dash-secao__titulo')?.focus({ preventScroll: true })
  }, [])

  return { ativa, irPara }
}

/** Barra de atalhos fixa logo abaixo dos filtros: um botão por seção, o ativo marcado com `aria-current`. */
export function SecaoNav({ barra, ativa, onIr }: { barra: RefObject<HTMLElement | null>; ativa: SecaoId; onIr: (id: SecaoId) => void }) {
  return (
    <nav ref={barra} className="dash-secoes" aria-label="Seções do resumo">
      <ol className="dash-secoes__lista">
        {SECOES.map((s, i) => (
          <li key={s.id}>
            <button type="button" className="dash-secoes__item" aria-current={ativa === s.id ? 'location' : undefined} aria-controls={idSecao(s.id)} onClick={() => onIr(s.id)}>
              <span className="dash-secoes__numero" aria-hidden="true">{i + 1}</span>
              {s.titulo}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
