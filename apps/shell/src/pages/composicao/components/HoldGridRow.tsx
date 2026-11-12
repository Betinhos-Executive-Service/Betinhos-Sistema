import { useEffect } from 'react'
import { useGridRowState } from './grid-row-state'

/** Para células que não usam a EditableViewFieldCell (a monetária): com `active`, a grade mantém a linha montada fora da janela. */
export function HoldGridRow({ active }: { active: boolean }) {
  const row = useGridRowState()
  useEffect(() => {
    if (!active || !row) return
    row.setEditing(true)
    return () => row.setEditing(false)
  }, [active, row])
  return null
}
