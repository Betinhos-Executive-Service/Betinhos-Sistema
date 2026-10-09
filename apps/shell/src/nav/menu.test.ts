import { expect, it } from 'vitest'
import { ALL_ITEMS, findItem, itemLabel } from './menu'

it('não repete ids de rota', () => {
  const ids = ALL_ITEMS.map((item) => item.id)
  expect(new Set(ids).size).toBe(ids.length)
})

it('localiza item e grupo pelo id', () => {
  expect(findItem('dashboard')?.group.id).toBe('operacional')
  expect(findItem('dashboard')?.item).toMatchObject({ kind: 'page', page: 'dashboard', label: 'Dashboard' })
  // O legado vira o modo TV, no Back-End.
  expect(findItem('new_dashboard')?.group.id).toBe('back-end')
  expect(findItem('new_dashboard')?.item).toMatchObject({ kind: 'webresource', label: 'Dashboard antigo (TV)' })
  expect(findItem('inexistente')).toBeNull()
})

it('Resumo Operacional é rota React do shell', () => {
  expect(findItem('operacional')?.item).toMatchObject({ kind: 'page', page: 'operacional', label: 'Resumo Operacional' })
  expect(findItem('new_telaoperacional')).toBeNull()
})

it('usa rótulo do sitemap, depois metadata, depois nome lógico', () => {
  const labels = new Map([['cr40f_recibos_v2', 'Recibos']])
  expect(itemLabel(findItem('cr40f_clientes1')!.item, labels)).toBe('Clientes')
  expect(itemLabel(findItem('cr40f_recibos_v2')!.item, labels)).toBe('Recibos')
  expect(itemLabel(findItem('cr40f_multas')!.item, labels)).toBe('cr40f_multas')
})
