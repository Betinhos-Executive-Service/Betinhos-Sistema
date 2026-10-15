import { useRef, useState, type PointerEvent } from 'react'
import { Button } from '../components/Button'
import { Checkbox } from '../components/Choice'
import { Dialog } from '../components/Dialog'
import { Drawer } from '../components/Drawer'
import { Sheet } from '../components/Sheet'
import { useMediaQuery } from '../useMediaQuery'
import { moveColumn, sameConfig, toggleColumn, visibleColumns, type ViewColumnDef, type ViewConfig } from './config'
import { icons } from './icons'

export type ColumnsPanelProps = {
  open: boolean
  onClose: () => void
  columns: ViewColumnDef[]
  /** Configuração na tela; o painel edita um rascunho das colunas. */
  config: ViewConfig
  /** Colunas da visão padrão, para "Restaurar colunas". */
  defaults: ViewConfig
  /** Recebe a configuração com as colunas novas; ordenação e filtros não mudam. */
  onApply: (config: ViewConfig) => void
}

/** Painel de colunas (§10.9.1): mostrar/ocultar e reordenar por arraste ou ↑/↓; só vale em "Aplicar". Drawer no desktop, Sheet no mobile. */
export function ColumnsPanel({ open, onClose, columns, config, defaults, onApply }: ColumnsPanelProps) {
  const mobile = useMediaQuery('(max-width: 820px)')
  const [draft, setDraft] = useState(config)
  const [confirming, setConfirming] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const [dragging, setDragging] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const drag = useRef<{ key: string; pointerId: number } | null>(null)

  // Cada abertura começa do que está na tela.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(config)
  }

  const labels = new Map(columns.map((c) => [c.key, c.label]))
  const first = columns[0]?.key
  const changed = !sameConfig(draft, config)
  const visibleCount = visibleColumns(draft).length

  function requestClose() {
    if (changed) setConfirming(true)
    else onClose()
  }
  function discard() {
    setConfirming(false)
    onClose()
  }
  function apply() {
    onApply({ ...config, columns: draft.columns })
    onClose()
  }
  const move = (key: string, to: number) => setDraft((d) => moveColumn(d, columns, key, to))

  // O item muda de lugar no DOM ao reordenar e perde a captura do ponteiro: o arraste ouve a janela.
  function onHandlePointerDown(event: PointerEvent<HTMLElement>, key: string) {
    if (event.button !== 0) return
    event.preventDefault()
    const pointerId = event.pointerId
    drag.current = { key, pointerId }
    setDragging(key)
    const onMove = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) dragMove(e.clientY) }
    const onUp = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      drag.current = null
      setDragging(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
  function dragMove(clientY: number) {
    const state = drag.current
    const list = listRef.current
    if (!state || !list) return
    // Posição final: quantos itens (fora o arrastado) têm o meio acima do ponteiro; o primeiro é fixo.
    const items = Array.from(list.querySelectorAll<HTMLElement>('[data-col]')).filter((el) => el.dataset.col !== state.key)
    const target = Math.max(1, items.filter((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 < clientY }).length)
    setDraft((d) => (d.columns.findIndex((c) => c.key === state.key) === target ? d : moveColumn(d, columns, state.key, target)))
  }

  const footer = (
    <div className="bt-columns__footer">
      <Button variant="ghost" icon={icons.reset} onClick={() => setDraft((d) => ({ ...d, columns: defaults.columns }))}>Restaurar colunas</Button>
      <span className="bt-columns__footer-end">
        <Button variant="secondary" onClick={requestClose}>Cancelar</Button>
        <Button onClick={apply} disabled={!changed}>Aplicar</Button>
      </span>
    </div>
  )

  const list = (
    <ul ref={listRef} className="bt-columns" aria-label="Colunas">
      {draft.columns.map((state, index) => {
        const label = labels.get(state.key) ?? state.key
        const fixed = state.key === first
        return (
          <li key={state.key} data-col={state.key} className={['bt-columns__item', dragging === state.key && 'is-dragging'].filter(Boolean).join(' ')}>
            {fixed ? <span className="bt-columns__handle bt-columns__handle--fixed" aria-hidden="true" /> : (
              <span
                className="bt-columns__handle"
                aria-hidden="true"
                title="Arraste para mudar a ordem"
                onPointerDown={(event) => onHandlePointerDown(event, state.key)}
              >{icons.grip}</span>
            )}
            <Checkbox
              className="bt-columns__check"
              label={label}
              description={fixed ? 'Coluna fixa' : undefined}
              checked={state.visible}
              disabled={fixed || (state.visible && visibleCount === 1)}
              onChange={() => setDraft((d) => toggleColumn(d, columns, state.key))}
            />
            {fixed ? null : (
              <span className="bt-columns__move">
                <Button variant="ghost" size="compact" icon={icons.up} aria-label={`Mover ${label} para cima`} disabled={index <= 1} onClick={() => move(state.key, index - 1)} />
                <Button variant="ghost" size="compact" icon={icons.down} aria-label={`Mover ${label} para baixo`} disabled={index === draft.columns.length - 1} onClick={() => move(state.key, index + 1)} />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      {mobile
        ? <Sheet open={open} onClose={requestClose} title="Colunas" footer={footer}>{list}</Sheet>
        : <Drawer open={open} onClose={requestClose} title="Colunas" footer={footer}>{list}</Drawer>}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={discard}>Descartar</Button>
        </>}
      >
        As mudanças nas colunas ainda não foram aplicadas.
      </Dialog>
    </>
  )
}
