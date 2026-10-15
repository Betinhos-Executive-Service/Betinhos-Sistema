import type { ReactNode } from 'react'
import { Alert, Button, Select, Skeleton, StatusBadge as Badge } from '@betinhos/ui'
import { label, STATUS_OPTIONS, TONE } from '../data/schema'
import type { LoadResult } from '../data/source'
import type { Kind, TableKey } from '../data/types'

export function StatusBadge({ kind, value }: { kind: Kind; value: number | null }) {
  const tone = value === null ? 'neutral' : TONE[kind][value] ?? 'neutral'
  return <Badge tone={tone}>{label(STATUS_OPTIONS[kind], value, 'Sem status')}</Badge>
}

/** Linhas no formato da lista enquanto as tabelas chegam. */
export function Carregando() {
  return (
    <div className="frota-skeleton" role="status" aria-busy="true">
      {[0, 1, 2, 3, 4].map((index) => <Skeleton key={index} shape="rect" height={44} />)}
      <span className="frota-sr-only">Carregando a frota…</span>
    </div>
  )
}

const TABLE_LABEL: Record<TableKey, string> = { veiculos: 'Veículos', manutencoes: 'Manutenções', multas: 'Multas', infracoes: 'Infrações', colisoes: 'Colisões', posses: 'Posses', planoPreventivo: 'Plano preventivo', baselines: 'Baselines de preventiva', despesasCombustivel: 'Despesas de combustível', telemetriaKm: 'Telemetria Infleet' }

/** Mostra o erro de carga só quando uma das tabelas que a visão usa falhou. */
export function ViewGate({ errors, tables, onRetry, children }: { errors: LoadResult['errors']; tables: TableKey[]; onRetry: () => void; children: ReactNode }) {
  const failed = tables.filter((table) => errors[table])
  if (!failed.length) return <>{children}</>
  return (
    <Alert tone="danger" title="Não foi possível carregar esta visão" action={<Button variant="secondary" size="compact" onClick={onRetry}>Tentar de novo</Button>}>
      {failed.map((table) => <p key={table}>{TABLE_LABEL[table]}: {errors[table]}</p>)}
    </Alert>
  )
}

/** Filtro de lista: vazio = todos. Busca no painel só quando a lista é longa. */
export function SelectFilter({ label: ariaLabel, allLabel, options, value, onChange }: { label: string; allLabel: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select
      className="frota-filter"
      size="compact"
      aria-label={ariaLabel}
      placeholder={allLabel}
      options={options}
      searchable={options.length > 8}
      value={value || null}
      onChange={(next) => onChange(next ?? '')}
    />
  )
}

export function Bars({ items, format }: { items: { label: string; value: number; hint?: string; text?: string }[]; format: (value: number) => string }) {
  const max = Math.max(...items.map((item) => item.value), 0)
  if (!items.length) return <p className="frota-muted">Sem dados no período.</p>
  return (
    <ul className="frota-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="frota-bars__label" title={item.label}>{item.label}</span>
          <span className="frota-bars__track" aria-hidden><span className="frota-bars__fill" style={{ width: max ? `${(item.value / max) * 100}%` : '0%' }} /></span>
          <span className="frota-nowrap"><strong>{item.text ?? format(item.value)}</strong>{item.hint ? <span className="frota-muted"> · {item.hint}</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}
