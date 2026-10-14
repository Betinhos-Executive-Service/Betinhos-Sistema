import { Component, lazy, useEffect, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, EmptyState, Skeleton, Stack } from '@betinhos/ui'
import type { Host } from '../host'
import { findItem, type MenuItem } from '../nav/menu'
import { PageLayout } from './PageLayout'

type PageId = Extract<MenuItem, { kind: 'page' }>['page']
type PageProps = { host: Host }

/** Um chunk por tela: só a rota aberta é baixada e avaliada na carga (Recharts fica no chunk do Dashboard). */
const LOADERS: Record<PageId, () => Promise<ComponentType<PageProps>>> = {
  operacional: () => import('../pages/operacional/OperacionalPage').then((m) => m.OperacionalPage),
  frota: () => import('../pages/frota/FrotaPage').then((m) => m.FrotaPage),
  funcionarios: () => import('../pages/funcionarios/FuncionariosPage').then((m) => m.FuncionariosPage),
  curriculos: () => import('../pages/curriculos/CurriculosPage').then((m) => m.CurriculosPage),
  pagantes: () => import('../pages/pagantes/PagantesPage').then((m) => m.PagantesPage),
  ops: () => import('../pages/ops/OpsPage').then((m) => m.OpsPage),
  pessoas: () => import('../pages/pessoas/PessoasPage').then((m) => m.PessoasPage),
  dashboard: () => import('../pages/dashboard/DashboardPage').then((m) => m.DashboardPage),
  infracoes: () => import('../pages/infracoes/InfracoesPage').then((m) => m.InfracoesPage),
  despesas: () => import('../pages/despesas/DespesasPage').then((m) => m.DespesasPage),
  documentos: () => import('../pages/documentos/DocumentosPage').then((m) => m.DocumentosPage),
  componentes: () => import('../pages/ComponentsPage').then((m) => m.ComponentsPage),
}

const RELOAD_KEY = 'bt-chunk-reload'
const pending = new Map<PageId, Promise<ComponentType<PageProps>>>()

/**
 * Baixa o chunk da tela uma única vez (prefetch e render compartilham a promessa).
 * Falha de rede some do cache para tentar de novo; chunk inexistente após uma publicação nova
 * (aba antiga com nomes de arquivo antigos) recarrega a página uma vez para pegar o build atual.
 */
export function loadPage(page: PageId) {
  let promise = pending.get(page)
  if (!promise) {
    promise = LOADERS[page]()
      .then((component) => { try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* sem storage */ } return component })
      .catch((error: unknown) => {
        pending.delete(page)
        let reloaded = true
        try { reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'; if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1') } catch { /* sem storage: não recarrega em laço */ }
        if (!reloaded) location.reload()
        throw error
      })
    pending.set(page, promise)
  }
  return promise
}

/** Prefetch pela rota do menu (`#/<id>`): só itens que são telas React. */
export function prefetchRoute(id: string) {
  const found = findItem(id)
  if (found?.item.kind === 'page') void loadPage(found.item.page).catch(() => undefined)
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
  if (!component) lazies.set(page, (component = lazy(() => loadPage(page).then((loaded) => ({ default: loaded })))))
  return component
}

export function LazyPage({ page, host }: { page: PageId; host: Host }) {
  const Page = lazyFor(page)
  return <Page host={host} />
}

/** Fallback do Suspense: o mesmo PageLayout das telas com Skeleton, para o cabeçalho não pular quando o chunk chega. */
export function PageFallback({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <PageLayout eyebrow={eyebrow} title={title}>
      <div className="surface" role="status" aria-label={`Carregando ${title}`}>
        <Stack gap="3">
          <Skeleton width="40%" height={20} />
          <Skeleton shape="rect" height={96} />
          <Skeleton shape="rect" height={96} />
        </Stack>
      </div>
    </PageLayout>
  )
}

type BoundaryProps = { title: string; children: ReactNode }

/** Erro ao carregar ou renderizar a tela fica contido nela; o menu continua funcionando. */
export class RouteErrorBoundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <PageLayout title={this.props.title}>
        <EmptyState className="surface" align="start" icon={<AlertTriangle size={36} />} title="Não foi possível abrir esta tela" action={<Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => location.reload()}>Recarregar</Button>}>
          {this.state.error.message}
        </EmptyState>
      </PageLayout>
    )
  }
}
