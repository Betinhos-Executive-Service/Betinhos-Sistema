import { useEffect, useState } from 'react'
import { MonitorOff, PlugZap, SearchX } from 'lucide-react'
import type { Host } from '../host'
import { DEFAULT_ITEM, type MenuGroup, type MenuItem } from '../nav/menu'
import { hrefFor } from '../nav/useHashRoute'
import { ComponentsPage } from '../pages/ComponentsPage'
import { OperacionalPage } from '../pages/operacional/OperacionalPage'
import { FrotaPage } from '../pages/frota/FrotaPage'
import { FuncionariosPage } from '../pages/funcionarios/FuncionariosPage'
import { CurriculosPage } from '../pages/curriculos/CurriculosPage'
import { PagantesPage } from '../pages/pagantes/PagantesPage'
import { PessoasPage } from '../pages/pessoas/PessoasPage'
import { InfracoesPage } from '../pages/infracoes/InfracoesPage'
import { EmptyState, buttonClassName } from '@betinhos/ui'
import { PageLayout } from './PageLayout'

type Props = { host: Host; group: MenuGroup | null; item: MenuItem | null; label: string }

/** Tela legada (WebResource ou lista nativa) ocupando toda a área, sem cabeçalho duplicado. */
function Frame({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => setLoaded(false), [src])
  return (
    <div className="frame" aria-busy={!loaded}>
      {loaded ? null : <p className="frame__loading" role="status">Carregando {title}…</p>}
      <iframe key={src} className="frame__iframe" src={src} title={title} onLoad={() => setLoaded(true)} />
    </div>
  )
}

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
    if (item.page === 'operacional') return <OperacionalPage host={host} />
    if (item.page === 'frota') return <FrotaPage host={host} />
    if (item.page === 'funcionarios') return <FuncionariosPage host={host} />
    if (item.page === 'curriculos') return <CurriculosPage host={host} />
    if (item.page === 'pagantes') return <PagantesPage host={host} />
    if (item.page === 'pessoas') return <PessoasPage host={host} />
    if (item.page === 'infracoes') return <InfracoesPage host={host} />
    return <ComponentsPage />
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

  if (item.kind === 'webresource') return <Frame src={`${host.clientUrl}/WebResources/${item.resource}`} title={label} />
  if (item.kind === 'entity') return <EntityFrame host={host} entity={item.entity} title={label} />
  return null
}
