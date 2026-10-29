import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Button, Spinner, Tabs, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { patchHashQuery, useHashQuery } from '../../nav/useHashRoute'
import { createSource } from './data/source'
import { userErrorMessage } from './domain/payloads'
import { parseRoute, routeIsCanonical, routePatch } from './domain/routes'
import type { ViewName } from './domain/types'
import { useFuncoesOperacionais, type Notify } from './useFuncoesOperacionais'
import { CarroTab } from './components/CarroTab'
import { CloneDrawer, DiscardDialog, LifecycleDrawer, LocationDrawer, ServiceDetailDrawer } from './components/Drawers'
import { Icon } from './components/Icon'
import { MotoristaTab, PedidoTab } from './components/ServiceLists'
import './funcoes-operacionais.css'

/** Funções Operacionais: trocar motorista, duplicar pedido e trocas de carro (antigo WebResource new_telafuncoesoperacionais). */
export function FuncoesOperacionaisPage({ host }: { host: Host }) {
  return <ToastProvider><FuncoesOperacionais host={host} /></ToastProvider>
}

const TABS = [
  { value: 'driver' as const, label: 'Motorista', icon: <Icon name="users" /> },
  { value: 'clone' as const, label: 'Pedido', icon: <Icon name="copy" /> },
  { value: 'vehicle' as const, label: 'Carro', icon: <Icon name="swap" /> },
]

function FuncoesOperacionais({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const query = useHashQuery()
  const route = useMemo(() => parseRoute(query), [query])
  const view: ViewName = route.view ?? 'driver'

  // Links antigos (view=, mode=edit&id=, data=) viram aba=/troca= sem criar entrada no histórico.
  useEffect(() => {
    if (!routeIsCanonical(query, view, route.editId)) patchHashQuery(routePatch(view, route.editId))
  }, [query, view, route.editId])

  const navigate = useCallback((next: ViewName, editId = '') => patchHashQuery(routePatch(next, editId)), [])

  // Toast com título e ação opcional ("Desfazer", "Abrir pedido"): somem em 3,6 s (6 s com ação); danger fica até fechar.
  const notify = useCallback<Notify>((title, message, tone = 'info', action) => {
    let used = false
    toast({
      tone,
      duration: tone === 'danger' ? 0 : action ? 6000 : 3600,
      message: (
        <span className="fo-toast">
          <strong>{title}</strong> {message}
          {action && <Button variant="ghost" size="compact" className="toast-action" onClick={() => { if (!used) { used = true; action.run() } }}>{action.label}</Button>}
        </span>
      ),
    })
  }, [toast])

  const fo = useFuncoesOperacionais({ source, notify, view, routeEditId: route.editId, navigate })
  const { state } = fo

  // Erros inesperados também aparecem para o usuário (o registro no log é do logger global do shell).
  const notifyRef = useRef(notify)
  notifyRef.current = notify
  useEffect(() => {
    const onError = (event: ErrorEvent) => notifyRef.current('Erro inesperado', userErrorMessage(event.error || event.message, 'Ocorreu um erro inesperado.'), 'danger')
    const onRejection = (event: PromiseRejectionEvent) => notifyRef.current('Erro inesperado', userErrorMessage(event.reason, 'Uma operação falhou sem resposta do sistema.'), 'danger')
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const editing = !!state.vehicle.editId
  const title = view === 'driver' ? 'Trocar Motorista' : view === 'clone' ? 'Duplicar pedido' : editing ? 'Editar troca de carro' : 'Trocar carro'
  const refreshBusy = state.refreshBusy
  const refreshNow = fo.refreshNow
  const refreshButton = useMemo(() => (
    <Button variant="secondary" icon={<Icon name="refresh" />} loading={refreshBusy} aria-label={refreshBusy ? 'Atualizando dados' : 'Atualizar dados'} data-action="refresh-data" onClick={() => void refreshNow('button')}>
      {refreshBusy ? 'Atualizando' : 'Atualizar'}
    </Button>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [refreshBusy])
  useShellHeader({ title, actions: refreshButton })

  return (
    <div className="fo-page">
      <PageLayout
        eyebrow="Operação"
        title={title}
        meta={view === 'vehicle' ? (editing ? 'Edição' : 'Novo agendamento') : undefined}
        actions={refreshButton}
        tabs={<Tabs tabs={TABS} value={view} onChange={fo.switchView} aria-label="Funções operacionais" />}
      >
        <div className={`fo-content content--${view} content--motion-${state.transitionKind || 'local'}`}>
          {view === 'driver' ? <MotoristaTab fo={fo} /> : view === 'clone' ? <PedidoTab fo={fo} /> : <CarroTab fo={fo} />}
        </div>
      </PageLayout>

      <LifecycleDrawer fo={fo} />
      <LocationDrawer fo={fo} />
      <ServiceDetailDrawer fo={fo} view={view} />
      <CloneDrawer fo={fo} />
      <DiscardDialog fo={fo} />

      {state.loading && state.firstLoadDone && (
        <div className="loading-overlay">
          <div className="loading-card"><Spinner label={state.loadingMessage || 'Carregando...'} size={24} /><p aria-hidden="true">{state.loadingMessage || 'Carregando...'}</p></div>
        </div>
      )}
    </div>
  )
}
