// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as sourceModule from './data/source'
import { EquipamentosPage } from './EquipamentosPage'

// O mock simula latência; com a suíte inteira em paralelo a máquina fica lenta.
configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.location.hash = '#/equipamentos'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const openButton = (nome: string) => screen.findByRole('button', { name: new RegExp(`^${nome}`) })
const rowOf = async (nome: string) => (await openButton(nome)).closest('.bt-table__row') as HTMLElement

/** Fonte de exemplo com a carga trocada (vazia ou com falha). */
function stubLoad(load: () => Promise<sourceModule.Carga>) {
  const real = sourceModule.createSource
  return vi.spyOn(sourceModule, 'createSource').mockImplementation((host) => ({ ...real(host), load }))
}

describe('Equipamentos', () => {
  it('lista os itens e esconde baixados na visão padrão', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    await openButton('Notebook do Financeiro')
    expect(screen.queryByText('Impressora antiga')).toBeNull()
    expect(screen.getByText('Dados de exemplo')).toBeTruthy()
  })

  it('responsável inativo aparece com selo', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Celular plantão')
    expect(within(row).getByText('Gustavo Amostra Pires')).toBeTruthy()
    expect(within(row).getByText('Inativo')).toBeTruthy()
    const ativo = await rowOf('Notebook do Financeiro')
    expect(within(ativo).queryByText('Inativo')).toBeNull()
  })

  it('item sem responsável mostra o texto no lugar do nome', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook reserva')
    await waitFor(() => expect(within(row).getByText('Sem responsável')).toBeTruthy())
  })

  it('compra em dd/mm/aaaa com valor em reais', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook do Financeiro')
    expect(within(row).getByText(/^12\/03\/2025 · R\$\s5\.899,90$/)).toBeTruthy()
  })

  it('clicar na linha grava ?ver=<id>; Novo equipamento grava ?novo=1', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook reserva')
    fireEvent.click(within(row).getByText('TP-E14-778'))
    await waitFor(() => expect(window.location.hash).toContain('ver=eeeeeeee-0000-4000-8000-000000000002'))
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    await waitFor(() => expect(window.location.hash).toContain('novo=1'))
    expect(window.location.hash).not.toContain('ver=')
  })

  it('Marca/modelo nasce oculta; o modelo aparece sob a descrição', async () => {
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const row = await rowOf('Notebook do Financeiro')
    expect(within(row).getByText('Dell Latitude 5440')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /Marca\/modelo/ })).toBeNull()
    expect(screen.getByRole('columnheader', { name: /Status/ })).toBeTruthy()
  })

  it('busca sem resultado mostra o estado de filtro vazio', async () => {
    window.location.hash = '#/equipamentos?q=xyzinexistente'
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    const vazio = (await screen.findByText('Nenhum equipamento com estes filtros')).closest('.bt-empty') as HTMLElement
    fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }))
    await openButton('Notebook do Financeiro')
  })

  it('sem nenhum item mostra o vazio com Novo equipamento', async () => {
    stubLoad(async () => ({ equipamentos: [], tipos: [], pessoas: [] }))
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Nenhum equipamento cadastrado.')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Novo equipamento' }).at(-1)!)
    await waitFor(() => expect(window.location.hash).toContain('novo=1'))
  })

  it('falha na carga mostra o erro com Tentar de novo', async () => {
    const load = vi.fn<() => Promise<sourceModule.Carga>>()
      .mockRejectedValueOnce(new Error('Tabela cr40f_equipamento não encontrada na metadata.'))
      .mockResolvedValue({ equipamentos: [], tipos: [], pessoas: [] })
    stubLoad(load)
    render(<EquipamentosPage host={{ mode: 'mock' }} />)
    expect(await screen.findByText('Não foi possível carregar os equipamentos')).toBeTruthy()
    expect(screen.getByText('Tabela cr40f_equipamento não encontrada na metadata.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Nenhum equipamento cadastrado.')).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
