// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AcessoError, type AcessoSource } from '../data/acesso'
import { CadastroAcessoDrawer } from './CadastroAcessoDrawer'

const ok = { emailMicrosoft: 'ana.lima@betinhos.com.br', senhaTemporaria: 'Kx7#mQ2vR9pL4w', funcionarioId: 'f9', linkApp: 'https://app', etapas: [{ etapa: 'usuario', estado: 'feita' as const, detalhe: 'criado' }] }
function src(cadastrar: AcessoSource['cadastrar']): AcessoSource { return { cadastrar, encerrar: async () => [] } }
function renderDrawer(source: AcessoSource, props: Partial<Parameters<typeof CadastroAcessoDrawer>[0]> = {}) {
  const onClose = vi.fn(); const onCadastrado = vi.fn()
  render(<ToastProvider><CadastroAcessoDrawer acesso={source} onClose={onClose} onCadastrado={onCadastrado} {...props} /></ToastProvider>)
  return { onClose, onCadastrado }
}
afterEach(cleanup)

describe('CadastroAcessoDrawer', () => {
  it('gera a prévia do e-mail a partir do nome e permite editar o prefixo', () => {
    renderDrawer(src(async () => ok))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Ávila' } })
    expect((screen.getByLabelText(/E-mail Microsoft/) as HTMLInputElement).value).toBe('joao.avila')
    expect(screen.getByText('joao.avila@betinhos.com.br')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/E-mail Microsoft/), { target: { value: 'joao.silva' } })
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'João da Silva Prado' } })
    expect((screen.getByLabelText(/E-mail Microsoft/) as HTMLInputElement).value).toBe('joao.silva')
  })

  it('cadastra, mostra senha uma vez e monta o link do WhatsApp', async () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    const { onCadastrado } = renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledWith({ nomeCompleto: 'Ana Lima', celular: '12991234567', emailPessoal: undefined, prefixoEmail: 'ana.lima', tipoVinculo: 1, funcionarioId: undefined })
    const wa = screen.getByRole('link', { name: /Enviar no WhatsApp/ })
    expect(wa.getAttribute("href")).toContain('https://wa.me/5512991234567?text=')
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('Kx7#mQ2vR9pL4w')
    expect(screen.getByText(/aparece só agora/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Abrir ficha/ }))
    expect(onCadastrado).toHaveBeenCalledWith('f9')
  })

  it('erro parcial mostra etapas e permite tentar de novo com o mesmo input', async () => {
    const cadastrar = vi.fn()
      .mockRejectedValueOnce(new AcessoError('GRAPH_INDISPONIVEL', 'O Microsoft 365 não respondeu.', [{ etapa: 'usuario', estado: 'feita', detalhe: 'criado' }, { etapa: 'licenca', estado: 'erro', detalhe: '503' }]))
      .mockResolvedValueOnce(ok)
    renderDrawer(src(cadastrar))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    await screen.findByRole('alert')
    expect(screen.getByText(/usuario/)).toBeTruthy()
    expect(screen.getByText(/licenca/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ })) })
    await screen.findByText('Kx7#mQ2vR9pL4w')
    expect(cadastrar).toHaveBeenCalledTimes(2)
    expect(cadastrar.mock.calls[1][0]).toEqual(cadastrar.mock.calls[0][0])
  })

  it('fechar com dado digitado pede confirmação; durante a criação não fecha', async () => {
    let resolver: (v: typeof ok) => void = () => {}
    const { onClose } = renderDrawer(src(() => new Promise((r) => { resolver = r })))
    fireEvent.change(screen.getByLabelText(/Nome completo/), { target: { value: 'Ana Lima' } })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('Descartar alterações?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continuar editando/ }))
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { resolver(ok) })
  })

  it('com inicial preenche nome e celular e envia funcionarioId', async () => {
    const cadastrar = vi.fn<AcessoSource['cadastrar']>(async () => ok)
    renderDrawer(src(cadastrar), { inicial: { funcionarioId: 'f1', nomeCompleto: 'Ana Lima', celular: '12991234567' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Criar acesso/ })) })
    expect(cadastrar.mock.calls[0][0]).toMatchObject({ funcionarioId: 'f1', nomeCompleto: 'Ana Lima' })
  })
})
