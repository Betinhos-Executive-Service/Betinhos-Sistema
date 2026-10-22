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

it('Documentos é rota React em Cadastros, logo após Funcionários', () => {
  expect(findItem('documentos')?.group.id).toBe('cadastros')
  expect(findItem('documentos')?.item).toMatchObject({ kind: 'page', page: 'documentos', label: 'Documentos' })
  const ids = findItem('documentos')!.group.items.map((item) => item.id)
  expect(ids.indexOf('documentos')).toBe(ids.indexOf('funcionarios') + 1)
})

it('Equipamentos é rota React em Cadastros, logo após Infrações', () => {
  expect(findItem('equipamentos')?.group.id).toBe('cadastros')
  expect(findItem('equipamentos')?.item).toMatchObject({ kind: 'page', page: 'equipamentos', label: 'Equipamentos' })
  const ids = findItem('equipamentos')!.group.items.map((item) => item.id)
  expect(ids.indexOf('equipamentos')).toBe(ids.indexOf('infracoes') + 1)
})

it('Geral é rota React do shell no lugar da lista nativa de reservas', () => {
  expect(findItem('geral')?.item).toMatchObject({ kind: 'page', page: 'geral', label: 'Geral' })
  expect(findItem('geral')?.group.id).toBe('operacional')
  expect(findItem('cr40f_reservadeveculos')).toBeNull()
})

it('Parcelas de multa é tabela em Frota, logo após Multas, para o DP', () => {
  const found = findItem('new_parcelamultafolha')
  expect(found?.group.id).toBe('frota')
  expect(found?.item).toMatchObject({ kind: 'entity', entity: 'new_parcelamultafolha', label: 'Parcelas de multa' })
  const ids = found!.group.items.map((item) => item.id)
  expect(ids.indexOf('new_parcelamultafolha')).toBe(ids.indexOf('cr40f_multas') + 1)
})
