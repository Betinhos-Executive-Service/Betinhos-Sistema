import type { ReactNode } from 'react'

/** Par rótulo/valor da ficha; vazio vira travessão. */
export function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pg-ficha__item"><dt>{label}</dt><dd>{children || '—'}</dd></div>
}
