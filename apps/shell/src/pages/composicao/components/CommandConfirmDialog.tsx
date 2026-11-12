import { useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type Summary = { label: string; count: number; tone?: 'warning' | 'neutral' | 'error' }

type Props = {
  kind: 'op' | 'delete'
  title: string
  description: string
  items: string[]
  summary?: Summary[]
  confirmLabel: string
  mock?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function CommandConfirmDialog({ kind, title, description, items, summary = [], confirmLabel, mock = false, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const eligibleCount = summary.find((item) => item.label === 'Elegíveis')?.count ?? 0
  const issues = summary.filter((item) => item.label !== 'Elegíveis' && item.count > 0)
  const hasReadErrors = issues.some((item) => item.tone === 'error')
  const issueCount = issues.reduce((total, item) => total + item.count, 0)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); return }
      if (event.key !== 'Tab') return
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      if (!buttons?.length) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [onCancel])

  return (
    <div className="command-dialog-backdrop">
      <div ref={dialogRef} className="command-dialog" role="alertdialog" aria-modal="true" aria-labelledby="command-dialog-title" aria-describedby="command-dialog-description" data-kind={kind}>
        <div className="command-dialog__top">
          {kind === 'delete' && <span className="command-dialog__symbol" aria-hidden="true"><AlertTriangle /></span>}
          <button type="button" className="command-dialog__close" onClick={onCancel} aria-label="Cancelar e fechar"><X /></button>
        </div>
        <h2 id="command-dialog-title">{title}</h2>
        <p id="command-dialog-description">{description}</p>
        {kind === 'op' && issues.length > 0 && <section className="command-dialog__issues" data-tone={hasReadErrors ? 'error' : 'warning'} aria-label="Serviços não processados">
          <strong>{issueCount} {issueCount === 1 ? 'serviço não será processado' : 'serviços não serão processados'}</strong>
          <div className="command-dialog__issue-list">{issues.map(({ label, count, tone }) => <span key={label} data-tone={tone ?? 'warning'}>{count} {label}</span>)}</div>
          {hasReadErrors && <p>Confira os serviços com erro de leitura antes de tentar novamente.</p>}
          {items.length > 0 && <details><summary>Ver serviços afetados</summary><ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></details>}
        </section>}
        {kind === 'delete' && items.length > 0 && <div className="command-dialog__records"><span>Registros selecionados</span><ul>{items.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>{items.length > 5 && <small>e mais {items.length - 5}</small>}</div>}
        {kind === 'delete' && <p className="command-dialog__warning">{mock ? 'Esta ação exclui somente os registros locais desta sessão.' : 'Esta ação exclui os registros no Dataverse.'} Confira a seleção antes de continuar.</p>}
        <div className="command-dialog__actions"><button ref={cancelRef} type="button" className="command-dialog__cancel" onClick={onCancel}>{kind === 'op' && eligibleCount === 0 ? 'Fechar' : 'Cancelar'}</button>{(kind !== 'op' || eligibleCount > 0) && <button type="button" className="command-dialog__confirm" onClick={onConfirm}>{confirmLabel}</button>}</div>
      </div>
    </div>
  )
}
