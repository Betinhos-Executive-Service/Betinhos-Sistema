// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT, MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource, type FlowResult } from '../data/source'
import type { Kind } from '../data/types'
import { liberarFlows, type RegistroStatus } from '../domain/transitions'
import { StatusPanel } from './StatusPanel'
import { ToastProvider } from '@betinhos/ui'

function fakeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    mode: 'mock', envLabel: 'TEST',
    load: async () => ({ data: EMPTY_DATA, errors: {} }),
    currentStatus: async () => MANUT.SOLICITADO,
    dateBehaviors: async () => ({ cr40f_agendarpara: 'DateOnly' }),
    update: vi.fn(async () => {}),
    openForm: async () => {},
    prepareFlow: vi.fn(async () => {}),
    classificacao: async () => ({ servicos: [], categorias: [], origem: null, confianca: null }), classificarAgora: async () => { throw new Error("indisponível") }, fotoVeiculo: async () => null, enviarFotoVeiculo: async () => {}, runFlow: vi.fn(async (): Promise<FlowResult> => ({ message: null, shareUrl: null })),
    ...overrides,
  }
}

type PanelOptions = { kind?: Kind; record?: Partial<RegistroStatus>; initial?: Record<string, string> }

function renderPanel(source: DataSource, status: number | null, options: PanelOptions = {}) {
  const onDone = vi.fn()
  const onReload = vi.fn()
  const record: RegistroStatus = { id: 'm1', status, temVeiculo: true, temMotorista: true, ...options.record }
  render(<ToastProvider><StatusPanel source={source} kind={options.kind ?? 'manutencao'} record={record} initial={options.initial} onDone={onDone} onReload={onReload} /></ToastProvider>)
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
    renderPanel(fakeSource(), MANUT.SOLICITADO)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Aprovar e agendar', 'Reprovar', 'Cancelar manutenção'])
  })

  it('informa quando não há ação disponível', () => {
    renderPanel(fakeSource(), MANUT.REALIZADO)
    expect(screen.getByText('Sem ações de status para este registro.')).toBeTruthy()
  })

  it('bloqueia a reprovação sem comentário e não grava', async () => {
    const source = fakeSource()
    renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }))
    await confirmar()
    expect(screen.getByText('Obrigatório')).toBeTruthy()
    expect(screen.getByLabelText(/Comentário do aprovador/).getAttribute('aria-invalid')).toBe('true')
    expect(source.update).not.toHaveBeenCalled()
  })

  it('grava a transição direta com o status e avisa a tela com null', async () => {
    const source = fakeSource()
    const { onDone, onReload } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }))
    fireEvent.change(screen.getByLabelText(/Comentário do aprovador/), { target: { value: 'Sem verba' } })
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(null)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.update).toHaveBeenCalledWith('manutencao', 'm1', expect.objectContaining({ cr40f_status: MANUT.REPROVADO, cr40f_comentariosdoaprovador: 'Sem verba' }))
    expect(source.runFlow).not.toHaveBeenCalled()
    expect(await screen.findByText('Reprovar: concluído.')).toBeTruthy()
  })

  it('em falha mostra a mensagem real e mantém o que foi digitado', async () => {
    const source = fakeSource({ update: vi.fn(async () => { throw new Error('Principal user is missing prvWritecr40f_manutencoes privilege.') }) })
    const { onDone, onReload } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Reprovar' }))
    fireEvent.change(screen.getByLabelText(/Comentário do aprovador/), { target: { value: 'Sem verba' } })
    await confirmar()
    await waitFor(() => expect(screen.getByText(/missing prvWritecr40f_manutencoes privilege/)).toBeTruthy())
    expect((screen.getByLabelText(/Comentário do aprovador/) as HTMLInputElement).value).toBe('Sem verba')
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).not.toHaveBeenCalled()
  })

  it('quando outra pessoa mudou o status, não grava e pede recarga', async () => {
    const source = fakeSource({ currentStatus: async () => MANUT.CANCELADO })
    const { onDone, onReload } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar manutenção' }))
    await confirmar()
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
    expect(source.update).not.toHaveBeenCalled()
    expect(source.runFlow).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText(/alterado por outra pessoa/)).toBeTruthy()
  })

  it('desabilita a ação com o motivo quando falta o requisito', () => {
    renderPanel(fakeSource(), MANUT.SOLICITADO, { record: { temVeiculo: false } })
    const aprovar = screen.getByRole('button', { name: 'Aprovar e agendar' }) as HTMLButtonElement
    expect(aprovar.disabled).toBe(true)
    expect(aprovar.title).toBe('Informe o veículo no formulário antes desta ação')
    expect(screen.getByText('Informe o veículo no formulário antes desta ação').className).toContain('muted')
    expect((screen.getByRole('button', { name: 'Reprovar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('desabilita as ações de multa que exigem motorista', () => {
    renderPanel(fakeSource(), MULTA.NOTIFICAR, { kind: 'multa', record: { temMotorista: false } })
    const notificar = screen.getByRole('button', { name: 'Notificar condutor' }) as HTMLButtonElement
    expect(notificar.disabled).toBe(true)
    expect(notificar.title).toBe('Informe o motorista no formulário antes desta ação')
  })

  it('começa os campos com o valor inicial informado', () => {
    renderPanel(fakeSource(), MANUT.SOLICITADO, { initial: { cr40f_agendarpara: '2026-10-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
    expect((screen.getByLabelText(/Agendar para/) as HTMLInputElement).value).toBe('2026-10-15')
    expect((screen.getByLabelText(/Comentário do aprovador/) as HTMLInputElement).value).toBe('')
  })

  it('transição com Flow grava só os campos da etapa, chama o Flow e devolve o resultado', async () => {
    const resultado: FlowResult = { message: 'Manutenção aprovada.', shareUrl: 'https://contrato.example/abc' }
    const source = fakeSource({ runFlow: vi.fn(async () => resultado) })
    const { onDone, onReload } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
    expect(screen.getByText('Esta ação dispara o Flow "Aprovar e agendar" e pode levar até um minuto.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Agendar para/), { target: { value: '2026-10-15' } })
    fireEvent.change(screen.getByLabelText(/Comentário do aprovador/), { target: { value: 'Pode fazer' } })
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledWith(resultado)
    expect(onReload).not.toHaveBeenCalled()
    expect(source.runFlow).toHaveBeenCalledTimes(1)
    expect(source.runFlow).toHaveBeenCalledWith('aprovarManutencao', 'm1')
    expect(source.update).toHaveBeenCalledTimes(1)
    const patch = (source.update as ReturnType<typeof vi.fn>).mock.calls[0][2] as Record<string, unknown>
    expect(patch).not.toHaveProperty('cr40f_status')
    expect(patch).toHaveProperty('cr40f_agendarpara')
    expect(patch).not.toHaveProperty('cr40f_datadaaprovacao')
    expect(patch.cr40f_comentariosdoaprovador).toBe('Pode fazer')
    expect(await screen.findByText('Manutenção aprovada.')).toBeTruthy()
  })

  it('usa a mensagem padrão quando o Flow não devolve texto', async () => {
    const source = fakeSource({ currentStatus: async () => MULTA.NOTIFICAR })
    const { onDone } = renderPanel(source, MULTA.NOTIFICAR, { kind: 'multa' })
    fireEvent.click(screen.getByRole('button', { name: 'Notificar condutor' }))
    await confirmar()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(source.runFlow).toHaveBeenCalledWith('notificarCondutor', 'm1')
    expect(source.update).not.toHaveBeenCalled()
    expect(await screen.findByText('Notificar condutor: concluído.')).toBeTruthy()
  })

  it('durante o Flow mostra a espera e desabilita os controles', async () => {
    let finish: (value: FlowResult) => void = () => {}
    const source = fakeSource({ runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { finish = resolve })) })
    const { onDone } = renderPanel(source, MANUT.SOLICITADO, { initial: { cr40f_agendarpara: '2026-10-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
    await confirmar()
    const espera = await screen.findByRole('button', { name: /Aguardando o Flow…/ })
    expect((espera as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Agendar para/) as HTMLInputElement).disabled).toBe(true)
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => { finish({ message: null, shareUrl: null }) })
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('falha do Flow mostra o erro, volta para a lista de ações e pede recarga', async () => {
    const source = fakeSource({ runFlow: vi.fn(async () => { throw new Error('O Flow não respondeu a tempo') }) })
    const { onDone, onReload } = renderPanel(source, MANUT.SOLICITADO)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
    fireEvent.change(screen.getByLabelText(/Agendar para/), { target: { value: '2026-10-15' } })
    fireEvent.change(screen.getByLabelText(/Comentário do aprovador/), { target: { value: 'Pode fazer' } })
    await confirmar()
    await waitFor(() => expect(screen.getByText(/O Flow não respondeu a tempo/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull()
    for (const nome of ['Aprovar e agendar', 'Reprovar', 'Cancelar manutenção']) expect(screen.getByRole('button', { name: nome })).toBeTruthy()
    expect(screen.queryByLabelText(/Agendar para/)).toBeNull()
    expect(onDone).not.toHaveBeenCalled()
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('dois envios seguidos antes de re-renderizar chamam o Flow uma única vez', async () => {
    const source = fakeSource({ runFlow: vi.fn(() => new Promise<FlowResult>((resolve) => { setTimeout(() => resolve({ message: null, shareUrl: null }), 20) })) })
    const { onDone } = renderPanel(source, MANUT.SOLICITADO, { initial: { cr40f_agendarpara: '2026-10-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar e agendar' }))
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
