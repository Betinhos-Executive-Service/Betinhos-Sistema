import type { CSSProperties } from 'react'
import { StatusBadge } from '@betinhos/ui'
import { choiceColor, statusTone, tipoVariant } from '../domain/cells'
import type { AttributeInfo, Column } from '../domain/types'

type Props = { column: Column; info: AttributeInfo | undefined; raw: number; text: string }

/** Etiqueta de status e tipo: usa a cor cadastrada na choice (fundo suave, texto escurecido para contraste) e, sem ela, as cores padrão da tela. */
export function ChoiceBadge({ column, info, raw, text }: Props) {
  const color = choiceColor(info, raw)
  if (color) return <span className="gr-choice" style={{ '--gr-choice': color } as CSSProperties} title={text}>{text}</span>
  if (column.attribute === 'cr40f_tipodeveiculo') return <span className={`gr-tipo gr-tipo--${tipoVariant(text)}`} title={text}>{text}</span>
  return <StatusBadge tone={statusTone(column.attribute, raw)}>{text}</StatusBadge>
}
