import { useLayoutEffect, useRef } from 'react'
import { Button, Menu } from '@betinhos/ui'
import { EllipsisVertical } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import { choiceLabel, type Stage } from '../domain/funnel'
import { daysAgo } from '../domain/text'
import { settleDelta } from '../domain/drag'
import { playSettle, type BoardDrag } from '../useBoardDrag'

type Props = {
  c: Curriculo
  stage: Stage
  stages: Stage[]
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  /** null no celular: sem arrasto, só o menu. */
  drag: BoardDrag | null
}

export function CurriculoCard({ c, stage, stages, choices, now, onOpen, onMove, drag }: Props) {
  const ref = useRef<HTMLElement>(null)

  // Card recém-solto em outra coluna: assenta da posição do soltar até a nova (FLIP).
  useLayoutEffect(() => {
    const settle = drag?.pendingSettle.current
    const el = ref.current
    if (!drag || !settle || settle.id !== c.id || !el) return
    drag.pendingSettle.current = null
    const delta = settleDelta(settle, el.getBoundingClientRect())
    playSettle(el, delta.x, delta.y)
  }, [drag, c.id, stage.value])

  const place = [c.cidade, c.estado].filter(Boolean).join('/')
  const cnh = choiceLabel(choices.cnh, c.cnh)
  return (
    <article ref={ref} className="cv-card" {...(drag ? drag.bind(c.id, stage.value) : {})}>
      <button type="button" className="cv-card__open" onClick={() => onOpen(c.id)}>
        <span className="cv-card__name">{c.nome || 'Sem nome'}</span>
        <span className="cv-card__role">{c.cargo || 'Cargo não informado'}</span>
        <span className="cv-card__meta">
          {place ? <span>{place}</span> : null}
          {cnh ? <span>CNH {cnh}</span> : null}
          {c.nota != null ? <span>Nota {c.nota}</span> : null}
        </span>
        {c.indicadoPor ? <span className="cv-card__meta">Indicado por {c.indicadoPor}</span> : null}
        <span className="cv-card__age">{daysAgo(c.criadoEm, now)}</span>
      </button>
      <div className="cv-card__menu" data-no-drag>
        <Menu
          trigger={(props) => <Button variant="ghost" size="compact" icon={<EllipsisVertical size={16} />} aria-label={`Mover ${c.nome} para outra etapa`} {...props} />}
          actions={stages.filter((s) => s.value !== stage.value).map((s) => ({ id: String(s.value), label: `Mover para ${s.short}`, onSelect: () => onMove(c, s) }))}
        />
      </div>
    </article>
  )
}
