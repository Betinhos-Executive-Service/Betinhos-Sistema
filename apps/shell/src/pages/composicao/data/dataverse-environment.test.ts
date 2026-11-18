// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { getDataverseEnvironmentLabel } from './dataverse'

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['https://org23b93544.crm2.dynamics.com/', 'DEV'],
  ['https://cpq--samcrmlivesg624.crm2.dynamics.com/', 'DEV'],
  ['https://orgf261ae8e.crm2.dynamics.com/', 'PROD'],
  ['https://cpq--samcrmlivesg628.crm2.dynamics.com/', 'PROD'],
  ['https://outro.crm2.dynamics.com/', 'Dataverse'],
])('identifica o ambiente de %s', (url, expected) => {
  vi.stubGlobal('window', { Xrm: { Utility: { getGlobalContext: () => ({ getClientUrl: () => url }) } } })
  expect(getDataverseEnvironmentLabel()).toBe(expected)
})
