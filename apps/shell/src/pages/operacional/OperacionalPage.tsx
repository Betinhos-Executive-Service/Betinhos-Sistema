import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Sheet, Surface, ToastProvider, useToast } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import { CalendarX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { createSource } from './data/source'
import type { Motorista, Reserva } from './domain/types'
import { buildAttention, type AttentionItem } from './domain/alerts'
import { groupByHour } from './domain/bands'
import { freshnessLabel } from './domain/refresh'
import { isCancelled, normalizeStatus, serviceState } from './domain/serviceState'
import { addDays, dateKey, formatHour } from './domain/time'
import { telHref } from './domain/phone'
import { useOperacional } from './useOperacional'
import { useMedia } from './useMedia'
import { DayHeader } from './components/DayHeader'
import { AttentionList } from './components/AttentionList'
import { Agenda, AgendaSkeleton } from './components/Agenda'
import { LandscapeTable } from './components/LandscapeTable'
import { ServiceActions, ServiceDetail } from './components/ServiceDetail'
import './operacional.css'

export function OperacionalPage({ host }: { host: Host }) {
  return <ToastProvider><Operacional host={host} /></ToastProvider>
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(t) }, [])
  return now
}

function Operacional({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const now = useNow()
  const today = dateKey(now)
  const [dayKey, setDayKey] = useState(today)
  const [motoristaId, setMotoristaId] = useState<string | null>(null)
  const [showConcluded, setShowConcluded] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusOptions, setStatusOptions] = useState<ChoiceOption[]>([])
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ reservaId: string; codigo: string; kind: 'cancel' | 'motorista' | 'programar'; run: () => void } | null>(null)
  const [manualRefresh, setManualRefresh] = useState(false)
  const wide = useMedia('(min-width: 860px)')
  const landscape = useMedia('(orientation: landscape) and (max-height: 560px)')
  const op = useOperacional(source, dayKey)

  const changeDay = useCallback((key: string) => { setDayKey(key); setSelectedId(null) }, [])

  useEffect(() => {
    let cancelled = false
    source.statusOptions().then((o) => { if (!cancelled) setStatusOptions(o) }).catch(() => {
      if (cancelled) return
      setStatusOptions([])
      toast({ tone: 'warning', message: 'Não foi possível carregar as opções de status.' })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

  // O ícone só gira quando a pessoa clicou em Atualizar; polling e pós-mutação só mudam o rótulo de frescor.
  useEffect(() => { if (!op.refreshing) setManualRefresh(false) }, [op.refreshing])

  // Setas do teclado trocam o dia quando nada está aberto e o foco não está num campo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (confirm || (selectedId && !wide)) return
      if ((event.target as HTMLElement).closest('input, textarea, select, [role="listbox"], [role="combobox"], [role="dialog"], [role="switch"], [contenteditable]')) return
      if (event.key === 'ArrowLeft') changeDay(addDays(dayKey, -1))
      if (event.key === 'ArrowRight') changeDay(addDays(dayKey, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, wide, confirm, dayKey, changeDay])

  const visible = useMemo(() => (motoristaId ? op.reservas.filter((r) => r.motoristaId === motoristaId) : op.reservas), [op.reservas, motoristaId])
  const attention = useMemo(() => buildAttention(visible, now), [visible, now])
  const { groups, concluded } = useMemo(() => groupByHour(visible, now), [visible, now])
  const byId = useMemo(() => new Map(op.reservas.map((r) => [r.id, r])), [op.reservas])
  const motoristas = op.data?.motoristas ?? []
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  // Desktop: painel sempre preenchido com o primeiro serviço, como no legado.
  const firstPending = useMemo(() => visible.find((r) => serviceState(r, now).kind !== 'concluded') ?? null, [visible, now])
  const detailed = selected ?? (wide && !landscape ? firstPending : null)
  const lastSelected = useRef<Reserva | null>(null)
  if (selected) lastSelected.current = selected
  const sheetReserva = selected ?? lastSelected.current
  const errorText = (prefix: string, reason: unknown) => [prefix, reason instanceof Error ? reason.message : '', 'Tente de novo.'].filter(Boolean).join(' ')

  async function changeStatus(target: { reservaId: string; codigo: string }, option: ChoiceOption, confirmed = false) {
    if (!confirmed) {
      const kind = isCancelled(option.label) ? 'cancel' : /programad/.test(normalizeStatus(option.label)) ? 'programar' : null
      if (kind) { setConfirm({ ...target, kind, run: () => void changeStatus(target, option, true) }); return }
    }
    setBusy(true)
    try {
      await op.mutate(target.reservaId, { statusValue: option.value, status: option.label }, () => source.setStatus(target.reservaId, option.value))
      toast({ tone: 'success', message: `Status alterado para ${option.label}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: errorText('Não foi possível alterar o status.', reason) })
    } finally { setBusy(false) }
  }

  async function changeMotorista(target: { reservaId: string; codigo: string }, motorista: Motorista | null, confirmed = false) {
    const current = byId.get(target.reservaId)
    if (!confirmed && current && /programad/.test(normalizeStatus(current.status))) {
      setConfirm({ ...target, kind: 'motorista', run: () => void changeMotorista(target, motorista, true) })
      return
    }
    setBusy(true)
    try {
      await op.mutate(target.reservaId, { motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '' }, () => source.setMotorista(target.reservaId, motorista?.id ?? null))
      toast({ tone: 'success', message: motorista ? `${motorista.nome} atribuído ao serviço #${target.codigo}.` : `Motorista removido do serviço #${target.codigo}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: errorText('Não foi possível trocar o motorista.', reason) })
    } finally { setBusy(false) }
  }

  function onAttentionAction(item: AttentionItem) {
    const r = byId.get(item.reservaId)
    const phone = r && motoristas.find((m) => m.id === r.motoristaId)?.celular
    if (item.action === 'ligar' && phone && telHref(phone)) { window.location.href = telHref(phone)!; return }
    setSelectedId(item.reservaId) // atribuir e ver abrem o detalhe, onde ficam o seletor e o contexto
  }

  const code = confirm?.codigo ?? ''
  const confirmTexts = confirm?.kind === 'motorista'
    ? { title: `Trocar o motorista do serviço #${code}?`, body: 'O motorista anterior e o novo recebem aviso por push e e-mail, e o veículo pode ser reatribuído automaticamente.', keep: 'Manter motorista', go: 'Trocar motorista' }
    : confirm?.kind === 'programar'
      ? { title: `Programar o serviço #${code}?`, body: 'O motorista recebe aviso por push e e-mail.', keep: 'Voltar', go: 'Programar serviço' }
      : { title: `Cancelar o serviço #${code}?`, body: 'O motorista e o cliente podem já estar contando com este serviço.', keep: 'Manter serviço', go: 'Cancelar serviço' }

  const freshness = op.refreshFailed && op.lastUpdated
    ? `Não foi possível atualizar · última atualização ${formatHour(op.lastUpdated)}`
    : freshnessLabel(op.lastUpdated, now)

  const renderDetail = (r: Reserva) => (
    <ServiceDetail reserva={r} filhos={op.data?.passageiros[r.id] ?? []} motoristas={motoristas} reservas={op.reservas} now={now}
      statusOptions={statusOptions} busy={busy} onStatus={(o) => void changeStatus({ reservaId: r.id, codigo: r.codigo }, o)}
      onMotorista={(m) => void changeMotorista({ reservaId: r.id, codigo: r.codigo }, m)} onOpenReserva={() => source.openReserva(r.id)} />
  )
  const panel = detailed ? renderDetail(detailed) : <EmptyState compact align="start" title="Selecione um serviço para ver os detalhes" />

  let body
  if (op.loading && !op.data) body = <AgendaSkeleton />
  else if (op.error) body = <Alert tone="danger" title="Não foi possível carregar os serviços" action={<Button variant="secondary" onClick={() => void op.refresh()}>Tentar de novo</Button>}>{op.error}</Alert>
  else if (!op.reservas.length) body = <EmptyState align="start" icon={<CalendarX size={36} />} title="Nenhum serviço para este dia" action={dayKey !== today ? <Button onClick={() => changeDay(today)}>Ir para hoje</Button> : undefined}>Use as setas para ver outro dia.</EmptyState>
  else if (!visible.length) body = <EmptyState align="start" title="Nenhum serviço deste motorista neste dia" action={<Button variant="secondary" onClick={() => setMotoristaId(null)}>Limpar filtro</Button>} />
  else if (landscape) body = <LandscapeTable reservas={visible} now={now} passageiros={op.data?.passageiros ?? {}} onSelect={setSelectedId} />
  else body = (
    <>
      <AttentionList items={attention} byId={byId} onOpen={setSelectedId} onAction={onAttentionAction} />
      <Agenda groups={groups} concluded={concluded} showConcluded={showConcluded} now={now} selectedId={detailed?.id ?? null} changed={op.changed} onSelect={setSelectedId} />
    </>
  )

  return (
    <PageLayout eyebrow="Operacional" title="Resumo Operacional">
      <div className="op">
        <DayHeader dayKey={dayKey} today={today} onChangeDay={changeDay}
          freshness={freshness} freshnessWarning={op.refreshFailed} refreshing={manualRefresh && op.refreshing}
          onRefresh={() => { setManualRefresh(true); void op.refresh() }} total={visible.length}
          motoristas={motoristas} motoristaId={motoristaId} onMotorista={setMotoristaId} showConcluded={showConcluded} onShowConcluded={setShowConcluded} mock={source.mock} />
        {op.data?.warnings.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
        {op.data?.queryMode === 'safe' ? <Alert tone="info">Alguns campos não estão disponíveis; mostrando a versão reduzida.</Alert> : null}
        <div className="op-split">
          <div>{body}</div>
          {wide && !landscape && op.reservas.length ? <Surface className="op-split__detail">{panel}</Surface> : null}
        </div>
      </div>

      {!wide || landscape ? (
        <Sheet open={Boolean(selected)} onClose={() => setSelectedId(null)} eyebrow={sheetReserva ? `Serviço #${sheetReserva.codigo}` : undefined}
          title={sheetReserva ? (sheetReserva.motorista || 'Sem motorista') : ''} footer={sheetReserva ? <ServiceActions motorista={motoristas.find((m) => m.id === sheetReserva.motoristaId)} /> : undefined}>
          {sheetReserva ? renderDetail(sheetReserva) : null}
        </Sheet>
      ) : null}

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} tone={confirm?.kind === 'cancel' ? 'danger' : undefined} title={confirmTexts.title}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>{confirmTexts.keep}</Button>
          <Button variant={confirm?.kind === 'cancel' ? 'danger' : 'primary'} onClick={() => { const pending = confirm!; setConfirm(null); pending.run() }}>{confirmTexts.go}</Button>
        </>}>
        {confirmTexts.body}
      </Dialog>
    </PageLayout>
  )
}
