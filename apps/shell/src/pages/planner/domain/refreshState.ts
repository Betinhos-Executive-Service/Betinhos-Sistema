// Porte de Tela Planner/src/refreshState.js (sem mudança de comportamento).
type Data = Record<string, unknown>

interface LoadedTask { id?: unknown; detailsLoaded?: unknown; [key: string]: unknown }

function omitCoreOwnedData(source: Data = {}): Data {
  const {
    notifications: _notifications,
    quotes: _quotes,
    quality: _quality,
    ...rest
  } = source
  return rest
}

function omitSupplementalUnrelatedData(source: Data = {}): Data {
  const { notifications: _notifications, tasks: _tasks, ...rest } = source
  return rest
}

function preserveLoadedTaskDetails(tasks: LoadedTask[] = [], currentTasks: LoadedTask[] = []): LoadedTask[] {
  const currentById = new Map(currentTasks.map((task) => [task.id, task]))
  return tasks.map((task) => {
    const current = currentById.get(task.id)
    if (!current?.detailsLoaded) return task
    const details: Data = { detailsLoaded: true }
    for (const key of ['comments', 'returns', 'history', 'attachments', 'detailsError']) {
      if (current[key] !== undefined) details[key] = current[key]
    }
    return {
      ...task,
      ...details,
    }
  })
}

interface Settled { status: string; value?: unknown; reason?: unknown }

export interface BackgroundRefreshResults {
  supplemental?: Settled
  photos?: Settled
  contacts?: Settled
}

interface LoadingFlags { core?: unknown; [key: string]: unknown }

export function buildBackgroundRefreshPatch(
  current: { loading?: LoadingFlags; tasks?: LoadedTask[]; [key: string]: unknown } = {},
  core: Data = {},
  results: BackgroundRefreshResults = {},
): Data & { loading: LoadingFlags } {
  const { loading: rawCoreLoading, ...coreData } = omitCoreOwnedData(core)
  const coreLoading = rawCoreLoading as LoadingFlags | undefined
  const patch: Data & { loading: LoadingFlags } = {
    ...coreData,
    loading: {
      ...(current.loading || {}),
      core: coreLoading?.core ?? current.loading?.core,
    },
  }
  if (Array.isArray(coreData.tasks)) {
    patch.tasks = preserveLoadedTaskDetails(coreData.tasks as LoadedTask[], current.tasks || [])
  }

  if (results.supplemental?.status === 'fulfilled') {
    Object.assign(patch, omitSupplementalUnrelatedData(results.supplemental.value as Data))
  }

  if (results.photos?.status === 'fulfilled') {
    Object.assign(patch, results.photos.value || {})
  }

  if (results.contacts?.status === 'fulfilled') {
    patch.contacts = results.contacts.value || []
    patch.contactLoading = false
    patch.contactLoadError = ''
  }

  return patch
}
