import { cleanId, type Row } from '@betinhos/dataverse'
import { Alert, Button, Checkbox, Drawer, EmptyState, Sheet, StatusBadge } from '@betinhos/ui'
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Source } from '../data/source'
import type { KV } from '../domain/columns'
import { contar, type Motorista } from '../domain/commands'
import { TZ } from '../domain/format'

export const EXCLUIDOS_KEY = 'betinhos.geral.contagem.excluidos.v1'
const REFRESH_MS = 60_000

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const avg = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const todayIso = () => dayFmt.format(new Date())
export const shiftDay = (day: string, delta: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + delta * 86_400_000).toISOString().slice(0, 10)
export const formatDay = (day: string) => day.split('-').reverse().join('/')

function loadExcluidos(kv: KV): string[] {
  try {
    const parsed: unknown = JSON.parse(kv.getItem(EXCLUIDOS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch { return [] }
}

type Data = { reservas: Row[]; motoristas: Motorista[] }

function useContagem(source: Pick<Source, 'contagem'>, day: string, active: boolean) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const seq = useRef(0)
  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    try {
      const next = await source.contagem(day)
      if (mine !== seq.current) return
      setData(next); setError(null); setUpdatedAt(new Date())
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [source, day])
  useEffect(() => {
    if (!active) return
    setData(null)
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, REFRESH_MS)
    return () => { window.clearInterval(timer); seq.current++ }
  }, [active, load])
  return { data, error, loading, updatedAt, reload: load }
}

export type ContagemDrawerProps = { open: boolean; onClose: () => void; source: Pick<Source, 'contagem'>; initialDay: string; kv: KV; mobile: boolean }

/** Serviços do dia por motorista (equivalente à aba lateral legada): total, média e trajetos. */
export function ContagemDrawer({ open, onClose, source, initialDay, kv, mobile }: ContagemDrawerProps) {
  const [day, setDay] = useState(initialDay)
  const [excluidos, setExcluidos] = useState(() => loadExcluidos(kv))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => { if (open) setDay(initialDay) }, [open, initialDay])
  const { data, error, loading, updatedAt, reload } = useContagem(source, day, open)

  const result = useMemo(() => (data ? contar(data.reservas, data.motoristas, new Set(excluidos)) : null), [data, excluidos])
  const rotas = useMemo(() => {
    const map = new Map<string, { hora: string; trajeto: string; at: string }[]>()
    for (const r of data?.reservas ?? []) {
      const id = r._cr40f_motorista_value ? cleanId(String(r._cr40f_motorista_value)) : ''
      if (!id) continue
      const at = String(r.cr40f_dataehorriodesada ?? '')
      const d = new Date(at)
      const list = map.get(id) ?? []
      list.push({ at, hora: Number.isNaN(d.getTime()) ? '--:--' : timeFmt.format(d), trajeto: String(r.cr40f_trajeto || 'Sem trajeto') })
      map.set(id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at))
    return map
  }, [data])

  function toggleExcluido(id: string) {
    const key = cleanId(id)
    const next = excluidos.map(cleanId).includes(key) ? excluidos.filter((x) => cleanId(x) !== key) : [...excluidos, key]
    setExcluidos(next)
    try { kv.setItem(EXCLUIDOS_KEY, JSON.stringify(next)) } catch { /* sem armazenamento: vale só nesta sessão */ }
  }
  function toggleExpand(id: string) {
    setExpanded((cur) => { const next = new Set(cur); if (!next.delete(id)) next.add(id); return next })
  }

  const title = 'Serviços por motorista'
  const eyebrow = formatDay(day)
  const isToday = day === todayIso()
  const skip = new Set(excluidos.map(cleanId))
  const size = mobile ? 'touch' : 'compact'

  const body = (
    <div className="gr-ct">
      <div className="gr-ct__nav">
        <Button variant="secondary" size={size} icon={<ChevronLeft size={16} />} aria-label="Dia anterior" onClick={() => setDay(shiftDay(day, -1))} />
        <Button variant="secondary" size={size} disabled={isToday} onClick={() => setDay(todayIso())}>Hoje</Button>
        <Button variant="secondary" size={size} icon={<ChevronRight size={16} />} aria-label="Próximo dia" onClick={() => setDay(shiftDay(day, 1))} />
        <span className="gr-ct__updated">{updatedAt ? `Atualizado às ${timeFmt.format(updatedAt)}` : 'Carregando…'}</span>
        <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} loading={loading} onClick={() => { void reload() }}>Atualizar</Button>
      </div>
      {error ? (
        <Alert tone="danger">
          <span>{error}</span>{' '}
          <Button variant="secondary" size="compact" onClick={() => { void reload() }}>Tentar de novo</Button>
        </Alert>
      ) : null}
      {!result && !error ? <p className="gr-ct__loading">Carregando serviços…</p> : null}
      {result && result.linhas.length === 0 ? <EmptyState title="Nenhum motorista ativo" /> : null}
      {result && result.linhas.length > 0 ? (
        <ul className="gr-ct__list">
          {result.linhas.map(({ motorista, total, tone, label }) => {
            const id = cleanId(motorista.id)
            const isOpen = expanded.has(id)
            const list = rotas.get(id) ?? []
            return (
              <li key={id} className="gr-ct__item">
                <div className="gr-ct__row">
                  <button type="button" className="gr-ct__toggle" aria-expanded={isOpen} aria-controls={`gr-ct-${id}`} disabled={total === 0} onClick={() => toggleExpand(id)}>
                    <ChevronDown size={16} className="gr-ct__chev" aria-hidden="true" />
                    <span className="gr-ct__name">{motorista.nome}</span>
                  </button>
                  <StatusBadge tone={tone}>{label ? `${total} · ${label}` : String(total)}</StatusBadge>
                </div>
                {isOpen ? (
                  <ul className="gr-ct__routes" id={`gr-ct-${id}`}>
                    {list.map((r, i) => <li key={i}><b>{r.hora}</b> · {r.trajeto}</li>)}
                  </ul>
                ) : null}
                <Checkbox label="Excluir da média" checked={skip.has(id)} onChange={() => toggleExcluido(id)} />
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
  const footer = result ? (
    <div className="gr-ct__foot">
      <strong>Total — {formatDay(day)}: {result.total}</strong>
      <span>Média: {avg.format(result.media)}</span>
    </div>
  ) : undefined

  return mobile
    ? <Sheet open={open} onClose={onClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Sheet>
    : <Drawer open={open} onClose={onClose} title={title} eyebrow={eyebrow} footer={footer}>{body}</Drawer>
}
