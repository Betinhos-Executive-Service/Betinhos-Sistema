import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react'

/**
 * Esc num <dialog> ou menu aninhado fecha só ele. O `cancel` e o keydown sintéticos do React sobem
 * pela árvore de componentes (não a do DOM) até o Drawer ou a ficha de trás, que fechariam junto.
 * `onCancel` não está nos tipos de <div>, mas o React o repassa; espalhado para o TS aceitar.
 */
const handlers = {
  onCancel: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Escape' && (event.target as HTMLElement).closest('dialog, [role=menu]')) event.stopPropagation() },
}

export function ContemEsc({ children }: { children: ReactNode }) {
  return <div style={{ display: 'contents' }} {...handlers}>{children}</div>
}
