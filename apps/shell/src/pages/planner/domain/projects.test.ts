import { describe, expect, it } from 'vitest'
import { PROJECTS_STORAGE_KEY, createProject, moveProjectTo, readProjects, shiftProject, writeProjects } from './projects'

const now = new Date('2026-11-25T12:00:00Z')

describe('projetos', () => {
  it('cria na etapa Ideia e recusa título vazio', () => {
    expect(createProject('   ', '', 'Renan', now)).toBeNull()
    expect(createProject('  Painel  ', ' nota ', 'Renan', now)).toMatchObject({ title: 'Painel', note: 'nota', stage: 'idea', author: 'Renan' })
  })

  it('avança e volta sem passar dos limites', () => {
    const project = createProject('App', '', '', now)!
    let list = shiftProject([project], project.id, -1, now)
    expect(list[0].stage).toBe('idea')
    for (let step = 0; step < 5; step++) list = shiftProject(list, project.id, 1, now)
    expect(list[0].stage).toBe('live')
    expect(moveProjectTo(list, project.id, 'design', now)[0].stage).toBe('design')
  })

  it('lê só registros válidos e tolera armazenamento quebrado', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value) } }
    const project = createProject('App', '', '', now)!
    expect(writeProjects([project], storage)).toBe(true)
    store.set(PROJECTS_STORAGE_KEY, JSON.stringify([project, { id: 'x', title: 'y', stage: 'outra' }]))
    expect(readProjects(storage)).toHaveLength(1)
    store.set(PROJECTS_STORAGE_KEY, '{quebrado')
    expect(readProjects(storage)).toEqual([])
  })
})
