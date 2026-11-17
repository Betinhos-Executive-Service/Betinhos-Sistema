// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COLISAO, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource, type FlowResult } from '../data/source'
import type { Kind } from '../data/types'
import { liberarFlows, type RegistroStatus } from '../domain/transitions'
import { StatusPanel } from './StatusPanel'
import { ToastProvider } from '@betinhos/ui'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => COLISAO.ENVIADO,
    dateBehaviors: async () => ({}),
    update: vi.fn(async () => {}),
    openForm: async () => {},
    prepareFlow: vi.fn(async () => {}),
    fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: null, shareUrl: null })), salvarItemPlano: async () => {}, inativarItemPlano: async () => {}, salvarBaseline: async () => {}, temAditivo: async () => false, listarTermos: async () => [], enviarTermoMulta: async () => 't1', cancelarTermoMulta: async () => {}, baixarPdfTermo: async () => ({ nome: 't.pdf', blob: new Blob() }), lembrarTermoMulta: async () => {}, listarParcelasTermo: async () => [],
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

afterEach(() => {
  cleanup()
  liberarFlows()
})

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

  it('grava a transição direta com o status e avisa a tela com null', async () => {
    const source = fakeSource()
    const { onDone, onReload } = renderPanel(source, COLISAO.ENVIADO)
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em análise' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(null)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.update).toHaveBeenCalledWith('colisao', 'c1', { cr40f_statusoperacional: COLISAO.ANALISE })
    expect(source.runFlow).not.toHaveBeenCalled()
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

  it('transição com campo fixo grava o campo junto com o status (Entrar com recurso)', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.INDICADA })
    renderPanel(source, MULTA.INDICADA, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com recurso' }))
    await confirmar()
    await waitFor(() => expect(source.update).toHaveBeenCalledWith('multa', 'c1', { cr40f_status: MULTA.RECURSO, new_recursopendente: true }))
  })

  it('desabilita as ações de multa que exigem motorista', () => {
    renderPanel(fakeSource(), MULTA.NOTIFICAR, { kind: 'multa', record: { temMotorista: false } })
    const notificar = screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement
    expect(notificar.disabled).toBe(true)
    expect(notificar.title).toBe('Informe o motorista no formulário antes desta ação')
    expect(screen.getByText('Informe o motorista no formulário antes desta ação').className).toContain('muted')
  })

  it('transição com Flow chama o Flow, sem gravar pela tela, e devolve o resultado', async () => {
    const resultado: FlowResult = { message: 'Contrato gerado.', shareUrl: 'https://contrato.example/abc' }
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICADO, runFlow: vi.fn(async () => resultado) })
    const { onDone, onReload } = renderPanel(source, MULTA.NOTIFICADO, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar contrato de indicação' }))
    expect(screen.getByText('Esta ação dispara o Flow "Gerar contrato de indicação" e pode levar até um minuto.')).toBeTruthy()
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(resultado)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.runFlow).toHaveBeenCalledWith('gerarContrato', 'c1')
    expect(source.update).not.toHaveBeenCalled()
    expect(await screen.findByText('Contrato gerado.')).toBeTruthy()
  })

  it('usa a mensagem padrão quando o Flow não devolve texto', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'c1')
    expect(source.update).not.toHaveBeenCalled()
    expect(await screen.findByText('Notificar condutor: concluído.')).toBeTruthy()
  })

  it('durante o Flow mostra a espera e desabilita os controles', async () => {
    let finish: (value: FlowResult) => void = () => {}
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { finish = resolve })) })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    const espera = await screen.findByRole('button', { name: /Aguardando o Flow…/ })
    expect((espera as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => { finish({ message: null, shareUrl: null }) })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('falha do Flow mostra o erro, volta para a lista de ações e pede recarga', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(async () => { throw new Error('O Flow não respondeu a tempo') }) })
    const { onDone, onReload } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/O Flow não respondeu a tempo/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Notificar condutor' })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('dois envios seguidos antes de re-renderizar chamam o Flow uma única vez', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR, runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { setTimeout(() => resolve({ message: null, shareUrl: null }), 20) })) })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    const form = screen.getByRole('button', { name: 'Confirmar' }).closest('form')!
    await act(async () => {
      fireEvent.submit(form)
      fireEvent.submit(form)
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
