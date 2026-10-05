import { useRef, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Select, StatusBadge, Switch } from '@betinhos/ui'
import type { Motorista } from '../domain/types'
import { addDays, dayLabel } from '../domain/time'

type Props = {
  dayKey: string; today: string; onChangeDay: (key: string) => void
  freshness: string; freshnessWarning: boolean; refreshing: boolean; onRefresh: () => void; total: number
  motoristas: Motorista[]; motoristaId: string | null; onMotorista: (id: string | null) => void
  showConcluded: boolean; onShowConcluded: (value: boolean) => void; mock: boolean
}

/** Cabeçalho fixo: dia (setas e swipe), frescor sempre visível e filtros. Troca de dia sem animação: é ação repetitiva. */
export function DayHeader(props: Props) {
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const { dayKey, onChangeDay } = props
  const go = (days: number) => onChangeDay(addDays(dayKey, days))

  const onDown = (e: PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } }
  const onUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const dx = e.clientX - start.x, dy = Math.abs(e.clientY - start.y)
    if (Math.abs(dx) > 60 && dy < 40) go(dx < 0 ? 1 : -1)
  }

  return (
    <header className="op-day" onPointerDown={onDown} onPointerUp={onUp}>
      <div className="op-day__row">
        <button type="button" className="op-icon" aria-label="Dia anterior" onClick={() => go(-1)}><ChevronLeft size={20} /></button>
        <h2 className="op-day__label">{dayLabel(dayKey, props.today)}</h2>
        <button type="button" className="op-icon" aria-label="Próximo dia" onClick={() => go(1)}><ChevronRight size={20} /></button>
        <button type="button" className="op-icon op-day__refresh" aria-label="Atualizar agora" aria-busy={props.refreshing} onClick={props.onRefresh} data-spinning={props.refreshing || undefined}><RefreshCw size={18} /></button>
      </div>
      <p className="op-day__fresh" role="status" aria-live="polite" data-warning={props.freshnessWarning || undefined}>
        {props.freshness} · {props.total} {props.total === 1 ? 'serviço' : 'serviços'}
        {props.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </p>
      <div className="op-day__filters">
        <Select
          aria-label="Filtrar por motorista" placeholder="Todos os motoristas" searchable clearable size="compact"
          options={props.motoristas.map((m) => ({ value: m.id, label: m.nome, subtitle: m.apelido || undefined, search: m.apelido }))}
          value={props.motoristaId} onChange={props.onMotorista}
        />
        <Switch checked={props.showConcluded} onChange={(event) => props.onShowConcluded(event.currentTarget.checked)} label="Mostrar concluídos" />
      </div>
    </header>
  )
}
