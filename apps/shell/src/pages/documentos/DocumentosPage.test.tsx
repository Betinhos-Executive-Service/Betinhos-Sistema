// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentosPage } from './DocumentosPage'
import { createFrotaSource } from '../frota/data/hostSource'
import { DOCUMENTOS_ALTERADOS } from './data/source'

// Espiões: a fonte de documentos conta as listagens reais (por baixo do cache) e as cargas; a da Frota conta quando é criada.
const espia = vi.hoisted(() => ({ arquivos: null as null | { mock: { calls: unknown[] } }, carregar: null as null | { mock: { calls: unknown[] } } }))
vi.mock('./data/source', async (importOriginal) => {
  const real = await importOriginal<typeof import('./data/source')>()
  return {
    ...real,
    createDocsSource: vi.fn(() => {
      const raw = real.createMockDocsSource(undefined, { cacheArquivos: false })
      const arquivos = vi.fn(raw.arquivos)
      const carregar = vi.fn(raw.carregar)
      espia.arquivos = arquivos
      espia.carregar = carregar
      return real.comCacheDeArquivos({ ...raw, arquivos, carregar })
    }),
  }
})
vi.mock('../frota/data/hostSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('../frota/data/hostSource')>()
  return { createFrotaSource: vi.fn(real.createFrotaSource) }
})

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })
const media = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && /max-width/.test(query), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
beforeEach(() => {
  media(false)
  window.location.hash = '#/documentos'
  vi.mocked(createFrotaSource).mockClear()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const linhaDe = async (nome: RegExp, doc: RegExp) => (await screen.findAllByRole('row')).find((r) => nome.test(r.textContent ?? '') && doc.test(r.textContent ?? ''))!

describe('Central de documentos', () => {
  it('mostra KPIs de Pessoas, filtra por KPI e troca para Frota', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const vencidos = await screen.findByRole('button', { name: /Vencidos/ })
    expect(within(vencidos).getByText('1')).toBeTruthy()
    fireEvent.click(vencidos)
    await waitFor(() => expect(window.location.hash).toContain('kpi=vencido'))
    expect(screen.getAllByRole('row').some((r) => /Carlão/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Frota' }))
    await waitFor(() => expect(window.location.hash).toContain('aba=frota'))
    expect((await screen.findAllByText('TST1A11')).length).toBeGreaterThan(0)
  })

  it('filtro de tipo começa em "Todos os tipos", filtra e limpa', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const combo = await screen.findByRole('combobox', { name: 'Tipo de documento' })
    expect(combo.textContent).toContain('Todos os tipos')
    expect(combo.textContent).not.toContain('Selecione')
    fireEvent.click(combo)
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('ASO').map((e) => e.closest('[role="option"]')).find(Boolean)
      if (!el) throw new Error('opção ASO não apareceu')
      return el
    })
    expect(screen.queryAllByRole('option').some((o) => o.textContent === 'Todos os tipos')).toBe(false)
    fireEvent.click(opcao)
    await waitFor(() => expect(window.location.hash).toContain('tipo=t-aso'))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    await waitFor(() => expect(window.location.hash).not.toContain('tipo='))
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' }).textContent).toContain('Todos os tipos')
  })

  it('Renovar abre o drawer do documento', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await linhaDe(/Bruna/, /CNH/)).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('salvar a renovação fecha o drawer e avisa que salvou', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await linhaDe(/Bruna/, /CNH/)).getByRole('button', { name: 'Renovar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renovar CNH' })
    fireEvent.change(within(dialog).getByLabelText(/^Validade/), { target: { value: '2031-10-20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar documento' }))
    expect(await screen.findByText('Documento salvo')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renovar CNH' })).toBeNull())
  })

  it('clique em qualquer ponto da linha abre o mesmo drawer; Abrir ficha não abre a renovação', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const linha = await linhaDe(/Bruna/, /CNH/)
    fireEvent.click(within(linha).getByText('Bruna'))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Renovar CNH' })).getByRole('button', { name: 'Fechar painel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renovar CNH' })).toBeNull())
    fireEvent.click(within(await linhaDe(/Carlão/, /CNH/)).getByRole('button', { name: 'Abrir ficha' }))
    await waitFor(() => expect(window.location.hash).toContain('ficha=m1'))
    expect(screen.queryByRole('dialog', { name: /^(Renovar|Adicionar)/ })).toBeNull()
  })

  it('celular: o cartão inteiro abre o drawer', async () => {
    media(true)
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const cartao = await screen.findByRole('listitem', { name: 'CNH · Bruna' })
    fireEvent.click(within(cartao).getByText('Bruna'))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('Abrir ficha de pessoa abre a ficha de Funcionários na central, na seção Documentos, e fechar volta à lista', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await linhaDe(/Carlão/, /CNH/)).getByRole('button', { name: 'Abrir ficha' }))
    const ficha = await screen.findByRole('dialog', { name: /Carlos Alberto/ })
    expect(window.location.hash).toMatch(/^#\/documentos\?/)
    expect(window.location.hash).toContain('ficha=m1')
    expect(window.location.hash).toContain('secao=documentos')
    expect(within(ficha).getByRole('tab', { name: 'Documentos' }).getAttribute('aria-selected')).toBe('true')
    expect(await within(ficha).findByRole('listitem', { name: 'CNH' })).toBeTruthy()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar ficha' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Carlos Alberto/ })).toBeNull())
    expect(window.location.hash).not.toContain('ficha=')
    expect(window.location.hash).not.toContain('secao=')
  })

  it('Abrir ficha de veículo carrega a Frota só no clique e abre a ficha do veículo na central', async () => {
    window.location.hash = '#/documentos?aba=frota'
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const linha = await linhaDe(/TST1A11/, /CRLV/)
    expect(createFrotaSource).not.toHaveBeenCalled()
    fireEvent.click(within(linha).getByRole('button', { name: 'Abrir ficha' }))
    expect(await screen.findByRole('dialog', { name: 'Carregando veículo' })).toBeTruthy()
    expect(createFrotaSource).toHaveBeenCalledTimes(1)
    const ficha = await screen.findByRole('dialog', { name: 'TST1A11' })
    expect(window.location.hash).toContain('ficha=v1')
    expect(window.location.hash).not.toContain('secao=')
    expect(await within(ficha).findByRole('listitem', { name: 'CRLV / Licenciamento' })).toBeTruthy()
  })

  const abrirFichaDoCarlao = async () => {
    fireEvent.click(within(await linhaDe(/Carlão/, /CNH/)).getByRole('button', { name: 'Abrir ficha' }))
    const ficha = await screen.findByRole('dialog', { name: /Carlos Alberto/ })
    await within(ficha).findAllByText('Nenhum arquivo enviado.')
    return ficha
  }
  const fechar = async (ficha: HTMLElement) => {
    fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar ficha' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Carlos Alberto/ })).toBeNull())
  }
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

  it('reabrir a ficha não lista os arquivos de novo no SharePoint', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    await fechar(await abrirFichaDoCarlao())
    const listagens = espia.arquivos!.mock.calls.length
    expect(listagens).toBeGreaterThan(0)
    await fechar(await abrirFichaDoCarlao())
    expect(espia.arquivos!.mock.calls.length).toBe(listagens)
  })

  it('fechar a ficha sem mudanças não recarrega a central; com mudança recarrega', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    let ficha = await abrirFichaDoCarlao()
    let cargas = espia.carregar!.mock.calls.length
    await fechar(ficha)
    await espera(300)
    expect(espia.carregar!.mock.calls.length).toBe(cargas)
    ficha = await abrirFichaDoCarlao()
    window.dispatchEvent(new CustomEvent(DOCUMENTOS_ALTERADOS))
    cargas = espia.carregar!.mock.calls.length
    await fechar(ficha)
    await waitFor(() => expect(espia.carregar!.mock.calls.length).toBe(cargas + 1))
  })

  it('link com ficha de cadastro inexistente limpa o parâmetro e avisa', async () => {
    window.location.hash = '#/documentos?ficha=nao-existe&secao=documentos'
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Cadastro não encontrado')).toBeTruthy()
    await waitFor(() => expect(window.location.hash).not.toContain('ficha='))
    expect(window.location.hash).not.toContain('secao=')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
