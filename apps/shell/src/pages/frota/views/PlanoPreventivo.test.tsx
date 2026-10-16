// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { FrotaData, ItemPlano } from '../data/types'
import { escolher, linhasDaTabela } from '../testUtils'
import { PlanoPreventivo } from './PlanoPreventivo'

const item = (id: string, nome: string, extra: Partial<ItemPlano>): ItemPlano => ({ id, nome, servico: null, intervaloKm: null, intervaloMeses: null, avisoKm: 1000, avisoDias: 30, ativo: true, ...extra })

const data: FrotaData = {
  ...EMPTY_DATA,
  planoPreventivo: [
    item('i1', 'Troca de óleo e filtro', { servico: 100000000, intervaloKm: 10000, intervaloMeses: 6 }),
    item('i2', 'Revisão anual', { intervaloMeses: 12 }),
    item('i4', 'Troca de correia', { intervaloKm: 60000, ativo: false }),
  ],
}

function fakeSource() {
  return {
    salvarItemPlano: vi.fn(async () => {}),
    inativarItemPlano: vi.fn(async () => {}),
  } as unknown as DataSource & { salvarItemPlano: ReturnType<typeof vi.fn>; inativarItemPlano: ReturnType<typeof vi.fn> }
}

function renderPlano(source = fakeSource(), onReload = vi.fn()) {
  render(<ToastProvider><PlanoPreventivo data={data} source={source} onReload={onReload} /></ToastProvider>)
  return { source, onReload }
}

beforeEach(() => vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('PlanoPreventivo', () => {
  it('lista os itens com intervalo e aviso formatados e a situação', () => {
    renderPlano()
    const linhas = linhasDaTabela()
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toContain('Troca de óleo e filtro')
    expect(linhas[0]).toContain('10.000 km · 6 meses')
    expect(linhas[0]).toContain('1.000 km · 30 dias')
    expect(linhas[0]).toContain('Ativo')
    expect(linhas[1]).toContain('12 meses')
    expect(linhas[2]).toContain('60.000 km')
    expect(linhas[2]).toContain('Inativo')
  })

  it('"Novo item" abre o drawer; salvar sem nome mostra o erro e não grava', () => {
    const { source } = renderPlano()
    fireEvent.click(screen.getByRole('button', { name: 'Novo item' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo item' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByText('Informe o nome')).toBeTruthy()
    expect(within(dialog).getByText('Escolha o serviço')).toBeTruthy()
    expect(within(dialog).getByText('Informe ao menos um intervalo (km ou meses)')).toBeTruthy()
    expect(source.salvarItemPlano).not.toHaveBeenCalled()
  })

  it('preenchido, grava o item com os avisos padrão e recarrega', async () => {
    const { source, onReload } = renderPlano()
    fireEvent.click(screen.getByRole('button', { name: 'Novo item' }))
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Óleo do motor' } })
    escolher('Serviço', 'Troca de óleo e filtro de óleo')
    fireEvent.change(screen.getByLabelText('Intervalo em km'), { target: { value: '10000' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })) })
    expect(source.salvarItemPlano).toHaveBeenCalledWith({ nome: 'Óleo do motor', servico: 100000000, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 30 }, undefined)
    expect(onReload).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('abre um item existente e o inativa', async () => {
    const { source, onReload } = renderPlano()
    fireEvent.click(screen.getByText('Troca de óleo e filtro'))
    const dialog = screen.getByRole('dialog', { name: 'Troca de óleo e filtro' })
    expect((within(dialog).getByLabelText('Intervalo em km') as HTMLInputElement).value).toBe('10000')
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Inativar' })) })
    expect(source.inativarItemPlano).toHaveBeenCalledWith('i1', false)
    expect(onReload).toHaveBeenCalled()
  })
})
