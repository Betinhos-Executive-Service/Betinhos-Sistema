// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { ambienteDoHost, instalarFaixaAmbiente } from './faixaAmbiente'

afterEach(() => { document.getElementById('faixa-ambiente')?.remove(); delete document.documentElement.dataset.ambiente })

it.each([
  ['org23b93544.crm2.dynamics.com', 'DEV'],
  ['cpq--samcrmlivesg624.crm2.dynamics.com', 'DEV'],
  ['AppBetinhosTest.crm2.dynamics.com', 'TEST'],
  ['localhost', 'LOCAL'],
  ['orgf261ae8e.crm2.dynamics.com', null],
  ['cpq--samcrmlivesg628.crm2.dynamics.com', null],
  ['outro.crm2.dynamics.com', null],
])('ambiente de %s', (host, esperado) => {
  expect(ambienteDoHost(host)).toBe(esperado)
})

it('mostra a faixa do TEST uma vez só', () => {
  instalarFaixaAmbiente(document, 'appbetinhostest.crm2.dynamics.com')
  instalarFaixaAmbiente(document, 'appbetinhostest.crm2.dynamics.com')
  const faixas = document.querySelectorAll('#faixa-ambiente')
  expect(faixas).toHaveLength(1)
  expect(faixas[0].textContent).toMatch(/^TEST/)
  expect(document.documentElement.dataset.ambiente).toBe('TEST')
})

it('não mostra nada no PROD', () => {
  expect(instalarFaixaAmbiente(document, 'orgf261ae8e.crm2.dynamics.com')).toBeNull()
  expect(document.getElementById('faixa-ambiente')).toBeNull()
  expect(document.documentElement.dataset.ambiente).toBeUndefined()
})
