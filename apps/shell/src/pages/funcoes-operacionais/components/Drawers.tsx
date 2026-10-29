import { Alert, Button, Dialog, Drawer, Field, Input, Select, Textarea, type SelectOption } from '@betinhos/ui'
import { calendarDays, cloneDatesHint, weekStart, addDays } from '../domain/forms'
import { createCloneDraft, passengerLinksByService, serviceById, servicePassengerText } from '../domain/logic'
import { displayDriverName, formatDate, formatTime, toDateInputValue } from '../domain/utils'
import type { ViewName } from '../domain/types'
import type { FuncoesOperacionais } from '../useFuncoesOperacionais'
import { Icon } from './Icon'

/** Detalhe do serviço (card clicado); o rodapé leva à ação da aba. */
export function ServiceDetailDrawer({ fo, view }: { fo: FuncoesOperacionais; view: ViewName }) {
  const { state, update } = fo
  const service = state.serviceDetailId ? serviceById(state, state.serviceDetailId) : null
  if (!service) return null
  const close = () => update((s) => ({ ...s, serviceDetailId: '' }))
  const primary = () => {
    close()
    if (view === 'driver') update((s) => ({ ...s, driver: { ...s.driver, activeServiceId: service.id } }))
    else if (view === 'clone') fo.openClone(service.id)
  }
  return (
    <Drawer
      open
      onClose={close}
      eyebrow={`Pedido #${service.readableId || '-'}`}
      title={service.trajeto || 'Sem trajeto'}
      footer={view === 'driver' || view === 'clone' ? (
        <Button variant="primary" icon={<Icon name={view === 'driver' ? 'users' : 'copy'} />} onClick={primary}>
          {view === 'driver' ? (service.motoristaId ? 'Trocar motorista' : 'Definir motorista') : 'Duplicar pedido'}
        </Button>
      ) : undefined}
    >
      <div className="service-detail">
        <div className="service-detail__datetime">
          <span>Saída prevista</span>
          <strong>{formatTime(service.dataSaida)}</strong>
          <small>{formatDate(service.dataSaida)}</small>
        </div>
        <dl className="info-list">
          <div className="info-row"><dt>Cliente</dt><dd>{service.clienteLabel || 'Sem cliente'}</dd></div>
          <div className="info-row"><dt>Motorista</dt><dd>{service.motoristaLabel || 'Sem motorista'}</dd></div>
          <div className="info-row"><dt>PAX</dt><dd>{servicePassengerText(service, passengerLinksByService(state, service.id))}</dd></div>
          <div className="info-row"><dt>Carro</dt><dd>{service.veiculoLabel || '-'}</dd></div>
          <div className="info-row"><dt>Tipo do veículo</dt><dd>{service.tipoVeiculoLabel || '-'}</dd></div>
          <div className="info-row"><dt>Perfil</dt><dd>{service.perfilPassageiro || '-'}</dd></div>
          <div className="info-row"><dt>Solicitante</dt><dd>{service.solicitanteLabel || '-'}</dd></div>
          {service.obsOperacao && <div className="info-row info-row--note"><dt>Obs operação</dt><dd>{service.obsOperacao}</dd></div>}
          {service.obsInterna && <div className="info-row info-row--note"><dt>Obs interna</dt><dd>{service.obsInterna}</dd></div>}
        </dl>
      </div>
    </Drawer>
  )
}

/** Duplicar pedido: uma ou mais datas no mini-calendário, horário, motorista e observações. */
export function CloneDrawer({ fo }: { fo: FuncoesOperacionais }) {
  const { state, update, today } = fo
  const service = state.clone.selectedServiceId ? serviceById(state, state.clone.selectedServiceId) : null
  const draft = state.clone.draft
  if (!service || !draft) return null
  const errors = state.clone.errors
  const dirty = JSON.stringify(draft) !== JSON.stringify(createCloneDraft(service))
  const close = () => fo.requestClose(dirty, fo.closeClone)
  const originalKey = toDateInputValue(service.dataSaida)
  const { days, title } = calendarDays(state.clone.calendarStart)
  const driverOptions: SelectOption[] = state.data.drivers.map((driver) => ({ value: driver.id, label: displayDriverName(driver) }))
  const moveCalendar = (delta: number) => update((s) => ({ ...s, clone: { ...s.clone, calendarStart: addDays(s.clone.calendarStart, delta) } }))
  return (
    <Drawer
      open
      size="wide"
      onClose={close}
      eyebrow={`Pedido #${service.readableId || '-'}`}
      title="Duplicar pedido"
      footer={(
        <>
          <Button variant="secondary" onClick={close}>Cancelar</Button>
          <Button variant="primary" icon={<Icon name="copy" />} disabled={state.loading} onClick={() => void fo.submitClone()}>{draft.dates.length > 1 ? `Criar ${draft.dates.length} pedidos` : 'Criar pedido'}</Button>
        </>
      )}
    >
      <div className="drawer-form">
        <details className="clone-summary">
          <summary>
            <span className="clone-summary__text">
              <strong>#{service.readableId || '-'} · {service.clienteLabel || 'Sem cliente'}</strong>
              <span>{service.trajeto || 'Sem trajeto'} · {formatDate(service.dataSaida).slice(0, 5)} às {formatTime(service.dataSaida)}</span>
            </span>
            <span className="clone-summary__toggle">O que será copiado <Icon name="chevron" /></span>
          </summary>
          <dl className="info-list">
            <div className="info-row"><dt>Cliente</dt><dd>{service.clienteLabel || 'Sem cliente'}</dd></div>
            <div className="info-row"><dt>Trajeto</dt><dd>{service.trajeto || '-'}</dd></div>
            <div className="info-row"><dt>PAX</dt><dd>{servicePassengerText(service, passengerLinksByService(state, service.id))}</dd></div>
            <div className="info-row"><dt>Tipo do veículo</dt><dd>{service.tipoVeiculoLabel || '-'}</dd></div>
            <div className="info-row"><dt>Solicitante</dt><dd>{service.solicitanteLabel || '-'}</dd></div>
          </dl>
        </details>

        <div id="cloneDates" tabIndex={-1} className={`clone-dates ${errors.cloneDates ? 'is-invalid' : ''}`} role="group" aria-labelledby="cloneDatesLabel">
          <span className="vehicle-choice__label" id="cloneDatesLabel">Datas do novo pedido</span>
          <div className="mini-calendar">
            <div className="mini-calendar__head">
              <Button variant="ghost" size="compact" className="mini-calendar__nav" aria-label="Semanas anteriores" icon={<Icon name="chevron" />} disabled={state.clone.calendarStart <= weekStart(new Date())} onClick={() => moveCalendar(-35)} />
              <strong>{title}</strong>
              <Button variant="ghost" size="compact" className="mini-calendar__nav mini-calendar__nav--next" aria-label="Próximas semanas" icon={<Icon name="chevron" />} onClick={() => moveCalendar(35)} />
            </div>
            <div className="mini-calendar__grid" aria-hidden="true">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => <span key={index} className="mini-calendar__weekday">{weekday}</span>)}
            </div>
            <div className="mini-calendar__grid">
              {days.map((day) => {
                const key = toDateInputValue(day)
                const selected = draft.dates.includes(key)
                return (
                  <button
                    key={day.getTime()}
                    type="button"
                    className={`mini-calendar__day ${selected ? 'is-selected' : ''} ${key === today ? 'is-today' : ''} ${key === originalKey ? 'is-original' : ''} ${day.getDate() === 1 ? 'is-month-start' : ''}`}
                    aria-pressed={selected}
                    aria-label={`${new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(day)}${key === originalKey ? ', data do pedido original' : ''}`}
                    disabled={key < today}
                    onClick={() => fo.toggleCloneDay(key)}
                  >{day.getDate()}</button>
                )
              })}
            </div>
          </div>
          {errors.cloneDates
            ? <Alert tone="danger">{errors.cloneDates}</Alert>
            : <p className="vehicle-choice__hint" aria-live="polite">{cloneDatesHint(draft.dates)}</p>}
        </div>

        <div className="form-grid form-grid--pair">
          <Field label="Horário" error={errors.cloneTime}>
            <Input id="cloneTime" name="cloneTime" type="time" step={300} value={`${draft.hour}:${draft.minute}`} onChange={(event) => { const [hour, minute] = event.currentTarget.value.split(':'); fo.patchCloneDraft({ hour: hour || '', minute: minute || '' }) }} />
          </Field>
          <Field label="Motorista">
            <Select id="cloneDriver" name="cloneDriver" value={draft.driverId || null} options={driverOptions} onChange={(value) => fo.patchCloneDraft({ driverId: value || '' })} />
          </Field>
        </div>
        <Field label="Obs de operação">
          <Textarea id="cloneObsOperacao" name="cloneObsOperacao" rows={2} value={draft.obsOperacao} onChange={(event) => fo.patchCloneDraft({ obsOperacao: event.currentTarget.value }, false)} />
        </Field>
        <Field label="Observação interna">
          <Textarea id="cloneObsInterna" name="cloneObsInterna" rows={2} value={draft.obsInterna} onChange={(event) => fo.patchCloneDraft({ obsInterna: event.currentTarget.value }, false)} />
        </Field>
      </div>
    </Drawer>
  )
}

/** Auditoria obrigatória para cancelar ou reverter a troca em edição. */
export function LifecycleDrawer({ fo }: { fo: FuncoesOperacionais }) {
  const { state } = fo
  const dialog = state.lifecycleDialog
  if (!dialog) return null
  const close = () => fo.requestClose(!!dialog.reason.trim(), () => fo.update((s) => ({ ...s, lifecycleDialog: null })))
  const cancel = dialog.action === 'cancel'
  return (
    <Drawer
      open
      onClose={close}
      eyebrow="Auditoria obrigatória"
      title={cancel ? 'Cancelar troca' : 'Reverter troca'}
      footer={(
        <>
          <Button variant="secondary" disabled={state.loading} onClick={close}>Voltar</Button>
          <Button variant={cancel ? 'danger' : 'primary'} disabled={state.loading || !dialog.reason.trim()} onClick={() => void fo.runVehicleLifecycle()}>
            {cancel ? 'Confirmar cancelamento' : 'Confirmar reversão'}
          </Button>
        </>
      )}
    >
      <div className="drawer-form">
        <Field label="Motivo" required>
          <Textarea rows={4} maxLength={2000} value={dialog.reason} onChange={(event) => fo.patchLifecycle({ reason: event.currentTarget.value })} placeholder="Descreva a razão operacional e a evidência disponível." />
        </Field>
        {!cancel && (
          <Field label="Data e hora efetivas">
            <Input type="datetime-local" step={60} value={dialog.effectiveAt} onChange={(event) => fo.patchLifecycle({ effectiveAt: event.currentTarget.value })} />
          </Field>
        )}
      </div>
    </Drawer>
  )
}

/** Cadastro rápido de local da base (aberto pelo "Adicionar" do select). */
export function LocationDrawer({ fo }: { fo: FuncoesOperacionais }) {
  const dialog = fo.state.locationDialog
  if (!dialog) return null
  const dirty = !!(dialog.name.trim() || dialog.address.trim() || dialog.mapUrl.trim())
  const close = () => { if (!dialog.saving) fo.requestClose(dirty, () => fo.update((s) => ({ ...s, locationDialog: null }))) }
  return (
    <Drawer
      open
      onClose={close}
      eyebrow="Troca de carro"
      title="Cadastrar local da base"
      footer={(
        <>
          <Button variant="secondary" disabled={dialog.saving} onClick={close}>Voltar</Button>
          <Button variant="primary" type="submit" form="locationForm" icon={<Icon name="check" />} loading={dialog.saving}>{dialog.saving ? 'Salvando...' : 'Cadastrar local'}</Button>
        </>
      )}
    >
      <form className="drawer-form" id="locationForm" onSubmit={(event) => { event.preventDefault(); void fo.submitLocation() }}>
        <Field label="Nome" required error={dialog.error && !dialog.name.trim() ? dialog.error : undefined}>
          <Input id="locationName" maxLength={100} placeholder="Ex.: Garagem Moema" disabled={dialog.saving} value={dialog.name} onChange={(event) => fo.patchLocation({ name: event.currentTarget.value })} />
        </Field>
        <Field label="Endereço (opcional)">
          <Input id="locationAddress" maxLength={250} placeholder="Rua, número, bairro, cidade" disabled={dialog.saving} value={dialog.address} onChange={(event) => fo.patchLocation({ address: event.currentTarget.value })} />
        </Field>
        <Field label="Link do mapa (opcional)">
          <Input id="locationMapUrl" type="url" maxLength={500} placeholder="https://maps.google.com/..." disabled={dialog.saving} value={dialog.mapUrl} onChange={(event) => fo.patchLocation({ mapUrl: event.currentTarget.value })} />
        </Field>
        {dialog.error && dialog.name.trim() && <Alert tone="danger">{dialog.error}</Alert>}
      </form>
    </Drawer>
  )
}

export function DiscardDialog({ fo }: { fo: FuncoesOperacionais }) {
  const cancel = () => fo.update((s) => ({ ...s, discardAction: null }))
  return (
    <Dialog
      open={!!fo.state.discardAction}
      onClose={cancel}
      title="Descartar alterações?"
      actions={(
        <>
          <Button variant="secondary" onClick={cancel}>Continuar editando</Button>
          <Button variant="danger" data-action="discard-confirm" onClick={fo.confirmDiscard}>Descartar</Button>
        </>
      )}
    >
      As mudanças deste formulário ainda não foram salvas e serão perdidas.
    </Dialog>
  )
}
