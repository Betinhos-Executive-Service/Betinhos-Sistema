// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockLinhas, createMockMensagens } from '../data/mock'
import type { Source } from '../data/source'
import type { Linha } from '../domain/types'
import { ValidacaoDrawer } from './ValidacaoDrawer'

afterEach(cleanup)

const mensagens = createMockMensagens()
const linhas = createMockLinhas(mensagens)
const emDuvida = linhas.find((l) => l.situacao === 'em_duvida' && l.cliente.nome === 'Tenaris')!

function source(over: Partial<Source> = {}): Source {
  return {
    mock: true,
    podeAcessar: async () => true,
    load: async () => ({ linhas, clientes: [], validadores: [] }),
    mensagens: async (id) => mensagens.filter((m) => m.validacaoId === id),
    responder: vi.fn(async (l: Linha, texto: string) => ({
      mensagem: { id: 'm-novo', validacaoId: l.validacaoId!, lado: 'betinhos' as const, autor: 'Juliana', motivo: null, texto, criadaEm: '2026-10-28T15:00:00Z' },
      prazoTacita: '2026-11-05',
      avisoFalhou: null,
    })),
    retirar: vi.fn(async () => undefined),
    liberar: vi.fn(async (ls: Linha[]) => ({ ok: ls.map((l) => ({ linhaId: l.id, validacaoId: 'v-novo' })), failed: [] })),
    setObservacao: vi.fn(async () => undefined),
    setFechamento: async () => undefined,
    criarValidador: async () => 'x',
    setValidadorAtivo: async () => undefined,
    refazerAutenticador: async () => undefined,
    ...over,
  }
}

function abrir(s: Source, linha: Linha = emDuvida) {
  const props = { onClose: vi.fn(), onRespondida: vi.fn(), onRetirada: vi.fn(), onPatch: vi.fn() }
  render(<ToastProvider><ValidacaoDrawer linha={linha} missing={false} source={s} mobile={false} {...props} /></ToastProvider>)
  return props
}
const drawer = () => screen.getAllByRole('dialog', { hidden: true }).find((d) => d.classList.contains('bt-drawer'))!

describe('ValidacaoDrawer', () => {
  it('mostra a conversa e responde: status vai para Respondido com o prazo novo', async () => {
    const s = source()
    const props = abrir(s)
    expect(await within(drawer()).findByText(/espera de 3 h/)).toBeTruthy()
    fireEvent.change(within(drawer()).getByLabelText('Responder'), { target: { value: 'Chegada às 07:10.' } })
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Enviar resposta' }))
    await waitFor(() => expect(props.onRespondida).toHaveBeenCalledWith(emDuvida, expect.objectContaining({ texto: 'Chegada às 07:10.' }), '2026-11-05'))
    expect(within(drawer()).getByText('Chegada às 07:10.')).toBeTruthy()
    expect((within(drawer()).getByLabelText('Responder') as HTMLTextAreaElement).value).toBe('')
  })

  it('não envia resposta vazia', async () => {
    const s = source()
    abrir(s)
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Enviar resposta' }))
    expect(await within(drawer()).findByText('Escreva a resposta antes de enviar.')).toBeTruthy()
    expect(s.responder).not.toHaveBeenCalled()
  })

  it('Esc com resposta digitada pede "Descartar alterações?"', async () => {
    const props = abrir(source())
    fireEvent.change(within(drawer()).getByLabelText('Responder'), { target: { value: 'rascunho' } })
    fireEvent(drawer(), new Event('cancel', { cancelable: true }))
    expect(await screen.findByText('Descartar alterações?')).toBeTruthy()
    expect(props.onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar', hidden: true }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('retira do portal só depois de confirmar', async () => {
    const s = source()
    const props = abrir(s)
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Retirar do portal' }))
    expect(await screen.findByText(/A conversa fica guardada aqui/)).toBeTruthy()
    expect(s.retirar).not.toHaveBeenCalled()
    const confirmar = screen.getAllByRole('button', { name: 'Retirar do portal', hidden: true }).find((b) => b.closest('.bt-dialog'))!
    fireEvent.click(confirmar)
    await waitFor(() => expect(props.onRetirada).toHaveBeenCalledWith(emDuvida))
    expect(s.retirar).toHaveBeenCalledWith(emDuvida.validacaoId)
  })

  it('aprovado não tem resposta nem retirada', async () => {
    abrir(source(), linhas.find((l) => l.situacao === 'aprovado')!)
    await waitFor(() => expect(within(drawer()).queryByRole('button', { name: 'Enviar resposta' })).toBeNull())
    expect(within(drawer()).queryByRole('button', { name: 'Retirar do portal' })).toBeNull()
  })

  it('a liberar: libera com a observação e a linha vira Liberado', async () => {
    const s = source()
    const linha = linhas.find((l) => l.situacao === 'a_liberar')!
    const props = abrir(s, linha)
    fireEvent.change(within(drawer()).getByLabelText('Observação'), { target: { value: 'Espera no embarque.' } })
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Liberar para o portal' }))
    await waitFor(() => expect(props.onPatch).toHaveBeenCalledWith(linha, expect.objectContaining({ situacao: 'liberado', observacao: 'Espera no embarque.', validacaoId: 'v-novo', valorLiberado: linha.valorComposicao })))
    expect(s.liberar).toHaveBeenCalledWith([linha], 'Espera no embarque.')
  })

  it('retirado oferece Liberar de novo', async () => {
    abrir(source(), linhas.find((l) => l.situacao === 'retirado')!)
    expect(within(drawer()).getByRole('button', { name: 'Liberar de novo' })).toBeTruthy()
  })

  it('liberado salva a observação editada', async () => {
    const s = source()
    const linha = linhas.find((l) => l.situacao === 'liberado' && l.observacao)!
    const props = abrir(s, linha)
    fireEvent.change(within(drawer()).getByLabelText('Observação'), { target: { value: 'Nova observação' } })
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Salvar observação' }))
    await waitFor(() => expect(props.onPatch).toHaveBeenCalledWith(linha, { observacao: 'Nova observação' }))
    expect(s.setObservacao).toHaveBeenCalledWith(linha.validacaoId, 'Nova observação')
  })
})
