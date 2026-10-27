// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { plannerUrlForState, readPlannerUrlState } from './domain/plannerUrl'
import { flattenPlannerQuery, shellPlannerWindow } from './shellNavigation'

afterEach(() => { history.replaceState(null, '', '#/') })

describe('navegação do Planner no hash do shell', () => {
  it('lê os deep links antigos da query do hash', () => {
    history.replaceState(null, '', '#/planner?view=quotes&quoteId=quote-1008')
    expect(readPlannerUrlState(shellPlannerWindow().location.search)).toEqual({ view: 'quotes', taskId: '', contactId: '', quoteId: 'quote-1008' })
    history.replaceState(null, '', '#/planner?taskId=task-1')
    expect(readPlannerUrlState(shellPlannerWindow().location.search)).toMatchObject({ view: 'board', taskId: 'task-1' })
    history.replaceState(null, '', '#/planner?contactId=c-1')
    expect(readPlannerUrlState(shellPlannerWindow().location.search)).toMatchObject({ view: 'contacts', contactId: 'c-1' })
  })

  it('grava a navegação no hash da rota atual, achatando data=', () => {
    history.replaceState(null, '', '#/planner')
    const nav = shellPlannerWindow()
    nav.history.pushState(null, '', plannerUrlForState(nav.location, { view: 'quotes', quoteId: 'quote-1007' }))
    expect(location.hash).toBe('#/planner?view=quotes&quoteId=quote-1007')
    nav.history.pushState(null, '', plannerUrlForState(nav.location, { view: 'board' }))
    expect(location.hash).toBe('#/planner')
  })

  it('achata a query aninhada em data', () => {
    expect(flattenPlannerQuery('data=view%3Dcontacts%26contactId%3Dx').toString()).toBe('view=contacts&contactId=x')
  })
})
