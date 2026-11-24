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
  const labels = new Map([['cr40f_categoriadespesaoperacional', 'Categorias de despesa']])
  expect(itemLabel(findItem('clientes')!.item, labels)).toBe('Clientes')
  expect(itemLabel(findItem('cr40f_categoriadespesaoperacional')!.item, labels)).toBe('Categorias de despesa')
  expect(itemLabel(findItem('cr40f_formapagamentodespesa')!.item, labels)).toBe('cr40f_formapagamentodespesa')
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

it('Projetos é rota React no Back-End, logo após os Logs dos apps', () => {
  expect(findItem('projetos')?.group.id).toBe('back-end')
  expect(findItem('projetos')?.item).toMatchObject({ kind: 'page', page: 'projetos', label: 'Projetos' })
  const ids = findItem('projetos')!.group.items.map((item) => item.id)
  expect(ids.indexOf('projetos')).toBe(ids.indexOf('logs-apps') + 1)
})

it('Frota tem um item por visão, sem as tabelas legadas', () => {
  const frota = MENU.find((group) => group.id === 'frota')!
  expect(frota.items.map((item) => item.label)).toEqual(['Pendências', 'Veículos', 'Manutenções', 'Multas', 'Infrações', 'Colisões', 'Indicadores', 'Plano preventivo', 'Checklists de Veículos'])
  expect(ENTITY_NAMES).not.toContain('cr40f_manutencoes')
  expect(ENTITY_NAMES).not.toContain('cr40f_multas')
  expect(ENTITY_NAMES).not.toContain('cr40f_colisao_v2')
  expect(findItem('infracoes')).toBeNull()
  expect(findItem('frota-checklists')?.item).toMatchObject({ kind: 'page', page: 'frota', aba: 'checklists' })
})

it('links antigos da Frota e de Infrações vão para a visão nova', () => {
  const ir = (id: string, q: string) => { const r = rotaAtualizada(id, new URLSearchParams(q)); return r && `${r.id}?${r.query}` }
  expect(ir('frota', 'aba=veiculos&q=TST')).toBe('frota-veiculos?q=TST')
  expect(ir('frota', 'aba=ocorrencias')).toBe('frota-multas?')
  expect(ir('frota', 'aba=ocorrencias&tipo=colisao')).toBe('frota-colisoes?')
  expect(ir('frota', 'aba=pendencias&ficha=v1')).toBe('frota?ficha=v1')
  expect(ir('infracoes', 'ver=i1')).toBe('frota-infracoes?ver=i1')
  expect(ir('frota-multas', 'sub=infracoes&ver=i1')).toBe('frota-infracoes?ver=i1')
  expect(ir('frota-multas', 'q=abc')).toBeNull()
  expect(findItem('frota-infracoes')?.item).toMatchObject({ kind: 'page', page: 'infracoes' })
  expect(ir('frota', 'aba=checklists')).toBe('frota-checklists?')
  expect(ir('new_gestaochecklistsveiculos', '')).toBe('frota-checklists?')
  expect(ir('frota', 'ficha=v1')).toBeNull()
  expect(ir('geral', 'aba=x')).toBeNull()
})

it('Geral é rota React do shell no lugar da lista nativa de reservas', () => {
  expect(findItem('geral')?.item).toMatchObject({ kind: 'page', page: 'geral', label: 'Geral' })
  expect(findItem('geral')?.group.id).toBe('operacional')
  expect(findItem('cr40f_reservadeveculos')).toBeNull()
})

it('Parcelas de multa sai do menu; Clientes é rota React em Cadastros', () => {
  expect(findItem('new_parcelamultafolha')).toBeNull()
  expect(findItem('clientes')?.group.id).toBe('cadastros')
  expect(findItem('clientes')?.item).toMatchObject({ kind: 'page', page: 'clientes', label: 'Clientes' })
  expect(findItem('cr40f_clientes1')).toBeNull()
  expect(rotaAtualizada('cr40f_clientes1', new URLSearchParams('ver=c1'))).toEqual({ id: 'clientes', query: new URLSearchParams('ver=c1') })
})

it('Funções Operacionais é rota React no Operacional e os links antigos vão para ela', () => {
  expect(findItem('funcoes-operacionais')?.group.id).toBe('operacional')
  expect(findItem('funcoes-operacionais')?.item).toMatchObject({ kind: 'page', page: 'funcoes-operacionais', label: 'Funções Operacionais' })
  expect(findItem('new_telafuncoesoperacionais')).toBeNull()
  expect(findItem('custom-page-funcoes-operacionais')).toBeNull()
  expect(findItem('cr40f_trocasdecarro')).toBeNull()
  const r = rotaAtualizada('new_telafuncoesoperacionais', new URLSearchParams('aba=carro'))
  expect(r && `${r.id}?${r.query}`).toBe('funcoes-operacionais?aba=carro')
  expect(rotaAtualizada('custom-page-funcoes-operacionais', new URLSearchParams())?.id).toBe('funcoes-operacionais')
})

it('Gestão de Qualidade é a tela React; o id do WebResource antigo redireciona', () => {
  expect(findItem('qualidade')?.group.id).toBe('operacional')
  expect(findItem('qualidade')?.item).toMatchObject({ kind: 'page', page: 'qualidade', label: 'Gestão de Qualidade' })
  expect(findItem('new_gestao_erros_operacionais')).toBeNull()
  expect(rotaAtualizada('new_gestao_erros_operacionais', new URLSearchParams('errorId=e1'))).toEqual({ id: 'qualidade', query: new URLSearchParams('errorId=e1') })
})

it('Pagamento de Fornecedores é rota React do Financeiro; o id do WebResource antigo redireciona', () => {
  expect(findItem('pagamento-fornecedores')?.group.id).toBe('financeiro')
  expect(findItem('pagamento-fornecedores')?.item).toMatchObject({ kind: 'page', page: 'pagamento-fornecedores', label: 'Pagamento de Fornecedores' })
  expect(findItem('cr40f_telapagamentofornecedores')).toBeNull()
  expect(rotaAtualizada('cr40f_telapagamentofornecedores', new URLSearchParams('tab=lots'))).toEqual({ id: 'pagamento-fornecedores', query: new URLSearchParams('tab=lots') })
})

it('Página Inicial é rota React, a tela padrão do shell, e o link antigo do WebResource vai para ela', async () => {
  const { DEFAULT_ITEM } = await import('./menu')
  expect(DEFAULT_ITEM).toMatchObject({ kind: 'page', id: 'inicio', page: 'inicio', label: 'Página Inicial' })
  expect(findItem('cr40f_homebetinhos')).toBeNull()
  expect(rotaAtualizada('cr40f_homebetinhos', new URLSearchParams('visao=gestao'))).toEqual({ id: 'inicio', query: new URLSearchParams('visao=gestao') })
})

it('Conciliação do cartão saiu do menu: Cartões corporativos é de Cadastros e o link antigo abre a fila de Despesas', () => {
  expect(findItem('conciliacao-cartao')).toBeNull()
  expect(findItem('cartoes')?.group.id).toBe('cadastros')
  expect(findItem('cartoes')?.item).toMatchObject({ kind: 'page', page: 'cartoes', label: 'Cartões corporativos' })
  expect(rotaAtualizada('conciliacao-cartao', new URLSearchParams())).toEqual({ id: 'despesas-operacionais', query: new URLSearchParams('fila=sem-despesa') })
})

it('Infleet abre dentro do shell, na área de conteúdo', () => {
  expect(findItem('infleet')?.item).toMatchObject({ kind: 'site', url: 'https://app.infleet.com.br/monitoring' })
})

it('Back-End não lista mais as tabelas de apoio tiradas em 18/11/2026', () => {
  for (const id of ['cr40f_servicosporpassageiro', 'cr40f_trocasdecarro', 'new_possedeveiculo', 'new_teladespesasoperacionais', 'new_fotomanutencao', 'cr40f_anexodespesaoperacional', 'cr40f_anexocolisao_v2', 'cr40f_anexorecebimento_v2']) {
    expect(findItem(id)).toBeNull()
  }
})

it('Portal do cliente, Descontos em folha e Composição antiga ficam no Back-End', () => {
  for (const id of ['validacao-cliente', 'rh-descontos', 'new_telacomposicaopreco']) expect(findItem(id)?.group.id).toBe('back-end')
  expect(MENU.some((group) => group.id === 'rh')).toBe(false)
})
