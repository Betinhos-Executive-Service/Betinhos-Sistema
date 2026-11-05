// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditoriaProvider } from '../../app/auditoria/AuditoriaProvider'
import { GeralPage } from './GeralPage'
import { acao, cellOf, columnMenu, dataRows, findDataRows, hooks, PAGE1, pickView, usarAmbienteGeral } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>()))
usarAmbienteGeral()

describe('Geral: correções finais', () => {
  const opener = (name: string) => ({ name: `Abrir serviço ${name} no Formulário Geral`, hidden: true })

  it('trocar de visão e buscar mudam de fato as linhas', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    // OS-1217 não tem motorista, mas fica além da primeira página (100 linhas) da Agenda; OS-1000 tem motorista.
    expect(screen.queryByRole('button', opener('OS-1217'))).toBeNull()
    expect(screen.getByRole('button', opener('OS-1000'))).toBeTruthy()
    await pickView('Sem motorista')
    expect(await screen.findByRole('button', opener('OS-1217'))).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1000'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1052'))).toBeTruthy()
    // A busca é no servidor: some o que não bate, fica o que bate.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar serviços' }), { target: { value: 'OS-1217' } })
    await waitFor(() => expect(screen.queryByRole('button', opener('OS-1052'))).toBeNull())
    expect(screen.getByRole('button', opener('OS-1217'))).toBeTruthy()
  })

  it('o cabeçalho mostra a ordem da visão e o menu do título a inverte', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const header = () => screen.getByRole('columnheader', { name: /Data e horário de saída/, hidden: true })
    expect(header().getAttribute('aria-sort')).toBe('ascending')
    await columnMenu(/^Data e horário de saída$/, 'Ordenar Z→A')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'))
    await screen.findAllByText(PAGE1)
    await columnMenu(/^Data e horário de saída$/, 'Ordenar A→Z')
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'))
  })

  it('o aviso do motorista aparece no editor da célula', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const cell = await cellOf((await findDataRows())[1], 'lookup')
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(await within(cell).findByTitle('Trocar o motorista dispara os avisos e a atribuição automática de veículo.')).toBeTruthy()
  })

  it('falha parcial ao desativar lista os ids que falharam e o primeiro erro', async () => {
    hooks.setState = async (ids) => ({ ok: [ids[0]], failed: [{ id: ids[1], message: 'Sem permissão' }] })
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
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
    await screen.findAllByText(PAGE1)
    const rows = dataRows()
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
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
    await acao('Copiar Serviços')
    const dialog = await screen.findByRole('dialog', { name: 'Copiar serviços' })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull())
    await new Promise((resolve) => { window.setTimeout(resolve, 700) })
    expect(screen.queryByRole('dialog', { name: 'Copiar serviços' })).toBeNull()
  })

  describe('Gerar link', () => {
    const writeText = vi.fn()
    beforeEach(() => { hooks.programada = true; writeText.mockReset().mockResolvedValue(undefined); vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } }) })
    afterEach(() => { hooks.programada = false; hooks.gerarLink = null; vi.unstubAllGlobals() })
    const item = async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: /^Ações/ }))
      return screen.findByRole('menuitem', { name: /^Gerar link/, hidden: true })
    }

    it('fica inerte quando o serviço não está Programado', async () => {
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[2]).getByRole('checkbox'))
      const menuitem = await item()
      expect(menuitem.getAttribute('aria-disabled') === 'true' || (menuitem as HTMLButtonElement).disabled).toBe(true)
      expect(menuitem.textContent).toContain('Programado')
    })

    it('mostra o link para abrir e copia ao clicar', async () => {
      hooks.gerarLink = async () => ({ ok: true, link: 'https://acompanhe.test/x', expiraEm: '2099-01-01T12:00:00Z' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      const dialog = await screen.findByRole('dialog', { name: /Link de acompanhamento/ })
      const abrir = await within(dialog).findByRole('link', { name: /Abrir link de acompanhamento/ })
      expect(abrir.getAttribute('href')).toBe('https://acompanhe.test/x')
      expect(within(dialog).getByText(/Válido até 01\/01 09:00/)).toBeTruthy()
      expect(writeText).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Copiar link' }))
      await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://acompanhe.test/x'))
      expect(await screen.findByText('Link copiado.')).toBeTruthy()
    })

    it('explica quando o ambiente não está configurado', async () => {
      hooks.gerarLink = async () => ({ ok: false, erro: 'Link de acompanhamento não configurado.' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      expect(await screen.findByText('Link de acompanhamento não configurado neste ambiente')).toBeTruthy()
      expect(screen.getByText(/Peça ao TI/)).toBeTruthy()
    })

    it('mostra o erro devolvido', async () => {
      hooks.gerarLink = async () => ({ ok: false, erro: 'Sem rastreador.' })
      render(<GeralPage host={{ mode: 'mock' }} />)
      await screen.findAllByText(PAGE1)
      fireEvent.click(within(dataRows()[1]).getByRole('checkbox'))
      fireEvent.click(await item())
      expect(await screen.findByText('Sem rastreador.')).toBeTruthy()
      expect(writeText).not.toHaveBeenCalled()
    })
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

describe('Geral: comandos Auditoria, Gerar OP, Disparar e Registrar Erro', () => {
  const pick = async (...ids: string[]) => {
    await screen.findAllByText(PAGE1)
    for (const id of ids) {
      const row = dataRows().find((r) => within(r).queryByText(id))
      if (!row) throw new Error(`Sem linha ${id}`)
      fireEvent.click(within(row).getByRole('checkbox'))
    }
  }
  const toolbar = () => screen.getByRole('toolbar', { name: 'Comandos de serviços' })

  it('sem seleção o menu Ações não existe; com seleção, Gerar OP e Disparar aparecem habilitados', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    expect(within(toolbar()).queryByRole('button', { name: /^Ações/ })).toBeNull()
    await pick('OS-1004')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Ações (1)' }))
    for (const name of ['Gerar OP', 'Disparar']) {
      const item = await screen.findByRole('menuitem', { name, hidden: true })
      expect((item as HTMLButtonElement).disabled).toBe(false)
    }
  })

  it('Gerar OP com um serviço que já tem OP mostra o diálogo parcial e, ao confirmar, avisa o sucesso', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1004', 'OS-1005')
    await acao('Gerar OP')
    const dialog = await screen.findByRole('dialog', { name: 'Gerar OP' })
    expect(within(dialog).getByText('Serviços com OP existente')).toBeTruthy()
    expect(within(dialog).getByText('OS-1004')).toBeTruthy()
    expect(within(dialog).getByText('Criar OP para 1 serviço(s) restante(s)?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sim, continuar' }))
    expect(await screen.findByText('OP criada para 1 serviço(s).')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gerar OP' })).toBeNull())
  })

  it('Gerar OP só com serviços que já têm OP avisa e não abre o diálogo', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1004')
    await acao('Gerar OP')
    expect(await screen.findByText('Todos os serviços selecionados já possuem OP.')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Gerar OP' })).toBeNull()
  })

  it('Disparar com a OS-1013 reporta a falha parcial', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1013', 'OS-1005')
    await acao('Disparar')
    const dialog = await screen.findByRole('dialog', { name: 'Marcar 2 serviço(s) como Programado?' })
    expect(within(dialog).getByText('Serviços sem motorista são recusados pelo servidor.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disparar' }))
    expect(await screen.findByText(/1 de 2 programados; falharam: OS-1013\./)).toBeTruthy()
  })

  it('Auditoria abre o painel da seleção; Registrar Erro em mock mostra o aviso', async () => {
    render(<AuditoriaProvider host={{ mode: 'mock' }}><GeralPage host={{ mode: 'mock' }} /></AuditoriaProvider>)
    await pick('OS-1005')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Auditoria', hidden: true }))
    const painel = await screen.findByRole('dialog', { name: 'Auditoria', hidden: true })
    expect(within(painel).getByText(/1 registro/)).toBeTruthy()
    expect(await within(painel).findAllByText('Status', {}, { timeout: 2000 })).not.toHaveLength(0)
    fireEvent.click(within(painel).getByRole('button', { name: 'Fechar painel', hidden: true }))
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Registrar Erro', hidden: true }))
    expect(await screen.findByText('A Gestão de Qualidade abre dentro do Dataverse.')).toBeTruthy()
  })

  it('Contagem de Serviços abre o painel com os motoristas do mock', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await screen.findAllByText(PAGE1)
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Contagem de Serviços', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Serviços por motorista', hidden: true })
    for (const nome of ['Carlos Lima', 'Ana Souza', 'Bruno Dias', 'Teste']) expect(await within(dialog).findByText(nome)).toBeTruthy()
    expect(within(dialog).getByText(/^Total — /)).toBeTruthy()
  })

  it('Registrar Erro fica inerte com 2 selecionados', async () => {
    render(<GeralPage host={{ mode: 'mock' }} />)
    await pick('OS-1005', 'OS-1006')
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Mais ações' }))
    const item = (await screen.findByRole('menuitem', { name: /Registrar Erro/, hidden: true })) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(within(item).getByText('Selecione exatamente um serviço.')).toBeTruthy()
  })
})
