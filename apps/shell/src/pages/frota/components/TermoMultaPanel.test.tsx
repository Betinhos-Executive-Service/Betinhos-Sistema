// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MULTA } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, TermoMulta } from '../data/types'
import { AvisoPorTermo } from './TermoMultaPanel'

const HOJE = '2026-11-18'
const multa: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'AIT 1', status: MULTA.NOTIFICAR, dataHora: null, local: null, dataParaIndicar: '2026-12-10', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC1234' }, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-11-01T12:00:00Z', valorGuia: 300.01, recursoPendente: false, termoVigente: null }
const pendente: TermoMulta = { id: 't1', status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: '2026-12-01', enviadoEm: '2026-11-17T13:00:00Z', assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: '2026-11-17T13:00:00Z' }

function fake() {
  return {
    enviarTermoMulta: vi.fn(async () => 't9'),
    cancelarTermoMulta: vi.fn(async () => {}),
    lembrarTermoMulta: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
  } as unknown as DataSource & Record<string, ReturnType<typeof vi.fn>>
}

async function montar(source: DataSource, opts: { item?: Multa; termoPendente?: TermoMulta | null; semTermo?: boolean } = {}) {
  const onChanged = vi.fn()
  const onSemTermo = vi.fn()
  await act(async () => {
    render(<ToastProvider><AvisoPorTermo source={source} multa={opts.item ?? multa} termoPendente={opts.termoPendente ?? null} valorCatalogo={195.23} hoje={HOJE} onChanged={onChanged} semTermo={opts.semTermo ?? false} onSemTermo={onSemTermo} indicacao={<p>Campos da indicação</p>} /></ToastProvider>)
  })
  return { onChanged, onSemTermo }
}

afterEach(cleanup)

describe('AvisoPorTermo', () => {
  it('sem termo: mostra os dois caminhos e a prévia das parcelas', async () => {
    await montar(fake())
    expect(screen.getByRole('button', { name: 'Enviar termo pelo app' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Indicar sem o termo' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '3' } })
    const previa = screen.getByRole('list', { name: 'Prévia das parcelas' })
    expect(previa.querySelectorAll('li')).toHaveLength(3)
    expect(previa.textContent).toMatch(/100,01/)
  })

  it('enviar chama enviarTermoMulta só com folha, parcelas, valor e mês', async () => {
    const source = fake()
    const { onChanged } = await montar(source)
    fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar termo pelo app' }))
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' })) })
    expect(source.enviarTermoMulta).toHaveBeenCalledWith('u1', { forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: '2026-12-01' })
    expect(onChanged).toHaveBeenCalled()
  })

  it('prazo curto para indicar: mostra o motivo e bloqueia o envio', async () => {
    await montar(fake(), { item: { ...multa, dataParaIndicar: '2026-11-20' } })
    expect(screen.getByText('Faltam menos de 3 dias para o prazo de indicação; indique sem o termo.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar termo pelo app' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Indicar sem o termo, sem termo pendente só troca o caminho', async () => {
    const { onSemTermo } = await montar(fake())
    fireEvent.click(screen.getByRole('button', { name: 'Indicar sem o termo' }))
    expect(onSemTermo).toHaveBeenCalledWith(true)
  })

  it('sem o termo mostra os campos da indicação e volta ao termo', async () => {
    const { onSemTermo } = await montar(fake(), { semTermo: true })
    expect(screen.getByText('Campos da indicação')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao termo pelo app' }))
    expect(onSemTermo).toHaveBeenCalledWith(false)
  })

  it('termo pendente: mostra o estado, lembra e cancela com confirmação', async () => {
    const source = fake()
    await montar(source, { termoPendente: pendente })
    expect(screen.getByText('Aguardando o motorista assinar o termo')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lembrar' })) })
    expect(source.lembrarTermoMulta).toHaveBeenCalledWith('t1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar termo' }))
    expect(screen.getByText('Cancelar o termo? O motorista deixa de ver o pedido de assinatura.')).toBeTruthy()
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar termo' })) })
    expect(source.cancelarTermoMulta).toHaveBeenCalledWith('t1')
  })

  it('termo pendente: Indicar sem o termo cancela o termo e depois abre os campos da indicação', async () => {
    const source = fake()
    const { onSemTermo } = await montar(source, { termoPendente: pendente })
    fireEvent.click(screen.getByRole('button', { name: 'Indicar sem o termo' }))
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar termo' })) })
    expect(source.cancelarTermoMulta).toHaveBeenCalledWith('t1')
    expect(onSemTermo).toHaveBeenCalledWith(true)
  })
})
