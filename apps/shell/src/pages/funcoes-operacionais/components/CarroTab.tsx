import { Alert, Button, Field, Input, SegmentedControl, Select, StatusBadge, Surface, Switch, Textarea, type SelectOption } from '@betinhos/ui'
import { CONFIG } from '../domain/config'
import { vehicleHint, vehicleSubtitle, vehicleSummaryRows } from '../domain/forms'
import {
  SWAP_TYPE_HANDOFF, SWAP_TYPE_PICKUP, SWAP_TYPE_RETURN, SWAP_TYPE_SWAP, betweenServicesWindow, buildVehiclePreview, computeVehiclePlanning,
  driverDayServices, swapTypeNeedsLocation, swapWindowAlert, usesBetweenServices,
} from '../domain/logic'
import { displayDriverName } from '../domain/utils'
import type { FuncoesOperacionais } from '../useFuncoesOperacionais'
import { AgendaGapPicker } from './AgendaGapPicker'
import { Icon } from './Icon'

const pickValue = (value: string | null) => value || ''

/** Aba Carro: nova troca (Agendar / Foi agora / Foi antes) ou edição da troca aberta por `?troca=`. */
export function CarroTab({ fo }: { fo: FuncoesOperacionais }) {
  const { state, readOnly } = fo
  const form = state.vehicle.form
  const errors = state.vehicle.errors
  const planning = computeVehiclePlanning(state)
  const draft = buildVehiclePreview(state)
  const overlapWarning = draft.errors.length === 0 && draft.overlaps.length > 0
  const editing = !!state.vehicle.editId
  const structureReadOnly = editing || readOnly
  const canCancel = editing && !readOnly
  const canRevert = editing && state.vehicle.editStatusValue === 202410001
  const windowSelectable = Number(form.typeValue) === SWAP_TYPE_SWAP && form.executionMode === 'schedule'
  const between = usesBetweenServices(form)
  const betweenWindow = between ? betweenServicesWindow(state) : null
  const persisted = editing ? state.data.swaps.find((item) => item.id === state.vehicle.editId) || null : null
  const windowAlert = persisted ? swapWindowAlert(state, persisted) : ''
  const typeValue = Number(form.typeValue || 0)
  const needsLocation = swapTypeNeedsLocation(typeValue)
  const driverName = (id: string) => displayDriverName(state.data.drivers.find((item) => item.id === id))

  const typeOptions: SelectOption[] = Object.entries(CONFIG.choices.tipoTroca).map(([value, label]) => ({ value, label }))
  const driver1Options: SelectOption[] = planning.availableDriver1.map((driver) => ({ value: driver.id, label: displayDriverName(driver) }))
  const driver2Options: SelectOption[] = planning.availableDriver2.map((driver) => ({ value: driver.id, label: displayDriverName(driver) }))
  const baseVehicleOptions: SelectOption[] = planning.baseVehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.model} • ${vehicle.plate}`, subtitle: vehicleSubtitle(vehicle, planning.locationsById) }))
  const locationOptions: SelectOption[] = state.data.locations.map((location) => ({ value: location.id, label: location.name, subtitle: location.address, search: location.address }))
  const executionOptions = [
    { value: 'schedule' as const, label: 'Agendar', disabled: structureReadOnly },
    { value: 'now' as const, label: 'Foi agora', disabled: structureReadOnly },
    { value: 'past' as const, label: 'Foi antes', disabled: structureReadOnly },
  ]
  const windowModeOptions = [
    { value: 'between' as const, label: 'Entre serviços', disabled: readOnly },
    { value: 'fixed' as const, label: 'Horário marcado', disabled: readOnly },
  ]

  return (
    <div className="vehicle-layout">
      <Surface className="vehicle-panel">
        {editing && (
          <div className="vehicle-edit-banner">
            <div><span className="vehicle-edit-banner__label">Registro selecionado</span><strong>{state.vehicle.editId}</strong></div>
            <StatusBadge tone={readOnly ? 'neutral' : 'info'} dot>{readOnly ? 'Somente leitura' : 'Editável'}</StatusBadge>
          </div>
        )}
        {readOnly && <Alert tone="warning">Esta troca já foi encerrada. Use o fluxo de reversão para corrigir o histórico.</Alert>}
        {windowAlert && <Alert tone="warning">{windowAlert}</Alert>}
        {overlapWarning && <Alert tone="warning">Existem trocas sobrepostas no histórico antes do horário escolhido. Revise o planejamento antes de agendar.</Alert>}
        <div className="vehicle-form">
          <Field label="Tipo de troca" error={errors.vehicleType}>
            <Select id="vehicleType" name="vehicleType" value={form.typeValue || null} options={typeOptions} clearable={false} disabled={structureReadOnly} onChange={(value) => fo.updateVehicleField('typeValue', pickValue(value))} />
          </Field>
          <div className="form-grid form-grid--pair">
            <Field label={needsLocation ? 'Responsável' : 'Motorista 1'} error={errors.vehicleDriver1} hint={vehicleHint(planning.driver1?.predictedVehicle)}>
              <Select id="vehicleDriver1" name="vehicleDriver1" value={form.driver1Id || null} options={driver1Options} disabled={structureReadOnly} onChange={(value) => fo.updateVehicleField('driver1Id', pickValue(value))} />
            </Field>
            {(typeValue === SWAP_TYPE_SWAP || typeValue === SWAP_TYPE_HANDOFF) && (
              <Field label={typeValue === SWAP_TYPE_HANDOFF ? 'Recebe o veículo' : 'Motorista 2'} error={errors.vehicleDriver2} hint={typeValue === SWAP_TYPE_HANDOFF ? 'Somente quem está sem veículo' : vehicleHint(planning.driver2?.predictedVehicle)}>
                <Select id="vehicleDriver2" name="vehicleDriver2" value={form.driver2Id || null} options={driver2Options} disabled={structureReadOnly} onChange={(value) => fo.updateVehicleField('driver2Id', pickValue(value))} />
              </Field>
            )}
            {needsLocation && (
              <Field label="Local da base" error={errors.vehicleLocation} hint={planning.location?.address || (locationOptions.length ? (typeValue === SWAP_TYPE_RETURN ? 'Onde o veículo vai ficar' : 'Onde o veículo será retirado') : 'Digite o nome para adicionar um local')}>
                <Select id="vehicleBaseLocation" name="vehicleBaseLocation" value={form.locationId || null} options={locationOptions} disabled={structureReadOnly} onCreate={fo.openLocationDialog} onChange={(value) => fo.updateVehicleField('locationId', pickValue(value))} />
              </Field>
            )}
            {typeValue === SWAP_TYPE_PICKUP && (
              <Field label="Veículo da base" error={errors.vehicleBase} hint={form.locationId ? 'Veículos livres neste local' : 'Somente veículos sem posse prevista'}>
                <Select id="vehicleBase" name="vehicleBase" value={form.baseVehicleId || null} options={baseVehicleOptions} disabled={structureReadOnly} onChange={(value) => fo.updateVehicleField('baseVehicleId', pickValue(value))} />
              </Field>
            )}
          </div>
          {windowSelectable && (
            <div className="vehicle-choice">
              <span className="vehicle-choice__label">Quando trocar?</span>
              <SegmentedControl className="vehicle-window-mode" fullWidth options={windowModeOptions} value={form.windowMode === 'fixed' ? 'fixed' : 'between'} aria-label="Quando trocar?" onChange={(value) => fo.updateVehicleField('windowMode', value)} />
              <p className="vehicle-choice__hint" aria-live="polite">
                {between
                  ? 'Os motoristas trocam assim que estiverem livres, na posição escolhida da agenda de cada um.'
                  : 'O horário é obrigatório. Use só quando a troca precisa acontecer exatamente nessa janela.'}
              </p>
            </div>
          )}
          {between ? (
            <>
              <Field label="Dia da troca" error={errors.vehicleWindowDay}>
                <Input id="vehicleWindowDay" name="vehicleWindowDay" type="date" disabled={readOnly} value={form.startDate} onChange={(event) => fo.updateVehicleField('startDate', event.currentTarget.value)} />
              </Field>
              <div className={`vehicle-anchors ${errors.vehicleDriver1After ? 'is-invalid' : ''}`}>
                <p className="vehicle-choice__hint">Escolha em que intervalo da agenda cada motorista faz a troca. Dá para arrastar o marcador <strong>Troca</strong>.</p>
                <div className="vehicle-anchors__grid">
                  <div className="vehicle-anchor" id="vehicleDriver1After" tabIndex={-1}>
                    <AgendaGapPicker idPrefix="vehicleDriver1Agenda" driverLabel={driverName(form.driver1Id) || 'Motorista 1'} placeholder={form.driver1Id ? '' : 'Escolha o motorista 1 para ver a agenda do dia.'} services={driverDayServices(state, form.driver1Id, form.startDate)} afterId={form.driver1AfterId} beforeId={form.driver1BeforeId} disabled={readOnly || !form.driver1Id} invalid={!!errors.vehicleDriver1After} onSelect={(after, before) => fo.selectAnchors(1, after, before)} />
                  </div>
                  <div className="vehicle-anchor">
                    <AgendaGapPicker idPrefix="vehicleDriver2Agenda" driverLabel={driverName(form.driver2Id) || 'Motorista 2'} placeholder={form.driver2Id ? '' : 'Escolha o motorista 2 para ver a agenda do dia.'} services={driverDayServices(state, form.driver2Id, form.startDate)} afterId={form.driver2AfterId} beforeId={form.driver2BeforeId} disabled={readOnly || !form.driver2Id} onSelect={(after, before) => fo.selectAnchors(2, after, before)} />
                  </div>
                </div>
                {errors.vehicleDriver1After && <Alert tone="danger">{errors.vehicleDriver1After}</Alert>}
              </div>
              {betweenWindow?.error && !errors.vehicleDriver1After && <Alert tone="warning">{betweenWindow.error}</Alert>}
            </>
          ) : (
            <div className="form-grid form-grid--pair">
              <Field label="Início" error={errors.vehicleStartDateTime}>
                <Input id="vehicleStartDateTime" name="vehicleStartDateTime" type="datetime-local" step={300} disabled={readOnly} value={`${form.startDate}T${form.startHour}:${form.startMinute}`} onChange={(event) => fo.updateVehicleDateTime('start', event.currentTarget.value)} />
              </Field>
              <Field label="Fim" error={errors.vehicleEndDateTime}>
                <Input id="vehicleEndDateTime" name="vehicleEndDateTime" type="datetime-local" step={300} disabled={readOnly} value={`${form.endDate}T${form.endHour}:${form.endMinute}`} onChange={(event) => fo.updateVehicleDateTime('end', event.currentTarget.value)} />
              </Field>
            </div>
          )}

          <div className="vehicle-choice">
            <span className="vehicle-choice__label">O que aconteceu?</span>
            <SegmentedControl className="execution-options" fullWidth options={executionOptions} value={form.executionMode} aria-label="O que aconteceu?" onChange={(mode) => fo.setVehicleFormValue('executionMode', mode)} />
            <p className="vehicle-choice__hint" aria-live="polite">
              {form.executionMode === 'schedule'
                ? 'Cria a Troca e a Geral. Não altera a posse.'
                : form.executionMode === 'now' ? 'Finaliza a Geral, a Troca e a posse agora.' : 'Registra a troca com o horário real informado.'}
            </p>
          </div>
          {form.executionMode === 'past' && (
            <Field label="Horário real da troca" error={errors.vehicleActualDateTime}>
              <Input id="vehicleActualDateTime" name="vehicleActualDateTime" type="datetime-local" step={60} disabled={structureReadOnly} value={`${form.actualDate}T${form.actualHour}:${form.actualMinute}`} onChange={(event) => fo.updateVehicleDateTime('actual', event.currentTarget.value)} />
            </Field>
          )}
          {form.executionMode === 'schedule' && (
            <Switch
              id="vehicleProgramAutomatically"
              name="vehicleProgramAutomatically"
              label="Programar automático"
              description={form.programAutomatically ? 'Aparece no app 3 dias antes do início.' : 'Fica Confirmada e oculta do motorista.'}
              disabled={structureReadOnly}
              checked={form.programAutomatically}
              onChange={(event) => fo.setVehicleFormValue('programAutomatically', event.currentTarget.checked)}
            />
          )}
          <Field label="Local da troca (opcional)">
            <Input id="vehicleLocation" name="vehicleLocation" maxLength={200} disabled={readOnly} value={form.location} onChange={(event) => fo.setVehicleFormValue('location', event.currentTarget.value)} placeholder="Ex.: Base Betinhos, Aeroporto de Guarulhos" />
          </Field>
          <Field label="Observação operacional (opcional)">
            <Textarea id="vehicleObs" name="vehicleObs" rows={3} disabled={readOnly} value={form.obs} onChange={(event) => fo.setVehicleFormValue('obs', event.currentTarget.value)} placeholder="Ex.: encontro na base, motivo da troca, ponto de apoio..." />
          </Field>
        </div>
        <div className="panel__footer">
          {canCancel && <Button variant="danger" data-action="vehicle-cancel" disabled={state.loading} onClick={() => fo.openVehicleLifecycle('cancel')}>Cancelar troca</Button>}
          {canRevert && <Button variant="secondary" data-action="vehicle-revert" disabled={state.loading} onClick={() => fo.openVehicleLifecycle('revert')}>Reverter troca</Button>}
          <Button variant="primary" icon={<Icon name={editing ? 'check' : form.executionMode === 'schedule' ? 'swap' : 'check'} />} data-action="vehicle-open-preview" disabled={readOnly} onClick={() => void fo.openVehiclePreview()}>
            {editing ? 'Salvar alterações' : form.executionMode === 'schedule' ? 'Agendar troca' : 'Registrar ocorrência'}
          </Button>
        </div>
      </Surface>
      <Surface as="div" className="vehicle-summary" eyebrow="Resumo" title={editing ? 'Troca selecionada' : 'Nova troca'} aria-label="Resumo da troca">
        <dl className="vehicle-summary__list">
          {vehicleSummaryRows(state).map((row) => (
            <div key={row.label} className="vehicle-summary__row"><dt>{row.label}</dt><dd className={row.value ? '' : 'is-empty'}>{row.value || 'A definir'}</dd></div>
          ))}
        </dl>
        {needsLocation && planning.location?.address && (
          <p className="vehicle-summary__note">{planning.location.address}{planning.location.mapUrl && <> · <a href={planning.location.mapUrl} target="_blank" rel="noopener noreferrer">Abrir mapa</a></>}</p>
        )}
      </Surface>
    </div>
  )
}
