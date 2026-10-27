// Porte de Tela Planner/src/plannerUrl.js (sem mudança de comportamento).
const DEFAULT_VIEW = 'board'
const VALID_VIEWS = new Set([
  'dashboard',
  'team',
  'management',
  'ideas',
  'contacts',
  'quotes',
  'board',
  'list',
  'calendar',
  'more',
  'quality',
  'settings',
])

export interface PlannerUrlState {
  view: string
  taskId: string
  contactId: string
  quoteId: string
}

interface NavigableWindow {
  parent?: NavigableWindow | null
  location: { search: string }
}

function readDataParams(search = '') {
  const params = new URLSearchParams(search)
  const data = new URLSearchParams((params.get('data') || '').replace(/^\?/, ''))
  return { params, data }
}

export function plannerNavigationWindow<W extends NavigableWindow>(sourceWindow: W): W {
  let current: NavigableWindow | null | undefined = sourceWindow
  let target: W = sourceWindow

  while (current?.parent && current.parent !== current) {
    try {
      current = current.parent
      const params = new URLSearchParams(current.location.search)
      if (params.get('pagetype') === 'webresource' && params.get('webresourceName')) target = current as W
    } catch {
      break
    }
  }

  return target
}

export function readPlannerUrlState(search = ''): PlannerUrlState {
  const { params, data } = readDataParams(search)
  const taskId = params.get('taskId') || data.get('taskId') || ''
  const contactId = taskId ? '' : params.get('contactId') || data.get('contactId') || ''
  const quoteId = taskId || contactId ? '' : params.get('quoteId') || data.get('quoteId') || ''
  const requestedView = params.get('view') || data.get('view') || (contactId ? 'contacts' : quoteId ? 'quotes' : DEFAULT_VIEW)
  return {
    view: VALID_VIEWS.has(requestedView) ? requestedView : DEFAULT_VIEW,
    taskId,
    contactId,
    quoteId,
  }
}

export function plannerUrlForState(
  location: { search: string; pathname: string; hash?: string },
  { view = DEFAULT_VIEW, taskId = '', contactId = '', quoteId = '' }: Partial<PlannerUrlState>,
): string {
  const { params, data } = readDataParams(location.search)

  if (view && view !== DEFAULT_VIEW) data.set('view', view)
  else data.delete('view')

  const recordId = taskId || contactId || quoteId
  data.delete('taskId')
  data.delete('contactId')
  data.delete('quoteId')
  if (taskId) data.set('taskId', taskId)
  else if (contactId) data.set('contactId', contactId)
  else if (quoteId) data.set('quoteId', quoteId)

  if (recordId) {
    data.delete('source')
    data.delete('sourceId')
    data.delete('mode')
  }

  params.delete('view')
  params.delete('taskId')
  params.delete('contactId')
  params.delete('quoteId')
  const serializedData = data.toString()
  if (serializedData) params.set('data', serializedData)
  else params.delete('data')

  const query = params.toString()
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`
}
