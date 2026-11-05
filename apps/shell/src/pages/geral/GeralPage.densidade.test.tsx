// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MOCK_ROW_COUNT } from './data/mock'
import { encodeFilters } from './domain/filters'
import { GeralPage } from './GeralPage'
import { colFilter, columnMenu, dataRows, FakeObserver, hooks, openColumnFilter, PAGE1, usarAmbienteGeral, viewTrigger } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
usarAmbienteGeral()

describe('Geral: espaço e densidade', () => {
  it('sem seleção a linha de comando tem só busca, Atualizar, Mais ações e Criar serviço (a primária, por último)', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(toolbar.classList.contains('is-selecting')).toBe(false)
    for (const name of ['Editar', 'Desativar', 'Ativar', 'Limpar seleção']) expect(within(toolbar).queryByRole('button', { name })).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: /^Ações/ })).toBeNull()
    expect(within(toolbar).queryByText(/selecionado/)).toBeNull()
    const buttons = within(toolbar).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    // Ordem da direita: …, Atualizar, Mais ações e a primária por último.
    expect(buttons.slice(-3)).toEqual(['Atualizar', 'Mais ações', 'Criar serviço'])
    expect(buttons.indexOf('Colunas')).toBeLessThan(buttons.indexOf('Atualizar'))
  })

  it('com 1 selecionado os comandos se habilitam e a contagem aparece como badge', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    expect(toolbar.classList.contains('is-selecting')).toBe(true)
    const count = within(toolbar).getByText('1 selecionado')
    expect(count.closest('.bt-badge')).not.toBeNull()
    for (const name of ['Editar', 'Desativar', 'Limpar seleção']) expect(within(toolbar).getByRole('button', { name }).getAttribute('aria-disabled')).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: 'Criar serviço' })).toBeNull()
    expect(within(toolbar).queryByRole('searchbox', { name: 'Buscar serviços' })).toBeNull()
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Ações (1)' }))
    for (const name of ['Gerar Voucher', 'Copiar Serviços']) expect(((await screen.findByRole('menuitem', { name, hidden: true })) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Limpar seleção' }))
    await waitFor(() => expect(within(toolbar).queryByText(/selecionado/)).toBeNull())
    expect(within(toolbar).getByRole('button', { name: 'Criar serviço' })).toBeTruthy()
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
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(100)
    expect(screen.queryByText(/Carregar mais$/)).toBeNull()
    // O efeito que cria o observador roda depois da pintura: espera ele existir.
    await waitFor(() => expect(FakeObserver.instances.filter((o) => !o.closed).length).toBe(1))
    expect(FakeObserver.instances.filter((o) => !o.closed)[0].options?.root === null).toBe(true)
    await act(async () => { FakeObserver.trigger([{ isIntersecting: true }]) })
    await screen.findAllByText(`200 de ${MOCK_ROW_COUNT} serviços`)
    expect(document.querySelectorAll('.gr-cards > li')).toHaveLength(200)
  }, 90_000)

  it('no desktop todos os comandos da lista têm o tamanho padrão do DS (40 px), igual a Colunas e Filtros', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
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
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('listitem')
    const toolbar = screen.getByRole('toolbar', { name: 'Comandos de serviços' })
    const search = within(toolbar).getByRole('searchbox', { name: 'Buscar serviços' }).closest('.bt-control')
    expect(search?.classList.contains('bt-control--compact')).toBe(false)
    expect(search?.classList.contains('bt-control--touch')).toBe(true)
    for (const name of ['Criar serviço', 'Mais ações', 'Colunas', 'Filtros']) {
      const button = within(toolbar).getByRole('button', { name })
      expect(button.classList.contains('bt-button--compact')).toBe(false)
      expect(button.classList.contains('bt-button--touch')).toBe(true)
    }
    // No celular não há linha de filtro rápido: os filtros ficam no painel.
    expect(within(toolbar).queryByRole('button', { name: 'Filtro rápido' })).toBeNull()
  })
  describe('filtros (DS §10.9.2)', () => {
    const header = (name: RegExp) => screen.getByRole('columnheader', { name, hidden: true })
    const chips = () => screen.queryByRole('group', { name: 'Filtros ativos' })

    it('o menu da coluna abre e ordena', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: /^Trajeto$/, hidden: true }))
      expect((await screen.findAllByRole('menuitem', { hidden: true })).map((item) => item.textContent)).toEqual(['Ordenar A→Z', 'Ordenar Z→A', 'Filtrar por…', 'Ocultar coluna'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ordenar Z→A', hidden: true }))
      await waitFor(() => expect(header(/Trajeto/).getAttribute('aria-sort')).toBe('descending'))
    }, 60_000)

    it('filtrar Status por Confirmado no painel da coluna reduz as linhas e cria o chip; remover restaura', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      const panel = await openColumnFilter(/^Status de Operação$/, 'Status de Operação')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('é um de')
      expect(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }).hasAttribute('disabled')).toBe(true)
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Valores de Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(await screen.findByText('Status de Operação: Confirmado')).toBeTruthy()
      await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
      expect(viewTrigger().textContent).toContain('Alterada')
      fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Status de Operação: Confirmado' }))
      await screen.findAllByText(PAGE1)
      expect(chips()).toBeNull()
      expect(viewTrigger().textContent).not.toContain('Alterada')
    }, 60_000)

    it('Filtrar por… abre o painel com operador e valor; Aplicar grava, reabrir mostra o filtro ativo, Limpar tira', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
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
      expect(await screen.findByText('Trajeto: começa com Galeão')).toBeTruthy()
      await waitFor(() => expect(window.location.hash).toContain('f='))
      expect(document.activeElement?.textContent).toContain('Trajeto')
      // Reabrir: mostra o filtro ativo e a condição já preenchida.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      expect(within(panel).getByRole('status', { hidden: true }).textContent).toBe('Filtro ativo: Trajeto: começa com Galeão')
      expect(within(panel).getByRole('combobox', { name: 'Operador', hidden: true }).textContent).toContain('começa com')
      expect((within(panel).getByRole('textbox', { name: 'Texto de Trajeto', hidden: true }) as HTMLInputElement).value).toBe('Galeão')
      // Esc fecha sem mexer no filtro.
      fireEvent.keyDown(panel, { key: 'Escape' })
      await waitFor(() => expect(colFilter()).toBeNull())
      expect(screen.getByText('Trajeto: começa com Galeão')).toBeTruthy()
      // Limpar tira o filtro e fecha.
      panel = await openColumnFilter(/^Trajeto$/, 'Trajeto')
      fireEvent.click(within(panel).getByRole('button', { name: 'Limpar', hidden: true }))
      await waitFor(() => expect(colFilter()).toBeNull())
      await waitFor(() => expect(screen.queryByText('Trajeto: começa com Galeão')).toBeNull())
    }, 60_000)

    it('o painel Filtros aplica uma condição avançada, conta no botão e Limpar filtros tira tudo', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('tab', { name: /^Avançado/ }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Condição' }))
      expect(within(panel).getByText('Digite um texto.')).toBeTruthy()
      fireEvent.change(within(panel).getByRole('textbox', { name: 'Texto de ID' }), { target: { value: 'OS-1005' } })
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar' }))
      expect(await screen.findByText('ID: OS-1005')).toBeTruthy()
      await waitFor(() => expect(screen.getByRole('button', { name: /^Filtros/ }).textContent).toContain('1'))
      fireEvent.click(within(chips() as HTMLElement).getByRole('button', { name: 'Limpar filtros' }))
      await screen.findAllByText(PAGE1)
      expect(chips()).toBeNull()
    }, 60_000)

    it('fechar o painel com rascunho pede confirmação', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('tab', { name: /^Avançado/ }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Condição' }))
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
      fireEvent(panel, new Event('cancel', { cancelable: true }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull())
      expect(chips()).toBeNull()
    }, 60_000)

    it('sem metadata o filtro restaurado da URL (link antigo) aparece como não aplicado', async () => {
      hooks.attributes = () => Promise.reject(new Error('sem metadata'))
      window.location.hash = '#/geral?f=' + encodeFilters({ cr40f_trajeto: { kind: 'text', op: 'contains', value: 'Galeão' } })
      render(<GeralPage host={{ mode: 'mock' }} />)
      expect(await screen.findByRole('img', { name: 'Filtro não aplicado', hidden: true })).toBeTruthy()
      expect(within(chips() as HTMLElement).getByText(/não aplicado/)).toBeTruthy()
    }, 60_000)

    it('no celular o botão Filtros tem tamanho de toque e o painel aplica por coluna', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByRole('listitem')
      const button = within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: 'Filtros' })
      expect(button.classList.contains('bt-button--touch')).toBe(true)
      fireEvent.click(button)
      const panel = await screen.findByRole('dialog', { name: 'Filtros' })
      fireEvent.click(within(panel).getByRole('combobox', { name: 'Filtrar Status de Operação', hidden: true }))
      fireEvent.click(await screen.findByRole('option', { name: 'Confirmado', hidden: true }))
      fireEvent.click(within(panel).getByRole('button', { name: 'Aplicar' }))
      expect(within(await screen.findByRole('group', { name: 'Filtros ativos' })).getByText('Status de Operação: Confirmado')).toBeTruthy()
    }, 60_000)
  })
})
