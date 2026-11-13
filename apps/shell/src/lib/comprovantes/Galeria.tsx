import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Spinner } from '@betinhos/ui'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, ImageOff, RefreshCw, Video, X } from 'lucide-react'
import { useQueryId } from '../../nav/queryState'
import { BrandLoader } from '../../app/BrandLoader'
import { ehVideo, tipoPrevia, type Arquivo, type Comprovante } from './arquivo'
import './comprovantes.css'

type Ler = (anexo: Comprovante) => Promise<Arquivo>
type Estado = { arquivo: Arquivo } | { erro: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Dá para buscar o conteúdo: pelo id do OneDrive ou, nos comprovantes antigos, pelo link. */
const temArquivo = (a: Comprovante) => Boolean(a.driveItemId || a.url)

/**
 * Conteúdo do comprovante; o Source guarda em cache (e esquece falhas), então "Tentar de novo" busca outra vez.
 * Com `ativo` falso (miniatura fora da tela) não busca nada.
 */
function useArquivo(ler: Ler, anexo: Comprovante | null, ativo = true) {
  const [estado, setEstado] = useState<Estado>(null)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    if (!anexo || !ativo) { setEstado(null); return }
    let cancelled = false
    setEstado(null)
    ler(anexo).then((arquivo) => { if (!cancelled) setEstado({ arquivo }) }).catch((reason) => { if (!cancelled) setEstado({ erro: message(reason) }) })
    return () => { cancelled = true }
  }, [ler, anexo, ativo, tentativa])
  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  return { estado, tentarDeNovo }
}

/** Vira verdadeiro quando o elemento chega perto da tela (e fica); sem IntersectionObserver, já nasce visível. */
function useVisivel() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [visivel, setVisivel] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (visivel || !el) return
    const obs = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisivel(true); obs.disconnect() } }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [el, visivel])
  return [setEl, visivel] as const
}

/** Miniatura: spinner pequeno; o visualizador usa o loader da marca. */
const Carregando = () => <span className="cmp-previa__vazio"><Spinner size={20} label="Buscando no OneDrive" />Buscando no OneDrive…</span>

/** No visualizador, com o link do arquivo, oferece abrir direto no SharePoint (ex.: vídeo grande demais para o flow). */
function Falha({ erro, onRetry, grande = false, link }: { erro: string; onRetry: () => void; grande?: boolean; link?: string | null }) {
  return (
    <span className="cmp-previa__vazio cmp-previa__vazio--erro" role={grande ? 'alert' : undefined}>
      <ImageOff size={grande ? 32 : 24} aria-hidden="true" />
      <span title={erro}>{grande ? erro : 'Prévia indisponível'}</span>
      <span className="cmp-previa__acoes">
        {grande && link ? <a className="cmp-link" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />Abrir no SharePoint</a> : null}
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry}>Tentar de novo</Button>
      </span>
    </span>
  )
}

const IconeVideo = () => <span className="cmp-previa__vazio"><Video size={28} aria-hidden="true" />Vídeo</span>

/** Imagem, PDF ou vídeo; outros tipos ficam só com abrir/baixar. Na miniatura o PDF não recebe clique e o vídeo é só ícone. */
function Conteudo({ arquivo, grande = false }: { arquivo: Arquivo; grande?: boolean }) {
  const tipo = tipoPrevia(arquivo.mime)
  if (tipo === 'video') return grande ? <video className="cmp-previa__video" src={arquivo.url} controls playsInline aria-label={arquivo.nome} /> : <IconeVideo />
  if (tipo === 'imagem') return <img className="cmp-previa__img" src={arquivo.url} alt={grande ? arquivo.nome : ''} />
  if (tipo === 'pdf') return <iframe className={grande ? 'cmp-previa__pdf' : 'cmp-previa__pdf cmp-previa__pdf--mini'} src={grande ? arquivo.url : `${arquivo.url}#toolbar=0&navpanes=0&view=FitH`} title={arquivo.nome} tabIndex={grande ? undefined : -1} />
  return <span className="cmp-previa__vazio"><FileText size={28} aria-hidden="true" />{grande ? 'Este tipo de arquivo não tem prévia. Use abrir ou baixar.' : 'Sem prévia'}</span>
}

/** Vídeo fica só com o ícone (é buscado ao abrir); o resto busca a prévia quando a miniatura chega perto da tela. */
function Miniatura({ anexo, ler, onOpen }: { anexo: Comprovante; ler: Ler; onOpen: (origem: DOMRect) => void }) {
  const video = ehVideo(anexo)
  const [ref, visivel] = useVisivel()
  const { estado, tentarDeNovo } = useArquivo(ler, anexo, visivel && !video)
  if (estado && 'erro' in estado) return <div ref={ref} className="cmp-comprovante__previa"><Falha erro={estado.erro} onRetry={tentarDeNovo} /></div>
  return (
    <button ref={ref} type="button" className="cmp-comprovante__previa" aria-label={`Ver ${estado?.arquivo.nome ?? anexo.nome}`} onClick={(event) => onOpen(event.currentTarget.getBoundingClientRect())}>
      {video ? <IconeVideo /> : estado ? <Conteudo arquivo={estado.arquivo} /> : <Carregando />}
    </button>
  )
}

type Props<T extends Comprovante> = {
  anexos: T[]
  ler: (anexo: T) => Promise<Arquivo>
  /** Linha cinza do cartão (tipo, data, quem enviou). */
  meta?: (anexo: T) => string
  /** Selo do cartão (ex.: status do envio). */
  selo?: (anexo: T) => ReactNode
  /** Grupo do cartão (ex.: serviço da OP): anexos seguidos com a mesma chave ficam sob um título. O visualizador navega por todos. */
  grupo?: (anexo: T) => { chave: string; titulo: ReactNode }
}

/** Cartões com miniatura; clicar abre o visualizador. Sem arquivo no OneDrive, só o aviso. */
export function ComprovantesGaleria<T extends Comprovante>({ anexos, ler: lerAnexo, meta: metaDe, selo, grupo }: Props<T>) {
  // A galeria só repassa a `ler` os próprios anexos (do tipo T), então o alargamento é seguro.
  const ler = lerAnexo as Ler
  const visiveis = anexos.filter(temArquivo)
  // O comprovante aberto no visualizador vive na URL (`comprovante=<id do anexo>`).
  const [abertoId, setAbertoId] = useQueryId('comprovante')
  const achado = abertoId ? visiveis.findIndex((a) => a.id === abertoId) : -1
  const aberto = achado >= 0 ? achado : null
  const setAberto = (indice: number | null) => setAbertoId(indice == null ? null : visiveis[indice]?.id ?? null)
  // Retângulo da miniatura clicada: o visualizador cresce a partir dela.
  const origem = useRef<DOMRect | null>(null)
  // Blocos de anexos seguidos do mesmo grupo; sem `grupo`, um bloco só, sem título.
  const blocos: { chave: string; titulo: ReactNode; itens: T[] }[] = []
  for (const a of anexos) {
    const g = grupo?.(a) ?? { chave: '', titulo: null }
    const ultimo = blocos[blocos.length - 1]
    if (ultimo && ultimo.chave === g.chave) ultimo.itens.push(a)
    else blocos.push({ ...g, itens: [a] })
  }
  return (
    <>
      {blocos.map((bloco) => (
      <Fragment key={bloco.chave}>
      {bloco.titulo ? <h4 className="cmp-grupo">{bloco.titulo}</h4> : null}
      <ul className="cmp-comprovantes">
        {bloco.itens.map((a) => {
          const indice = visiveis.indexOf(a)
          const meta = metaDe?.(a) ?? ''
          return (
            <li key={a.id} className="cmp-comprovante">
              {indice >= 0
                ? <Miniatura anexo={a} ler={ler} onOpen={(rect) => { origem.current = rect; setAberto(indice) }} />
                : <div className="cmp-comprovante__previa"><span className="cmp-previa__vazio"><FileText size={28} aria-hidden="true" />Arquivo ainda não está no OneDrive</span></div>}
              <div className="cmp-comprovante__info">
                <strong className="cmp-comprovante__nome" title={a.nome}>{a.nome}</strong>
                {meta ? <span className="cmp-comprovante__meta" title={meta}>{meta}</span> : null}
                {selo?.(a)}
                {a.url ? <a className="cmp-link" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome} no OneDrive`} title="Abrir no OneDrive"><ExternalLink size={16} aria-hidden="true" /></a> : null}
              </div>
            </li>
          )
        })}
      </ul>
      </Fragment>
      ))}
      <Visualizador anexos={visiveis} indice={aberto} onChange={setAberto} ler={ler} origem={origem} />
    </>
  )
}

/**
 * Visualizador em tela cheia por cima da ficha: <dialog> nativo empilhado sobre o Drawer (que também é
 * <dialog>), então Esc e o fundo fecham só ele. Setas trocam de arquivo.
 * Abre crescendo da miniatura clicada e, ao fechar, espera a saída (~150 ms) mostrando o último arquivo.
 */
function Visualizador({ anexos, indice: pedido, onChange, ler, origem }: { anexos: Comprovante[]; indice: number | null; onChange: (i: number | null) => void; ler: Ler; origem: { current: DOMRect | null } }) {
  const ref = useRef<HTMLDialogElement>(null)
  const pedidoAnexo = pedido != null ? anexos[pedido] ?? null : null
  // Durante a saída o conteúdo continua o último aberto, para não sumir antes do fade.
  const ultimo = useRef<{ anexo: Comprovante; indice: number } | null>(null)
  if (pedidoAnexo && pedido != null) ultimo.current = { anexo: pedidoAnexo, indice: pedido }
  const anexo = pedidoAnexo ?? ultimo.current?.anexo ?? null
  const indice = pedidoAnexo ? pedido : ultimo.current?.indice ?? null
  const { estado, tentarDeNovo } = useArquivo(ler, anexo)
  const total = anexos.length
  const arquivo = estado && 'arquivo' in estado ? estado.arquivo : null
  const nome = arquivo?.nome ?? anexo?.nome ?? ''

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (pedidoAnexo) {
      dialog.classList.remove('cmp-viewer--saindo')
      if (dialog.open) return
      dialog.showModal()
      // Origem da escala: o centro da miniatura, em relação ao visualizador (sem miniatura, o centro dele).
      const de = origem.current
      origem.current = null
      const caixa = dialog.getBoundingClientRect()
      dialog.style.setProperty('--cmp-origem', de && caixa.width ? `${de.left + de.width / 2 - caixa.left}px ${de.top + de.height / 2 - caixa.top}px` : 'center')
      return
    }
    if (!dialog.open) return
    dialog.classList.add('cmp-viewer--saindo')
    const fechar = () => { dialog.classList.remove('cmp-viewer--saindo'); dialog.close(); ultimo.current = null }
    // Fim da animação do próprio dialog fecha na hora; o timer cobre navegador sem animação (ou jsdom).
    const aoAnimar = (event: AnimationEvent) => { if (event.target === dialog && !event.pseudoElement) fechar() }
    const timer = window.setTimeout(fechar, 200)
    dialog.addEventListener('animationend', aoAnimar)
    return () => { window.clearTimeout(timer); dialog.removeEventListener('animationend', aoAnimar) }
  }, [pedidoAnexo, origem])

  const ir = (passo: number) => { if (pedidoAnexo && indice != null && total > 1) onChange((indice + passo + total) % total) }

  return (
    <dialog
      ref={ref}
      className="cmp-viewer"
      aria-label={anexo ? `Comprovante ${nome}` : 'Comprovante'}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onChange(null) }}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onChange(null) }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); ir(1) }
        if (event.key === 'ArrowLeft') { event.preventDefault(); ir(-1) }
      }}
    >
      {anexo ? (
        <div className="cmp-viewer__panel">
          <header className="cmp-viewer__head">
            <span className="cmp-viewer__titulo"><strong>{nome}</strong>{total > 1 ? <span className="cmp-num">{(indice ?? 0) + 1} de {total}</span> : null}</span>
            <span className="cmp-viewer__acoes">
              {arquivo ? (
                <>
                  <a className="cmp-viewer__acao" href={arquivo.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba" title="Abrir em nova aba"><ExternalLink size={18} aria-hidden="true" /></a>
                  <a className="cmp-viewer__acao" href={arquivo.url} download={arquivo.nome} aria-label="Baixar arquivo" title="Baixar"><Download size={18} aria-hidden="true" /></a>
                </>
              ) : null}
              <button type="button" className="cmp-viewer__acao" aria-label="Fechar visualizador" onClick={() => onChange(null)}><X size={18} aria-hidden="true" /></button>
            </span>
          </header>
          <div className="cmp-viewer__body">
            {total > 1 ? <Button variant="secondary" className="cmp-viewer__nav cmp-viewer__nav--prev" icon={<ChevronLeft size={20} />} aria-label="Comprovante anterior" onClick={() => ir(-1)} /> : null}
            <div key={anexo.id} className="cmp-viewer__conteudo">
            {estado == null ? (ehVideo(anexo)
              ? <BrandLoader variant="inline" size="md" label="Baixando o vídeo" text="Baixando o vídeo… pode levar até 1 minuto." />
              : <BrandLoader variant="inline" size="md" label="Buscando no OneDrive" text="Buscando no OneDrive…" />)
              : 'erro' in estado ? <Falha erro={estado.erro} onRetry={tentarDeNovo} grande link={anexo.url} />
                : <Conteudo arquivo={estado.arquivo} grande />}
            </div>
            {total > 1 ? <Button variant="secondary" className="cmp-viewer__nav cmp-viewer__nav--next" icon={<ChevronRight size={20} />} aria-label="Próximo comprovante" onClick={() => ir(1)} /> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
