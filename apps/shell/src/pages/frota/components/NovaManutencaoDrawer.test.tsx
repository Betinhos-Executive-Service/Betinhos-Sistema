// apps/shell/src/pages/frota/components/NovaManutencaoDrawer.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { createMockSource } from '../data/mock'
import type { Veiculo } from '../data/types'
import { segundaDe, somarDias } from '../domain/janela'
import { escolher } from '../testUtils'
import { NovaManutencaoDrawer } from './NovaManutencaoDrawer'

const hoje = todaySP()
afterEach(cleanup)

async function montar() {
  const source = createMockSource()
  const { data } = await source.load()
  vi.spyOn(source, 'criarManutencao')
  vi.spyOn(source, 'agendarManutencao')
  const onCriada = vi.fn()
  render(<ToastProvider><NovaManutencaoDrawer source={source} veiculos={data.veiculos} hoje={hoje} onClose={() => {}} onCriada={onCriada} /></ToastProvider>)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return { source, onCriada }
}

describe('NovaManutencaoDrawer', () => {
  it('não cria sem veículo, descrição, grau e km', async () => {
    const { source } = await montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar manutenção' })) })
    for (const erro of ['Escolha o veículo', 'Descreva o problema', 'Escolha o grau', 'Informe o km atual (número inteiro)']) expect(screen.getByText(erro)).toBeTruthy()
    expect(source.criarManutencao).not.toHaveBeenCalled()
  })

  it('veículo com hodômetro já preenche o km', async () => {
    await montar()
    escolher('Veículo', 'TST1A11 · Corolla')
    expect((screen.getByLabelText(/Km atual/) as HTMLInputElement).value).toBe('171000')
  })

  it('cria e já encaixa na semana de hoje', async () => {
    const { source, onCriada } = await montar()
    escolher('Veículo', 'TST2B22 · Virtus')
    fireEvent.change(screen.getByLabelText(/Descrição do problema/), { target: { value: 'Pneu furado' } })
    escolher('Grau', 'Alta')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Já encaixar num dia ou numa semana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar e encaixar' })) })
    await waitFor(() => expect(onCriada).toHaveBeenCalledTimes(1))
    expect(source.criarManutencao).toHaveBeenCalledWith({ veiculoId: 'v2', descricao: 'Pneu furado', grau: 3, tipo: null, km: 40000, solicitanteId: null })
    const id = onCriada.mock.calls[0][0] as string
    const inicio = segundaDe(hoje)
    expect(source.agendarManutencao).toHaveBeenCalledWith({ manutencaoId: id, inicio, fim: somarDias(inicio, 6), comentario: null })
  })

  it('encaixe que falha depois da criação avisa e abre a manutenção criada', async () => {
    const { source, onCriada } = await montar()
    vi.mocked(source.agendarManutencao).mockRejectedValueOnce(new Error('A manutenção não tem veículo.'))
    escolher('Veículo', 'TST2B22 · Virtus')
    fireEvent.change(screen.getByLabelText(/Descrição do problema/), { target: { value: 'Pneu furado' } })
    escolher('Grau', 'Alta')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '40000' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Já encaixar num dia ou numa semana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar e encaixar' })) })
    await waitFor(() => expect(onCriada).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/A manutenção foi criada, mas o encaixe falhou/)).toBeTruthy()
  })

  async function preencherBasico() {
    escolher('Veículo', 'TST2B22 · Virtus')
    fireEvent.change(screen.getByLabelText(/Descrição do problema/), { target: { value: 'Pneu furado' } })
    escolher('Grau', 'Alta')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '40000' } })
  }

  it('falha ao criar: mostra a mensagem do servidor e mantém o que foi preenchido, sem chamar o encaixe', async () => {
    const { source, onCriada } = await montar()
    vi.mocked(source.criarManutencao).mockRejectedValueOnce(new Error('Sem privilégio de escrita.'))
    await preencherBasico()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar manutenção' })) })
    expect(await screen.findByText(/Sem privilégio de escrita\. O que você preencheu foi mantido\./)).toBeTruthy()
    expect((screen.getByLabelText(/Km atual/) as HTMLInputElement).value).toBe('40000')
    expect(onCriada).not.toHaveBeenCalled()
    expect(source.agendarManutencao).not.toHaveBeenCalled()
  })

  it('dois envios no mesmo instante criam uma única manutenção', async () => {
    const { source } = await montar()
    await preencherBasico()
    const formulario = document.querySelector('form') as HTMLFormElement // o botão fica no rodapé da gaveta, fora do <form>
    await act(async () => {
      fireEvent.submit(formulario)
      fireEvent.submit(formulario)
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(source.criarManutencao).toHaveBeenCalledTimes(1)
  })

  it('sem a prop hoje, a janela padrão é a semana de hoje em São Paulo', async () => {
    const source = createMockSource()
    const { data } = await source.load()
    vi.spyOn(source, 'agendarManutencao')
    const onCriada = vi.fn()
    render(<ToastProvider><NovaManutencaoDrawer source={source} veiculos={data.veiculos} onClose={() => {}} onCriada={onCriada} /></ToastProvider>)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    await preencherBasico()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Já encaixar num dia ou numa semana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar e encaixar' })) })
    await waitFor(() => expect(onCriada).toHaveBeenCalledTimes(1))
    const inicio = segundaDe(hoje)
    expect(source.agendarManutencao).toHaveBeenCalledWith(expect.objectContaining({ inicio, fim: somarDias(inicio, 6) }))
  })

  async function montarComVeiculos(veiculos: Veiculo[]) {
    const source = createMockSource()
    render(<ToastProvider><NovaManutencaoDrawer source={source} veiculos={veiculos} hoje={hoje} onClose={() => {}} onCriada={() => {}} /></ToastProvider>)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  }
  const lerKm = () => (screen.getByLabelText(/Km atual/) as HTMLInputElement).value

  it('trocar de veículo substitui o km que veio do hodômetro; sem hodômetro no novo, limpa', async () => {
    const { data } = await createMockSource().load()
    const [v1, v2] = data.veiculos
    await montarComVeiculos([{ ...v1, hodometro: 171000 }, { ...v2, hodometro: 90000 }, { ...data.veiculos[4], hodometro: null }])
    escolher('Veículo', 'TST1A11 · Corolla')
    expect(lerKm()).toBe('171000')
    escolher('Veículo', 'TST2B22 · Virtus')
    expect(lerKm()).toBe('90000')
    escolher('Veículo', 'TST4D44 · Carnival')
    expect(lerKm()).toBe('') // o novo veículo não tem hodômetro: não fica o km do anterior
  })

  it('km digitado pelo usuário não é trocado ao mudar de veículo', async () => {
    const { data } = await createMockSource().load()
    const [v1, v2] = data.veiculos
    await montarComVeiculos([{ ...v1, hodometro: 171000 }, { ...v2, hodometro: 90000 }])
    escolher('Veículo', 'TST1A11 · Corolla')
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '171500' } }) // corrigiu o do hodômetro
    escolher('Veículo', 'TST2B22 · Virtus')
    expect(lerKm()).toBe('171500')
  })

  it('km digitado antes de escolher o veículo também fica', async () => {
    const { data } = await createMockSource().load()
    await montarComVeiculos([{ ...data.veiculos[0], hodometro: 171000 }])
    fireEvent.change(screen.getByLabelText(/Km atual/), { target: { value: '123' } })
    escolher('Veículo', 'TST1A11 · Corolla')
    expect(lerKm()).toBe('123')
  })
})
