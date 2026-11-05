// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GeralPage } from './GeralPage'
import { acao, cellOf, columnMenu, dataRows, findDataRows, PAGE1, pickView, usarAmbienteGeral, viewTrigger } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
usarAmbienteGeral()

describe('Geral', () => {
  it('abre a Agenda com as colunas da visão, pagina e ordena', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })).toBeTruthy()
    // A linha do cabeçalho já existe antes dos dados: espera as 100 linhas chegarem.
    await waitFor(() => expect(dataRows().length).toBeGreaterThan(10))
    expect(screen.getAllByText(PAGE1)).toHaveLength(1)
    await columnMenu(/^Status de Operação$/, 'Ordenar A→Z')
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/, hidden: true }).getAttribute('aria-sort')).toBe('ascending'))
    // O primeiro teste paga a carga fria dos módulos: com a máquina ocupada passa dos 30 s do padrão.
  }, 60_000)

  it('abre na visão pedida pela URL e grava o estado sem empilhar histórico', async () => {
    window.location.hash = '#/geral?view=mock-sem-motorista'
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await waitFor(() => expect(viewTrigger().textContent).toContain('Sem motorista'))
      await waitFor(() => expect(window.location.hash).toBe('#/geral?view=mock-sem-motorista'))
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
      await waitFor(() => expect(window.location.hash).toBe('#/geral?view=mock-sem-motorista&q=OS-10'))
      expect(replace).toHaveBeenCalled()
      expect(push).not.toHaveBeenCalled()
    } finally {
      replace.mockRestore()
      push.mockRestore()
      window.location.hash = ''
    }
  })

  it('troca de visão e busca por palavra-chave', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    await pickView('Sem motorista')
    await waitFor(() => expect(screen.queryAllByText(PAGE1)).toHaveLength(0))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const restore = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(restore).getByRole('button', { name: 'Restaurar colunas' }))
    fireEvent.click(within(restore).getByRole('button', { name: 'Aplicar' }))
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
  })

  it('adicionar campo da própria reserva e aplicar mostra a coluna na tabela', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Adicionar coluna de outra tabela/ }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Adicionar a coluna Razão do status' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Voltar às colunas' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await screen.findByRole('columnheader', { name: /Razão do status/, hidden: true })
  })

  it('o menu do título ordena crescente e decrescente; Restaurar padrão volta à ordem da visão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })
    await columnMenu(/^Trajeto$/, 'Ordenar A→Z')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
    await screen.findAllByText(PAGE1)
    await columnMenu(/^Trajeto$/, 'Ordenar Z→A')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    fireEvent.click(viewTrigger())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar padrão', hidden: true }))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('none'))
  }, 60_000)

  it('busca sem resultado mostra o estado vazio e limpar busca volta à lista', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'zzzz-nada' } })
    const empty = (await screen.findByText('Nenhum serviço nesta visão', {}, { timeout: 4000 })).closest('section') as HTMLElement
    // A caixa de busca também tem um "Limpar busca"; o do estado vazio é o que está dentro da seção.
    fireEvent.click(within(empty).getByRole('button', { name: 'Limpar busca' }))
    await screen.findAllByText(PAGE1)
  })

  it('a coluna oculta fica salva por visão e volta ao reabrir a tela', async () => {
    const first = render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    first.unmount()
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })
    expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull()
  })

  it('fechar o diálogo de colunas com alterações pede confirmação antes de descartar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas' })

    // Sem alterações: fecha direto.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar painel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()

    // Com alterações: X abre a confirmação; "Continuar editando" mantém o diálogo.
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const again = await screen.findByRole('dialog', { name: 'Colunas' })
    fireEvent.click(within(again).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Fechar painel' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Colunas' })).toBeTruthy()

    // Esc também pede confirmação; "Descartar" fecha sem aplicar.
    fireEvent(again, new Event('cancel', { cancelable: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas' })).toBeNull())
    expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toBeNull()
  })

  it('edita texto na célula com Enter e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'text')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Rota editada' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Rota editada')).toBeTruthy()
  })

  it('erro do servidor restaura o valor, mostra aviso e permite tentar de novo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const row = opener.closest('[role="row"]') as HTMLElement
    const cell = await cellOf(row, 'text')
    const before = cell.textContent
    fireEvent.doubleClick(cell)
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Não vai' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByText('Sem permissão para alterar este serviço.')).toBeTruthy()
    expect(cell.getAttribute('aria-invalid')).toBe('true')
    expect(within(cell).getByText(before!.replace(/Somente leitura/, '').trim() || '—')).toBeTruthy()
    expect(within(cell).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  })

  it('Esc cancela sem gravar e status abre um select', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const first = (await findDataRows())[1]
    const text = await cellOf(first, 'text')
    const original = text.textContent
    fireEvent.keyDown(text, { key: 'Enter' })
    fireEvent.change(within(text).getByRole('textbox'), { target: { value: 'descartar' } })
    fireEvent.keyDown(within(text).getByRole('textbox'), { key: 'Escape' })
    expect(text.textContent).toBe(original)
    const status = await cellOf(first, 'choice')
    fireEvent.keyDown(status, { key: 'Enter' })
    // O painel do Select usa `popover`, que o jsdom não exibe: a opção existe, mas fica fora da árvore acessível.
    expect(await within(status).findByRole('option', { name: 'Confirmado', hidden: true })).toBeTruthy()
  })

  it('dinheiro inválido mostra o erro local e mantém o campo aberto sem gravar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'money')
    fireEvent.keyDown(cell, { key: 'Enter' })
    const input = within(cell).getByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await within(cell).findByText('Valor inválido.')).toBeTruthy()
    expect(cell.getAttribute('aria-invalid')).toBe('true')
    expect(within(cell).getByRole('textbox')).toBe(input)
    expect(within(cell).queryByLabelText('Salvo')).toBeNull()
  })

  it('tentar de novo reabre a edição com o último valor digitado', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const cell = await cellOf(opener.closest('[role="row"]') as HTMLElement, 'text')
    fireEvent.doubleClick(cell)
    fireEvent.change(within(cell).getByRole('textbox'), { target: { value: 'Não vai' } })
    fireEvent.keyDown(within(cell).getByRole('textbox'), { key: 'Enter' })
    fireEvent.click(await within(cell).findByRole('button', { name: 'Tentar de novo' }))
    expect((within(cell).getByRole('textbox') as HTMLInputElement).value).toBe('Não vai')
    expect(cell.getAttribute('aria-invalid')).toBeNull()
  })

  it('escolher outro motorista grava e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    fireEvent.click(await within(cell).findByRole('option', { name: 'Bruno Dias', hidden: true }))
    expect(await within(cell).findByLabelText('Salvo')).toBeTruthy()
    expect(within(cell).getByText('Bruno Dias')).toBeTruthy()
  })

  it('tentar de novo regrava o Sim/Não que falhou', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    const opener = await screen.findByRole('button', { name: 'Abrir serviço OS-1013 no Formulário Geral', hidden: true })
    const cell = await cellOf(opener.closest('[role="row"]') as HTMLElement, 'boolean')
    const before = (within(cell).getByRole('switch') as HTMLInputElement).checked
    fireEvent.click(within(cell).getByRole('switch'))
    fireEvent.click(await within(cell).findByRole('button', { name: 'Tentar de novo' }))
    // Regravar volta ao estado "gravando" e, como a OS-1013 segue bloqueada, termina no erro de novo.
    expect(within(cell).getByLabelText('Gravando')).toBeTruthy()
    expect(await within(cell).findByText('Sem permissão para alterar este serviço.')).toBeTruthy()
    expect((within(cell).getByRole('switch') as HTMLInputElement).checked).toBe(before)
  })

  it('seleção mostra comandos; copiar abre a prévia com o bloco; desativar pede confirmação', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    // A linha do cabeçalho existe antes dos dados: espera as linhas chegarem.
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    // A linha de comando vira a barra da seleção; Editar (exige exatamente um) não aparece com 2 selecionados.
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    await acao('Copiar Serviços')
    const copy = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    expect((await within(copy).findByText(/\*ID:\* OS-/)).textContent).toContain('*Trajeto:*')
    // O X do Dialog também se chama "Fechar": o botão de ação é o último.
    fireEvent.click(within(copy).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Desativar 2 serviços?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText('2 serviços desativados.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('2 selecionados')).toBeNull())
  })

  it('em mock, criar avisa que o formulário abre no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByRole('row', { hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Criar serviço' }))
    expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
  })

  it('novo=1 na URL (atalho da Página Inicial) abre a criação e tira o parâmetro do link', async () => {
    window.location.hash = '#/geral?novo=1'
    try {
      render(<GeralPage host={{ mode: 'mock' }} />)
      expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
      await waitFor(() => expect(window.location.hash).not.toContain('novo='))
    } finally {
      window.location.hash = ''
    }
  })

  it('clique direito: na seleção age sobre ela; fora dela troca a seleção; Ctrl mantém o menu do navegador', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    // Linha já selecionada: o menu vale para os 2, e Editar (exige um) fica desabilitado.
    expect(fireEvent.contextMenu(rows[2], { clientX: 40, clientY: 40 })).toBe(false)
    const editar = await screen.findByRole('menuitem', { name: /^Editar/, hidden: true })
    expect((editar as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar Serviços', hidden: true }))
    expect(await screen.findByRole('dialog', { name: 'Copiar serviços' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Copiar serviços' })).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    // Linha fora da seleção: vira a única selecionada e Editar se habilita.
    fireEvent.contextMenu(rows[3], { clientX: 40, clientY: 80 })
    await waitFor(() => expect(screen.getByText('1 selecionado')).toBeTruthy())
    expect((screen.getByRole('menuitem', { name: 'Editar', hidden: true }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.keyDown(screen.getByRole('menu', { hidden: true }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu', { hidden: true })).toBeNull())
    // Ctrl + clique direito: o navegador abre o próprio menu.
    expect(fireEvent.contextMenu(rows[4], { ctrlKey: true })).toBe(true)
    expect(screen.queryByRole('menu', { hidden: true })).toBeNull()
  })

  it('com 1 selecionado, Editar abre o formulário e Gerar Voucher avisa que só roda no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    await acao('Gerar Voucher')
    expect(await screen.findByText('O voucher abre dentro do Dataverse.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(await screen.findByRole('dialog', { name: 'Formulário Geral abre no Dataverse' })).toBeTruthy()
  })
  it('no celular mostra cards e edita pela sheet', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    fireEvent.click(within(card).getByRole('button', { name: 'Editar campos' }))
    const sheet = await screen.findByRole('dialog', { name: /Serviço OS-/ })
    const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
    fireEvent.change(trajeto, { target: { value: 'Rota pelo celular' } })
    fireEvent.blur(trajeto)
    expect(await within(sheet).findByText('Salvo ✓')).toBeTruthy()
  })
  it('no celular, fechar a sheet com o campo em edição grava o que foi digitado', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    render(<GeralPage host={{ mode: 'mock' }} />)
    const card = (await screen.findAllByRole('listitem'))[0]
    fireEvent.click(within(card).getByRole('button', { name: 'Editar campos' }))
    const sheet = await screen.findByRole('dialog', { name: /Serviço OS-/ })
    const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
    trajeto.focus()
    fireEvent.change(trajeto, { target: { value: 'Rota sem blur' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    expect(await within((await screen.findAllByRole('listitem'))[0]).findByText('Rota sem blur')).toBeTruthy()
  })
})
