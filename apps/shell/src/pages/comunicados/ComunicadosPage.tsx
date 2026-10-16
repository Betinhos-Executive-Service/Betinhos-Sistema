import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, ToastProvider, useShellHeader } from '@betinhos/ui'
import { RefreshCw } from 'lucide-react'
import type { Host } from '../../host'
import { useQueryAlvo } from '../../nav/queryState'
import { createSource } from './data/source'
import { emptyDraft, isDisparado, type Comunicado } from './domain/comunicados'
import { useComunicados } from './useComunicados'
import { ComunicadosLista } from './components/ComunicadosLista'
import { ComunicadoEditor } from './components/ComunicadoEditor'
import { ComunicadoRelatorio } from './components/ComunicadoRelatorio'
import './comunicados.css'

export function ComunicadosPage({ host }: { host: Host }) {
  return <ToastProvider><Comunicados host={host} /></ToastProvider>
}

/**
 * Comunicados aos motoristas (antes WebResource `new_gestaocomunicadosmotoristas`): lista, editor de rascunho e
 * relatório de entrega/ciência. A tela aberta fica na URL (`ver=<id>`, `novo=1`).
 */
function Comunicados({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const data = useComunicados(source)
  const [target, setTarget] = useQueryAlvo()
  // Cópia de um comunicado ainda não salva: abre como novo, já preenchido.
  const [seed, setSeed] = useState<Comunicado | null>(null)
  // Cada "novo" (ou cópia) remonta o editor do zero.
  const [createKey, setCreateKey] = useState(0)

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar comunicados" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Comunicados', actions: headerActions })

  const goHome = useCallback(() => { setSeed(null); setTarget(null) }, [setTarget])
  const startNew = useCallback((draft?: Comunicado) => { setSeed(draft ?? null); setCreateKey((n) => n + 1); setTarget({ mode: 'create' }) }, [setTarget])
  const open = useCallback((id: string) => { setSeed(null); setTarget({ mode: 'view', id }) }, [setTarget])

  const selected = target && target.mode !== 'create' ? data.items.find((item) => item.id === target.id) : undefined

  let body
  if (!target) {
    body = <ComunicadosLista data={data} source={source} onNew={() => startNew()} onOpen={open} onRefresh={refresh} />
  } else if (target.mode === 'create') {
    body = <ComunicadoEditor key={`novo-${createKey}`} initial={seed ?? emptyDraft()} motoristas={data.motoristas} source={source} onBack={goHome} onSaved={async (id) => { await data.reload(); open(id) }} onDuplicate={startNew} />
  } else if (!data.loaded) {
    body = data.error
      ? <Alert tone="danger" title="Não foi possível carregar os comunicados" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
      : <div className="surface cm-loading" role="status" aria-label="Carregando comunicado" />
  } else if (!selected) {
    body = <Alert tone="warning" title="Comunicado não encontrado" action={<Button variant="secondary" onClick={goHome}>Voltar para a lista</Button>}>Ele pode ter sido excluído. Atualize a lista para conferir.</Alert>
  } else if (isDisparado(selected)) {
    body = <ComunicadoRelatorio key={selected.id} item={selected} motoristas={data.motoristas} source={source} onBack={goHome} onDuplicate={startNew} />
  } else {
    body = <ComunicadoEditor key={selected.id} initial={selected} motoristas={data.motoristas} source={source} onBack={goHome} onSaved={async (id) => { await data.reload(); open(id) }} onDuplicate={startNew} onDeleted={async () => { goHome(); await data.reload() }} />
  }

  return <div className="page cm-page">{body}</div>
}
