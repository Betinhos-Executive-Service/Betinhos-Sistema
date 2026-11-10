// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DespesasPage } from './DespesasPage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

// Mock: mock-desp-3 (Estapar GRU T3, com justificativa do motorista) e mock-desp-10 (Restaurante Frango Assado) esperam o gestor.
const PRIMEIRA = 'Estapar GRU T3'
const SEGUNDA = 'Restaurante Frango Assado'

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = '#/despesas?abrir=mock-desp-3'
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = '' })

async function abrir() {
  render(<DespesasPage host={{ mode: 'mock' }} />)
  return screen.findByRole('dialog', { name: PRIMEIRA })
}

describe('decisão do gestor no drawer', () => {
  it('mostra o motivo, a justificativa do motorista e as três ações', async () => {
    const ficha = await abrir()
    const bloco = within(ficha).getByRole('region', { name: 'Esperando sua decisão' })
    expect(within(bloco).getByText('O posto emitiu o cupom com o valor errado e corrigiu à mão.')).toBeTruthy()
    for (const nome of ['Validar', 'Devolver ao motorista', 'Cancelar despesa']) expect(within(bloco).getByRole('button', { name: nome })).toBeTruthy()
  })

  it('validar grava direto, avisa e avança para a próxima da fila', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Validar' }))
    expect(await screen.findByText('Despesa validada.')).toBeTruthy()
    expect(await screen.findByRole('dialog', { name: SEGUNDA })).toBeTruthy()
  })

  it('devolver exige motivo de 10 caracteres e confirma pelo botão que diz o efeito', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver ao motorista' }))
    const confirmar = within(ficha).getByRole('button', { name: 'Enviar ao motorista' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    const campo = within(ficha).getByPlaceholderText('Ex.: envie uma foto legível do cupom.')
    fireEvent.change(campo, { target: { value: 'curto' } })
    expect(confirmar.disabled).toBe(true)
    expect(within(ficha).getByText(/Escreva mais 5/)).toBeTruthy()
    fireEvent.change(campo, { target: { value: 'Envie o cupom fiscal original.' } })
    expect(confirmar.disabled).toBe(false)
    fireEvent.click(confirmar)
    expect(await screen.findByText('Despesa devolvida ao motorista.')).toBeTruthy()
    expect(await screen.findByRole('dialog', { name: SEGUNDA })).toBeTruthy()
  })

  it('cancelar avisa da Divergência do cartão e exige motivo', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Cancelar despesa' }))
    expect(within(ficha).getByText(/Divergência na conciliação/)).toBeTruthy()
    const confirmar = within(ficha).getByRole('button', { name: 'Confirmar cancelamento' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    fireEvent.change(within(ficha).getByPlaceholderText('Ex.: lançamento duplicado.'), { target: { value: 'Lançamento duplicado.' } })
    fireEvent.click(confirmar)
    expect(await screen.findByText('Despesa cancelada.')).toBeTruthy()
  })

  it('motivo pronto preenche o campo e libera o envio', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver ao motorista' }))
    fireEvent.click(within(ficha).getByRole('button', { name: 'Explique a diferença de valor.' }))
    expect((within(ficha).getByPlaceholderText('Ex.: envie uma foto legível do cupom.') as HTMLTextAreaElement).value).toBe('Explique a diferença de valor.')
    expect((within(ficha).getByRole('button', { name: 'Enviar ao motorista' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('o texto de uma devolução não vira motivo de cancelamento', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver ao motorista' }))
    fireEvent.change(within(ficha).getByPlaceholderText('Ex.: envie uma foto legível do cupom.'), { target: { value: 'Envie o cupom fiscal original.' } })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Cancelar despesa' }))
    expect((within(ficha).getByPlaceholderText('Ex.: lançamento duplicado.') as HTMLTextAreaElement).value).toBe('')
  })

  it('com motivo digitado, fechar pergunta "Descartar alterações?"', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Devolver ao motorista' }))
    fireEvent.change(within(ficha).getByPlaceholderText('Ex.: envie uma foto legível do cupom.'), { target: { value: 'Envie o cupom fiscal original.' } })
    fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar painel' }))
    const confirma = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(confirma).getByRole('button', { name: 'Continuar editando' }))
    expect(screen.getByRole('dialog', { name: PRIMEIRA })).toBeTruthy()
    expect((within(ficha).getByPlaceholderText('Ex.: envie uma foto legível do cupom.') as HTMLTextAreaElement).value).toBe('Envie o cupom fiscal original.')

    fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar painel' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: PRIMEIRA })).toBeNull())
  })

  it('durante o envio o drawer não fecha', async () => {
    const ficha = await abrir()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Validar' }))
    fireEvent.click(within(ficha).getByRole('button', { name: 'Fechar painel' }))
    expect(screen.getByRole('dialog', { name: PRIMEIRA })).toBeTruthy()
    expect(await screen.findByText('Despesa validada.')).toBeTruthy()
  })

  it('a visão Esperando gestor lista só as duas', async () => {
    window.location.hash = '#/despesas'
    render(<DespesasPage host={{ mode: 'mock' }} />)
    await screen.findAllByText('Posto Shell Faria Lima')
    expect(screen.getAllByText('Esperando gestor').length).toBeGreaterThan(0)
    fireEvent.click(await screen.findByRole('button', { name: /^Visão:/ }))
    const opcao = await waitFor(() => {
      const el = screen.getAllByText('Esperando gestor').map((e) => e.closest('[role="menuitemradio"]')).find(Boolean)
      if (!el) throw new Error('visão não apareceu')
      return el
    })
    fireEvent.click(opcao)
    await waitFor(() => expect(document.querySelectorAll('.pg-open')).toHaveLength(2))
  })
})
