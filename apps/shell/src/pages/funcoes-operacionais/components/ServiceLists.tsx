import { Button, EmptyState, Field, Input, PageToolbar, SearchBox } from '@betinhos/ui'
import { PAGE_SIZE, dayLabel, startsNewDay } from '../domain/forms'
import { passengerLinksByService } from '../domain/logic'
import { formatDate } from '../domain/utils'
import type { FuncoesOperacionais } from '../useFuncoesOperacionais'
import { Icon } from './Icon'
import { ListHead, LoadMoreSentinel, SkeletonList } from './ListParts'
import { ServiceCard } from './ServiceCard'

const plural = (n: number) => `${n} ${n === 1 ? 'serviço' : 'serviços'}`

/** Contador da aba Motorista ("N serviço(s)" e, com o chip ativo, " sem motorista"). */
export function driverCount(fo: FuncoesOperacionais) {
  return `${plural(fo.driverList.length)}${fo.state.driver.onlyMissing ? ' sem motorista' : ''}`
}

/** Aba Motorista: trocar ou definir o motorista dos serviços a partir de uma data. */
export function MotoristaTab({ fo }: { fo: FuncoesOperacionais }) {
  const { state, update, today } = fo
  const visible = fo.driverList.slice(0, state.driver.visible)
  const hasMore = state.driver.visible < fo.driverList.length
  const count = driverCount(fo)
  const setDriver = (patch: Partial<typeof state.driver>) => update((s) => ({ ...s, driver: { ...s.driver, ...patch } }))
  const filterLabel = state.driver.startDate === today ? 'A partir de hoje' : `A partir de ${formatDate(state.driver.startDate)}`

  return (
    <>
      <PageToolbar
        className="list-toolbar"
        label="Filtros de serviços"
        start={(
          <>
            <SearchBox id="driverSearch" name="driverSearch" className="list-toolbar__search" value={state.driver.query} placeholder="ID, PAX, trajeto ou motorista" aria-label="Buscar serviço" onChange={(value) => setDriver({ query: value, visible: PAGE_SIZE })} />
            <Button
              variant="secondary"
              className={`driver-filter-toggle ${state.driver.filterOpen ? 'is-open' : ''}`}
              icon={<Icon name="calendar" />}
              iconEnd={<Icon name="chevron" className="driver-filter-toggle__chevron" />}
              aria-expanded={state.driver.filterOpen}
              aria-controls="driverFilterPanel"
              onClick={() => setDriver({ filterOpen: !state.driver.filterOpen })}
            >{filterLabel}</Button>
          </>
        )}
        end={state.firstLoadDone && (fo.driverMissingCount > 0 || state.driver.onlyMissing) ? (
          <Button variant={state.driver.onlyMissing ? 'primary' : 'secondary'} className="filter-chip" icon={<Icon name="alert" />} aria-pressed={state.driver.onlyMissing} onClick={() => setDriver({ onlyMissing: !state.driver.onlyMissing, visible: PAGE_SIZE })}>
            Sem motorista <span className="filter-chip__count">{fo.driverMissingCount}</span>
          </Button>
        ) : undefined}
      />
      {state.driver.filterOpen && (
        <div id="driverFilterPanel" className="driver-filter-panel">
          <Field label="A partir de" hint={count}>
            <Input id="driverStartDate" name="driverStartDate" type="date" value={state.driver.startDate} onChange={(event) => setDriver({ startDate: event.currentTarget.value, visible: PAGE_SIZE })} />
          </Field>
        </div>
      )}
      {state.firstLoadDone && <p className="list-count" aria-live="polite">{count}</p>}
      <section className="stack-list">
        {state.firstLoadDone && visible.length > 0 && <ListHead />}
        {visible.length ? visible.map((service, index) => [
          startsNewDay(visible, index) && <h3 key={`day-${service.id}`} className="day-divider">{dayLabel(service.dataSaida)}</h3>,
          <ServiceCard
            key={service.id}
            service={service}
            passengerLinks={passengerLinksByService(state, service.id)}
            drivers={state.data.drivers}
            itemIndex={index}
            active={state.driver.activeServiceId === service.id}
            busy={!!state.driverBusy[service.id]}
            error={state.driverErrors[service.id] || ''}
            feedback={!!state.driverFeedback[service.id]}
            onCardOpen={(id) => update((s) => ({ ...s, serviceDetailId: id }))}
            onDriverOpen={(id) => update((s) => ({ ...s, driver: { ...s.driver, activeServiceId: id }, driverErrors: { ...s.driverErrors, [id]: '' } }))}
            onDriverClose={() => setDriver({ activeServiceId: '' })}
            onDriverConfirm={fo.submitDriverChange}
            requestClose={fo.requestClose}
          />,
        ]) : !state.firstLoadDone ? (
          <SkeletonList />
        ) : (
          <EmptyState icon={<Icon name="search" />} title="Nada para ajustar">Nenhum serviço encontrado a partir do filtro selecionado. Ajuste a data ou a busca.</EmptyState>
        )}
        {hasMore && <LoadMoreSentinel label="Carregando mais serviços" text="Carregando mais serviços..." onVisible={() => update((s) => ({ ...s, driver: { ...s.driver, visible: Math.min(s.driver.visible + PAGE_SIZE, fo.driverList.length) } }))} />}
      </section>
    </>
  )
}

/** Aba Pedido: escolher o serviço a duplicar (todos os carregados, filtrados pela busca). */
export function PedidoTab({ fo }: { fo: FuncoesOperacionais }) {
  const { state, update } = fo
  const visible = fo.cloneList.slice(0, state.clone.visible)
  const hasMore = state.clone.visible < fo.cloneList.length
  return (
    <>
      <PageToolbar
        className="list-toolbar"
        label="Filtros de pedidos"
        start={<SearchBox id="cloneSearch" name="cloneSearch" className="list-toolbar__search" value={state.clone.query} placeholder="ID, PAX, cliente ou trajeto" aria-label="Buscar pedido" onChange={(value) => update((s) => ({ ...s, clone: { ...s.clone, query: value, visible: PAGE_SIZE } }))} />}
      />
      {state.firstLoadDone && <p className="list-count" aria-live="polite">{plural(fo.cloneList.length)}</p>}
      <section className="stack-list">
        {state.firstLoadDone && visible.length > 0 && <ListHead />}
        {visible.length ? visible.map((service, index) => [
          startsNewDay(visible, index) && <h3 key={`day-${service.id}`} className="day-divider">{dayLabel(service.dataSaida)}</h3>,
          <ServiceCard key={service.id} mode="clone" service={service} passengerLinks={passengerLinksByService(state, service.id)} itemIndex={index} highlighted={state.clone.highlightedServiceId === service.id} onCardOpen={(id) => update((s) => ({ ...s, serviceDetailId: id }))} onCloneOpen={fo.openClone} />,
        ]) : !state.firstLoadDone ? (
          <SkeletonList />
        ) : (
          <EmptyState icon={<Icon name="search" />} title="Sem resultados">A busca não retornou nenhum pedido dentro da janela carregada.</EmptyState>
        )}
        {hasMore && <LoadMoreSentinel label="Carregando mais pedidos" text="Carregando mais pedidos..." onVisible={() => update((s) => ({ ...s, clone: { ...s.clone, visible: Math.min(s.clone.visible + PAGE_SIZE, fo.cloneList.length) } }))} />}
      </section>
    </>
  )
}
