import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AuditButton, AuditPanel, type AuditEvent, type AuditStatus } from '@betinhos/ui'
import type { Host } from '../../host'
import { createAuditSource, createMockAuditSource, isForbidden, MAX_IDS, type AuditTarget } from './source'

export type { AuditTarget } from './source'

type State = {
  target: AuditTarget | null
  status: AuditStatus
  events: AuditEvent[]
  next: string | null
  loadingMore: boolean
  error?: string
  tableLabel?: string
}

const CLOSED: State = { target: null, status: 'loading', events: [], next: null, loadingMore: false }

const AuditoriaContext = createContext<(target: AuditTarget) => void>(() => {})

/** Abre o painel de auditoria (DS §10.9.4) da tabela, da seleção ou de um registro. */
export const useAuditoria = () => useContext(AuditoriaContext)

/** Botão do cabeçalho do drawer do registro (§10.9.4); sem id (criação, carregando) não aparece. */
export function BotaoAuditoria({ entity, ids, name }: { entity: string; ids: (string | null | undefined)[]; name?: string }) {
  const abrir = useAuditoria()
  const valid = ids.filter((id): id is string => Boolean(id))
  return valid.length ? <AuditButton iconOnly onClick={() => abrir({ entity, ids: valid, name })} /> : null
}

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Tente de novo em instantes.')

/** Um único painel de auditoria para o shell; as telas só chamam `useAuditoria()(alvo)`. */
export function AuditoriaProvider({ host, children }: { host: Host; children: ReactNode }) {
  const source = useMemo(() => (host.mode === 'dataverse' ? createAuditSource(host) : createMockAuditSource()), [host])
  const [state, setState] = useState<State>(CLOSED)
  // Cada abertura ganha um número: resposta de uma abertura anterior não pisa na atual.
  const run = useRef(0)

  const load = useCallback(async (target: AuditTarget, next: string | null) => {
    const id = run.current
    try {
      const page = await source.load(target, next)
      if (id !== run.current) return
      // Mostra os eventos já; os nomes dos lookups chegam depois e trocam só esses eventos.
      void page.withNames?.().then((named) => {
        if (!named || id !== run.current) return
        const byId = new Map(named.map((event) => [event.id, event]))
        setState((s) => ({ ...s, events: s.events.map((event) => byId.get(event.id) ?? event) }))
      }, () => undefined)
      setState((s) => {
        const events = next ? [...s.events, ...page.events] : page.events
        const status: AuditStatus = !events.length && !page.auditEnabled ? 'disabled' : 'ready'
        return { ...s, status, events, next: page.next, loadingMore: false, tableLabel: page.tableLabel, error: undefined }
      })
    } catch (error) {
      if (id !== run.current) return
      setState((s) => next
        ? { ...s, loadingMore: false, error: messageOf(error) }
        : { ...s, status: isForbidden(error) ? 'forbidden' : 'error', error: messageOf(error) })
    }
  }, [source])

  const open = useCallback((target: AuditTarget) => {
    run.current += 1
    setState({ ...CLOSED, target })
    void load(target, null)
  }, [load])

  const close = useCallback(() => { run.current += 1; setState(CLOSED) }, [])

  const { target } = state
  const ids = target?.ids ?? []
  const scope = ids.length === 1 ? target?.name || '1 registro' : ids.length > 1 ? `${Math.min(ids.length, MAX_IDS)} registros` : 'Alterações recentes'
  const eyebrow = [state.tableLabel, scope].filter(Boolean).join(' · ')
  const openRecord = target?.onOpenRecord

  return (
    <AuditoriaContext.Provider value={open}>
      {children}
      <AuditPanel
        open={target != null}
        onClose={close}
        eyebrow={eyebrow}
        status={state.status}
        events={state.events}
        error={state.error}
        onRetry={target ? () => open(target) : undefined}
        hasMore={state.next != null}
        loadingMore={state.loadingMore}
        onLoadMore={target && state.next ? () => { setState((s) => ({ ...s, loadingMore: true })); void load(target, state.next) } : undefined}
        showRecord={ids.length !== 1}
        onOpenRecord={openRecord ? (record) => { close(); openRecord(record.id) } : undefined}
      />
    </AuditoriaContext.Provider>
  )
}
