import { expect, it } from 'vitest'
import { ALL_ITEMS, findItem, itemLabel } from './menu'

it('não repete ids de rota', () => {
  const ids = ALL_ITEMS.map((item) => item.id)
  expect(new Set(ids).size).toBe(ids.length)
})

it('localiza item e grupo pelo id', () => {
  expect(findItem('new_dashboard')?.group.id).toBe('operacional')
  expect(findItem('inexistente')).toBeNull()
})

it('Resumo Operacional é rota React do shell', () => {
  expect(findItem('operacional')?.item).toMatchObject({ kind: 'page', page: 'operacional', label: 'Resumo Operacional' })
  expect(findItem('new_telaoperacional')).toBeNull()
})

it('usa rótulo do sitemap, depois metadata, depois nome lógico', () => {
  const labels = new Map([['cr40f_financeiro', 'Financeiros']])
  expect(itemLabel(findItem('cr40f_clientes1')!.item, labels)).toBe('Clientes')
  expect(itemLabel(findItem('cr40f_financeiro')!.item, labels)).toBe('Financeiros')
  expect(itemLabel(findItem('cr40f_multas')!.item, labels)).toBe('cr40f_multas')
})
