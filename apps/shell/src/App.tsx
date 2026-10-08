import { useEffect, useMemo, useState } from 'react'
import { BuildBadge } from '@betinhos/ui'
import { AppShell } from './app/AppShell'
import { RouteLayout } from './app/RouteLayout'
import { createHost } from './host'
import { DEFAULT_ITEM, ENTITY_NAMES, findItem, itemLabel } from './nav/menu'
import { useHashRoute } from './nav/useHashRoute'

type LabelsState = { labels: Map<string, string>; error: string | null }

export function App() {
  const host = useMemo(createHost, [])
  const route = useHashRoute()
  const activeId = route || DEFAULT_ITEM.id
  const found = findItem(activeId)
  const [{ labels, error }, setLabels] = useState<LabelsState>({ labels: new Map(), error: null })

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
      <AppShell activeId={activeId} title={label} entityLabels={labels} connection={connection} defaultCollapsed={found?.item.kind === 'page' && found.item.page === 'geral'}>
        <RouteLayout host={host} group={found?.group ?? null} item={found?.item ?? null} label={label} />
      </AppShell>
      <BuildBadge version={__APP_VERSION__} isoDate={__BUILD_DATE__} />
    </>
  )
}
