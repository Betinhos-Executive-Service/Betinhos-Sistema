import { Button, Skeleton, StatusBadge } from '@betinhos/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { Stage } from '../domain/funnel'
import type { BoardDrag } from '../useBoardDrag'
import { CurriculoCard } from './CurriculoCard'

type Props = {
  stages: Stage[]
  groups: Map<number, Curriculo[]>
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  drag: BoardDrag
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Desktop: uma coluna por etapa; Reprovado pode ficar recolhida e continua aceitando o soltar. */
export function FunnelBoard({ stages, groups, choices, now, onOpen, onMove, drag, collapsed, onToggleCollapsed }: Props) {
  const isCollapsed = (stage: Stage) => stage.key === 'reprovado' && collapsed
  return (
    <div className="cv-board" style={{ gridTemplateColumns: stages.map((s) => (isCollapsed(s) ? 'var(--bt-control-height-prominent)' : 'minmax(0, 1fr)')).join(' ') }}>
      {stages.map((stage) => {
        const items = groups.get(stage.value) ?? []
        const titleId = `cv-col-${stage.value}`
        if (isCollapsed(stage)) {
          return (
            <section key={stage.value} className="cv-col cv-col--collapsed" data-stage={stage.value} aria-labelledby={titleId}>
              <button type="button" className="cv-col__expand" id={titleId} aria-expanded={false} aria-label={`Expandir ${stage.short}, ${items.length}`} onClick={onToggleCollapsed}>
                <ChevronLeft size={16} aria-hidden="true" />
                <span className="cv-col__vertical">{stage.short}</span>
                <span className="cv-col__count">{items.length}</span>
              </button>
            </section>
          )
        }
        return (
          <section key={stage.value} className="cv-col" data-stage={stage.value} aria-labelledby={titleId}>
            <header className="cv-col__head">
              <h2 className="cv-col__title" id={titleId} aria-label={`${stage.short}, ${items.length}`}>
                <StatusBadge tone={stage.tone}>{stage.short}</StatusBadge>
                <span className="cv-col__count">{items.length}</span>
              </h2>
              {stage.key === 'reprovado' ? <Button variant="ghost" size="compact" icon={<ChevronRight size={16} />} aria-label={`Recolher ${stage.short}`} aria-expanded onClick={onToggleCollapsed} /> : null}
            </header>
            <div className="cv-col__list">
              {items.length
                ? items.map((c) => <CurriculoCard key={c.id} c={c} stage={stage} stages={stages} choices={choices} now={now} onOpen={onOpen} onMove={onMove} drag={drag} />)
                : <p className="cv-col__empty">Nenhum candidato nesta etapa</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function BoardSkeleton() {
  return (
    <div className="cv-board cv-board--skeleton" aria-busy="true" aria-label="Carregando currículos">
      {Array.from({ length: 4 }, (_, column) => (
        <div key={column} className="cv-col">
          <Skeleton width="60%" height={24} />
          {Array.from({ length: 3 }, (_, row) => <Skeleton key={row} shape="rect" height={96} />)}
        </div>
      ))}
    </div>
  )
}
