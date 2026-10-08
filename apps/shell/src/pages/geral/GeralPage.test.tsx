// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Source } from './data/source'
import { GeralPage } from './GeralPage'

// Ganchos para simular o que o mock não faz: falha parcial de estado, linha inativa e cópia lenta.
const hooks = vi.hoisted(() => ({
  setState: null as null | Source['setState'],
  copyRows: null as null | Source['copyRows'],
  update: null as null | Source['update'],
  mixedState: false,
}))
vi.mock('./data/source', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/source')>()
  return {
    ...actual,
    createSource: (host: Parameters<typeof actual.createSource>[0]): Source => {
      // Sem a latência simulada do pnpm dev: os testes não esperam timers artificiais.
      const source = actual.createSource(host, { latency: 0 })
      return {
        ...source,
        setState: (ids, active) => (hooks.setState ? hooks.setState(ids, active) : source.setState(ids, active)),
        copyRows: (ids) => (hooks.copyRows ? hooks.copyRows(ids) : source.copyRows(ids)),
        update: (id, patch) => (hooks.update ? hooks.update(id, patch) : source.update(id, patch)),
        page: async (request) => {
          const page = await source.page(request)
          return hooks.mixedState ? { ...page, rows: page.rows.map((row, index) => (index === 1 ? { ...row, statecode: 1 } : row)) } : page
        },
      }
    },
  }
})

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  hooks.setState = null
  hooks.copyRows = null
  hooks.update = null
  hooks.mixedState = false
})

/** A célula só vira editável quando a metadata chega: espera a classe do tipo aparecer na linha. */
const cellOf = (row: HTMLElement, kind: string) =>
  waitFor(() => {
    const cell = within(row).getAllByRole('gridcell').find((c) => c.className.includes(`gr-cell--${kind}`))
    if (!cell) throw new Error(`Sem célula ${kind}`)
    return cell
  })

describe('Geral', () => {
  it('abre a Agenda com as colunas da visão, pagina e ordena', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('columnheader', { name: /Status de Operação/, hidden: true })).toBeTruthy()
    // A linha do cabeçalho já existe antes dos dados: espera as 50 linhas chegarem.
    await waitFor(() => expect(screen.getAllByRole('row', { hidden: true }).length).toBeGreaterThan(10))
    expect(screen.getByText(/Linhas 1–50 de/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Status de Operação/, hidden: true }))
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /Status de Operação/, hidden: true }).getAttribute('aria-sort')).toBe('ascending'))
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    await screen.findByText(/Linhas 51–/)
    // O primeiro teste paga a carga fria dos módulos: com a máquina ocupada passa dos 30 s do padrão.
  }, 60_000)

  it('troca de visão e busca por palavra-chave', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50/)
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    // O painel do Select usa `popover`, que o jsdom não exibe: as opções existem, mas ficam fora da árvore acessível.
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista', hidden: true }))
    await waitFor(() => expect(screen.queryByText(/Linhas 1–50/)).toBeNull())
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-10' } })
    await waitFor(() => expect(screen.getAllByText(/OS-10\d/).length).toBeGreaterThan(0), { timeout: 4000 })
  })

  it('ocultar coluna some da tabela e volta com restaurar', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Colunas da visão' })).getByRole('button', { name: 'Restaurar colunas da visão' }))
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
  })

  it('o clique no cabeçalho cicla crescente, decrescente e ordem da visão', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const header = () => screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })
    const sort = () => fireEvent.click(screen.getByRole('button', { name: /Trajeto/, hidden: true }))
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
    await screen.findByText(/Linhas 1–50 de/)
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findByText(/Linhas 1–50 de/)
    sort()
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('none'))
  }, 60_000)

  it('busca sem resultado mostra o estado vazio e limpar busca volta à lista', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'zzzz-nada' } })
    const empty = (await screen.findByText('Nenhum serviço nesta visão', {}, { timeout: 4000 })).closest('section') as HTMLElement
    // A caixa de busca também tem um "Limpar busca"; o do estado vazio é o que está dentro da seção.
    fireEvent.click(within(empty).getByRole('button', { name: 'Limpar busca' }))
    await screen.findByText(/Linhas 1–50 de/)
  })

  it('a coluna oculta fica salva por visão e volta ao reabrir a tela', async () => {
    const first = render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByRole('columnheader', { name: /Trajeto/, hidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover Trajeto para cima' }))
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
    const dialog = await screen.findByRole('dialog', { name: 'Colunas da visão' })

    // Sem alterações: fecha direto.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas da visão' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()

    // Com alterações: X abre a confirmação; "Continuar editando" mantém o diálogo.
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const again = await screen.findByRole('dialog', { name: 'Colunas da visão' })
    fireEvent.click(within(again).getByRole('checkbox', { name: 'Trajeto' }))
    fireEvent.click(within(again).getByRole('button', { name: 'Fechar' }))
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Colunas da visão' })).toBeTruthy()

    // Esc também pede confirmação; "Descartar" fecha sem aplicar.
    fireEvent(again, new Event('cancel', { cancelable: true }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Colunas da visão' })).toBeNull())
    expect(screen.getByRole('columnheader', { name: /Trajeto/, hidden: true })).toBeTruthy()
    expect(window.localStorage.getItem('betinhos.geral.colunas.v1')).toBeNull()
  })

  it('edita texto na célula com Enter e mostra salvo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'text')
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
    await screen.findByText(/Linhas 1–50 de/)
    const first = (await screen.findAllByRole('row', { hidden: true }))[1]
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
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'money')
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
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'lookup')
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
    await screen.findByText(/Linhas 1–50 de/)
    const rows = screen.getAllByRole('row', { hidden: true })
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    expect(screen.getByText('2 selecionados')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Serviços' }))
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

  it('com 1 selecionado, Editar abre o formulário e Gerar Voucher avisa que só roda no Dataverse', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    fireEvent.click(within(screen.getAllByRole('row', { hidden: true })[1]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Voucher' }))
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

describe('Geral: correções finais', () => {
  const opener = (name: string) => ({ name: `Abrir serviço ${name} no Formulário Geral`, hidden: true })

  it('trocar de visão e buscar mudam de fato as linhas', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50/)
    // OS-1057 não tem motorista, mas cai na segunda página da Agenda; OS-1000 tem motorista.
    expect(screen.queryByRole('button', opener('OS-1057'))).toBeNull()
    expect(screen.getByRole('button', opener('OS-1000'))).toBeTruthy()
    fireEvent.click(screen.getByRole('combobox', { name: 'Visão' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Sem motorista', hidden: true }))
    expect(await screen.findByRole('button', opener('OS-1057'))).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1000'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1052'))).toBeTruthy()
    // A busca é no servidor: some o que não bate, fica o que bate.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-1057' } })
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1052'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1057'))).toBeTruthy()
  })

  it('o cabeçalho mostra a ordem da visão e o primeiro clique nela inverte', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const header = () => screen.getByRole('columnheader', { name: /Data e horário de saída/, hidden: true })
    expect(header().getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(within(header()).getByRole('button'))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findByText(/Linhas 1–50 de/)
    fireEvent.click(within(header()).getByRole('button'))
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
  })

  it('o aviso do motorista aparece no editor da célula', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const cell = await cellOf((await screen.findAllByRole('row', { hidden: true }))[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(await within(cell).findByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
  })

  it('falha parcial ao desativar lista os ids que falharam e o primeiro erro', async () => {
    hooks.setState = async (ids) => ({ ok: [ids[0]], failed: [{ id: ids[1], message: 'Sem permissão' }] })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const rows = screen.getAllByRole('row', { hidden: true })
    const failedName = within(rows[2]).getByRole('button', { name: /Abrir serviço/ }).textContent
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Desativar 2 serviços?' })).getByRole('button', { name: 'Desativar' }))
    expect(await screen.findByText(`1 de 2 serviços desativados; falharam: ${failedName}. Sem permissão`)).toBeTruthy()
  })

  it('Desativar e Ativar com seleção mista ficam focáveis, explicam o motivo e não fazem nada', async () => {
    hooks.mixedState = true
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    const rows = screen.getAllByRole('row', { hidden: true })
    fireEvent.click(within(rows[1]).getByRole('checkbox'))
    fireEvent.click(within(rows[2]).getByRole('checkbox'))
    const reason = 'Selecione só serviços ativos ou só inativos.'
    for (const name of ['Desativar', 'Ativar']) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('aria-disabled')).toBe('true')
      expect((button as HTMLButtonElement).disabled).toBe(false)
      expect(button.getAttribute('title')).toBe(reason)
      expect(document.getElementById(button.getAttribute('aria-describedby') ?? '')?.textContent).toBe(reason)
      fireEvent.click(button)
    }
    expect(screen.queryByRole('dialog', { name: /serviços?\?/ })).toBeNull()
  })

  it('fechar a prévia de cópia antes do texto chegar não a reabre', async () => {
    hooks.copyRows = () => new Promise((resolve) => { window.setTimeout(() => resolve([]), 400) })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findByText(/Linhas 1–50 de/)
    fireEvent.click(within(screen.getAllByRole('row', { hidden: true })[1]).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Copiar Serviços' }))
    const dialog = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull())
    await new Promise((resolve) => { window.setTimeout(resolve, 700) })
    expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull()
  })

  describe('no celular', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    })
    const openSheet = async (name?: string) => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      const cards = await screen.findAllByRole('listitem')
      const card = name ? cards.find((c) => c.textContent?.includes(name)) : cards[0]
      fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Editar campos' }))
      return screen.findByRole('dialog', { name: /Serviço OS-/ })
    }

    it('não fecha enquanto um campo grava e anuncia o estado numa região viva', async () => {
      // A gravação só termina quando o teste libera: o estado "gravando" não depende da velocidade da máquina.
      let release: () => void = () => undefined
      hooks.update = () => new Promise<void>((resolve) => { release = resolve })
      const sheet = await openSheet()
      const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
      fireEvent.change(trajeto, { target: { value: 'Rota lenta' } })
      fireEvent.blur(trajeto)
      expect(await within(sheet).findByText('Gravando…')).toBeTruthy()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      // O Sheet anima a saída, pede o fechamento ao pai e, recusado, volta: espera esse retorno.
      await waitFor(() => expect(sheet.hasAttribute('data-closing')).toBe(false))
      expect(within(sheet).getByText('Gravando…')).toBeTruthy()
      expect(screen.getByRole('dialog', { name: /Serviço OS-/ })).toBeTruthy()
      await act(async () => { release() })
      const saved = await within(sheet).findByText('Salvo ✓')
      expect(saved.closest('[aria-live="polite"]')).not.toBeNull()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    })

    it('com valor inválido digitado pede confirmação antes de descartar', async () => {
      const sheet = await openSheet()
      const cotacao = within(sheet).getByLabelText('Cotação') as HTMLInputElement
      cotacao.focus()
      fireEvent.change(cotacao, { target: { value: 'abc' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull())
      expect(screen.getByRole('dialog', { name: /Serviço OS-/ })).toBeTruthy()
      expect(await within(sheet).findByText('Valor inválido.')).toBeTruthy()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
    })

    it('erro de gravação com a sheet já fechada vira aviso com campo, serviço e motivo', async () => {
      const sheet = await openSheet('OS-1013')
      const trajeto = within(sheet).getByLabelText('Trajeto') as HTMLInputElement
      trajeto.focus()
      fireEvent.change(trajeto, { target: { value: 'Não vai' } })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Serviço OS-/ })).toBeNull())
      expect(await screen.findByText('Não foi possível salvar Trajeto do serviço OS-1013: Sem permissão para alterar este serviço.')).toBeTruthy()
    })

    it('o aviso do motorista aparece no campo da sheet', async () => {
      const sheet = await openSheet()
      expect(within(sheet).getByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
    })
  })
})
