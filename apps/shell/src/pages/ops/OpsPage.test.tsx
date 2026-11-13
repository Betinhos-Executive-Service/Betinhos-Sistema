// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpsPage } from './OpsPage'
import { OP_STATUS } from './domain/status'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const openRow = async (code: string) => fireEvent.click((await screen.findByText(code)).closest('button')!)


const blobText = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.readAsText(blob)
})

describe('Ordens de Pagamento', () => {
  it('seleção em lote: copia os números e exporta as OPs selecionadas', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const blobs: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:x' }, revokeObjectURL: () => undefined }))
    render(<OpsPage host={{ mode: 'mock' }} />)
    fireEvent.click((await screen.findByText('OP-401')).closest('.bt-table__row')!.querySelector('.pg-num')!)
    fireEvent.click((await screen.findByText('OP-402')).closest('.bt-table__row')!.querySelector('.pg-num')!, { shiftKey: true })
    const faixa = screen.getByRole('group', { name: 'Comandos da seleção' })
    expect(within(faixa).getByText(/selecionados/)).toBeTruthy()

    fireEvent.click(within(faixa).getByRole('button', { name: 'Copiar números' }))
    await screen.findByText(/números de OP copiados\./)
    expect(writeText.mock.calls[0][0]).toMatch(/OP-401/)
    expect(writeText.mock.calls[0][0]).toMatch(/OP-402/)

    fireEvent.click(within(faixa).getByRole('button', { name: 'Exportar seleção' }))
    await screen.findByText(/OPs exportadas\./)
    expect(await blobText(blobs[0])).toMatch(/OP-401/)
  })

  it('Fechar mês no cabeçalho: escolhe cliente e mês, confirma e avisa', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar mês' }))
    const dialog = await screen.findByRole('dialog', { name: 'Fechar mês?' })
    fireEvent.click(await within(dialog).findByRole('combobox', { name: 'Cliente' }))
    await waitFor(() => expect(screen.getAllByText('Construtora Horizonte').length).toBeGreaterThan(1))
    fireEvent.click(screen.getAllByText('Construtora Horizonte').find((el) => el.closest('[role="option"], li'))!)
    expect(within(dialog).getByRole('combobox', { name: 'Mês' }).textContent).toMatch(/de \d{4}/)
    expect(within(dialog).getByText('RES-741')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar mês' }))
    await screen.findByText('OP criada com 2 serviço(s).')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fechar mês?' })).toBeNull())
  })

  it('abre a ficha com rateio e bloqueia cancelar OP com pagamento confirmado', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await openRow('OP-401')
    const ficha = await screen.findByRole('dialog', { name: 'OP-401' })
    expect(await within(ficha).findByText(/2 parcelas · recebido/)).toBeTruthy()
    expect(within(ficha).getByText('Mariana Albuquerque')).toBeTruthy()
    expect(within(ficha).getByText(/Há pagamento confirmado/)).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'Cancelar OP' })).toHaveProperty('disabled', true)
  })

  it('cancela OP sem pagantes depois de confirmar', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await openRow('OP-412')
    const ficha = await screen.findByRole('dialog', { name: 'OP-412' })
    expect(await within(ficha).findByText(/Nenhum pagante gerado/)).toBeTruthy()
    const cancelar = within(ficha).getByRole('button', { name: 'Cancelar OP' })
    await waitFor(() => expect(cancelar).toHaveProperty('disabled', false))
    fireEvent.click(cancelar)

    const confirm = await screen.findByRole('dialog', { name: /Cancelar a OP-412/ })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar OP' }))
    expect(await screen.findByText('OP-412 cancelada.')).toBeTruthy()
    await waitFor(() => expect(within(ficha).getByText('OP cancelada')).toBeTruthy())
    expect(within(ficha).queryByRole('button', { name: 'Cancelar OP' })).toBeNull()
  })

  it('filtra pela visão Pagas', async () => {
    render(<OpsPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-401')
    fireEvent.click(await screen.findByRole('button', { name: /^Visão:/ }))
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('Pagas').map((e) => e.closest('[role="menuitemradio"]')).find(Boolean)
      if (!el) throw new Error('visão não apareceu')
      return el
    })
    fireEvent.click(opcao)
    await waitFor(() => expect(screen.queryByText('OP-401')).toBeNull())
    expect(screen.getByText('OP-404')).toBeTruthy()
  })

  it('link antigo com status na URL abre filtrado e passa a usar f=', async () => {
    window.location.hash = `#/ops?status=${OP_STATUS.cancelada}`
    render(<OpsPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-413')
    await waitFor(() => expect(screen.queryByText('OP-401')).toBeNull())
    await waitFor(() => expect(window.location.hash).toMatch(/[?&]f=/))
    expect(window.location.hash).not.toMatch(/[?&]status=/)
  })

  it('Agrupar por status no painel Colunas: grupos começam fechados, abrem a tabela e o rodapé soma a lista', async () => {
    window.location.hash = '#/ops'
    render(<OpsPage host={{ mode: 'mock' }} />)
    await screen.findByText('OP-401')
    fireEvent.click(screen.getByRole('button', { name: 'Colunas' }))
    const painel = await screen.findByRole('dialog')
    fireEvent.click(within(painel).getByRole('combobox', { name: 'Agrupar por' }))
    fireEvent.click((await screen.findAllByText('Status')).find((el) => el.closest('[role="option"]'))!)
    fireEvent.click(within(painel).getByRole('button', { name: 'Aplicar' }))

    const grupo = await screen.findByRole('button', { name: /Pagamento Pendente/, expanded: false })
    expect(screen.queryByText('OP-401')).toBeNull()
    expect(screen.getByText(/OPs · /)).toBeTruthy()
    fireEvent.click(grupo)
    expect(grupo.getAttribute('aria-expanded')).toBe('true')
    expect(grupo.closest('.bt-groups__group')!.querySelector('.bt-table__row')).toBeTruthy()
  })
})
