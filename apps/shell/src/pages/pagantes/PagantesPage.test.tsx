// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagantesPage } from './PagantesPage'
import { VIEWS_KEY } from './domain/filters'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta e 1 s de espera não basta.
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

describe('Pagantes', () => {
  it('lista no mock, abre a ficha com rateio e marca como pago com recibo', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1201')

    const ficha = await screen.findByRole('dialog', { name: 'Mariana Albuquerque' })
    // O contato carrega depois da ficha abrir; até lá o WhatsApp é um botão desabilitado.
    expect((await within(ficha).findByRole('link', { name: 'WhatsApp' })).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5511998124410/)
    expect(await within(ficha).findByText(/2 parcelas/)).toBeTruthy()

    fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como pago' }))
    const confirm = await screen.findByRole('dialog', { name: /Marcar Mariana Albuquerque/ })
    expect(within(confirm).getByRole('checkbox', { name: /Gerar e enviar o recibo/ })).toHaveProperty('checked', true)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Marcar como pago' }))

    expect(await screen.findByText(/marcado como pago\. O recibo entra na fila/)).toBeTruthy()
    await waitFor(() => expect(within(ficha).getByText(/status não pode mais ser alterado/)).toBeTruthy())
    expect(within(ficha).getByRole('button', { name: 'Gerar recibo' })).toBeTruthy()
  })

  it('importa as visões salvas no navegador para “Minhas” uma vez', async () => {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify({ views: [{ id: 'v1', nome: 'Falhas desde sempre', filters: { periodo: 'all', falhas: true } }] }))
    render(<PagantesPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText(/agora fica em “Minhas”/)).toBeTruthy()
    expect(window.localStorage.getItem(VIEWS_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Visão:/ }))
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('Falhas desde sempre').map((e) => e.closest('[role="menuitemradio"]')).find(Boolean)
      if (!el) throw new Error('visão importada não apareceu')
      return el
    })
    fireEvent.click(opcao)
    await waitFor(() => expect(screen.queryByText('PAG-1201')).toBeNull())
    expect(screen.getByText('PAG-1204')).toBeTruthy()
  })

  it('pagante sem pessoa: ficha pelo código, aviso e recibo automático bloqueado', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1212')
    const ficha = await screen.findByRole('dialog', { name: 'PAG-1212' })
    expect(within(ficha).getByText('Pagante sem pessoa vinculada', { selector: '*' })).toBeTruthy()
    expect(within(ficha).getByRole('button', { name: 'WhatsApp' })).toHaveProperty('disabled', true)

    fireEvent.click(within(ficha).getByRole('button', { name: 'Marcar como pago' }))
    const confirm = await screen.findByRole('dialog', { name: /Marcar PAG-1212/ })
    // Recibo já enviado: a opção de reenviar pelo flow nem aparece.
    expect(within(confirm).queryByRole('checkbox', { name: /Gerar e enviar o recibo/ })).toBeNull()
  })

  it('clique na linha seleciona, duplo clique abre a ficha; ações rápidas não', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    const row = (await screen.findByText('PAG-1203')).closest('.bt-table__row') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /Copiar link|Sem link/ }))
    expect(screen.queryByText('1 selecionado')).toBeNull()
    fireEvent.click(within(row).getByText(/860,50/))
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('dialog', { name: 'Helena Prado' })).toBeNull()
    fireEvent.doubleClick(within(row).getByText(/860,50/))
    expect(await screen.findByRole('dialog', { name: 'Helena Prado' })).toBeTruthy()
  })

  it('seleção em lote: faixa com contagem, exporta e gera recibos dos selecionados', async () => {
    const blobs: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => { blobs.push(blob); return 'blob:x' }, revokeObjectURL: () => undefined }))
    render(<PagantesPage host={{ mode: 'mock' }} />)
    fireEvent.click((await screen.findByText('PAG-1201')).closest('.bt-table__row')!.querySelector('.pg-num')!)
    fireEvent.click((await screen.findByText('PAG-1203')).closest('.bt-table__row')!.querySelector('.pg-num')!, { ctrlKey: true })
    const faixa = screen.getByRole('group', { name: 'Comandos da seleção' })
    expect(within(faixa).getByText('2 selecionados')).toBeTruthy()
    expect(screen.queryByRole('searchbox', { name: 'Buscar pagantes' })).toBeNull()

    fireEvent.click(within(faixa).getByRole('button', { name: 'Exportar seleção' }))
    await screen.findByText('2 pagantes exportados.')
    const csv = await blobText(blobs[0])
    expect(csv).toMatch(/PAG-1201/)
    expect(csv).toMatch(/PAG-1203/)

    // No mock o gerador só funciona dentro do Dataverse: o erro aparece e a seleção foi limpa.
    fireEvent.click(within(faixa).getByRole('button', { name: 'Gerar recibos' }))
    await screen.findByText('O gerador de recibo só funciona dentro do Dataverse.')
    expect(screen.queryByRole('group', { name: 'Comandos da seleção' })).toBeNull()
  })

  it('recibo gerado e não enviado oferece gerar de novo, não reenviar', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1211')
    const ficha = await screen.findByRole('dialog')
    expect(within(ficha).getByRole('button', { name: 'Gerar recibo novamente' })).toBeTruthy()
    expect(within(ficha).queryByRole('button', { name: 'Reenviar recibo' })).toBeNull()
  })

  it('gerar recibo fecha a ficha antes de abrir o gerador e mostra o erro', async () => {
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await openRow('PAG-1202')
    const ficha = await screen.findByRole('dialog', { name: 'Ricardo Menezes' })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Reenviar recibo' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ricardo Menezes' })).toBeNull())
    expect(await screen.findByText(/só funciona dentro do Dataverse/)).toBeTruthy()
  })

  it('link antigo com falhas=1 abre filtrado; filtros e ficha aberta ficam na URL e reabrem igual', async () => {
    history.replaceState(null, '', '#/pagantes?falhas=1')
    render(<PagantesPage host={{ mode: 'mock' }} />)
    await screen.findByText('PAG-1204')
    await waitFor(() => expect(screen.queryByText('PAG-1201')).toBeNull())
    await waitFor(() => expect(location.hash).toMatch(/[?&]f=/))
    expect(location.hash).not.toMatch(/falhas=/)

    await openRow('PAG-1204')
    await screen.findByRole('dialog')
    const link = location.hash
    expect(link).toMatch(/[?&]abrir=/)
    expect(link).toMatch(/[?&]f=/)

    cleanup()
    history.replaceState(null, '', link)
    render(<PagantesPage host={{ mode: 'mock' }} />)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('PAG-1201')).toBeNull())
  })
})
