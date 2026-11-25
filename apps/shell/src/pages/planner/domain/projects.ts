// Projetos de software: ideias que andam por quatro etapas até ir ao ar.
// Guardado no navegador (localStorage); não há tabela no Dataverse para isto ainda.

export type ProjectStage = 'idea' | 'design' | 'build' | 'live'

export interface Project {
  id: string
  title: string
  note: string
  stage: ProjectStage
  author: string
  createdAt: string
  updatedAt: string
}

export const PROJECT_STAGES: { id: ProjectStage; label: string; hint: string }[] = [
  { id: 'idea', label: 'Ideia', hint: 'Anotada, ainda sem forma' },
  { id: 'design', label: 'Desenho', hint: 'Escopo e tela pensados' },
  { id: 'build', label: 'Construção', hint: 'Em código' },
  { id: 'live', label: 'No ar', hint: 'Publicado e em uso' },
]

export const PROJECTS_STORAGE_KEY = 'planner.projects.v1'

const STAGE_IDS = PROJECT_STAGES.map((stage) => stage.id)

export function stageIndex(stage: ProjectStage): number {
  return STAGE_IDS.indexOf(stage)
}

export function createProject(title: string, note: string, author: string, now = new Date()): Project | null {
  const cleanTitle = title.trim()
  if (!cleanTitle) return null
  const stamp = now.toISOString()
  const random = Math.random().toString(36).slice(2, 8)
  return { id: `prj-${now.getTime()}-${random}`, title: cleanTitle, note: note.trim(), stage: 'idea', author, createdAt: stamp, updatedAt: stamp }
}

/** Move uma etapa para frente (+1) ou para trás (-1); fora dos limites devolve a mesma lista. */
export function shiftProject(projects: Project[], id: string, step: 1 | -1, now = new Date()): Project[] {
  return projects.map((project) => {
    if (project.id !== id) return project
    const next = STAGE_IDS[stageIndex(project.stage) + step]
    return next ? { ...project, stage: next, updatedAt: now.toISOString() } : project
  })
}

export function moveProjectTo(projects: Project[], id: string, stage: ProjectStage, now = new Date()): Project[] {
  return projects.map((project) =>
    project.id === id && project.stage !== stage ? { ...project, stage, updatedAt: now.toISOString() } : project,
  )
}

function isProject(value: any): value is Project {
  return value && typeof value.id === 'string' && typeof value.title === 'string' && STAGE_IDS.includes(value.stage)
}

export function readProjects(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Project[] {
  try {
    const parsed = JSON.parse(storage?.getItem(PROJECTS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isProject) : []
  } catch {
    return []
  }
}

export function writeProjects(projects: Project[], storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
    return true
  } catch {
    return false
  }
}
