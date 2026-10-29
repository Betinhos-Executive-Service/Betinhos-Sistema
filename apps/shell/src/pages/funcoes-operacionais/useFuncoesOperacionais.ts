import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { logAppError } from '@betinhos/ui/error-logger'
import type { Source } from './data/source'
import {
  PAGE_SIZE, SWAP_STATUS_READ_ONLY, applyVehicleFieldChange, emptyVehicleForm, splitDateTime, toggleCloneDate, validateCloneDraft,
  validateVehicleForm, vehicleFormFromSwap, weekStart, type FieldErrors,
} from './domain/forms'
import { betweenServicesWindow, buildVehiclePreview, cloneServices, createCloneDraft, driverServices, passengerLinksByService, serviceById, usesBetweenServices } from './domain/logic'
import { userErrorMessage } from './domain/payloads'
import type { CloneDraft, DashboardData, ToastTone, VehicleForm, VehiclePreview, ViewName } from './domain/types'
import { combineDateTime, displayDriverName, formatDate, formatTime, toDateInputValue, twoDigits } from './domain/utils'

export type ToastAction = { label: string; run: () => void }
export type Notify = (title: string, message: string, tone?: ToastTone, action?: ToastAction) => void

export type LifecycleDialog = { action: 'cancel' | 'revert'; reason: string; effectiveAt: string }
export type LocationDialog = { name: string; address: string; mapUrl: string; error: string; saving: boolean }

/** Estado da tela. `driver`, `clone`, `vehicle` e `data` têm o formato que as regras puras leem (AppState). */
export type FoState = {
  loading: boolean
  loadingMessage: string
  firstLoadDone: boolean
  refreshBusy: boolean
  transitionKind: string
  driver: { query: string; startDate: string; activeServiceId: string; onlyMissing: boolean; filterOpen: boolean; visible: number }
  clone: { query: string; selectedServiceId: string; highlightedServiceId: string; draft: CloneDraft | null; visible: number; calendarStart: Date; errors: FieldErrors }
  vehicle: { form: VehicleForm; editId: string; editStatusValue: number | null; errors: FieldErrors }
  data: DashboardData
  driverBusy: Record<string, boolean>
  driverErrors: Record<string, string>
  driverFeedback: Record<string, boolean>
  serviceDetailId: string
  discardAction: (() => void) | null
  lifecycleDialog: LifecycleDialog | null
  locationDialog: LocationDialog | null
}

const VIEW_ORDER: ViewName[] = ['driver', 'clone', 'vehicle']
const EMPTY_DATA: DashboardData = { drivers: [], vehicles: [], services: [], passengerLinks: [], swaps: [], possessions: [], locations: [] }

function initialState(now: Date): FoState {
  return {
    loading: true,
    loadingMessage: 'Carregando operação...',
    firstLoadDone: false,
    refreshBusy: false,
    transitionKind: 'boot',
    driver: { query: '', startDate: toDateInputValue(now), activeServiceId: '', onlyMissing: false, filterOpen: false, visible: PAGE_SIZE },
    clone: { query: '', selectedServiceId: '', highlightedServiceId: '', draft: null, visible: PAGE_SIZE, calendarStart: weekStart(now), errors: {} },
    vehicle: { form: emptyVehicleForm(now), editId: '', editStatusValue: null, errors: {} },
    data: EMPTY_DATA,
    driverBusy: {},
    driverErrors: {},
    driverFeedback: {},
    serviceDetailId: '',
    discardAction: null,
    lifecycleDialog: null,
    locationDialog: null,
  }
}

/** Foco no primeiro campo com erro, centralizado. */
function focusField(fieldId: string) {
  window.requestAnimationFrame(() => {
    const field = document.getElementById(fieldId)
    if (!field) return
    field.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field.focus?.()
  })
}

type Options = {
  source: Source
  notify: Notify
  /** Aba atual e troca pedida pela URL (`aba=`/`troca=`). */
  view: ViewName
  routeEditId: string
  /** Grava a aba e a troca em edição na URL. */
  navigate: (view: ViewName, editId?: string) => void
}

/**
 * Estado, carga e ações das três abas (Motorista, Pedido, Carro). Substitui o estado observável do WebResource:
 * `update` aplica a mudança sobre o estado mais recente (lido de um ref) para os fluxos assíncronos.
 */
export function useFuncoesOperacionais({ source, notify, view, routeEditId, navigate }: Options) {
  const [state, setState] = useState<FoState>(() => initialState(new Date()))
  const ref = useRef(state)
  const update = useCallback((fn: (s: FoState) => FoState) => { ref.current = fn(ref.current); setState(ref.current) }, [])
  const get = () => ref.current
  const today = toDateInputValue(new Date())
  const viewRef = useRef(view)
  const io = useRef({ notify, navigate, source })
  io.current = { notify, navigate, source }
  const toast: Notify = (...args) => io.current.notify(...args)

  // ── carga ──
  const refreshData = useCallback(async (message = 'Carregando dados...', silent = false) => {
    if (!silent) update((s) => ({ ...s, loading: true, loadingMessage: message }))
    try {
      const data = await io.current.source.load()
      update((s) => ({ ...s, data, loading: false, loadingMessage: '', firstLoadDone: true }))
    } catch (error) {
      update((s) => ({ ...s, loading: false, loadingMessage: '', firstLoadDone: true }))
      void logAppError(error, { severity: 'error', source: 'App.refreshData', action: 'loadDashboardData', screen: viewRef.current, payload: { silent, message } })
      io.current.notify('Falha', userErrorMessage(error, 'Não foi possível carregar os dados.'), 'danger')
      throw error
    }
  }, [update])

  useEffect(() => { void refreshData().catch(() => undefined) }, [refreshData])

  async function refreshNow(origin: 'button' | 'pull' = 'button') {
    if (get().refreshBusy || get().loading) return
    update((s) => ({ ...s, refreshBusy: true }))
    try {
      await refreshData('Atualizando dados...', true)
      if (origin === 'button') toast('Atualizado', 'Lista sincronizada com o Dataverse.', 'success')
    } catch {
      // refreshData já avisou.
    } finally {
      update((s) => ({ ...s, refreshBusy: false }))
    }
  }

  function refreshInBackground(message: string) {
    if (get().refreshBusy) return
    update((s) => ({ ...s, refreshBusy: true }))
    void refreshData(message, true).catch(() => undefined).finally(() => update((s) => ({ ...s, refreshBusy: false })))
  }

  // ── abas ──
  if (viewRef.current !== view) {
    const previous = VIEW_ORDER.indexOf(viewRef.current)
    const next = VIEW_ORDER.indexOf(view)
    const from = viewRef.current
    viewRef.current = view
    // Ajuste síncrono durante o render (sem efeito): animação e paginação voltam a 16 ao entrar na aba.
    ref.current = {
      ...ref.current,
      transitionKind: next < previous ? 'tab-back' : 'tab-forward',
      driver: view === 'driver' && from !== 'driver' ? { ...ref.current.driver, visible: PAGE_SIZE } : ref.current.driver,
      clone: view === 'clone' && from !== 'clone' ? { ...ref.current.clone, visible: PAGE_SIZE } : ref.current.clone,
    }
  }
  const current = ref.current

  function switchView(next: ViewName) {
    io.current.navigate(next, next === 'vehicle' ? get().vehicle.editId : '')
  }

  // ── edição da troca pela URL (?troca=) ──
  const openVehicleEdit = useCallback(async (id: string) => {
    update((s) => ({ ...s, vehicle: { ...s.vehicle, editId: id }, loading: true, loadingMessage: 'Carregando troca...' }))
    try {
      const swap = await io.current.source.loadSwap(id)
      update((s) => ({
        ...s,
        data: s.data.swaps.some((item) => item.id === swap.id) ? { ...s.data, swaps: s.data.swaps.map((item) => (item.id === swap.id ? { ...item, ...swap } : item)) } : { ...s.data, swaps: [...s.data.swaps, swap] },
        vehicle: { form: vehicleFormFromSwap(swap), editId: id, editStatusValue: swap.statusValue, errors: {} },
      }))
    } catch (error) {
      update((s) => ({ ...s, vehicle: { ...s.vehicle, editId: '', editStatusValue: null } }))
      void logAppError(error, { severity: 'error', source: 'App.openVehicleEdit', action: 'loadSwap', screen: 'vehicle', detailId: id })
      io.current.notify('Falha', userErrorMessage(error, 'Não foi possível carregar a troca.'), 'danger')
      io.current.navigate('vehicle', '')
    } finally {
      update((s) => ({ ...s, loading: false, loadingMessage: '' }))
    }
  }, [update])

  function resetVehicleEdit() {
    update((s) => ({ ...s, vehicle: { form: emptyVehicleForm(), editId: '', editStatusValue: null, errors: {} } }))
  }

  useEffect(() => {
    if (!state.firstLoadDone || view !== 'vehicle') return
    if (routeEditId && routeEditId !== ref.current.vehicle.editId) void openVehicleEdit(routeEditId)
    else if (!routeEditId && ref.current.vehicle.editId) resetVehicleEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.firstLoadDone, view, routeEditId, openVehicleEdit])

  function closeVehicleEdit() {
    resetVehicleEdit()
    io.current.navigate('vehicle', '')
  }

  // ── Motorista ──
  function setServiceDriver(serviceId: string, motoristaId: string | null, motoristaLabel: string) {
    update((s) => ({ ...s, data: { ...s.data, services: s.data.services.map((service) => (service.id === serviceId ? { ...service, motoristaId, motoristaLabel } : service)) } }))
  }

  function submitDriverChange(serviceId: string, driverId: string, fromUndo = false) {
    const s = get()
    const service = serviceById(s, serviceId)
    const driver = driverId ? s.data.drivers.find((item) => item.id === driverId) : null
    if (!service || (driverId && !driver)) {
      update((x) => ({ ...x, driverErrors: { ...x.driverErrors, [serviceId]: 'Motorista não encontrado.' } }))
      return
    }
    const previousDriverId = service.motoristaId
    const previousDriverLabel = service.motoristaLabel
    // Otimista: a lista muda e o drawer fecha antes da gravação.
    setServiceDriver(service.id, driver?.id || null, driver ? displayDriverName(driver) : '')
    update((x) => ({
      ...x,
      driver: { ...x.driver, activeServiceId: '' },
      driverBusy: { ...x.driverBusy, [serviceId]: false },
      driverErrors: { ...x.driverErrors, [serviceId]: '' },
      driverFeedback: { ...x.driverFeedback, [serviceId]: true },
    }))
    io.current.source.changeDriver(service.id, driverId || null).then(() => {
      window.setTimeout(() => update((x) => ({ ...x, driverFeedback: { ...x.driverFeedback, [serviceId]: false } })), 1500)
      const order = `#${service.readableId || '-'}`
      const nextLabel = driver ? displayDriverName(driver) : ''
      if (fromUndo) {
        toast('Alteração desfeita', `${order} voltou para ${nextLabel || 'sem motorista'}.`, 'success')
        return
      }
      toast(
        driverId ? 'Motorista atualizado' : 'Motorista retirado',
        driverId ? `${order}: ${previousDriverLabel || 'sem motorista'} → ${nextLabel}.` : `${order} ficou sem motorista.`,
        'success',
        { label: 'Desfazer', run: () => submitDriverChange(serviceId, previousDriverId || '', true) },
      )
    }).catch((error: unknown) => {
      void logAppError(error, { severity: 'error', source: 'App.submitDriverChange', action: 'changeDriver', screen: 'driver', detailId: serviceId, detailType: 'service', payload: { driverId } })
      setServiceDriver(service.id, previousDriverId, previousDriverLabel)
      const message = userErrorMessage(error, 'Não foi possível alterar o motorista.')
      update((x) => ({
        ...x,
        driver: { ...x.driver, activeServiceId: serviceId },
        driverFeedback: { ...x.driverFeedback, [serviceId]: false },
        driverErrors: { ...x.driverErrors, [serviceId]: message },
      }))
      toast('Falha', message, 'danger')
    })
  }

  // ── Pedido (duplicar) ──
  function openClone(serviceId: string) {
    const service = serviceById(get(), serviceId)
    if (!service) {
      toast('Falha', 'Serviço não encontrado.', 'danger')
      return
    }
    update((s) => ({ ...s, clone: { ...s.clone, selectedServiceId: service.id, draft: createCloneDraft(service), calendarStart: weekStart(new Date()), errors: {} } }))
  }

  function closeClone() {
    update((s) => ({ ...s, clone: { ...s.clone, selectedServiceId: '', draft: null } }))
  }

  function patchCloneDraft(patch: Partial<CloneDraft>, clearErrors = true) {
    update((s) => (s.clone.draft ? { ...s, clone: { ...s.clone, draft: { ...s.clone.draft, ...patch }, errors: clearErrors ? {} : s.clone.errors } } : s))
  }

  function toggleCloneDay(date: string) {
    update((s) => (s.clone.draft ? { ...s, clone: { ...s.clone, draft: toggleCloneDate(s.clone.draft, date), errors: {} } } : s))
  }

  async function submitClone() {
    const s = get()
    const original = s.clone.selectedServiceId ? serviceById(s, s.clone.selectedServiceId) : null
    const draft = s.clone.draft
    if (!original || !draft) {
      toast('Validação', 'Nenhum serviço selecionado.', 'warning')
      return
    }
    const { errors, departures } = validateCloneDraft(draft)
    update((x) => ({ ...x, clone: { ...x.clone, errors } }))
    const firstField = Object.keys(errors)[0]
    if (firstField) {
      focusField(firstField)
      toast('Validação', errors[firstField] || 'Revise os campos destacados.', 'warning')
      return
    }
    const created: string[] = []
    update((x) => ({ ...x, loading: true }))
    try {
      for (const [index, dataSaida] of departures.entries()) {
        update((x) => ({ ...x, loadingMessage: departures.length > 1 ? `Criando pedido ${index + 1} de ${departures.length}...` : 'Duplicando pedido...' }))
        created.push(await io.current.source.cloneService({
          originalId: original.id, original, dataSaida, driverId: draft.driverId, obsOperacao: draft.obsOperacao, obsInterna: draft.obsInterna,
          passengerLinks: passengerLinksByService(get(), original.id),
        }))
      }
      closeClone()
      await refreshData('Atualizando lista...')
      const firstId = created[0]
      toast(
        created.length > 1 ? `${created.length} pedidos criados` : 'Pedido duplicado',
        created.length > 1
          ? `Cópias de #${original.readableId || '-'} para ${departures.map((date) => formatDate(date).slice(0, 5)).join(', ')}.`
          : `Cópia de #${original.readableId || '-'} para ${formatDate(departures[0])} às ${formatTime(departures[0])}.`,
        'success',
        { label: 'Abrir pedido', run: () => update((x) => ({ ...x, serviceDetailId: firstId })) },
      )
      update((x) => ({ ...x, clone: { ...x.clone, highlightedServiceId: firstId } }))
      window.setTimeout(() => update((x) => (x.clone.highlightedServiceId === firstId ? { ...x, clone: { ...x.clone, highlightedServiceId: '' } } : x)), 2200)
    } catch (error) {
      update((x) => ({ ...x, loading: false }))
      void logAppError(error, {
        severity: 'error', source: 'App.submitClone', action: 'cloneService', screen: 'clone', detailId: original.id, detailType: 'service',
        payload: { driverId: draft.driverId, created: created.length, dates: departures.map((date) => date.toISOString()) },
      })
      const message = userErrorMessage(error, 'Não foi possível duplicar o pedido.')
      if (created.length) {
        // As datas já criadas saem da seleção.
        update((x) => (x.clone.draft ? { ...x, clone: { ...x.clone, draft: { ...x.clone.draft, dates: x.clone.draft.dates.slice(created.length) } } } : x))
        toast('Duplicação parcial', `${created.length} de ${departures.length} pedidos criados. ${message} As datas restantes continuam selecionadas.`, 'danger')
        void refreshData('Atualizando lista...', true).catch(() => undefined)
      } else {
        toast('Falha', message, 'danger')
      }
    }
  }

  // ── Carro (troca de carro) ──
  const readOnly = SWAP_STATUS_READ_ONLY.includes(current.vehicle.editStatusValue ?? -1)

  function updateVehicleField(key: keyof VehicleForm, value: string) {
    const { form, sameStartConflict } = applyVehicleFieldChange(get(), key, value)
    update((s) => ({ ...s, vehicle: { ...s.vehicle, form, errors: {} } }))
    if (sameStartConflict) toast('Não permitido', 'Não é possível agendar duas trocas com o mesmo horário de início.', 'danger')
  }

  function updateVehicleDateTime(prefix: 'start' | 'end' | 'actual', value: string) {
    const { date, hour, minute } = splitDateTime(value)
    updateVehicleField(`${prefix}Date`, date)
    updateVehicleField(`${prefix}Hour`, hour)
    updateVehicleField(`${prefix}Minute`, minute)
  }

  /** Campos sem cascata (modo de execução, switch, local da troca, observação). */
  function setVehicleFormValue<K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) {
    update((s) => ({ ...s, vehicle: { ...s.vehicle, form: { ...s.vehicle.form, [key]: value } } }))
  }

  function selectAnchors(driver: 1 | 2, afterId: string, beforeId: string) {
    update((s) => ({
      ...s,
      vehicle: { ...s.vehicle, errors: {}, form: { ...s.vehicle.form, ...(driver === 1 ? { driver1AfterId: afterId, driver1BeforeId: beforeId } : { driver2AfterId: afterId, driver2BeforeId: beforeId }) } },
    }))
  }

  async function openVehiclePreview() {
    if (SWAP_STATUS_READ_ONLY.includes(get().vehicle.editStatusValue ?? -1)) {
      toast('Somente leitura', 'Troca concluída ou cancelada não pode ser editada.', 'warning')
      return
    }
    try {
      await refreshData('Atualizando posse e agenda...', true)
    } catch {
      return
    }
    const errors = validateVehicleForm(get())
    update((s) => ({ ...s, vehicle: { ...s.vehicle, errors } }))
    const firstField = Object.keys(errors)[0]
    if (firstField) {
      focusField(firstField)
      toast('Validação', errors[firstField] || 'Revise os campos destacados.', 'warning')
      return
    }
    if (get().vehicle.editId) {
      await submitVehicleEdit()
      return
    }
    const result = buildVehiclePreview(get())
    if (result.errors.length) {
      toast('Validação', result.errors[0], 'warning')
      return
    }
    if (result.overlaps.length) {
      toast('Conflito', 'Existe outra troca ativa para esse motorista ou veículo no período.', 'danger')
      return
    }
    await submitVehicleSchedule(result.preview)
  }

  async function submitVehicleEdit() {
    const s = get()
    const form = s.vehicle.form
    const between = usesBetweenServices(form)
    const window = between ? betweenServicesWindow(s) : null
    const start = window ? window.start : combineDateTime(form.startDate, form.startHour, form.startMinute)
    const end = window ? window.end : combineDateTime(form.endDate, form.endHour, form.endMinute)
    if (!start || !end) return
    const editId = s.vehicle.editId
    const persisted = s.data.swaps.find((item) => item.id === editId)
    update((x) => ({ ...x, loading: true, loadingMessage: 'Salvando troca...' }))
    try {
      await io.current.source.updateSwap({
        id: editId, rowVersion: persisted?.rowVersion || '', start, end, obs: form.obs,
        windowMode: between ? 'between' : 'fixed',
        driver1AfterId: between ? form.driver1AfterId : '', driver1BeforeId: between ? form.driver1BeforeId : '',
        driver2AfterId: between ? form.driver2AfterId : '', driver2BeforeId: between ? form.driver2BeforeId : '',
        location: form.location || '',
      })
      toast('Salvo', 'Troca atualizada.', 'success')
      await refreshData('Atualizando troca...', true)
      closeVehicleEdit()
    } catch (error) {
      void logAppError(error, { severity: 'error', source: 'App.submitVehicleEdit', action: 'updateSwap', screen: 'vehicle', detailId: editId })
      toast('Falha', userErrorMessage(error, 'Não foi possível salvar a troca.'), 'danger')
    } finally {
      update((x) => ({ ...x, loading: false, loadingMessage: '' }))
    }
  }

  async function submitVehicleSchedule(preview: VehiclePreview | null) {
    if (!preview) {
      toast('Validação', 'Prévia inválida. Revise os dados.', 'warning')
      return
    }
    const effectiveAt = preview.executionMode === 'now' ? new Date() : preview.actualAt
    update((s) => ({ ...s, loading: true, loadingMessage: effectiveAt ? 'Finalizando troca e posse...' : 'Agendando troca...' }))
    try {
      await io.current.source.scheduleSwap({
        preview, start: preview.start, end: preview.end, typeValue: preview.typeValue, obs: preview.obs, summary: preview.summary,
        programAutomatically: preview.programAutomatically, effectiveAt,
      })
      update((s) => ({ ...s, loading: false, loadingMessage: '', vehicle: { ...s.vehicle, form: emptyVehicleForm(), errors: {} } }))
      toast('Sucesso', effectiveAt
        ? 'Troca finalizada e posse atualizada.'
        : preview.programAutomatically ? 'Troca programada e disponível para o motorista.' : 'Troca confirmada e oculta do motorista.', 'success')
      refreshInBackground(effectiveAt ? 'Atualizando posse e agenda...' : 'Atualizando trocas...')
    } catch (error) {
      update((s) => ({ ...s, loading: false, loadingMessage: '' }))
      void logAppError(error, {
        severity: 'error', source: 'App.submitVehicleSchedule', action: 'scheduleSwap', screen: 'vehicle', detailType: 'swap',
        payload: {
          executionMode: preview.executionMode, effectiveAt: effectiveAt?.toISOString() || null, typeValue: preview.typeValue,
          driver1Id: preview.driver1Id, driver2Id: preview.driver2Id, vehicle1Id: preview.vehicle1Id, vehicle2Id: preview.vehicle2Id,
          start: preview.start.toISOString(), end: preview.end.toISOString(),
        },
      })
      toast('Falha', userErrorMessage(error, 'Não foi possível agendar a troca.'), 'danger')
    }
  }

  function openVehicleLifecycle(action: 'cancel' | 'revert') {
    const now = new Date()
    update((s) => ({ ...s, lifecycleDialog: { action, reason: '', effectiveAt: `${toDateInputValue(now)}T${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}` } }))
  }

  function patchLifecycle(patch: Partial<LifecycleDialog>) {
    update((s) => (s.lifecycleDialog ? { ...s, lifecycleDialog: { ...s.lifecycleDialog, ...patch } } : s))
  }

  async function runVehicleLifecycle() {
    const s = get()
    const dialog = s.lifecycleDialog
    const id = s.vehicle.editId
    if (!dialog || !id) return
    const isCancel = dialog.action === 'cancel'
    const label = isCancel ? 'cancelar' : 'reverter'
    const reason = dialog.reason.trim()
    if (!reason) {
      toast('Motivo obrigatório', `Informe por que precisa ${label} esta troca.`, 'warning')
      return
    }
    const effectiveAt = !isCancel ? new Date(dialog.effectiveAt) : undefined
    if (effectiveAt && Number.isNaN(effectiveAt.getTime())) {
      toast('Data inválida', 'Informe a data e a hora efetivas da reversão.', 'warning')
      return
    }
    update((x) => ({ ...x, loading: true, loadingMessage: `${isCancel ? 'Cancelando' : 'Revertendo'} troca...` }))
    try {
      if (isCancel) await io.current.source.cancelSwap(id, reason)
      else await io.current.source.revertSwap(id, reason, effectiveAt)
      toast('Concluído', isCancel ? 'Troca cancelada.' : 'Troca revertida.', 'success')
      await refreshData('Atualizando troca...', true)
      update((x) => ({ ...x, lifecycleDialog: null }))
      closeVehicleEdit()
    } catch (error) {
      void logAppError(error, { severity: 'error', source: 'App.runVehicleLifecycle', action: isCancel ? 'cancelSwap' : 'revertSwap', screen: 'vehicle', detailId: id })
      toast('Falha', userErrorMessage(error, `Não foi possível ${label} a troca.`), 'danger')
    } finally {
      update((x) => ({ ...x, loading: false, loadingMessage: '' }))
    }
  }

  function openLocationDialog(typed: string) {
    update((s) => ({ ...s, locationDialog: { name: typed, address: '', mapUrl: '', error: '', saving: false } }))
  }

  function patchLocation(patch: Partial<LocationDialog>) {
    update((s) => (s.locationDialog ? { ...s, locationDialog: { ...s.locationDialog, ...patch } } : s))
  }

  async function submitLocation() {
    const dialog = get().locationDialog
    if (!dialog || dialog.saving) return
    if (!dialog.name.trim()) {
      patchLocation({ error: 'Informe o nome do local.' })
      return
    }
    patchLocation({ saving: true, error: '' })
    try {
      const created = await io.current.source.createLocation(dialog)
      update((s) => ({ ...s, data: { ...s.data, locations: [...s.data.locations, created].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')) } }))
      updateVehicleField('locationId', created.id)
      update((s) => ({ ...s, locationDialog: null }))
      toast('Sucesso', `Local "${created.name}" cadastrado e selecionado.`, 'success')
    } catch (error) {
      patchLocation({ saving: false, error: 'Não foi possível cadastrar o local. Confira os dados e tente de novo.' })
      void logAppError(error, { severity: 'error', source: 'App.submitLocation', action: 'createLocation', screen: 'vehicle', detailType: 'location' })
    }
  }

  // ── fechar com alteração pendente ──
  function requestClose(dirty: boolean, close: () => void) {
    if (get().loading) return
    if (dirty) {
      update((s) => ({ ...s, discardAction: close }))
      return
    }
    close()
  }

  function confirmDiscard() {
    const close = get().discardAction
    update((s) => ({ ...s, discardAction: null }))
    close?.()
  }

  // ── derivados ──
  const derived = useMemo(() => {
    const driverAll = driverServices(state)
    const driverList = state.driver.onlyMissing ? driverAll.filter((service) => !service.motoristaId) : driverAll
    const cloneList = cloneServices(state)
    return { driverAll, driverList, driverMissingCount: driverAll.filter((service) => !service.motoristaId).length, cloneList }
  }, [state])

  return {
    state: current,
    today,
    readOnly,
    ...derived,
    update,
    refreshNow,
    switchView,
    submitDriverChange,
    openClone,
    closeClone,
    patchCloneDraft,
    toggleCloneDay,
    submitClone,
    updateVehicleField,
    updateVehicleDateTime,
    setVehicleFormValue,
    selectAnchors,
    openVehiclePreview,
    openVehicleLifecycle,
    patchLifecycle,
    runVehicleLifecycle,
    openLocationDialog,
    patchLocation,
    submitLocation,
    requestClose,
    confirmDiscard,
  }
}

export type FuncoesOperacionais = ReturnType<typeof useFuncoesOperacionais>
