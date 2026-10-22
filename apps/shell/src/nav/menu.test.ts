import { expect, it } from 'vitest'
import { ALL_ITEMS, ENTITY_NAMES, MENU, findItem, itemLabel, rotaAtualizada } from './menu'

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
  expect(itemLabel(findItem('cr40f_trocasdecarro')!.item, labels)).toBe('cr40f_trocasdecarro')
})

it('Documentos é rota React em Cadastros, logo após Funcionários', () => {
  expect(findItem('documentos')?.group.id).toBe('cadastros')
  expect(findItem('documentos')?.item).toMatchObject({ kind: 'page', page: 'documentos', label: 'Documentos' })
  const ids = findItem('documentos')!.group.items.map((item) => item.id)
  expect(ids.indexOf('documentos')).toBe(ids.indexOf('funcionarios') + 1)
})

it('Equipamentos é rota React em Cadastros', () => {
  expect(findItem('equipamentos')?.group.id).toBe('cadastros')
  expect(findItem('equipamentos')?.item).toMatchObject({ kind: 'page', page: 'equipamentos', label: 'Equipamentos' })
})

it('Frota tem um item por visão, sem as tabelas legadas nem Infrações solta', () => {
  const frota = MENU.find((group) => group.id === 'frota')!
  expect(frota.items.map((item) => item.label)).toEqual(['Pendências', 'Veículos', 'Manutenções', 'Multas', 'Colisões', 'Indicadores', 'Plano preventivo', 'Assistente', 'Checklists de Veículos'])
  expect(ENTITY_NAMES).not.toContain('cr40f_manutencoes')
  expect(ENTITY_NAMES).not.toContain('cr40f_multas')
  expect(ENTITY_NAMES).not.toContain('cr40f_colisao_v2')
  expect(findItem('infracoes')).toBeNull()
})

it('links antigos da Frota e de Infrações vão para a visão nova', () => {
  const ir = (id: string, q: string) => { const r = rotaAtualizada(id, new URLSearchParams(q)); return r && `${r.id}?${r.query}` }
  expect(ir('frota', 'aba=veiculos&q=TST')).toBe('frota-veiculos?q=TST')
  expect(ir('frota', 'aba=ocorrencias')).toBe('frota-multas?')
  expect(ir('frota', 'aba=ocorrencias&tipo=colisao')).toBe('frota-colisoes?')
  expect(ir('frota', 'aba=pendencias&ficha=v1')).toBe('frota?ficha=v1')
  expect(ir('infracoes', 'ver=i1')).toBe('frota-multas?ver=i1&sub=infracoes')
  expect(ir('frota', 'ficha=v1')).toBeNull()
  expect(ir('geral', 'aba=x')).toBeNull()
})

it('Geral é rota React do shell no lugar da lista nativa de reservas', () => {
  expect(findItem('geral')?.item).toMatchObject({ kind: 'page', page: 'geral', label: 'Geral' })
  expect(findItem('geral')?.group.id).toBe('operacional')
  expect(findItem('cr40f_reservadeveculos')).toBeNull()
})
