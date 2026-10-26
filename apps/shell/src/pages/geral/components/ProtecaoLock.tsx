import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react'
import { Lock } from 'lucide-react'
import { Spinner } from '@betinhos/ui'
import { formatDateTime } from '../domain/format'
import { AUDIT_LIMIT, textoDoValor, ultimaAlteracao, valorDaTenaris, type Protecao } from '../domain/protecao'
import type { AttributeInfo } from '../domain/types'

/** Busca (com cache por OS) o histórico do popover; `null` fora da Geral: o cadeado não aparece. */
export const ProtecaoContext = createContext<((id: string) => Promise<Protecao>) | null>(null)

const HOVER_OPEN_MS = 200
const HOVER_CLOSE_MS = 150
const GAP = 6

type State = { kind: 'loading' } | { kind: 'ok'; data: Protecao } | { kind: 'error'; message: string }
type Props = { id: string; attribute: string; label: string; atual: string; info: AttributeInfo | undefined }

// O cadeado vive dentro da célula e da linha: clique, duplo clique e teclas não podem selecionar nem abrir edição.
const stop = (event: SyntheticEvent) => event.stopPropagation()

/** Cadeado do campo travado contra a sincronização da Tenaris; hover (mouse) ou clique/toque abre o histórico. */
export function ProtecaoLock({ id, attribute, label, atual, info }: Props) {
  const load = useContext(ProtecaoContext)
  const [open, setOpen] = useState(false)
  // Aberto por clique, toque ou teclado: sair com o mouse não fecha.
  const [pinned, setPinned] = useState(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const panelId = useId()

  const close = useCallback((focus = false) => {
    window.clearTimeout(timer.current)
    setOpen(false)
    setPinned(false)
    if (focus) buttonRef.current?.focus()
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!open || !load) return
    let alive = true
    setState({ kind: 'loading' })
    load(id).then(
      (data) => { if (alive) setState({ kind: 'ok', data }) },
      (error: unknown) => { if (alive) setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) }) },
    )
    return () => { alive = false }
  }, [open, id, load])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const button = buttonRef.current
    if (!open || !panel || !button) return
    try { panel.showPopover?.() } catch { /* sem suporte: fixo com z-index alto */ }
    const place = () => {
      const r = button.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`
      const below = window.innerHeight - r.bottom - GAP
      panel.style.top = `${below >= height || below >= r.top ? r.bottom + GAP : Math.max(8, r.top - GAP - height)}px`
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(panel)
    const outside = (event: PointerEvent) => { const t = event.target as Node; if (!panel.contains(t) && !button.contains(t)) close() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }
    const onScroll = (event: Event) => { if (!panel.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      observer?.disconnect()
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  if (!load) return null

  const hoverIn = (event: { pointerType: string }) => {
    if (event.pointerType !== 'mouse') return
    window.clearTimeout(timer.current)
    if (!open) timer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS)
  }
  const hoverOut = (event: { pointerType: string }) => {
    if (event.pointerType !== 'mouse' || pinned) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS)
  }
  const toggle = () => {
    window.clearTimeout(timer.current)
    if (open && pinned) close()
    else { setOpen(true); setPinned(true) }
  }

  return (
    <span className="gr-protecao" onClick={stop} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop} onKeyDown={stop}>
      <button
        ref={buttonRef}
        type="button"
        className="gr-protecao__trigger"
        aria-label={`${label}: campo protegido da sincronização da Tenaris. Ver histórico`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
      >
        <Lock size={12} aria-hidden="true" />
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="gr-protecao__panel" popover="manual" role="dialog" aria-label={`Histórico de ${label}`} onPointerEnter={hoverIn} onPointerLeave={hoverOut}>
          <p className="gr-protecao__title"><Lock size={12} aria-hidden="true" /> Campo protegido</p>
          <p className="gr-protecao__note">Editado manualmente: a sincronização da Tenaris não sobrescreve mais este campo.</p>
          <dl className="gr-protecao__list">
            <div><dt>Valor atual</dt><dd>{atual}</dd></div>
            <Historico state={state} attribute={attribute} info={info} />
          </dl>
        </div>
      ) : null}
    </span>
  )
}

const Status = ({ children }: { children: ReactNode }) => <div><dt>Histórico</dt><dd className="gr-protecao__status">{children}</dd></div>

function Historico({ state, attribute, info }: { state: State; attribute: string; info: AttributeInfo | undefined }) {
  if (state.kind === 'loading') return <Status><Spinner size={12} label="Buscando histórico" /> Buscando histórico…</Status>
  if (state.kind === 'error') return <Status>Não foi possível carregar o histórico. {state.message}</Status>
  const { audits, snapshot } = state.data
  const fonte = valorDaTenaris(snapshot, attribute)
  const change = audits === 'sem-permissao' ? null : ultimaAlteracao(audits, attribute)
  return (
    <>
      {audits === 'sem-permissao' ? (
        <Status>Seu perfil não tem acesso à auditoria, por isso o valor anterior e o autor não aparecem.</Status>
      ) : change ? (
        <>
          <div><dt>Antes</dt><dd>{textoDoValor(change.antes, info)}</dd></div>
          <div><dt>Alterado em</dt><dd>{formatDateTime(change.em)}</dd></div>
          <div><dt>Por</dt><dd>{change.por}</dd></div>
        </>
      ) : (
        <Status>{audits.length >= AUDIT_LIMIT ? `A alteração é anterior às últimas ${AUDIT_LIMIT} mudanças auditadas desta OS.` : 'Nenhuma alteração deste campo na auditoria.'}</Status>
      )}
      {fonte != null ? <div><dt>A Tenaris manda hoje</dt><dd>{textoDoValor(fonte, info)}</dd></div> : null}
    </>
  )
}
