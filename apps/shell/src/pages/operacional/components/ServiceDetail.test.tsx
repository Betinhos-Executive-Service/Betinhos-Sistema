// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@betinhos/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reserva } from '../domain/fixtures'
import type { Motorista, Veiculo } from '../domain/types'
import { ServiceDetail } from './ServiceDetail'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const veiculos: Veiculo[] = [{ id: 'v1', placa: 'RUH7G45', modelo: 'Corolla', cor: 'Prata' }]
const motorista = (extra: Partial<Motorista> = {}): Motorista => ({ id: 'm1', nome: 'Carlos', apelido: '', celular: '', veiculoAtualId: 'v1', terceiro: false, ...extra })

function setup(m: Motorista, onGerarLink = vi.fn().mockResolvedValue({ ok: true, link: 'https://l/r/x' })) {
  const r = reserva({ hora: '10:00' })
  render(
    <ToastProvider>
      <ServiceDetail reserva={r} filhos={[]} motoristas={[m]} reservas={[r]} now={new Date('2026-10-05T12:00:00Z')} statusOptions={[]} busy={false}
        veiculos={veiculos} onGerarLink={onGerarLink} onStatus={vi.fn()} onMotorista={vi.fn()} onOpenReserva={vi.fn()} />
    </ToastProvider>,
  )
  return onGerarLink
}

describe('ServiceDetail: carro e link', () => {
  it('mostra o carro e copia a mensagem ao cliente', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    setup(motorista())
    expect(screen.getByText('Corolla Prata · RUH7G45')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Copiar para o cliente/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('*Seu motorista:* Carlos\n• *Carro:* Corolla Prata\n• *Placa:* RUH7G45'))
  })

  it('motorista terceiro desativa "Gerar link" com o motivo', () => {
    setup(motorista({ terceiro: true }))
    const botao = screen.getByRole('button', { name: /Gerar link/ }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(botao.title).toBe('Motorista terceiro sem rastreador')
  })

  it('gera o link e mostra o erro no próprio detalhe quando falha', async () => {
    const onGerarLink = setup(motorista(), vi.fn().mockResolvedValue({ ok: false, erro: 'Sem rastreador.' }))
    fireEvent.click(screen.getByRole('button', { name: /Gerar link/ }))
    expect(await screen.findByText('Sem rastreador.')).toBeTruthy()
    expect(onGerarLink).toHaveBeenCalledTimes(1)
  })

  it('mostra o link gerado para abrir e copiar, e oferece gerar outro', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    setup(motorista(), vi.fn().mockResolvedValue({ ok: true, link: 'https://l/r/x', expiraEm: '2026-10-05T16:00:00Z' }))
    fireEvent.click(screen.getByRole('button', { name: /^Gerar link/ }))
    const abrir = await screen.findByRole('link', { name: /Abrir link de acompanhamento/ })
    expect(abrir.getAttribute('href')).toBe('https://l/r/x')
    expect(screen.getByText('Válido até 05/10 13:00')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gerar novo link/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('*Seu motorista:* Carlos\n• *Carro:* Corolla Prata\n• *Placa:* RUH7G45\n• *Acompanhe:* https://l/r/x'))
  })
})
