import { Component, lazy, useEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, EmptyState, PageHeader, Skeleton, Stack } from '@betinhos/ui'
import type { Host } from '../host'
import { findItem, type MenuItem } from '../nav/menu'
import { logAppError } from '@betinhos/ui/error-logger'
import { isChunkLoadError, reportarErro } from './erros'

type PageId = Extract<MenuItem, { kind: 'page' }>['page']
type Agente = NonNullable<Extract<MenuItem, { kind: 'page' }>['agente']>
type PageProps = { host: Host; agente?: Agente }

/**
 * Um chunk por tela: só a rota aberta é baixada e avaliada na carga (Recharts fica no chunk do Dashboard).
 * Mutável só para os testes trocarem o carregador de uma tela.
 */
export const PAGE_LOADERS: Record<PageId, () => Promise<ComponentType<PageProps>>> = {
  operacional: () => import('../pages/operacional/OperacionalPage').then((m) => m.OperacionalPage),
  frota: () => import('../pages/frota/FrotaPage').then((m) => m.FrotaPage),
  funcionarios: () => import('../pages/funcionarios/FuncionariosPage').then((m) => m.FuncionariosPage),
  curriculos: () => import('../pages/curriculos/CurriculosPage').then((m) => m.CurriculosPage),
  pagantes: () => import('../pages/pagantes/PagantesPage').then((m) => m.PagantesPage),
  ops: () => import('../pages/ops/OpsPage').then((m) => m.OpsPage),
  pendencias: () => import('../pages/pendencias/PendenciasPage').then((m) => m.PendenciasPage),
  pessoas: () => import('../pages/pessoas/PessoasPage').then((m) => m.PessoasPage),
  geral: () => import('../pages/geral/GeralPage').then((m) => m.GeralPage),
  dashboard: () => import('../pages/dashboard/DashboardPage').then((m) => m.DashboardPage),
  infracoes: () => import('../pages/infracoes/InfracoesPage').then((m) => m.InfracoesPage),
  despesas: () => import('../pages/despesas/DespesasPage').then((m) => m.DespesasPage),
  documentos: () => import('../pages/documentos/DocumentosPage').then((m) => m.DocumentosPage),
  equipamentos: () => import('../pages/equipamentos/EquipamentosPage').then((m) => m.EquipamentosPage),
  comunicados: () => import('../pages/comunicados/ComunicadosPage').then((m) => m.ComunicadosPage),
  agentes: () => import('../pages/agentes/AgentesPage').then((m) => m.AgentesPage),
}

const pending = new Map<PageId, Promise<ComponentType<PageProps>>>()

/** Baixa o chunk da tela uma vez (prefetch e render compartilham a promessa); falha sai do cache para tentar de novo. */
function fetchPage(page: PageId) {
  let promise = pending.get(page)
  if (!promise) {
    promise = PAGE_LOADERS[page]().catch((error: unknown) => { pending.delete(page); throw error })
    pending.set(page, promise)
  }
  return promise
}

export { isChunkLoadError }

/** Indireção para os testes observarem o reload. */
export const navegador = { recarregar: () => { window.location.reload() } }

const RELOAD_KEY = `bt-chunk-reload:${__APP_VERSION__}`

/**
 * Chunk ausente quase sempre é aba antiga depois de uma publicação nova (os nomes têm hash).
 * Recarrega uma única vez por build nesta sessão; se o build novo também falhar, o erro fica na tela.
 */
function reloadOncePerBuild() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === '1') return false
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch { return false /* sem storage: não arrisca recarregar em laço */ }
  navegador.recarregar()
  return true
}

/** Prefetch pela rota do menu (`#/<id>`): só telas React; falha nunca recarrega, só avisa no console. */
export function prefetchRoute(id: string) {
  const found = findItem(id)
  if (found?.item.kind !== 'page') return
  fetchPage(found.item.page).catch((error: unknown) => { console.warn(`Prefetch da tela ${id} falhou`, error) })
}

/**
 * Intenção de navegar (mouse em cima, foco ou toque num link `#/…` do menu) já baixa o chunk da tela,
 * então o clique quase sempre encontra o código pronto. Sem prefetch em lote no idle: no 4G dos
 * motoristas isso gastaria dados com telas que eles não abrem.
 */
export function usePrefetchOnIntent() {
  useEffect(() => {
    const onIntent = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#/"]') : null
      const id = link?.getAttribute('href')?.slice(2).split('?')[0]
      if (id) prefetchRoute(decodeURIComponent(id))
    }
    const events = ['pointerover', 'focusin', 'touchstart'] as const
    events.forEach((name) => document.addEventListener(name, onIntent, { passive: true }))
    return () => events.forEach((name) => document.removeEventListener(name, onIntent))
  }, [])
}

const lazies = new Map<PageId, LazyExoticComponent<ComponentType<PageProps>>>()
const lazyFor = (page: PageId) => {
  let component = lazies.get(page)
  if (!component) {
    component = lazy(() => fetchPage(page).then(
      (loaded) => ({ default: loaded }),
      (error: unknown) => {
        // Lazy rejeitado fica rejeitado para sempre: sai do cache para a próxima visita à rota tentar de novo.
        lazies.delete(page)
        // Recarregando: segura o Suspense no fallback em vez de piscar o erro antes do reload.
        if (isChunkLoadError(error) && reloadOncePerBuild()) return new Promise<never>(() => {})
        throw error
      },
    ))
    lazies.set(page, component)
  }
  return component
}

export function LazyPage({ page, host, agente }: { page: PageId; host: Host; agente?: Agente }) {
  const Page = lazyFor(page)
  return <Page host={host} agente={agente} />
}

/**
 * Moldura das telas enquanto carregam ou quando falham: o mesmo `.page` e o `PageHeader` (com a altura mínima
 * reservada pelo DS), sem adivinhar eyebrow/descrição que a tela real pode não ter.
 */
function RouteFrame({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <PageHeader className="page__header" title={title} />
      <Stack gap="4">{children}</Stack>
    </div>
  )
}

/** Fallback do Suspense: cabeçalho neutro (título em Skeleton) e o corpo em Skeleton. */
export function PageFallback({ title }: { title: string }) {
  return (
    <RouteFrame title={<Skeleton width={220} height={32} />}>
      <div className="surface" role="status" aria-label={`Carregando ${title}`}>
        <Stack gap="3">
          <Skeleton width="40%" height={20} />
          <Skeleton shape="rect" height={96} />
          <Skeleton shape="rect" height={96} />
        </Stack>
      </div>
    </RouteFrame>
  )
}

type BoundaryProps = { title: string; children: ReactNode }

/** Erro ao carregar ou renderizar a tela fica contido nela; o menu continua funcionando. */
export class RouteErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) {
    reportarErro(error, `tela ${this.props.title}`)
    void logAppError(error, { action: 'renderizar-tela', phase: 'render', component: 'RouteErrorBoundary', screen: this.props.title })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <RouteFrame title={this.props.title}>
        <EmptyState className="surface" align="start" icon={<AlertTriangle size={36} />} title="Não foi possível abrir esta tela" action={<Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => navegador.recarregar()}>Recarregar</Button>}>
          {this.state.error.message}
        </EmptyState>
      </RouteFrame>
    )
  }
}
