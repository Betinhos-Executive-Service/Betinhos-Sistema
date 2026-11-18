import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
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
import { ABRIR_MS, FADE_MS, FECHAR_MS, FUNDO_MS, REDUZIDO_MS, animar, criarClone, deslocar, encolher, recorte, reduzidoAgora } from './morph'
import type { Conteudo, GenericoAmpliado, Origem } from './DetalheProvider'

/* Card ampliado (chunk carregado sob demanda): gráfico maior, tabela dos números, comparativo, top 5 e "Ver na lista". */

type Props = {
  conteudo: Conteudo; aberto: boolean; origem: Origem | null; clientUrl: string | null
  onFechar: () => void; onSaiu: () => void
}

/** Animações em curso, o clone e o item escondido: tudo que volta ao normal quando a transição acaba ou o painel desmonta. */
type Vivo = { seq: number; anims: Animation[]; clone: HTMLElement | null; el: HTMLElement | null }

/** O painel monta já aberto (a URL muda no clique); `aberto` falso dispara a saída e `onSaiu` só vem depois dela. */
export default function CardAmpliado({ conteudo, aberto, origem, clientUrl, onFechar, onSaiu }: Props) {
  const id = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const fundo = useRef<HTMLDivElement>(null)
  const painel = useRef<HTMLElement>(null)
  const fechar = useRef<HTMLButtonElement>(null)
  const vivo = useRef<Vivo>({ seq: 0, anims: [], clone: null, el: null })

  const encerrar = () => {
    const v = vivo.current
    v.anims.forEach((a) => a.cancel())
    v.anims = []
    v.clone?.remove()
    v.clone = null
    if (v.el) v.el.style.visibility = ''
    v.el = null
  }
  const guardar = (...novas: (Animation | null | undefined)[]) => { vivo.current.anims.push(...novas.filter((a): a is Animation => a != null)) }
  /** Chama `fim` quando as animações guardadas terminam (na hora, sem WAAPI); cancelar descarta o aviso. */
  const aoTerminar = (fim: () => void) => {
    const { anims } = vivo.current
    if (!anims.length) fim()
    else void Promise.all(anims.map((a) => a.finished)).then(fim, () => {})
  }

  useLayoutEffect(() => {
    const v = vivo.current
    const seq = ++v.seq
    const p = painel.current
    const f = fundo.current
    const r = raiz.current
    if (!p || !f || !r) return
    const corpo = p.querySelector<HTMLElement>('.dash-ampliado__corpo')
    const fadeFundo = (de: number, ate: number, ms: number) => animar(f, [{ opacity: de }, { opacity: ate }], ms)

    if (aberto) {
      v.anims.forEach((a) => a.cancel())
      v.anims = []
      if (reduzidoAgora()) { guardar(animar(p, [{ opacity: 0 }, { opacity: 1 }], REDUZIDO_MS, 'linear'), fadeFundo(0, 1, REDUZIDO_MS)); return }
      const el = origem?.el?.isConnected ? origem.el : null
      const de = el?.getBoundingClientRect()
      const para = p.getBoundingClientRect()
      if (!el || !de?.width || !de.height || !para.width || !para.height) {
        p.style.transformOrigin = 'center'
        guardar(animar(p, [{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], FADE_MS), fadeFundo(0, 1, FADE_MS))
        return
      }
      const clone = criarClone(el, de)
      r.append(clone)
      v.clone = clone
      v.el = el
      el.style.visibility = 'hidden'
      const raioCard = getComputedStyle(el).borderRadius
      const raioPainel = getComputedStyle(p).borderRadius
      if (corpo) corpo.style.transformOrigin = 'top left'
      p.dataset.movendo = ''
      guardar(
        animar(p, [{ clipPath: recorte(de, para, raioCard) }, { clipPath: `inset(0px 0px 0px 0px round ${raioPainel})` }], ABRIR_MS),
        animar(clone, [{ transform: 'none' }, { transform: deslocar(de, para) }], ABRIR_MS),
        animar(clone, [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 0, offset: 1 }], ABRIR_MS, 'linear'),
        corpo && animar(corpo, [{ transform: encolher(de, para) }, { transform: 'none' }], ABRIR_MS),
        corpo && animar(corpo, [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 1 }], ABRIR_MS, 'linear'),
        fadeFundo(0, 1, FUNDO_MS),
      )
      aoTerminar(() => { if (v.seq === seq) { v.clone?.remove(); v.clone = null; delete p.dataset.movendo } })
      return
    }

    // Esconde antes de cancelar: sem o fill das animações, o painel inteiro piscaria por um quadro até desmontar.
    const sair = () => { if (v.seq === seq) { r.style.visibility = 'hidden'; encerrar(); onSaiu() } }
    // Fechar no meio da abertura: volta de onde está (reverse), sem reiniciar.
    if (v.anims.some((a) => a.playState === 'running')) {
      v.anims.forEach((a) => a.reverse())
      aoTerminar(sair)
      return
    }
    v.anims.forEach((a) => a.cancel())
    v.anims = []
    const el = v.el?.isConnected ? v.el : null
    const para = el?.getBoundingClientRect()
    if (reduzidoAgora()) guardar(animar(p, [{ opacity: 1 }, { opacity: 0 }], REDUZIDO_MS, 'linear'), fadeFundo(1, 0, REDUZIDO_MS))
    else if (!el || !para?.width || !para.height) {
      p.style.transformOrigin = 'center'
      guardar(animar(p, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], FECHAR_MS), fadeFundo(1, 0, FECHAR_MS))
    } else {
      const de = p.getBoundingClientRect()
      p.dataset.movendo = ''
      const clone = criarClone(el, para)
      r.append(clone)
      v.clone?.remove()
      v.clone = clone
      guardar(
        animar(p, [{ clipPath: `inset(0px 0px 0px 0px round ${getComputedStyle(p).borderRadius})` }, { clipPath: recorte(para, de, getComputedStyle(el).borderRadius) }], FECHAR_MS),
        animar(clone, [{ transform: deslocar(para, de) }, { transform: 'none' }], FECHAR_MS),
        animar(clone, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.55 }, { opacity: 1, offset: 1 }], FECHAR_MS, 'linear'),
        corpo && animar(corpo, [{ transform: 'none' }, { transform: encolher(para, de) }], FECHAR_MS),
        corpo && animar(corpo, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0, offset: 0.4 }, { opacity: 0, offset: 1 }], FECHAR_MS, 'linear'),
        fadeFundo(1, 0, FECHAR_MS),
      )
    }
    aoTerminar(sair)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  // Ao desmontar (inclusive troca de rota): cancela tudo e devolve o item de origem.
  useEffect(() => () => { vivo.current.seq++; encerrar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div ref={raiz} className="dash-ampliado__raiz">
      <div ref={fundo} className="dash-ampliado__fundo" onClick={onFechar} />
      <section ref={painel} className="dash-ampliado" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <div className="dash-ampliado__corpo">
          <header className="dash-ampliado__cabeca">
            <div className="dash-ampliado__titulos">
              <span className="dash-ampliado__eyebrow">Detalhe do indicador</span>
              <h2 className="dash-ampliado__titulo" id={`${id}-t`}>{conteudo.dado.titulo}</h2>
              {conteudo.tipo === 'generico' && conteudo.dado.valor !== undefined ? <strong className="dash-ampliado__valor">{conteudo.dado.valor ?? 's/dado'}</strong>
                : conteudo.tipo === 'dominio' && conteudo.dado.valor ? <strong className="dash-ampliado__valor">{conteudo.dado.valor}</strong> : null}
              <p className="dash-ampliado__descricao">{conteudo.tipo === 'dominio' ? conteudo.dado.descricao : [conteudo.dado.sub, conteudo.dado.hint].filter(Boolean).join(' · ')}</p>
            </div>
            <Button ref={fechar} variant="ghost" size="touch" icon={<X size={18} />} aria-label="Fechar" onClick={onFechar} />
          </header>
          {conteudo.tipo === 'dominio' ? <ConteudoDominio dado={conteudo.dado} clientUrl={clientUrl} /> : <ConteudoGenerico dado={conteudo.dado} />}
        </div>
      </section>
    </div>
  )
}

const Secao = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`dash-ampliado__secao ${className}`.trim()}>{children}</div>
)

function ConteudoDominio({ dado, clientUrl }: { dado: Ampliado; clientUrl: string | null }) {
  return <>
    {dado.grafico ? <Secao><GraficoAmpliado g={dado.grafico} nome={dado.titulo} /></Secao> : null}
    {dado.comparativo?.length ? <Secao><Comparativo itens={dado.comparativo} /></Secao> : null}
    {dado.tops ? <Secao><Tops tops={dado.tops} /></Secao> : null}
    <Secao className="dash-detalhe">
      {dado.tipo === 'indicador' ? <TabelaNumeros tabela={dado.tabela} /> : <Lista key={dado.titulo} detalhe={dado} clientUrl={clientUrl} />}
    </Secao>
    {dado.lista ? <Secao className="dash-ampliado__rodape"><VerNaLista lista={dado.lista} /></Secao> : null}
  </>
}

function ConteudoGenerico({ dado }: { dado: GenericoAmpliado }) {
  const comparativo = comparativoDe(dado.chips.filter((c): c is Chip => c.tipo === 'valor'))
  return <>
    {dado.apoio.length ? <Secao><span className="dash-card__chips dash-ampliado__chips"><Chips chips={[]} apoio={dado.apoio} /></span></Secao> : null}
    {dado.grafico ? <Secao className="dash-ampliado__grafico">{dado.grafico}</Secao> : null}
    {comparativo.length ? <Secao><Comparativo itens={comparativo} /></Secao> : null}
    {dado.tops?.length ? <Secao><Tops tops={dado.tops} /></Secao> : null}
    {dado.tabelaDados ? <Secao className="dash-detalhe"><TabelaNumeros tabela={dado.tabelaDados} /></Secao> : null}
    {dado.tabela ? <Secao className="dash-detalhe">{dado.tabela}</Secao> : null}
    <Secao><p className="dash-card__nota">{dado.periodo ? `${dado.periodo} · ` : ''}{dado.unidade}</p></Secao>
    {dado.lista ? <Secao className="dash-ampliado__rodape"><VerNaLista lista={dado.lista} /></Secao> : null}
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

