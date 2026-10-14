// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentosPage } from './DocumentosPage'
import { createFrotaSource } from '../frota/data/hostSource'

// Os mocks de Funcionários e Frota usam ids próprios; aqui a ficha aberta responde pelo id do dono da central.
vi.mock('../funcionarios/data/hostSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('../funcionarios/data/hostSource')>()
  return {
    createFuncionariosSource: vi.fn((host: Parameters<typeof real.createFuncionariosSource>[0]) => {
      const s = real.createFuncionariosSource(host)
      return { ...s, get: async (id: string) => ({ ...(await s.get('m1')), id }) }
    }),
  }
})
vi.mock('../frota/data/hostSource', async (importOriginal) => {
  const real = await importOriginal<typeof import('../frota/data/hostSource')>()
  return {
    createFrotaSource: vi.fn((host: Parameters<typeof real.createFrotaSource>[0]) => {
      const s = real.createFrotaSource(host)
      return { ...s, load: async () => { const r = await s.load(); return { ...r, data: { ...r.data, veiculos: r.data.veiculos.map((v) => (v.id === 'v1' ? { ...v, id: 'v-1' } : v)) } } } }
    }),
  }
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
    expect(screen.getAllByRole('row').some((r) => /Ana/.test(r.textContent ?? '') && /CNH/.test(r.textContent ?? ''))).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Frota' }))
    await waitFor(() => expect(window.location.hash).toContain('aba=frota'))
    expect((await screen.findAllByText('ABC1D23')).length).toBeGreaterThan(0)
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
    fireEvent.click(within(await linhaDe(/Bruno/, /CNH/)).getByRole('button', { name: 'Renovar' }))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('clique em qualquer ponto da linha abre o mesmo drawer; Abrir ficha não abre a renovação', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const linha = await linhaDe(/Bruno/, /CNH/)
    fireEvent.click(within(linha).getByText('Bruno'))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Renovar CNH' })).getByRole('button', { name: 'Fechar painel' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Renovar CNH' })).toBeNull())
    fireEvent.click(within(await linhaDe(/Ana/, /CNH/)).getByRole('button', { name: 'Abrir ficha' }))
    await waitFor(() => expect(window.location.hash).toContain('ficha=f-ana'))
    expect(screen.queryByRole('dialog', { name: /^(Renovar|Adicionar)/ })).toBeNull()
  })

  it('celular: o cartão inteiro abre o drawer', async () => {
    media(true)
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    const cartao = await screen.findByRole('listitem', { name: 'CNH · Bruno' })
    fireEvent.click(within(cartao).getByText('Bruno'))
    expect(await screen.findByRole('dialog', { name: 'Renovar CNH' })).toBeTruthy()
  })

  it('Abrir ficha de pessoa abre a ficha de Funcionários na central, na seção Documentos, e fechar volta à lista', async () => {
    render(<DocumentosPage host={{ mode: 'mock' }} />)
    fireEvent.click(within(await linhaDe(/Ana/, /CNH/)).getByRole('button', { name: 'Abrir ficha' }))
    const ficha = await screen.findByRole('dialog', { name: /Carlos Alberto/ })
    expect(window.location.hash).toMatch(/^#\/documentos\?/)
    expect(window.location.hash).toContain('ficha=f-ana')
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
    const linha = await linhaDe(/ABC1D23/, /CRLV/)
    expect(createFrotaSource).not.toHaveBeenCalled()
    fireEvent.click(within(linha).getByRole('button', { name: 'Abrir ficha' }))
    expect(await screen.findByRole('dialog', { name: 'Carregando veículo' })).toBeTruthy()
    expect(createFrotaSource).toHaveBeenCalledTimes(1)
    const ficha = await screen.findByRole('dialog', { name: 'TST1A11' })
    expect(window.location.hash).toContain('ficha=v-1')
    expect(window.location.hash).not.toContain('secao=')
    expect(await within(ficha).findByRole('listitem', { name: 'CRLV / Licenciamento' })).toBeTruthy()
  })
})
