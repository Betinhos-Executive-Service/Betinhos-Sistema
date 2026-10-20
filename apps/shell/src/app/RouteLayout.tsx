import { Suspense, useEffect, useState } from 'react'
import { MonitorOff, PlugZap, SearchX } from 'lucide-react'
import type { Host } from '../host'
import { DEFAULT_ITEM, type MenuGroup, type MenuItem } from '../nav/menu'
import { hrefFor } from '../nav/useHashRoute'
import { EmptyState, buttonClassName } from '@betinhos/ui'
import { Frame } from './Frame'
import { PageLayout } from './PageLayout'
import { LazyPage, PageFallback, RouteErrorBoundary } from './routes'

type Props = { host: Host; group: MenuGroup | null; item: MenuItem | null; label: string }

function EntityFrame({ host, entity, title }: { host: Extract<Host, { mode: 'dataverse' }>; entity: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setSrc(null)
    host.appId().then((appId) => {
      if (cancelled) return
      const params = new URLSearchParams({ pagetype: 'entitylist', etn: entity, navbar: 'off' })
      if (appId) params.set('appid', appId)
      setSrc(`${host.clientUrl}/main.aspx?${params}`)
    })
    return () => { cancelled = true }
  }, [host, entity])
  return src ? <Frame src={src} title={title} /> : <p className="frame__loading" role="status">Carregando {title}…</p>
}

/** Escolhe o layout da rota: moldura para telas legadas, página do shell para os demais estados. */
export function RouteLayout({ host, group, item, label }: Props) {
  if (!item) {
    return (
      <PageLayout title="Tela não encontrada">
        <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Este endereço não corresponde a nenhuma tela" action={<a className={buttonClassName({ variant: 'primary' })} href={hrefFor(DEFAULT_ITEM.id)}>Ir para a Página Inicial</a>}>
          Escolha uma tela no menu.
        </EmptyState>
      </PageLayout>
    )
  }

  if (item.kind === 'unavailable') {
    return (
      <PageLayout eyebrow={group?.label} title={label}>
        <EmptyState className="surface" align="start" icon={<MonitorOff size={36} />} title="Ainda não disponível no Sistema Betinhos">{item.reason}</EmptyState>
      </PageLayout>
    )
  }

  if (item.kind === 'page') {
    // Cada tela é um chunk próprio; enquanto ele chega, o cabeçalho da página já aparece com Skeleton.
    return (
      <RouteErrorBoundary key={item.id} title={label}>
        <Suspense fallback={<PageFallback title={label} />}>
          <LazyPage page={item.page} host={host} agente={item.agente} />
        </Suspense>
      </RouteErrorBoundary>
    )
  }

  if (host.mode === 'mock') {
    const target = item.kind === 'webresource' ? item.resource : item.kind === 'entity' ? item.entity : item.url
    return (
      <PageLayout eyebrow={group?.label} title={label}>
        <EmptyState className="surface" align="start" icon={<PlugZap size={36} />} title="Esta tela abre dentro do Dataverse">
          Fora do ambiente não há dados para mostrar. Publique com <code>pnpm push</code> e abra o Sistema Betinhos no Dataverse para ver <code>{target}</code>.
        </EmptyState>
      </PageLayout>
    )
  }

  // `host=shell`: a tela legada sabe que está dentro do shell e recolhe a própria barra lateral e o rodapé de versão.
  if (item.kind === 'webresource') return <Frame src={`${host.clientUrl}/WebResources/${item.resource}${item.resource.includes('?') ? '&' : '?'}host=shell`} title={label} />
  if (item.kind === 'entity') return <EntityFrame host={host} entity={item.entity} title={label} />
  return null
}
