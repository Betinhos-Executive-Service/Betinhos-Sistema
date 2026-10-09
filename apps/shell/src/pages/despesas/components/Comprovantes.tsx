import { useEffect, useRef, useState } from 'react'
import { Button, Spinner, StatusBadge } from '@betinhos/ui'
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, ImageOff, X } from 'lucide-react'
import { formatDateTime } from '../../pagantes/domain/messages'
import { label } from '../../pagantes/domain/status'
import { temPrevia, tipoPrevia } from '../domain/arquivo'
import { arquivoTone } from '../domain/status'
import type { Anexo, Arquivo, DespesaChoices } from '../domain/types'

type Ler = (anexo: Anexo) => Promise<Arquivo>
type Estado = { arquivo: Arquivo } | { erro: string } | null
const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

/** Conteúdo do comprovante; o Source guarda em cache, então miniatura e visualizador leem uma vez só. */
function useArquivo(ler: Ler, anexo: Anexo | null) {
  const [estado, setEstado] = useState<Estado>(null)
  useEffect(() => {
    if (!anexo) { setEstado(null); return }
    let cancelled = false
    setEstado(null)
    ler(anexo).then((arquivo) => { if (!cancelled) setEstado({ arquivo }) }).catch((reason) => { if (!cancelled) setEstado({ erro: message(reason) }) })
    return () => { cancelled = true }
  }, [ler, anexo])
  return estado
}

/** Imagem ou PDF em tamanho de miniatura (PDF sem interação: o clique é do cartão). */
function Conteudo({ arquivo, grande = false }: { arquivo: Arquivo; grande?: boolean }) {
  const tipo = tipoPrevia(arquivo.mime)
  if (tipo === 'imagem') return <img className="dp-previa__img" src={arquivo.url} alt={grande ? arquivo.nome : ''} />
  if (tipo === 'pdf') return <iframe className={grande ? 'dp-previa__pdf' : 'dp-previa__pdf dp-previa__pdf--mini'} src={grande ? arquivo.url : `${arquivo.url}#toolbar=0&navpanes=0&view=FitH`} title={arquivo.nome} tabIndex={grande ? undefined : -1} />
  return <span className="dp-previa__vazio"><FileText size={28} aria-hidden="true" />Sem prévia para este tipo de arquivo</span>
}

function Miniatura({ anexo, ler }: { anexo: Anexo; ler: Ler }) {
  const estado = useArquivo(ler, anexo)
  if (estado == null) return <span className="dp-previa__vazio"><Spinner size={20} />Preparando prévia…</span>
  if ('erro' in estado) return <span className="dp-previa__vazio dp-previa__vazio--erro" title={estado.erro}><ImageOff size={24} aria-hidden="true" />Prévia indisponível</span>
  return <Conteudo arquivo={estado.arquivo} />
}

type Props = { anexos: Anexo[]; choices: DespesaChoices; ler: Ler }

/** Cartões com miniatura; imagem e PDF abrem no visualizador, o resto só pelo link do OneDrive. */
export function ComprovantesGaleria({ anexos, choices, ler }: Props) {
  const visiveis = anexos.filter((a) => a.driveItemId && temPrevia(a.nome))
  const [aberto, setAberto] = useState<number | null>(null)
  return (
    <>
      <ul className="dp-comprovantes">
        {anexos.map((a) => {
          const indice = visiveis.indexOf(a)
          const meta = [label(choices.anexoTipo, a.tipo, ''), a.enviadoEm ? formatDateTime(a.enviadoEm) : ''].filter(Boolean).join(' · ')
          return (
            <li key={a.id} className="dp-comprovante">
              {indice >= 0 ? (
                <button type="button" className="dp-comprovante__previa" aria-label={`Ver ${a.nome}`} onClick={() => setAberto(indice)}>
                  <Miniatura anexo={a} ler={ler} />
                </button>
              ) : (
                <span className="dp-comprovante__previa"><span className="dp-previa__vazio"><FileText size={28} aria-hidden="true" />{a.driveItemId ? 'Sem prévia para este tipo de arquivo' : 'Arquivo ainda não está no OneDrive'}</span></span>
              )}
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
  const estado = useArquivo(ler, anexo)
  const total = anexos.length

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
      aria-label={anexo ? `Comprovante ${anexo.nome}` : 'Comprovante'}
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
            <span className="dp-viewer__titulo"><strong>{anexo.nome}</strong>{total > 1 ? <span className="pg-num">{(indice ?? 0) + 1} de {total}</span> : null}</span>
            <span className="dp-viewer__acoes">
              {estado && 'arquivo' in estado ? (
                <>
                  <a className="dp-viewer__acao" href={estado.arquivo.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba" title="Abrir em nova aba"><ExternalLink size={18} aria-hidden="true" /></a>
                  <a className="dp-viewer__acao" href={estado.arquivo.url} download={anexo.nome} aria-label="Baixar arquivo" title="Baixar"><Download size={18} aria-hidden="true" /></a>
                </>
              ) : null}
              <button type="button" className="dp-viewer__acao" aria-label="Fechar visualizador" onClick={() => onChange(null)}><X size={18} aria-hidden="true" /></button>
            </span>
          </header>
          <div className="dp-viewer__body">
            {total > 1 ? <Button variant="secondary" className="dp-viewer__nav dp-viewer__nav--prev" icon={<ChevronLeft size={20} />} aria-label="Comprovante anterior" onClick={() => ir(-1)} /> : null}
            {estado == null ? <span className="dp-previa__vazio"><Spinner size={24} />Preparando prévia…</span>
              : 'erro' in estado ? <span className="dp-previa__vazio dp-previa__vazio--erro" role="alert"><ImageOff size={32} aria-hidden="true" />{estado.erro}</span>
                : <Conteudo arquivo={estado.arquivo} grande />}
            {total > 1 ? <Button variant="secondary" className="dp-viewer__nav dp-viewer__nav--next" icon={<ChevronRight size={20} />} aria-label="Próximo comprovante" onClick={() => ir(1)} /> : null}
          </div>
        </div>
      ) : null}
    </dialog>
  )
}
