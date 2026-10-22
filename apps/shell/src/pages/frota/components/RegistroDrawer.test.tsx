// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { FrotaData, Multa, Manutencao } from '../data/types'
import { RegistroDrawer } from './RegistroDrawer'
import { ToastProvider } from '@betinhos/ui'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => MANUT.SOLICITADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: vi.fn(async () => {}),
    prepareFlow: vi.fn(async () => {}),
    classificacao: async () => ({ servicos: [], categorias: [], origem: null, confianca: null }), classificarAgora: async () => { throw new Error("indisponível") }, fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async () => ({ message: null, shareUrl: null })), salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => {},
    ...overrides,
  }
}

const manutencao: Manutencao = { id: 'm1', codigo: 'M-1', descricao: 'Freio com ruído', status: MANUT.SOLICITADO, grau: null, tipo: null, agendarPara: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: { id: 'v1', label: 'ABC-1234' }, solicitante: null, criadoEm: '2026-10-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null }
const multa: Multa = { id: 'u1', titulo: 'Multa sem condutor', status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC-1234' }, motorista: null, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const data: FrotaData = { ...EMPTY_DATA, manutencoes: [manutencao], multas: [multa] }

function renderDrawer(source: DataSource, kind: 'manutencao' | 'multa', id: string) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(<ToastProvider><RegistroDrawer source={source} kind={kind} id={id} data={data} onClose={onClose} onChanged={onChanged} onOpenVeiculo={() => {}} /></ToastProvider>)
  return { onClose, onChanged }
}

afterEach(cleanup)

describe('RegistroDrawer', () => {
  it('fecha com Esc (cancel do dialog nativo) mesmo depois que o botão focado saiu da tela', () => {
    const { onClose } = renderDrawer(fakeSource(), 'manutencao', 'm1')
    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mostra o erro e não recarrega quando o formulário não abre', async () => {
    const source = fakeSource({ openForm: vi.fn(async () => { throw new Error('Formulário indisponível') }) })
    const { onChanged } = renderDrawer(source, 'manutencao', 'm1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    await waitFor(() => expect(screen.getByText(/Formulário indisponível/)).toBeTruthy())
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('recarrega depois que o formulário fecha', async () => {
    const { onChanged } = renderDrawer(fakeSource(), 'manutencao', 'm1')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Abrir formulário/ })) })
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('multa sem motorista: Notificar condutor desabilitado com o motivo visível', () => {
    renderDrawer(fakeSource(), 'multa', 'u1')
    expect((screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Informe o motorista no formulário antes desta ação')).toBeTruthy()
  })

  it('mostra a classificação da IA e grava a correção manual dos serviços', async () => {
    const update = vi.fn(async () => {})
    const classificada = { ...manutencao, servicos: [100000007], categorias: [100000001], origemClassificacao: 100000000, confiancaIa: 0.93 }
    const onChanged = vi.fn()
    render(<ToastProvider><RegistroDrawer source={fakeSource({ update })} kind="manutencao" id="m1" data={{ ...data, manutencoes: [classificada] }} onClose={() => {}} onChanged={onChanged} onOpenVeiculo={() => {}} /></ToastProvider>)
    expect(screen.getByText('IA JEV · 93%')).toBeTruthy()
    expect(screen.getByText('Pastilhas de freio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Discos de freio' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' })) })
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_servicosmanutencao: '100000007,100000008', new_categoriasmanutencao: '100000001', new_classificacaoorigem: 100000001, new_confiancaia: null })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('classifica com IA de forma assíncrona: mostra o andamento e recarrega quando o flow grava', async () => {
    vi.useFakeTimers()
    try {
      const update = vi.fn(async () => {})
      const classificacao = vi.fn()
        .mockResolvedValueOnce({ servicos: [], categorias: [], origem: null, confianca: null })
        .mockResolvedValue({ servicos: [100000012], categorias: [100000002], origem: 100000000, confianca: 0.96 })
      const { onChanged } = renderDrawer(fakeSource({ update, classificacao }), 'manutencao', 'm1')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Classificar com IA' })) })
      expect(update).toHaveBeenCalledWith('manutencao', 'm1', { new_classificacaoorigem: null, cr40f_descricao: 'Freio com ruído' })
      expect(screen.getByText('Classificando com IA…')).toBeTruthy()
      expect((screen.getByRole('button', { name: 'Corrigir' }) as HTMLButtonElement).disabled).toBe(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(onChanged).not.toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(onChanged).toHaveBeenCalledTimes(1)
      expect(screen.getByText('IA classificou: Troca de pneu.')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('avisa quando a IA não responde dentro do limite', async () => {
    vi.useFakeTimers()
    try {
      const classificacao = vi.fn(async () => ({ servicos: [], categorias: [], origem: null, confianca: null }))
      renderDrawer(fakeSource({ classificacao }), 'manutencao', 'm1')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Classificar com IA' })) })
      await act(async () => { await vi.advanceTimersByTimeAsync(62000) })
      expect(screen.getByText(/A IA ainda não respondeu/)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('aplica a classificação só na manutenção, sem recarregar tudo, quando o App oferece onClassificado', async () => {
    vi.useFakeTimers()
    try {
      const classificacao = vi.fn(async () => ({ servicos: [100000039], categorias: [100000005], origem: 100000000, confianca: 0.98 }))
      const onChanged = vi.fn()
      const onClassificado = vi.fn()
      render(<ToastProvider><RegistroDrawer source={fakeSource({ classificacao })} kind="manutencao" id="m1" data={data} onClose={() => {}} onChanged={onChanged} onClassificado={onClassificado} onOpenVeiculo={() => {}} /></ToastProvider>)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Classificar com IA' })) })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(onClassificado).toHaveBeenCalledWith('m1', { servicos: [100000039], categorias: [100000005], origem: 100000000, confianca: 0.98 })
      expect(onChanged).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('classifica de forma síncrona pelo flow HTTP, sem gravar a descrição nem consultar de novo', async () => {
    const update = vi.fn(async () => {})
    const classificacao = vi.fn()
    const classificarAgora = vi.fn(async () => ({ servicos: [100000007], categorias: [100000001], origem: 100000000, confianca: 0.97 }))
    const onClassificado = vi.fn()
    render(<ToastProvider><RegistroDrawer source={fakeSource({ update, classificacao, classificarAgora })} kind="manutencao" id="m1" data={data} onClose={() => {}} onChanged={() => {}} onClassificado={onClassificado} onOpenVeiculo={() => {}} /></ToastProvider>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Classificar com IA' })) })
    expect(classificarAgora).toHaveBeenCalledWith('m1')
    expect(onClassificado).toHaveBeenCalledWith('m1', { servicos: [100000007], categorias: [100000001], origem: 100000000, confianca: 0.97 })
    expect(screen.getByText('IA classificou: Pastilhas de freio.')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    expect(classificacao).not.toHaveBeenCalled()
  })
})
