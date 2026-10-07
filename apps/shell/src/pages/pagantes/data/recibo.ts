/**
 * Reaproveita o gerador de recibo do model-driven (WebResource `cr40f_GerarRecibo`):
 * o script monta o PDF, mostra a própria galeria e entrega pelo Flow `new_FlowUrlGerarRecibo`.
 * Aqui só carregamos o script e simulamos a grade com os pagantes escolhidos.
 */
type GridRow = { getData: () => { getEntity: () => { getId: () => string; getEntityName: () => string } } }
type FakeControl = {
  getGrid: () => { getSelectedRows: () => { getLength: () => number; forEach: (fn: (row: GridRow) => void) => void } }
  refresh: () => void
}

declare global { interface Window { GerarRecibo?: (control: FakeControl) => void } }

export const RECIBO_RESOURCE = 'cr40f_GerarRecibo'

export function fakeGridControl(entityName: string, ids: string[], onRefresh: () => void): FakeControl {
  const rows: GridRow[] = ids.map((id) => ({ getData: () => ({ getEntity: () => ({ getId: () => `{${id}}`, getEntityName: () => entityName }) }) }))
  return {
    getGrid: () => ({ getSelectedRows: () => ({ getLength: () => rows.length, forEach: (fn) => rows.forEach(fn) }) }),
    refresh: onRefresh,
  }
}

let loading: Promise<void> | null = null

function loadScript(clientUrl: string) {
  if (window.GerarRecibo) return Promise.resolve()
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${clientUrl}/WebResources/${RECIBO_RESOURCE}`
    script.async = true
    script.onload = () => (window.GerarRecibo ? resolve() : reject(new Error('O gerador de recibo foi carregado, mas não iniciou.')))
    script.onerror = () => reject(new Error('Não foi possível carregar o gerador de recibo do Dataverse.'))
    document.head.append(script)
  }).catch((error) => { loading = null; throw error }))
}

export async function abrirGeradorDeRecibo(clientUrl: string, entityName: string, ids: string[], onRefresh: () => void) {
  await loadScript(clientUrl)
  window.GerarRecibo!(fakeGridControl(entityName, ids, onRefresh))
}
