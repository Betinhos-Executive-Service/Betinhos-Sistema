// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConciliacaoCartaoPage } from './ConciliacaoCartaoPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/conciliacao-cartao'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const linha = (nome: string) => screen.findByRole('button', { name: new RegExp(`^${nome}`) })
const aba = (nome: RegExp) => fireEvent.click(screen.getByRole('tab', { name: nome }))

async function abrir(nome: string) {
  fireEvent.click(await linha(nome))
  return screen.findByRole('dialog', { name: nome })
}
async function renderPage() {
  render(<ConciliacaoCartaoPage host={{ mode: 'mock' }} />)
  await linha('POSTO SHELL AV BRASIL')
}
/** Espera o drawer fechar (o `<dialog>` some da árvore acessível). */
const fechou = (nome: string) => waitFor(() => expect(screen.queryByRole('dialog', { name: nome })).toBeNull())

describe('Conciliação do cartão', () => {
  it('Para revisar mostra pendente, sem motorista e divergência; as outras abas separam o resto', async () => {
    await renderPage()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
    for (const n of ['RESTAURANTE SABOR', 'ESTACIONAMENTO CENTRO', 'LAVA RAPIDO JARDINS']) await linha(n)
    expect(screen.queryByText('POSTO IPIRANGA MARGINAL')).toBeNull()
    aba(/^Aguardando motorista/); await linha('AUTO PECAS SILVA')
    aba(/^Conciliadas/); await linha('POSTO IPIRANGA MARGINAL'); await linha('PEDAGIO ECOVIAS')
    aba(/^Ignoradas/); await linha('IOF COMPRA INTERNACIONAL')
    aba(/^Cartões/); await linha('Nubank conta toda · Elaine')
  })

  it('filtra por motorista', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('combobox', { name: 'Motorista' }))
    fireEvent.click((await screen.findAllByText('Diego Exemplo Rocha')).map((e) => e.closest('[role="option"]')).find(Boolean)!)
    await waitFor(() => expect(screen.queryByText('POSTO SHELL AV BRASIL')).toBeNull())
    expect(await linha('RESTAURANTE SABOR')).toBeTruthy()
  })

  it('casa com a despesa candidata e move para Conciliadas', async () => {
    await renderPage()
    const d = await abrir('POSTO SHELL AV BRASIL')
    fireEvent.click(await within(d).findByRole('radio', { name: /Combustível Shell/ }))
    expect(within(d).queryByText(/Combustível no Pix/)).toBeNull()
    fireEvent.click(within(d).getByRole('button', { name: 'Casar com a despesa escolhida' }))
    await fechou('POSTO SHELL AV BRASIL')
    expect(await screen.findByText('Transação casada com a despesa.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^POSTO SHELL AV BRASIL/ })).toBeNull()
    aba(/^Conciliadas/)
    const row = (await linha('POSTO SHELL AV BRASIL')).closest('.bt-table__row') as HTMLElement
    expect(within(row).getByText('Conciliada manual')).toBeTruthy()
  })

  it('ignorar exige motivo; com motivo vai para Ignoradas e pode reabrir', async () => {
    await renderPage()
    const d = await abrir('RESTAURANTE SABOR')
    fireEvent.click(within(d).getByRole('button', { name: 'Ignorar transação' }))
    expect(within(d).getByText('Diga por que a transação não precisa de despesa.')).toBeTruthy()
    fireEvent.change(within(d).getByRole('textbox', { name: /Motivo para ignorar/ }), { target: { value: 'Compra pessoal, já descontada.' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Ignorar transação' }))
    await fechou('RESTAURANTE SABOR')
    aba(/^Ignoradas/)
    const r = await abrir('RESTAURANTE SABOR')
    expect(within(r).getByText('Compra pessoal, já descontada.')).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'Reabrir transação' }))
    await fechou('RESTAURANTE SABOR')
    aba(/^Para revisar/)
    expect(await linha('RESTAURANTE SABOR')).toBeTruthy()
  })

  it('fechar com motivo digitado pede confirmação', async () => {
    await renderPage()
    const d = await abrir('RESTAURANTE SABOR')
    fireEvent.change(within(d).getByRole('textbox', { name: /Motivo para ignorar/ }), { target: { value: 'x' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Fechar' }))
    const conf = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(conf).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.getByRole('dialog', { name: 'RESTAURANTE SABOR' })).toBeTruthy()
  })

  it('ir cadastrar o cartão com motivo digitado também pede confirmação', async () => {
    await renderPage()
    const d = await abrir('ESTACIONAMENTO CENTRO')
    fireEvent.change(within(d).getByRole('textbox', { name: /Motivo para ignorar/ }), { target: { value: 'x' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Cadastrar cartão' }))
    const conf = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    expect(screen.queryByRole('dialog', { name: 'Novo cartão' })).toBeNull()
    fireEvent.click(within(conf).getByRole('button', { name: 'Descartar' }))
    expect(await screen.findByRole('dialog', { name: 'Novo cartão' })).toBeTruthy()
  })

  it('reprocessa a sem motorista pelo cartão da conta inteira e casa em seguida', async () => {
    await renderPage()
    const d = await abrir('LAVA RAPIDO JARDINS')
    expect(within(d).getByText('Nubank conta toda · Elaine')).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Vincular cartão e motorista' }))
    fireEvent.click(await within(d).findByRole('radio', { name: /Lavagem do carro/ }))
    fireEvent.click(within(d).getByRole('button', { name: 'Casar com a despesa escolhida' }))
    await fechou('LAVA RAPIDO JARDINS')
    aba(/^Conciliadas/)
    const row = (await linha('LAVA RAPIDO JARDINS')).closest('.bt-table__row') as HTMLElement
    expect(within(row).getByText('Elaine Mock Duarte')).toBeTruthy()
  })

  it('sem cartão vigente: cadastra o cartão a partir da transação e reprocessa', async () => {
    await renderPage()
    const d = await abrir('ESTACIONAMENTO CENTRO')
    fireEvent.click(within(d).getByRole('button', { name: 'Cadastrar cartão' }))
    const c = await screen.findByRole('dialog', { name: 'Novo cartão' })
    expect((within(c).getByRole('textbox', { name: /Conta no Banco MCP/ }) as HTMLInputElement).value).toBe('conta-itau-0001')
    expect((within(c).getByRole('textbox', { name: /Final do cartão/ }) as HTMLInputElement).value).toBe('9012')
    fireEvent.click(within(c).getByRole('button', { name: 'Cadastrar cartão' }))
    expect(await within(c).findByText('Informe o nome do cartão.')).toBeTruthy()
    fireEvent.change(within(c).getByRole('textbox', { name: /^Nome/ }), { target: { value: 'Itaú final 9012 · Fabio' } })
    fireEvent.click(within(c).getByRole('combobox', { name: /Motorista/ }))
    fireEvent.click((await screen.findAllByText('Fabio Demo Nunes')).map((e) => e.closest('[role="option"]')).find(Boolean)!)
    fireEvent.click(within(c).getByRole('button', { name: 'Cadastrar cartão' }))
    await fechou('Novo cartão')

    const r = await abrir('ESTACIONAMENTO CENTRO')
    expect(within(r).getByText('Itaú final 9012 · Fabio')).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'Vincular cartão e motorista' }))
    expect(await within(r).findByText(/Nenhuma despesa encontrada/)).toBeTruthy()
    fireEvent.click(within(r).getByRole('button', { name: 'Fechar' }))
    await fechou('ESTACIONAMENTO CENTRO')
    const row = (await linha('ESTACIONAMENTO CENTRO')).closest('.bt-table__row') as HTMLElement
    expect(within(row).getByText('Fabio Demo Nunes')).toBeTruthy()
    expect(within(row).getByText('Pendente')).toBeTruthy()
    aba(/^Cartões/); await linha('Itaú final 9012 · Fabio')
  })
})
