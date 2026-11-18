// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLISAO } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { Kind } from '../data/types'
import type { RegistroStatus } from '../domain/transitions'
import { StatusPanel } from './StatusPanel'
import { ToastProvider } from '@betinhos/ui'
import { manutencaoFalsa } from '../testUtils'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    ...manutencaoFalsa(),
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => COLISAO.ENVIADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: async () => {},
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [], passoMulta: async () => { throw new Error('não usado neste teste') }, dossieMulta: async () => { throw new Error('não usado neste teste') }, enviarArquivoMulta: async () => {}, urlArquivoMulta: () => 'about:blank',
    ...overrides,
  }
}

type PanelOptions = { kind?: Kind; record?: Partial<RegistroStatus> }

function renderPanel(source: DataSource, status: number | null, options: PanelOptions = {}) {
  const onDone = vi.fn()
  const onReload = vi.fn()
  const record: RegistroStatus = { id: 'c1', status, temVeiculo: true, temMotorista: true, ...options.record }
  render(<ToastProvider><StatusPanel source={source} kind={options.kind ?? 'colisao'} record={record} onDone={onDone} onReload={onReload} /></ToastProvider>)
  return { onDone, onReload }
}

async function confirmar() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar' })) })
}

afterEach(cleanup)

describe('StatusPanel', () => {
  it('mostra só as ações permitidas para o status', () => {
    renderPanel(fakeSource(), COLISAO.ENVIADO)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Colocar em análise', 'Cancelar colisão'])
  })

  it('informa quando não há ação, inclusive na manutenção (que usa a gaveta própria)', () => {
    renderPanel(fakeSource(), COLISAO.RESOLVIDO)
    expect(screen.getByText('Sem ações de status para este registro.')).toBeTruthy()
    cleanup()
    renderPanel(fakeSource(), 0, { kind: 'manutencao' })
    expect(screen.getByText('Sem ações de status para este registro.')).toBeTruthy()
  })

  it('grava a transição direta com o status e avisa a tela', async () => {
    const source = fakeSource()
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onReload).not.toHaveBeenCalled()
    expect(source.update).toHaveBeenCalledWith('colisao', 'c1', { cr40f_statusoperacional: COLISAO.ANALISE })
    expect(await screen.findByText('Colocar em análise: concluído.')).toBeTruthy()
  })

  it('em falha mostra a mensagem real e continua no formulário', async () => {
    const source = fakeSource({ update: vi.fn(async () => { throw new Error('Principal user is missing prvWritecr40f_colisao_v2 privilege.') }) })
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/missing prvWritecr40f_colisao_v2 privilege/)).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('quando outra pessoa mudou o status, não grava e pede recarga', async () => {
    const source = fakeSource({ currentStatus: async () => COLISAO.RESOLVIDO })
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar colisão' }))
    await confirmar()
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(source.update).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText(/alterado por outra pessoa/)).toBeTruthy()
  })
})
