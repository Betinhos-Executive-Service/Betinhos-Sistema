import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Sheet, Surface, ToastProvider, useToast } from '@betinhos/ui'
import type { ChoiceOption } from '@betinhos/dataverse'
import { CalendarX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { createSource } from './data/source'
import type { Motorista } from './domain/types'
import { buildAttention, type AttentionItem } from './domain/alerts'
import { groupByHour } from './domain/bands'
import { freshnessLabel } from './domain/refresh'
import { isCancelled } from './domain/serviceState'
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
  const [confirmCancel, setConfirmCancel] = useState<ChoiceOption | null>(null)
  const [manualRefresh, setManualRefresh] = useState(false)
  const wide = useMedia('(min-width: 860px)')
  const landscape = useMedia('(orientation: landscape) and (max-height: 560px)')
  const op = useOperacional(source, dayKey)

  useEffect(() => { source.statusOptions().then(setStatusOptions).catch(() => setStatusOptions([])) }, [source])

  // O ícone só gira quando a pessoa clicou em Atualizar; polling e pós-mutação só mudam o rótulo de frescor.
  useEffect(() => { if (!op.refreshing) setManualRefresh(false) }, [op.refreshing])

  // Setas do teclado trocam o dia quando nada está aberto e o foco não está num campo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (selectedId && !wide) return
      if ((event.target as HTMLElement).closest('input, textarea, select, [role="listbox"], [contenteditable]')) return
      if (event.key === 'ArrowLeft') setDayKey((k) => addDays(k, -1))
      if (event.key === 'ArrowRight') setDayKey((k) => addDays(k, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, wide])

  const visible = useMemo(() => (motoristaId ? op.reservas.filter((r) => r.motoristaId === motoristaId) : op.reservas), [op.reservas, motoristaId])
  const attention = useMemo(() => buildAttention(visible, now), [visible, now])
  const { groups, concluded } = useMemo(() => groupByHour(visible, now), [visible, now])
  const byId = useMemo(() => new Map(op.reservas.map((r) => [r.id, r])), [op.reservas])
  const motoristas = op.data?.motoristas ?? []
  const selected = selectedId ? byId.get(selectedId) ?? null : null
  // Desktop: painel sempre preenchido com o primeiro serviço, como no legado.
  const detailed = selected ?? (wide && !landscape ? visible[0] ?? null : null)

  async function changeStatus(option: ChoiceOption, confirmed = false) {
    if (!detailed) return
    if (isCancelled(option.label) && !confirmed) { setConfirmCancel(option); return }
    setBusy(true)
    try {
      await op.mutate(detailed.id, { statusValue: option.value, status: option.label }, () => source.setStatus(detailed.id, option.value))
      toast({ tone: 'success', message: `Status alterado para ${option.label}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível alterar o status. ${reason instanceof Error ? reason.message : ''} Tente de novo.` })
    } finally { setBusy(false) }
  }

  async function changeMotorista(motorista: Motorista | null) {
    if (!detailed) return
    setBusy(true)
    try {
      await op.mutate(detailed.id, { motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '' }, () => source.setMotorista(detailed.id, motorista?.id ?? null))
      toast({ tone: 'success', message: motorista ? `${motorista.nome} atribuído ao serviço #${detailed.codigo}.` : `Motorista removido do serviço #${detailed.codigo}.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível trocar o motorista. ${reason instanceof Error ? reason.message : ''} Tente de novo.` })
    } finally { setBusy(false) }
  }

  function onAttentionAction(item: AttentionItem) {
    const r = byId.get(item.reservaId)
    const phone = r && motoristas.find((m) => m.id === r.motoristaId)?.celular
    if (item.action === 'ligar' && phone && telHref(phone)) { window.location.href = telHref(phone)!; return }
    setSelectedId(item.reservaId) // atribuir e ver abrem o detalhe, onde ficam o seletor e o contexto
  }

  const freshness = op.refreshFailed && op.lastUpdated
    ? `Não foi possível atualizar · última atualização ${formatHour(op.lastUpdated)}`
    : freshnessLabel(op.lastUpdated, now)

  const detail = detailed ? (
    <ServiceDetail reserva={detailed} filhos={op.data?.passageiros[detailed.id] ?? []} motoristas={motoristas} reservas={op.reservas} now={now}
      statusOptions={statusOptions} busy={busy} onStatus={(o) => void changeStatus(o)} onMotorista={(m) => void changeMotorista(m)} onOpenReserva={() => source.openReserva(detailed.id)} />
  ) : null

  let body
  if (op.loading && !op.data) body = <AgendaSkeleton />
  else if (op.error) body = <Alert tone="danger" title="Não foi possível carregar os serviços" action={<Button variant="secondary" onClick={() => void op.refresh()}>Tentar de novo</Button>}>{op.error}</Alert>
  else if (!op.reservas.length) body = <EmptyState align="start" icon={<CalendarX size={36} />} title="Nenhum serviço para este dia" action={dayKey !== today ? <Button onClick={() => setDayKey(today)}>Ir para hoje</Button> : undefined}>Use as setas para ver outro dia.</EmptyState>
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
        <DayHeader dayKey={dayKey} today={today} onChangeDay={(k) => { setDayKey(k); setSelectedId(null) }}
          freshness={freshness} freshnessWarning={op.refreshFailed} refreshing={manualRefresh && op.refreshing}
          onRefresh={() => { setManualRefresh(true); void op.refresh() }} total={visible.length}
          motoristas={motoristas} motoristaId={motoristaId} onMotorista={setMotoristaId} showConcluded={showConcluded} onShowConcluded={setShowConcluded} mock={source.mock} />
        {op.data?.queryMode === 'safe' ? <Alert tone="info">Alguns campos não estão disponíveis; mostrando a versão reduzida.</Alert> : null}
        <div className="op-split">
          <div>{body}</div>
          {wide && !landscape && detail ? <Surface className="op-split__detail">{detail}</Surface> : null}
        </div>
      </div>

      {!wide || landscape ? (
        <Sheet open={Boolean(selected)} onClose={() => setSelectedId(null)} eyebrow={selected ? `Serviço #${selected.codigo}` : undefined}
          title={selected ? (selected.motorista || 'Sem motorista') : ''} footer={selected ? <ServiceActions motorista={motoristas.find((m) => m.id === selected.motoristaId)} /> : undefined}>
          {detail}
        </Sheet>
      ) : null}

      <Dialog open={Boolean(confirmCancel)} onClose={() => setConfirmCancel(null)} tone="danger" title={`Cancelar o serviço #${detailed?.codigo ?? ''}?`}
        actions={<>
          <Button variant="secondary" onClick={() => setConfirmCancel(null)}>Manter serviço</Button>
          <Button variant="danger" onClick={() => { const option = confirmCancel!; setConfirmCancel(null); void changeStatus(option, true) }}>Cancelar serviço</Button>
        </>}>
        O motorista e o cliente podem já estar contando com este serviço.
      </Dialog>
    </PageLayout>
  )
}
