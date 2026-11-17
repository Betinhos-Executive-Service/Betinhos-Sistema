// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GavetaRegistro } from '../../app/GavetaRegistro'
import { avisarRegistroAlterado, fecharGavetaRegistro } from '../../app/registroAberto'
import { todaySP } from '../frota/data/dates'
import { GeralPage } from './GeralPage'
import { acao, cellOf, hooks, pickView, usarAmbienteGeral, viewTrigger } from './testUtils'

vi.mock('./data/source', async (importOriginal) => (await import('./testUtils')).mockSource(await importOriginal<typeof import('./data/source')>(), { manutencoes: true }))
usarAmbienteGeral()
afterEach(() => { act(() => fecharGavetaRegistro()) })

const host = { mode: 'mock' } as const
// A busca deixa na lista só as quatro linhas de manutenção do mock (OS-9001 a OS-9004).
beforeEach(() => { window.location.hash = '#/geral?q=OS-900' })
const abrirDe = (descricao: string) => screen.findByRole('button', { name: new RegExp(`^Abrir manutenção ${descricao}`), hidden: true })
const linhaDe = async (descricao: string) => (await abrirDe(descricao)).closest('[role="row"]') as HTMLElement
const chave = () => screen.getByLabelText('Mostrar manutenções') as HTMLInputElement
const nenhumaManutencao = () => screen.queryByRole('button', { name: /^Abrir manutenção/, hidden: true }) == null

describe('Geral › linhas de manutenção', () => {
  it('aparecem com outra cara, com o selo de atrasada, e abrem a gaveta da manutenção pela Geral', async () => {
    render(<><GeralPage host={host} /><GavetaRegistro host={host} /></>)
    const m3 = await linhaDe('Manutenção fictícia m3')
    expect(m3.className).toContain('gr-row--manutencao')
    expect(within(m3).getByText('Programado')).toBeTruthy()
    expect(within(m3).getByText('Atrasada')).toBeTruthy()
    const m2 = await linhaDe('Manutenção fictícia m2')
    expect(within(m2).getByText('Agendado')).toBeTruthy()
    expect(within(m2).queryByText('Atrasada')).toBeNull()
    // Agendada com a janela da semana passada: atrasada, sem motorista.
    expect(within(await linhaDe('Ar-condicionado sem gelar')).getByText('Atrasada')).toBeTruthy()
    fireEvent.click(await abrirDe('Manutenção fictícia m3'))
    expect(await screen.findByRole('dialog', { name: 'Manutenção fictícia m3' }, { timeout: 20_000 })).toBeTruthy()
  })

  it('a linha ligada à manutenção mas sem os dados do link mostra os rótulos de reserva e abre a gaveta', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    const semLink = await waitFor(() => {
      const linha = screen.getAllByRole('row', { hidden: true }).find((r) => r.className.includes('gr-row--manutencao') && r.textContent?.includes('Sem descrição'))
      if (!linha) throw new Error('Sem a linha sem dados do link')
      return linha
    })
    expect(within(semLink).getByText('Sem status')).toBeTruthy()
    expect(within(semLink).getByText('Sem janela')).toBeTruthy()
  })

  it('"Mostrar manutenções" desligado tira as linhas, marca a visão como Alterada e vai para a URL', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    expect(chave().checked).toBe(true)
    fireEvent.click(chave())
    await waitFor(() => expect(nenhumaManutencao()).toBe(true))
    expect(viewTrigger().textContent).toContain('Alterada')
    await waitFor(() => expect(window.location.hash).toContain('m=0'))
  })

  it('a visão de faturamento abre desligada; ligar traz as manutenções e a visão fica Alterada', async () => {
    window.location.hash = '#/geral?view=mock-faturamento&q=OS-900'
    render(<GeralPage host={host} />)
    await waitFor(() => expect(viewTrigger().textContent).toContain('Faturamento'))
    await waitFor(() => expect(chave().checked).toBe(false))
    expect(viewTrigger().textContent).not.toContain('Alterada')
    expect(nenhumaManutencao()).toBe(true)
    fireEvent.click(chave())
    await abrirDe('Manutenção fictícia m3')
    expect(viewTrigger().textContent).toContain('Alterada')
    await waitFor(() => expect(window.location.hash).toContain('m=1'))
  })

  it('Salvar como e Salvar gravam "Mostrar manutenções" na visão: reaberta, volta como foi salva, sem Alterada nem m= na URL', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    // Salvar como: desligado.
    fireEvent.click(chave())
    await waitFor(() => expect(nenhumaManutencao()).toBe(true))
    fireEvent.click(viewTrigger())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Salvar como…', hidden: true }))
    const dialog = await screen.findByRole('dialog', { name: 'Salvar como visão' })
    fireEvent.change(within(dialog).getByLabelText(/Nome da visão/), { target: { value: 'Sem manutenções' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar visão' }))
    await waitFor(() => expect(viewTrigger().textContent).toContain('Sem manutenções'))
    await waitFor(() => expect(chave().checked).toBe(false))
    expect(viewTrigger().textContent).not.toContain('Alterada')
    expect(window.location.hash).not.toContain('m=')
    expect(nenhumaManutencao()).toBe(true)
    // Salvar: liga de novo e regrava a mesma visão.
    fireEvent.click(chave())
    await abrirDe('Manutenção fictícia m3')
    await waitFor(() => expect(viewTrigger().textContent).toContain('Alterada'))
    fireEvent.click(viewTrigger())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Salvar', hidden: true }))
    expect(await screen.findByText('Visão salva.')).toBeTruthy()
    await waitFor(() => expect(viewTrigger().textContent).not.toContain('Alterada'))
    expect(chave().checked).toBe(true)
    expect(window.location.hash).not.toContain('m=')
    await abrirDe('Manutenção fictícia m3')
  }, 60_000)

  it('"Restaurar padrão" volta o liga/desliga ao da visão', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    fireEvent.click(chave())
    await waitFor(() => expect(viewTrigger().textContent).toContain('Alterada'))
    fireEvent.click(viewTrigger())
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar padrão', hidden: true }))
    await waitFor(() => expect(chave().checked).toBe(true))
    await abrirDe('Manutenção fictícia m3')
    expect(viewTrigger().textContent).not.toContain('Alterada')
  })

  it('só motorista e saída editam; saída fora da janela grava, avisa e marca a linha', async () => {
    render(<GeralPage host={host} />)
    const m2 = await linhaDe('Manutenção fictícia m2')
    const saida = await cellOf(m2, 'datetime')
    expect(within(m2).getAllByRole('gridcell').filter((c) => c.className.includes('gr-cell--editable'))).toHaveLength(2)
    expect(m2.querySelector('.gr-cell--money, .gr-cell--text, .gr-cell--choice')).toBeNull()
    fireEvent.keyDown(saida, { key: 'Enter' })
    const input = saida.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: `${todaySP()}T10:00` } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/ficou fora da janela da manutenção/)).toBeTruthy()
    expect(await within(m2).findByText('Fora da janela')).toBeTruthy()
  })

  describe('ações da seleção', () => {
    const selecionar = async (descricao: string) => fireEvent.click(within(await linhaDe(descricao)).getByRole('checkbox'))
    const maisAcoes = async () => {
      fireEvent.click(within(screen.getByRole('toolbar', { name: 'Comandos de serviços' })).getByRole('button', { name: /^Mais ações/ }))
      await screen.findAllByRole('menuitem', { hidden: true })
    }
    const desabilitado = (item: HTMLElement) => item.getAttribute('aria-disabled') === 'true' || (item as HTMLButtonElement).disabled

    it('com manutenção na seleção, as cinco ações só de serviço ficam inertes com o motivo', async () => {
      render(<GeralPage host={host} />)
      await selecionar('Manutenção fictícia m2')
      await maisAcoes()
      for (const nome of ['Gerar Voucher', 'Liberar para o portal', 'Gerar link', 'Link de cadastro', 'Gerar OP']) {
        const item = await screen.findByRole('menuitem', { name: new RegExp(`^${nome}`), hidden: true })
        expect(desabilitado(item), nome).toBe(true)
        expect(item.textContent, nome).toContain('Ação só para serviços')
      }
    })

    it('Disparar, Copiar e Registrar Erro continuam disponíveis com manutenção na seleção', async () => {
      render(<GeralPage host={host} />)
      await selecionar('Manutenção fictícia m2')
      await maisAcoes()
      for (const nome of ['Disparar', 'Registrar Erro']) {
        const item = await screen.findByRole('menuitem', { name: new RegExp(`^${nome}`), hidden: true })
        expect(desabilitado(item), nome).toBe(false)
      }
    })

    it('com só serviços na seleção, as ações de serviço seguem como sempre', async () => {
      window.location.hash = '#/geral'
      render(<GeralPage host={host} />)
      const servico = await waitFor(() => {
        const linha = screen.getAllByRole('row', { hidden: true }).find((r) => r.classList.contains('bt-table__row') && !r.classList.contains('gr-row--manutencao') && r.querySelector('input[type="checkbox"]'))
        if (!linha) throw new Error('Sem linha de serviço')
        return linha
      })
      fireEvent.click(within(servico).getByRole('checkbox'))
      await maisAcoes()
      const voucher = await screen.findByRole('menuitem', { name: /^Gerar Voucher/, hidden: true })
      expect(voucher.textContent).not.toContain('Ação só para serviços')
    })

    it('"Editar" com a manutenção selecionada abre a gaveta dela, não o Formulário Geral', async () => {
      render(<><GeralPage host={host} /><GavetaRegistro host={host} /></>)
      await selecionar('Manutenção fictícia m3')
      await acao('Editar')
      expect(await screen.findByRole('dialog', { name: 'Manutenção fictícia m3' }, { timeout: 20_000 })).toBeTruthy()
    })
  })

  it('gravar na gaveta relê a lista da Geral', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    const antes = hooks.paginas
    act(() => avisarRegistroAlterado('cr40f_manutencoes', 'm3'))
    await waitFor(() => expect(hooks.paginas).toBeGreaterThan(antes))
  })

  it('aviso de outra tabela não relê a lista', async () => {
    render(<GeralPage host={host} />)
    await abrirDe('Manutenção fictícia m3')
    const antes = hooks.paginas
    act(() => avisarRegistroAlterado('cr40f_veiculos', 'v1'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(hooks.paginas).toBe(antes)
  })

  describe('no celular', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width: 820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    })

    it('o card da manutenção tem o selo e "Programar" abre a edição só com motorista e saída', async () => {
      render(<GeralPage host={host} />)
      await screen.findByLabelText('Mostrar manutenções')
      const card = (await screen.findAllByRole('listitem')).find((c) => c.textContent?.includes('TST1A11')) as HTMLElement
      expect(card.className).toContain('gr-card--manutencao')
      expect(within(card).getByText('Atrasada')).toBeTruthy()
      fireEvent.click(within(card).getByRole('button', { name: 'Programar' }))
      const sheet = await screen.findByRole('dialog', { name: 'Manutenção · TST1A11' })
      expect(within(sheet).getByText('Programar manutenção')).toBeTruthy()
      expect(within(sheet).getByText('Motorista')).toBeTruthy()
      expect(within(sheet).getByLabelText('Data e horário de saída')).toBeTruthy()
      expect(within(sheet).queryByLabelText('Trajeto')).toBeNull()
      expect(within(sheet).queryByText('Comprovantes de recebimento')).toBeNull()
    })

    it('numa visão sem as colunas, a edição da manutenção cria o campo de motorista e o de saída', async () => {
      render(<GeralPage host={host} />)
      await screen.findByLabelText('Mostrar manutenções')
      await pickView('Sem motorista')
      const card = await waitFor(() => {
        const achado = screen.getAllByRole('listitem').find((c) => c.className.includes('gr-card--manutencao') && c.textContent?.includes('TST2B22'))
        if (!achado) throw new Error('Sem o card da manutenção sem motorista')
        return achado
      })
      fireEvent.click(within(card).getByRole('button', { name: 'Programar' }))
      const sheet = await screen.findByRole('dialog', { name: 'Manutenção · TST2B22' })
      expect(within(sheet).getByText('Motorista')).toBeTruthy()
      expect(within(sheet).getByLabelText('Data e horário de saída')).toBeTruthy()
    })
  })
})
