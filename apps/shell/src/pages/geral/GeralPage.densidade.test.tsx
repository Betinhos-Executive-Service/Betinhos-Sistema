// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOCK_ROW_COUNT } from './data/mock'
import { GeralPage } from './GeralPage'
import { colFilter, columnMenu, dataRows, FakeObserver, hooks, openColumnFilter, PAGE1 as PAGE1_CURTA, TEST_PAGE_SIZE, usarAmbienteGeral, viewTrigger } from './testUtils'

// Este arquivo testa a página cheia e a rolagem (100, 200, 220): usa o tamanho real da página.
vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>(), { pageSize: 100 }))
usarAmbienteGeral()

const PAGE1 = new RegExp(`^100 de ${MOCK_ROW_COUNT} serviços$`)

/** Barra de comandos e filtros não dependem do número de linhas: 20 em vez de 100 corta a renderização e as consultas. */
async function renderCurta() {
  hooks.pageSize = TEST_PAGE_SIZE
  render(<GeralPage host={{ mode: 'mock' }} />)
  await screen.findAllByText(PAGE1_CURTA)
}

describe('Geral: espaço e densidade', () => {
  it('sem seleção a linha de comando tem só busca, Atualizar, Mais ações e Criar serviço (a primária, por último)', async () => {
    await renderCurta()
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(toolbar.classList.contains('is-selecting')).toBe(false)
    for (const name of ['Editar', 'Desativar', 'Ativar', 'Limpar seleção']) expect(within(toolbar).queryByRole('button', { name })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: /^Ações/ })).toBeNull()
    expect(within(toolbar).queryByRole('group', { name: 'Comandos da seleção' })).toBeNull()
    const buttons = within(toolbar).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // Ordem da direita: …, Mais ações, Atualizar e a primária por último.
    expect(buttons.slice(-3)).toEqual(['Mais ações', 'Atualizar', 'Criar serviço'])
    expect(buttons.indexOf('Colunas')).toBeLessThan(buttons.indexOf('Atualizar'))
  })

  it('com 1 selecionado o contador com ✕ e as ações entram antes da busca; visão, Colunas, Filtros, Auditoria, busca, ⋮, Atualizar e a primária ficam', async () => {
    await renderCurta()
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const fixos = () => within(toolbar).getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent)?.replace(/^Mais ações.*/, 'Mais ações')).filter((name) => ['Colunas', 'Filtros', 'Auditoria', 'Mais ações', 'Atualizar', 'Criar serviço'].includes(name ?? ''))
    const antes = fixos()
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    const selecao = within(toolbar).getByRole('group', { name: 'Comandos da seleção' })
    expect(within(selecao).getByRole('status').textContent).toBe('1 selecionado')
    // DS §10.9.6 (1.26): as ações `inline` ficam na linha enquanto couberem; o resto no ⋮, sob "1 selecionado".
    for (const name of ['Editar', 'Copiar Serviços', 'Desativar', 'Limpar seleção']) expect(within(selecao).getByRole('button', { name }).getAttribute('aria-disabled')).toBeNull()
    expect(within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' })).toBeTruthy()
    expect(fixos()).toEqual(antes)
    fireEvent.click(within(toolbar).getByRole('button', { name: /^Mais ações \(\d+ da seleção\)$/ }))
    for (const name of ['Gerar Voucher', 'Gerar OP']) expect(((await screen.findByRole('menuitem', { name, hidden: true })) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    fireEvent.click(within(selecao).getByRole('button', { name: 'Limpar seleção' }))
    await waitFor(() => expect(within(toolbar).queryByRole('group', { name: 'Comandos da seleção' })).toBeNull())
    expect(within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' })).toBeTruthy()
  })

  it('lista sem cabeçalho de página: o título é a visão e Atualizar fica na linha de comando', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(screen.queryByRole('banner')).toBeNull()
    expect(viewTrigger().textContent).toContain('Agenda')
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(within(toolbar).getByRole('button', { name: 'Atualizar' }).getAttribute('title')).toBe(`100 de ${MOCK_ROW_COUNT} serviços`)
    expect(within(toolbar).getByRole('button', { name: 'Criar serviço' })).toBeTruthy()
  })

  it('cada título de coluna tem o rótulo completo em title (o texto pode ser cortado)', async () => {
    hooks.pageSize = TEST_PAGE_SIZE
    render(<GeralPage host={{ mode: 'mock' }} />)
    const header = await screen.findByRole('columnheader', { name: /Status de faturamento/, hidden: true })
    expect(header.getAttribute('title')).toBe('Status de faturamento')
  })

  it('página fixa de 100: sem seletor de quantidade nem paginação numerada', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findAllByText(`100 de ${MOCK_ROW_COUNT} serviços`)).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: 'Serviços por página' })).toBeNull()
    expect(screen.queryByText(/Anterior|Próxima/)).toBeNull()
  })

  // Com 200+ linhas, consultas por papel (getByRole) percorrem milhares de nós no jsdom: aqui só consultas baratas.
  const rowCount = () => document.querySelectorAll('.gr-grid [role="row"]').length - 1
  /** Rolar até o fim: o sentinela entra na área do observador (espera o observador da página atual existir). */
  const scrollToEnd = async () => {
    await waitFor(() => expect(FakeObserver.instances.some((o) => !o.closed)).toBe(true))
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
  }

  it('rolar até o fim acumula 100, 200 e 220 linhas sem botão e para no Fim da lista', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(rowCount()).toBe(100)
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    await scrollToEnd()
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(200)
    await scrollToEnd()
    await screen.findAllByText(`${MOCK_ROW_COUNT} serviços`)
    expect(rowCount()).toBe(MOCK_ROW_COUNT)
    expect(screen.getByText('Fim da lista')).toBeTruthy()
    // Fim dos dados: sem sentinela, ninguém pede mais.
    expect(FakeObserver.instances.every((o) => o.closed)).toBe(true)
    expect(document.querySelector('.gr-sentinel')).toBeNull()
  }, 90_000)

  it('ordenar depois de rolar volta ao topo com 100 linhas', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await scrollToEnd()
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
    await screen.findAllByText(PAGE1)
    expect(rowCount()).toBe(100)
  }, 90_000)

  it('o observador carrega a próxima página sem clique e a seleção dos carregados é mantida', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const grid = document.querySelector('.gr-grid') as HTMLElement
    // O sentinela vive dentro do contêiner de rolagem, que é a raiz do observador.
    await waitFor(() => expect(FakeObserver.instances.some((o) => !o.closed)).toBe(true))
    const live = FakeObserver.instances.filter((o) => !o.closed)
    // Comparações booleanas: se falhar, o diff de um elemento DOM inteiro travaria o jsdom.
    expect(live.length).toBe(1)
    expect(live[0].options?.root === grid).toBe(true)
    expect(grid.contains(live[0].observed[0])).toBe(true)
    // "Selecionar carregados" marca as linhas carregadas até aqui; carregar mais não desfaz a seleção.
    // (Consulta direta ao DOM: getByLabelText percorre centenas de rótulos e trava o jsdom.)
    const selectAll = document.querySelector('.gr-grid [role="columnheader"] input[type="checkbox"]') as HTMLInputElement
    expect(selectAll.closest('label')?.textContent).toBe('Selecionar carregados')
    fireEvent.click(selectAll)
    await screen.findByText('100 selecionados')
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-grid [role="row"]').length - 1).toBe(200)
    expect(screen.getByText('100 selecionados')).toBeTruthy()
  }, 90_000)

  it('no celular os cards usam a janela como raiz e carregam mais ao rolar, sem botão', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(document.querySelectorAll('.gr-cards > li.gc-card')).toHaveLength(100)
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    // O efeito que cria o observador roda depois da pintura: espera ele existir.
    await waitFor(() => expect(FakeObserver.instances.filter((o) => !o.closed).length).toBe(1))
    expect(FakeObserver.instances.filter((o) => !o.closed)[0].options?.root === null).toBe(true)
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-cards > li.gc-card')).toHaveLength(200)
  }, 90_000)

  it('no desktop todos os comandos da lista têm o tamanho padrão do DS (40 px), igual a Colunas e Filtros', async () => {
    await renderCurta()
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const search = within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')
    expect(search?.classList.contains('bt-control--compact')).toBe(false)
    expect(search?.classList.contains('bt-control--touch')).toBe(false)
    for (const name of ['Colunas', 'Filtros', 'Criar serviço', 'Mais ações', 'Atualizar']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(false)
    }
    expect(within(toolbar).getByRole('button', { name: 'Colunas' })).toBeTruthy()
    // O filtro por coluna mora no menu do título (DS 1.13): a barra não tem mais o botão "Filtro rápido".
    expect(within(toolbar).queryByRole('button', { name: 'Filtro rápido' })).toBeNull()
  })

  it('no celular a barra usa tamanho de toque (44 px), nunca o compacto de 32 px', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    hooks.pageSize = TEST_PAGE_SIZE
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('listitem')
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const search = within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')
    expect(search?.classList.contains('bt-control--compact')).toBe(false)
    expect(search?.classList.contains('bt-control--touch')).toBe(true)
    for (const name of ['Mais ações', 'Colunas', 'Filtros']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(true)
    }
    // "Criar serviço" vira o botão redondo fixo (FAB): a barra não o repete.
    expect(within(toolbar).queryByRole('button', { name: 'Criar serviço' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Criar serviço' }).classList.contains('gc-fab')).toBe(true)
    // No celular não há linha de filtro rápido: os filtros ficam no painel.
    expect(within(toolbar).queryByRole('button', { name: 'Filtro rápido' })).toBeNull()
  })
  describe('filtros (DS §10.9.2)', () => {
    const header = (name: RegExp) => screen.getByRole('columnheader', { name, hidden: true })
    // Sem faixa de chips (DS 2.0.0): o filtro ativo aparece no número do botão Filtros e no título da coluna.
    const noChips = () => expect(screen.queryByRole('group', { name: 'Filtros ativos' })).toBeNull()
    const filtersButton = () => within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: /^Filtros/ })

    it('o menu da coluna abre e ordena', async () => {
      await renderCurta()
      fireEvent.click(screen.getByRole('button', { name: /^Trajeto$/, hidden: true }))
      expect((await screen.findAllByRole('menuitem', { hidden: true })).map((item) => item.textContent)).toEqual(['Ordenar A→Z', 'Ordenar Z→A', 'Filtrar por…', 'Ocultar coluna'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ordenar Z→A', hidden: true }))
      await waitFor(() => expect(header(/Trajeto/).getAttribute('aria-sort')).toBe('descending'))
    }, 60_000)

    it('filtrar Status por Confirmado no painel da coluna reduz as linhas e conta no botão; Limpar filtro da coluna restaura', async () => {
      await renderCurta()
      const panel = await openColumnFilter(/^Status de Operação$/, 'Status de Operação')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('é um de')
      expect(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }).hasAttribute('disabled')).toBe(true)
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Valores de Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      await waitFor(() => expect(screen.queryAllByText(PAGE1_CURTA)).toHaveLength(0))
      expect(filtersButton().textContent).toContain('1')
      noChips()
      expect(viewTrigger().textContent).toContain('Alterada')
      fireEvent.click(screen.getByRole('button', { name: /^Status de Operação$/, hidden: true }))
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Limpar filtro', hidden: true }))
      await screen.findAllByText(PAGE1_CURTA)
      expect(filtersButton().textContent).not.toContain('1')
      expect(viewTrigger().textContent).not.toContain('Alterada')
    }, 60_000)

    it('Filtrar por… abre o painel com operador e valor; Aplicar grava, reabrir mostra o filtro ativo, Limpar tira', async () => {
      await renderCurta()
      let panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      expect(within(panel).queryByRole('status', { hidden: true })).toBeNull()
      expect(within(panel).getByRole('button', { name: 'Limpar', hidden: true }).hasAttribute('disabled')).toBe(true)
      // Operador do tipo texto, como no model-driven: troca para "começa com".
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'começa com', hidden: true }))
      const text = within(panel).getByRole('textbox', { name: 'Texto de Trajeto', hidden: true })
      fireEvent.change(text, { target: { value: 'Galeão' } })
      fireEvent.keyDown(text, { key: 'Enter' })
      await waitFor(() => expect(colFilter()).toBeNull())
      await waitFor(() => expect(window.location.hash).toContain('f='))
      noChips()
      expect(document.activeElement?.textContent).toContain('Trajeto')
      // Reabrir: mostra o filtro ativo e a condição já preenchida.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      expect(within(panel).getByRole('status', { hidden: true }).textContent).toBe('Filtro ativo: Trajeto: começa com Galeão')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('começa com')
      expect((within(panel).getByRole('textbox', { name: 'Texto de Trajeto', hidden: true }) as HTMLInputElement).value).toBe('Galeão')
      // Esc fecha sem mexer no filtro.
      fireEvent.keyDown(panel, { key: 'Escape' })
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(window.location.hash).toContain('f=')
      // Limpar tira o filtro e fecha.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      fireEvent.click(within(panel).getByRole('button', { name: 'Limpar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      await waitFor(() => expect(window.location.hash).not.toContain('f='))
    }, 60_000)

    it('o painel Filtros aplica uma condição, conta no botão e o Limpar do painel tira tudo', async () => {
      await renderCurta()
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      // A condição de estado da visão (`statecode`) não é campo de filtro: aparece só leitura, sem ×.
      expect(within(panel).getByText('Status igual a Ativo')).toBeTruthy()
      expect(within(panel).queryByRole('button', { name: 'Remover condição da visão' })).toBeNull()
      fireEvent.click(within(panel).getByRole('button', { name: '+ Adicionar filtro' }))
      fireEvent.click(screen.getByRole('option', { name: /^ID$/, hidden: true }))
      expect(within(panel).getByText('1 filtro sem valor não entra')).toBeTruthy()
      fireEvent.change(screen.getByRole('textbox', { name: 'Texto de ID', hidden: true }), { target: { value: 'OS-1005' } })
      fireEvent.click(within(panel).getByRole('button', { name: /^Mostrar/ }))
      await waitFor(() => expect(filtersButton().textContent).toContain('1'))
      noChips()
      fireEvent.click(filtersButton())
      const again = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(again).getByRole('button', { name: 'Limpar' }))
      fireEvent.click(within(again).getByRole('button', { name: /^Mostrar/ }))
      await screen.findAllByText(PAGE1_CURTA)
      expect(filtersButton().textContent).not.toContain('1')
    }, 60_000)

    it('fechar o painel com rascunho pede confirmação', async () => {
      await renderCurta()
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('button', { name: '+ Adicionar filtro' }))
      fireEvent.click(screen.getByRole('option', { name: /^ID$/, hidden: true }))
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull())
      expect(filtersButton().textContent).not.toContain('1')
    }, 60_000)

    it('no celular o botão Filtros tem tamanho de toque e o painel aplica um filtro de coluna', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
      hooks.pageSize = TEST_PAGE_SIZE
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByRole('listitem')
      const button = within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: 'Filtros' })
      expect(button.classList.contains('bt-button--touch')).toBe(true)
      fireEvent.click(button)
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('button', { name: '+ Adicionar filtro', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: /^Status de Operação$/, hidden: true }))
      fireEvent.click(await screen.findByRole('checkbox', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: /^Mostrar/, hidden: true }))

      await waitFor(() => expect(filtersButton().textContent).toContain('1'))
      noChips()
    }, 60_000)
  })
})
