import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { BuildBadge } from '@betinhos/ui'
import { AppShell } from './app/AppShell'
import { AuditoriaProvider } from './app/auditoria/AuditoriaProvider'
import { useDocumentosBadge } from './app/useDocumentosBadge'
import { RouteLayout } from './app/RouteLayout'
import { usePrefetchOnIntent } from './app/routes'
import { iniciarCapturaDeErros } from './app/erros'
import { createHost } from './host'
import { DEFAULT_ITEM, ENTITY_NAMES, findItem, itemLabel, rotaAtualizada } from './nav/menu'
import { hrefFor, parseHash, useHashQuery, useHashRoute } from './nav/useHashRoute'

type LabelsState = { labels: Map<string, string>; error: string | null }

export function App() {
  const host = useMemo(createHost, [])
  const docsUrgentes = useDocumentosBadge(host)
  const badges = useMemo(() => (docsUrgentes ? { documentos: docsUrgentes } : undefined), [docsUrgentes])
  const route = useHashRoute()
  const query = useHashQuery()
  usePrefetchOnIntent()
  // Rotas que viraram outra (abas antigas da Frota, Infrações) trocam o hash sem criar entrada no histórico.
  useLayoutEffect(() => {
    const atual = parseHash(location.hash)
    const nova = rotaAtualizada(atual.id, atual.query)
    if (!nova) return
    history.replaceState(history.state, '', hrefFor(nova.id, nova.query))
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }, [route, query])
  const activeId = route || DEFAULT_ITEM.id
  const found = findItem(activeId)
  const [{ labels, error }, setLabels] = useState<LabelsState>({ labels: new Map(), error: null })

  // Erros não tratados do app vão para cr40f_errodosistema, onde o plantão os encontra.
  useEffect(() => (host.mode === 'dataverse' ? iniciarCapturaDeErros(host.client) : undefined), [host])

  // Rótulos das tabelas vêm da metadata real; em falha o menu mostra o nome lógico e o rodapé avisa.
  useEffect(() => {
    if (host.mode !== 'dataverse') return
    let cancelled = false
    host.metadata.entities(ENTITY_NAMES)
      .then((entities) => { if (!cancelled) setLabels({ labels: new Map([...entities].map(([name, info]) => [name, info.label])), error: null }) })
      .catch((reason: unknown) => { if (!cancelled) setLabels({ labels: new Map(), error: reason instanceof Error ? reason.message : String(reason) }) })
    return () => { cancelled = true }
  }, [host])

  const label = found ? itemLabel(found.item, labels) : 'Tela não encontrada'
  useEffect(() => { document.title = `${label} · Sistema Betinhos` }, [label])

  const connection = host.mode === 'mock'
    ? { ok: false, text: 'Fora do Dataverse (dados de exemplo nas telas migradas)' }
    : error
      ? { ok: false, text: 'Dataverse sem resposta. Recarregue a página.' }
      : { ok: true, text: 'Conectado ao Dataverse' }

  return (
    <>
      <AuditoriaProvider host={host}>
        <AppShell activeId={activeId} title={label} entityLabels={labels} connection={connection} badges={badges} defaultCollapsed={found?.item.kind === 'page' && found.item.page === 'geral'}>
          <RouteLayout host={host} group={found?.group ?? null} item={found?.item ?? null} label={label} />
        </AppShell>
      </AuditoriaProvider>
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </>
  )
}
