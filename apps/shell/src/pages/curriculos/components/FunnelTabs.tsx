import { Tabs } from '@betinhos/ui'
import type { ChoiceSet, Curriculo } from '../domain/types'
import type { Stage } from '../domain/funnel'
import { CurriculoCard } from './CurriculoCard'

type Props = {
  stages: Stage[]
  groups: Map<number, Curriculo[]>
  choices: ChoiceSet
  now: Date
  onOpen: (id: string) => void
  onMove: (c: Curriculo, stage: Stage) => void
  active: number | null
  onActive: (value: number) => void
}

/** Celular: uma aba por etapa com contador; mover é só pelo menu. */
export function FunnelTabs({ stages, groups, choices, now, onOpen, onMove, active, onActive }: Props) {
  const current = stages.find((s) => s.value === active) ?? stages[0]
  const items = groups.get(current.value) ?? []
  return (
    <Tabs
      aria-label="Etapas do funil"
      value={String(current.value)}
      onChange={(value) => onActive(Number(value))}
      tabs={stages.map((s) => ({ value: String(s.value), label: s.short, badge: (groups.get(s.value) ?? []).length }))}
    >
      <div className="cv-col__list">
        {items.length
          ? items.map((c) => <CurriculoCard key={c.id} c={c} stage={current} stages={stages} choices={choices} now={now} onOpen={onOpen} onMove={onMove} drag={null} />)
          : <p className="cv-col__empty">Nenhum candidato nesta etapa</p>}
      </div>
    </Tabs>
  )
}
