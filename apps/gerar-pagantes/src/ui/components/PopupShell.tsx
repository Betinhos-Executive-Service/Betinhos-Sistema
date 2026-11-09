import type { ReactNode } from 'react'

export function PopupShell({ children, onBackdropClick }: { children: ReactNode; onBackdropClick?: () => void }) {
  return <div className="popup-stage" onMouseDown={(event) => { if (event.target === event.currentTarget) onBackdropClick?.() }}><main className="popup-shell">{children}</main></div>
}
