// apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { createMockSource } from '../data/mock'
import { MANUT } from '../data/schema'
import type { DataSource } from '../data/source'
import { segundaDe, somarDias } from '../domain/janela'
import { GavetaManutencao } from './GavetaManutencao'

const hoje = todaySP()
afterEach(cleanup)

function montar(id: string, source: DataSource = createMockSource()) {
  const onChanged = vi.fn()
  const onClassificado = vi.fn()
  render(<ToastProvider><GavetaManutencao source={source} id={id} hoje={hoje} onClose={() => {}} onChanged={onChanged} onClassificado={onClassificado} /></ToastProvider>)
  return { source, onChanged, onClassificado }
}
const gaveta = (nome: string) => screen.findByRole('dialog', { name: nome })

describe('GavetaManutencao', () => {
  it('mostra o pedido, os links das fotos e as ações de uma solicitada', async () => {
    montar('m1')
    const g = await gaveta('Freio com ruído (fictício)')
    expect(within(g).getByText('Solicitado')).toBeTruthy()
    for (const nome of ['Encaixar', 'Reprovar', 'Cancelar manutenção', 'Concluir']) expect(within(g).getByRole('button', { name: nome })).toBeTruthy()
    expect(within(g).getByText('TST1A11')).toBeTruthy()
    expect(within(g).getAllByRole('link', { name: /Fotos do pedido, arquivo/ })).toHaveLength(2)
  })

  it('encaixa na semana de hoje (padrão) e passa a oferecer Reagendar', async () => {
    const source = createMockSource()
    const agendar = vi.spyOn(source, 'agendarManutencao')
    const { onChanged } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Encaixar' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Confirmar' })) })
    const inicio = segundaDe(hoje)
    expect(agendar).toHaveBeenCalledWith({ manutencaoId: 'm1', inicio, fim: somarDias(inicio, 6), comentario: null })
    expect(await within(g).findByRole('button', { name: 'Reagendar' })).toBeTruthy()
    expect(within(g).getByText('Agendado')).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
  })

  it('encaixa num dia escolhido', async () => {
    const source = createMockSource()
    const agendar = vi.spyOn(source, 'agendarManutencao')
    montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Encaixar' }))
    fireEvent.click(within(g).getByRole('radio', { name: 'Dia' }))
    fireEvent.change(g.querySelector('input[type="date"]') as HTMLInputElement, { target: { value: somarDias(hoje, 2) } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Confirmar' })) })
    expect(agendar).toHaveBeenCalledWith({ manutencaoId: 'm1', inicio: somarDias(hoje, 2), fim: somarDias(hoje, 2), comentario: null })
  })

  it('reprovar exige o motivo', async () => {
    const source = createMockSource()
    const reprovar = vi.spyOn(source, 'reprovarManutencao')
    montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(within(g).getByText('Escreva o motivo da reprovação')).toBeTruthy()
    expect(reprovar).not.toHaveBeenCalled()
    fireEvent.change(within(g).getByLabelText(/Motivo da reprovação/), { target: { value: 'Sem verba' } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(reprovar).toHaveBeenCalledWith('m1', 'Sem verba')
    expect(await within(g).findByText('Reprovado')).toBeTruthy()
  })

  it('programada com a janela vencida: selo Atrasada e Reagendar avisa que tira o motorista', async () => {
    montar('m3')
    const g = await gaveta('Manutenção fictícia m3')
    expect(within(g).getByText('Atrasada')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Reagendar' }))
    expect(within(g).getByText(/tira o motorista da programação/)).toBeTruthy()
  })

  it('outra pessoa mudou a manutenção: avisa, não grava e recarrega', async () => {
    const source = createMockSource()
    vi.spyOn(source, 'currentStatus').mockResolvedValue(MANUT.CANCELADO)
    const cancelar = vi.spyOn(source, 'cancelarManutencao')
    const { onChanged } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' })) })
    expect(await screen.findByText(/alterado por outra pessoa/)).toBeTruthy()
    expect(cancelar).not.toHaveBeenCalled()
    expect(onChanged).toHaveBeenCalled()
  })

  it('mostra a classificação da IA e grava a correção manual', async () => {
    const source = createMockSource()
    const update = vi.spyOn(source, 'update')
    const { onClassificado } = montar('m1', source)
    const g = await gaveta('Freio com ruído (fictício)')
    expect(within(g).getByText('Classificado por IA · 93%')).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Corrigir' }))
    fireEvent.click(within(g).getByRole('checkbox', { name: 'Discos de freio' }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Salvar correção' })) })
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_servicosmanutencao: '100000007,100000008', new_categoriasmanutencao: '100000001', new_classificacaoorigem: 100000001, new_confiancaia: null })
    await waitFor(() => expect(onClassificado).toHaveBeenCalledWith('m1', { servicos: [100000007, 100000008], categorias: [100000001], origem: 100000001, confianca: null }))
  })

  it('Concluir abre o formulário da conclusão', async () => {
    montar('m2')
    const g = await gaveta('Manutenção fictícia m2')
    fireEvent.click(within(g).getByRole('button', { name: 'Concluir' }))
    expect(within(g).getByRole('button', { name: 'Concluir manutenção' })).toBeTruthy()
  })

  it('os links dos arquivos abrem em outra aba, sem passar o opener nem o referrer', async () => {
    montar('m1')
    const g = await gaveta('Freio com ruído (fictício)')
    for (const link of within(g).getAllByRole('link', { name: /Fotos do pedido, arquivo/ })) {
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('sem a prop hoje, usa o dia de hoje em São Paulo (a Geral abre a gaveta só com source e id)', async () => {
    const source = createMockSource()
    render(<ToastProvider><GavetaManutencao source={source} id="m3" onClose={() => {}} onChanged={() => {}} /></ToastProvider>)
    const g = await gaveta('Manutenção fictícia m3')
    expect(within(g).getByText('Atrasada')).toBeTruthy()
  })

  it('manutenção que não existe mais avisa na própria gaveta', async () => {
    montar('nao-existe')
    expect(await gaveta('Manutenção não encontrada')).toBeTruthy()
  })
})
