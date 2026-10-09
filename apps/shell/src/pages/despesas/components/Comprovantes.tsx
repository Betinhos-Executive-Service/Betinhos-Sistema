import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner, StatusBadge } from '@betinhos/ui'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, ImageOff, RefreshCw, X } from 'lucide-react'
import { useQueryId } from '../../../nav/queryState'
import { formatDateTime } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import { tipoPrevia } from '../domain/arquivo'
import { arquivoTone } from '../domain/status'
import type { Anexo, Arquivo, DespesaChoices } from '../domain/types'

type Ler = (anexo: Anexo) => Promise<Arquivo>
type Estado = { arquivo: Arquivo } | { erro: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Dá para buscar o conteúdo: pelo id do OneDrive ou, nos comprovantes antigos, pelo link. */
const temArquivo = (a: Anexo) => Boolean(a.driveItemId || a.url)

/** Conteúdo do comprovante; o Source guarda em cache (e esquece falhas), então "Tentar de novo" busca outra vez. */
function useArquivo(ler: Ler, anexo: Anexo | null) {
  const [estado, setEstado] = useState<Estado>(null)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    if (!anexo) { setEstado(null); return }
    let cancelled = false
    setEstado(null)
    ler(anexo).then((arquivo) => { if (!cancelled) setEstado({ arquivo }) }).catch((reason) => { if (!cancelled) setEstado({ erro: message(reason) }) })
    return () => { cancelled = true }
  }, [ler, anexo, tentativa])
  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), [])
  return { estado, tentarDeNovo }
}

const Carregando = () => <span className="dp-previa__vazio"><Spinner size={20} label="Buscando no OneDrive" />Buscando no OneDrive…</span>

function Falha({ erro, onRetry, grande = false }: { erro: string; onRetry: () => void; grande?: boolean }) {
  return (
    <span className="dp-previa__vazio dp-previa__vazio--erro" role={grande ? 'alert' : undefined}>
      <ImageOff size={grande ? 32 : 24} aria-hidden="true" />
      <span title={erro}>{grande ? erro : 'Prévia indisponível'}</span>
      <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={onRetry}>Tentar de novo</Button>
    </span>
  )
}

/** Imagem ou PDF; outros tipos ficam só com abrir/baixar. Na miniatura o PDF não recebe clique. */
function Conteudo({ arquivo, grande = false }: { arquivo: Arquivo; grande?: boolean }) {
  const tipo = tipoPrevia(arquivo.mime)
  if (tipo === 'imagem') return <img className="dp-previa__img" src={arquivo.url} alt={grande ? arquivo.nome : ''} />
  if (tipo === 'pdf') return <iframe className={grande ? 'dp-previa__pdf' : 'dp-previa__pdf dp-previa__pdf--mini'} src={grande ? arquivo.url : `${arquivo.url}#toolbar=0&navpanes=0&view=FitH`} title={arquivo.nome} tabIndex={grande ? undefined : -1} />
  return <span className="dp-previa__vazio"><FileText size={28} aria-hidden="true" />{grande ? 'Este tipo de arquivo não tem prévia. Use abrir ou baixar.' : 'Sem prévia'}</span>
}

function Miniatura({ anexo, ler, onOpen }: { anexo: Anexo; ler: Ler; onOpen: () => void }) {
  const { estado, tentarDeNovo } = useArquivo(ler, anexo)
  if (estado && 'erro' in estado) return <div className="dp-comprovante__previa"><Falha erro={estado.erro} onRetry={tentarDeNovo} /></div>
  return (
    <button type="button" className="dp-comprovante__previa" aria-label={`Ver ${estado?.arquivo.nome ?? anexo.nome}`} onClick={onOpen}>
      {estado ? <Conteudo arquivo={estado.arquivo} /> : <Carregando />}
    </button>
  )
}

type Props = { anexos: Anexo[]; choices: DespesaChoices; ler: Ler }

/** Cartões com miniatura; clicar abre o visualizador. Sem arquivo no OneDrive, só o aviso. */
export function ComprovantesGaleria({ anexos, choices, ler }: Props) {
  const visiveis = anexos.filter(temArquivo)
  // O comprovante aberto no visualizador vive na URL (`comprovante=<id do anexo>`).
  const [abertoId, setAbertoId] = useQueryId('comprovante')
  const achado = abertoId ? visiveis.findIndex((a) => a.id === abertoId) : -1
  const aberto = achado >= 0 ? achado : null
  const setAberto = (indice: number | null) => setAbertoId(indice == null ? null : visiveis[indice]?.id ?? null)
  return (
    <>
      <ul className="dp-comprovantes">
        {anexos.map((a) => {
          const indice = visiveis.indexOf(a)
          const meta = [label(choices.anexoTipo, a.tipo, ''), a.enviadoEm ? formatDateTime(a.enviadoEm) : ''].filter(Boolean).join(' · ')
          return (
            <li key={a.id} className="dp-comprovante">
              {indice >= 0
                ? <Miniatura anexo={a} ler={ler} onOpen={() => setAberto(indice)} />
                : <div className="dp-comprovante__previa"><span className="dp-previa__vazio"><FileText size={28} aria-hidden="true" />Arquivo ainda não está no OneDrive</span></div>}
              <div className="dp-comprovante__info">
                <strong className="dp-comprovante__nome" title={a.nome}>{a.nome}</strong>
                <span className="pg-muted dp-comprovante__meta" title={meta}>{meta}</span>
                <StatusBadge tone={arquivoTone(a.status)}>{label(choices.anexoStatus, a.status, 'Sem status')}</StatusBadge>
                {a.url ? <a className="dp-link" href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome} no OneDrive`} title="Abrir no OneDrive"><ExternalLink size={16} aria-hidden="true" /></a> : null}
              </div>
            </li>
          )
        })}
      </ul>
      <Visualizador anexos={visiveis} indice={aberto} onChange={setAberto} ler={ler} />
    </>
  )
}

/**
 * Visualizador em tela cheia por cima da ficha: <dialog> nativo empilhado sobre o Drawer (que também é
 * <dialog>), então Esc e o fundo fecham só ele. Setas trocam de arquivo.
 */
function Visualizador({ anexos, indice, onChange, ler }: { anexos: Anexo[]; indice: number | null; onChange: (i: number | null) => void; ler: Ler }) {
  const ref = useRef<HTMLDialogElement>(null)
  const anexo = indice != null ? anexos[indice] ?? null : null
  const { estado, tentarDeNovo } = useArquivo(ler, anexo)
  const total = anexos.length
  const arquivo = estado && 'arquivo' in estado ? estado.arquivo : null
  const nome = arquivo?.nome ?? anexo?.nome ?? ''

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (anexo && !dialog.open) dialog.showModal()
    if (!anexo && dialog.open) dialog.close()
  }, [anexo])

  const ir = (passo: number) => { if (indice != null && total > 1) onChange((indice + passo + total) % total) }

  return (
    <dialog
      ref={ref}
      className="dp-viewer"
      aria-label={anexo ? `Comprovante ${nome}` : 'Comprovante'}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onChange(null) }}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onChange(null) }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') { event.preventDefault(); ir(1) }
        if (event.key === 'ArrowLeft') { event.preventDefault(); ir(-1) }
      }}
    >
      {anexo ? (
        <div className="dp-viewer__panel">
          <header className="dp-viewer__head">
            <span className="dp-viewer__titulo"><strong>{nome}</strong>{total > 1 ? <span className="pg-num">{(indice ?? 0) + 1} de {total}</span> : null}</span>
            <span className="dp-viewer__acoes">
              {arquivo ? (
                <>
                  <a className="dp-viewer__acao" href={arquivo.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba" title="Abrir em nova aba"><ExternalLink size={18} aria-hidden="true" /></a>
                  <a className="dp-viewer__acao" href={arquivo.url} download={arquivo.nome} aria-label="Baixar arquivo" title="Baixar"><Download size={18} aria-hidden="true" /></a>
                </>
              ) : null}
              <button type="button" className="dp-viewer__acao" aria-label="Fechar visualizador" onClick={() => onChange(null)}><X size={18} aria-hidden="true" /></button>
            </span>
          </header>
          <div className="dp-viewer__body">
            {total > 1 ? <Button variant="secondary" className="dp-viewer__nav dp-viewer__nav--prev" icon={<ChevronLeft size={20} />} aria-label="Comprovante anterior" onClick={() => ir(-1)} /> : null}
            {estado == null ? <Carregando />
              : 'erro' in estado ? <Falha erro={estado.erro} onRetry={tentarDeNovo} grande />
                : <Conteudo arquivo={estado.arquivo} grande />}
            {total > 1 ? <Button variant="secondary" className="dp-viewer__nav dp-viewer__nav--next" icon={<ChevronRight size={20} />} aria-label="Próximo comprovante" onClick={() => ir(1)} /> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
