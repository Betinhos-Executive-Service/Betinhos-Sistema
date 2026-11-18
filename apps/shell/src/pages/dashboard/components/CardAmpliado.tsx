import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { AnimatePresence, LazyMotion, domMax, m, useReducedMotion, type Variants } from 'framer-motion'
import { Button, ProgressRing, buttonClassName, type TableColumn } from '@betinhos/ui'
import { ArrowDownRight, ArrowUpRight, List, X } from 'lucide-react'
import { Tabela } from './Tabela'
import { AnosChart, BarraChart, MetaChart } from '../charts/Charts'
import type { Ampliado } from '../domain/detalhes'
import { comparativoDe, type ComparativoItem, type GraficoDetalhe, type ListaAlvo, type TabelaDetalhe, type Top } from '../domain/indicadores'
import type { Chip } from '../domain/types'
import { brlS, dec, int, plural } from '../domain/format'
import { tomRecebimento } from '../domain/kpis'
import { encodeTableFilters } from '../../../app/filtersUrl'
import { hrefFor } from '../../../nav/useHashRoute'
import { useMedia } from '../../operacional/useMedia'
import { Chips } from './KpiChip'
import { Lista } from './ListaDetalhe'
import { MEDIA_MOBILE, juntar } from './Linhas'
import { retanguloDe, type Conteudo, type GenericoAmpliado, type Origem, type Retangulo } from './DetalheProvider'

/* Card ampliado (chunk carregado sob demanda): gráfico maior, tabela dos números, comparativo, top 5 e "Ver na lista". */

const LAYOUT = 'dash-ampliado'
const EASE = [0.23, 1, 0.32, 1] as const
const ENTRADA = { duration: 0.3, ease: EASE }
const SAIDA = { duration: 0.22, ease: EASE }

type Props = {
  conteudo: Conteudo | null; aberto: boolean; origem: Origem | null; clientUrl: string | null
  onFechar: () => void; onOrigemPronta: () => void; onSaiu: () => void
}

/** Tamanho e posição do item de origem agora (ele pode ter rolado ou mudado de tamanho desde o clique). */
const retanguloAtual = (origem: Origem): Retangulo | null => {
  return origem.el?.isConnected ? retanguloDe(origem.el) : origem.rect
}

/** Invisível, do tamanho do item clicado: o painel nasce dele e volta a ele ao fechar (mesmo `layoutId`). */
function Fantasma({ rect, onMontou }: { rect: Retangulo; onMontou: () => void }) {
  useEffect(() => {
    // Dois quadros: o framer mede o fantasma no commit; só depois a URL abre o painel.
    let b = 0
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(onMontou) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <m.div layoutId={LAYOUT} className="dash-ampliado__fantasma" aria-hidden="true" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
}

export default function CardAmpliado({ conteudo, aberto, origem, clientUrl, onFechar, onOrigemPronta, onSaiu }: Props) {
  const reduzido = useReducedMotion() ?? false
  const rect = useMemo(() => (origem ? retanguloAtual(origem) : null), [origem, aberto]) // eslint-disable-line react-hooks/exhaustive-deps
  const comOrigem = !reduzido && rect != null
  return (
    <LazyMotion features={domMax}>
      {!aberto && comOrigem && rect ? <Fantasma key="fantasma" rect={rect} onMontou={onOrigemPronta} /> : null}
      <AnimatePresence onExitComplete={onSaiu}>
        {aberto && conteudo ? <Painel key="painel" conteudo={conteudo} reduzido={reduzido} compartilhado={comOrigem} clientUrl={clientUrl} onFechar={onFechar} /> : null}
      </AnimatePresence>
    </LazyMotion>
  )
}

function Painel({ conteudo, reduzido, compartilhado, clientUrl, onFechar }: { conteudo: Conteudo; reduzido: boolean; compartilhado: boolean; clientUrl: string | null; onFechar: () => void }) {
  const id = useId()
  const painel = useRef<HTMLElement>(null)
  const fechar = useRef<HTMLButtonElement>(null)

  // Esc fecha; Tab fica dentro do painel; o foco entra no X.
  useEffect(() => {
    fechar.current?.focus({ preventScroll: true })
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFechar(); return }
      if (e.key !== 'Tab' || !painel.current) return
      const alvos = [...painel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
      if (!alvos.length) return
      const primeiro = alvos[0]
      const ultimo = alvos[alvos.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
      else if (!painel.current.contains(document.activeElement)) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', tecla, true)
    // Como no dialog modal: a página por trás fica inerte (leitor de tela e foco) e não rola.
    const inertes: HTMLElement[] = []
    for (let no = painel.current?.closest('.dash-ampliado__raiz'); no && no !== document.body; no = no.parentElement) {
      for (const irmao of no.parentElement?.children ?? []) {
        if (irmao !== no && irmao instanceof HTMLElement && !irmao.inert) inertes.push(irmao)
      }
    }
    inertes.forEach((el) => { el.inert = true })
    const rolagem = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla, true)
      inertes.forEach((el) => { el.inert = false })
      document.documentElement.style.overflow = rolagem
    }
  }, [onFechar])

  const secoes: Variants = useMemo(() => ({
    oculto: reduzido ? { opacity: 0 } : { opacity: 0, y: 8 },
    visivel: { opacity: 1, y: 0, transition: ENTRADA },
  }), [reduzido])
  const lista = useMemo(() => ({ oculto: {}, visivel: { transition: { staggerChildren: reduzido ? 0 : 0.04, delayChildren: reduzido ? 0 : 0.12 } } }), [reduzido])
  // Sem item de origem (link direto) ou com movimento reduzido: só aparece (fade); com origem, o `layoutId` faz o painel crescer dele.
  const entrada = compartilhado ? {} : { initial: { opacity: 0 }, animate: { opacity: 1, transition: ENTRADA } }

  return (
    <div className="dash-ampliado__raiz">
      <m.div className="dash-ampliado__fundo" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: ENTRADA }} exit={{ opacity: 0, transition: SAIDA }} onClick={onFechar} />
      <m.section
        ref={painel} layoutId={reduzido ? undefined : LAYOUT} className="dash-ampliado" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}
        transition={ENTRADA} exit={{ opacity: 0, transition: SAIDA }} {...entrada}
      >
        <m.div className="dash-ampliado__corpo" variants={lista} initial="oculto" animate="visivel">
          <m.header className="dash-ampliado__cabeca" variants={secoes}>
            <div className="dash-ampliado__titulos">
              <span className="dash-ampliado__eyebrow">Detalhe do indicador</span>
              <h2 className="dash-ampliado__titulo" id={`${id}-t`}>{conteudo.dado.titulo}</h2>
              {conteudo.tipo === 'generico' && conteudo.dado.valor !== undefined ? <strong className="dash-ampliado__valor">{conteudo.dado.valor ?? 's/dado'}</strong>
                : conteudo.tipo === 'dominio' && conteudo.dado.valor ? <strong className="dash-ampliado__valor">{conteudo.dado.valor}</strong> : null}
              <p className="dash-ampliado__descricao">{conteudo.tipo === 'dominio' ? conteudo.dado.descricao : [conteudo.dado.sub, conteudo.dado.hint].filter(Boolean).join(' · ')}</p>
            </div>
            <Button ref={fechar} variant="ghost" size="touch" icon={<X size={18} />} aria-label="Fechar" onClick={onFechar} />
          </m.header>
          {conteudo.tipo === 'dominio' ? <ConteudoDominio dado={conteudo.dado} secoes={secoes} clientUrl={clientUrl} /> : <ConteudoGenerico dado={conteudo.dado} secoes={secoes} />}
        </m.div>
      </m.section>
    </div>
  )
}

const Secao = ({ secoes, className = '', children }: { secoes: Variants; className?: string; children: ReactNode }) => (
  <m.div className={`dash-ampliado__secao ${className}`.trim()} variants={secoes}>{children}</m.div>
)

function ConteudoDominio({ dado, secoes, clientUrl }: { dado: Ampliado; secoes: Variants; clientUrl: string | null }) {
  return <>
    {dado.grafico ? <Secao secoes={secoes}><GraficoAmpliado g={dado.grafico} nome={dado.titulo} /></Secao> : null}
    {dado.comparativo?.length ? <Secao secoes={secoes}><Comparativo itens={dado.comparativo} /></Secao> : null}
    {dado.tops ? <Secao secoes={secoes}><Tops tops={dado.tops} /></Secao> : null}
    <Secao secoes={secoes} className="dash-detalhe">
      {dado.tipo === 'indicador' ? <TabelaNumeros tabela={dado.tabela} /> : <Lista key={dado.titulo} detalhe={dado} clientUrl={clientUrl} />}
    </Secao>
    {dado.lista ? <Secao secoes={secoes} className="dash-ampliado__rodape"><VerNaLista lista={dado.lista} /></Secao> : null}
  </>
}

function ConteudoGenerico({ dado, secoes }: { dado: GenericoAmpliado; secoes: Variants }) {
  const comparativo = comparativoDe(dado.chips.filter((c): c is Chip => c.tipo === 'valor'))
  return <>
    {dado.apoio.length ? <Secao secoes={secoes}><span className="dash-card__chips dash-ampliado__chips"><Chips chips={[]} apoio={dado.apoio} /></span></Secao> : null}
    {dado.grafico ? <Secao secoes={secoes} className="dash-ampliado__grafico">{dado.grafico}</Secao> : null}
    {comparativo.length ? <Secao secoes={secoes}><Comparativo itens={comparativo} /></Secao> : null}
    {dado.tops?.length ? <Secao secoes={secoes}><Tops tops={dado.tops} /></Secao> : null}
    {dado.tabelaDados ? <Secao secoes={secoes} className="dash-detalhe"><TabelaNumeros tabela={dado.tabelaDados} /></Secao> : null}
    {dado.tabela ? <Secao secoes={secoes} className="dash-detalhe">{dado.tabela}</Secao> : null}
    <Secao secoes={secoes}><p className="dash-card__nota">{dado.periodo ? `${dado.periodo} · ` : ''}{dado.unidade}</p></Secao>
    {dado.lista ? <Secao secoes={secoes} className="dash-ampliado__rodape"><VerNaLista lista={dado.lista} /></Secao> : null}
  </>
}

function GraficoAmpliado({ g, nome }: { g: GraficoDetalhe; nome: string }) {
  if (g.tipo === 'anel') {
    return (
      <div className="dash-ampliado__anel">
        <ProgressRing value={g.razao} tone={tomRecebimento(g.razao)} size={200} label={g.centro} caption="recebido" />
        <p className="dash-anel__valores"><strong>{g.recebido}</strong> de {g.base}</p>
      </div>
    )
  }
  const grafico = g.tipo === 'barras'
    ? <BarraChart descricao={`${nome} por mês`} nome={nome} formatar={g.dinheiro ? brlS : int} dados={g.dados} />
    : g.tipo === 'anos'
      ? <AnosChart descricao={`${nome} por mês, ${g.anos.join(', ')}`} formatar={brlS} anos={g.anos} dados={g.dados} />
      : <MetaChart descricao="Meta e realizado por mês" formatar={brlS} dados={g.dados} />
  return <div className="dash-ampliado__grafico">{grafico}</div>
}

function Comparativo({ itens }: { itens: ComparativoItem[] }) {
  return (
    <section aria-label="Comparativo">
      <h3 className="dash-ampliado__subtitulo">Comparativo</h3>
      <ul className="dash-ampliado__comparativo">
        {itens.map((c) => {
          const sobe = c.variacao >= 0
          return (
            <li key={c.codigo} className="dash-ampliado__comp">
              <span className="dash-ampliado__comp-rotulo">{c.rotulo}</span>
              <strong>{c.anterior}</strong>
              <span className={`dash-ampliado__variacao dash-ampliado__variacao--${sobe ? 'sobe' : 'desce'}`}>
                {sobe ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}{sobe ? '+' : '−'}{dec(Math.abs(c.variacao), 1)}%
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Tabela dos números do indicador; no celular, a 1ª coluna e o resto juntos com rótulo (como as outras tabelas do dashboard). */
function TabelaNumeros({ tabela }: { tabela: TabelaDetalhe }) {
  const mobile = useMedia(MEDIA_MOBILE)
  const [primeira, ...resto] = tabela.colunas
  const colunas: TableColumn<string[]>[] = mobile && resto.length > 1
    ? [{ key: 'c0', header: primeira, cell: (l) => l[0] }, { key: 'resto', header: resto.join(' · '), width: 'minmax(0, 2fr)', cell: (l) => juntar(...resto.map((c, i) => `${c} ${l[i + 1]}`)) }]
    : tabela.colunas.map((c, i) => ({ key: `c${i}`, header: c, cell: (l: string[]) => (i === 0 ? <strong className="dash-forte">{l[0]}</strong> : l[i]) }))
  return <Tabela columns={colunas} rows={tabela.linhas} rowKey={(l) => l[0]} empty={<p className="dash-ampliado__vazio">Nada no período</p>} />
}

function Tops({ tops }: { tops: Top[] }) {
  if (!tops.length) return null
  return (
    <div className="dash-ampliado__tops">
      {tops.map((t) => (
        <section key={t.titulo} aria-label={t.titulo}>
          <h3 className="dash-ampliado__subtitulo">{t.titulo}</h3>
          {t.itens.length ? (
            <ol className="dash-ampliado__top">
              {t.itens.map((i, n) => (
                <li key={`${n}-${i.rotulo}`} className="dash-ampliado__top-item">
                  <span className="dash-ampliado__top-pos" aria-hidden="true">{n + 1}</span>
                  <span className="dash-ampliado__top-nome" title={i.rotulo}>{i.rotulo}{i.apoio ? <span className="dash-ampliado__top-apoio">{i.apoio}</span> : null}</span>
                  <strong className="dash-ampliado__top-valor">{i.valor}</strong>
                </li>
              ))}
            </ol>
          ) : <p className="dash-ampliado__vazio">Nada no período</p>}
        </section>
      ))}
    </div>
  )
}

/** Abre a lista (mesma aba) já filtrada; o Voltar do navegador retorna ao dashboard com o card aberto. */
function VerNaLista({ lista }: { lista: ListaAlvo }) {
  const f = encodeTableFilters(lista.filtros)
  const href = hrefFor(lista.rota, f ? { f } : undefined)
  return <>
    {lista.nota ? <p className="dash-card__nota dash-ampliado__nota-lista">{lista.nota}</p> : null}
    <a className={buttonClassName({ variant: 'primary' })} href={href}><List size={16} aria-hidden="true" /> Ver na lista</a>
  </>
}

