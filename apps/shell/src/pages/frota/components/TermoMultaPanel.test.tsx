// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { addMonths, todaySP } from '../data/dates'
import { MULTA } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, TermoMulta } from '../data/types'
import { TermoMultaPanel } from './TermoMultaPanel'

const multa: Multa = { id: 'u1', titulo: 'AIT 1', status: MULTA.NOTIFICADO, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC1234' }, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: 300.01, recursoPendente: false, termoVigente: null }
const termo = (extra: Partial<TermoMulta>): TermoMulta => ({ id: 't1', status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: '2026-11-01', enviadoEm: '2026-10-20T13:00:00Z', assinadoEm: null, hashPdf: null, motivoContestacao: null, criadoEm: '2026-10-20T13:00:00Z', ...extra })

function fake(overrides: Partial<DataSource> = {}) {
  return {
    temAditivo: vi.fn(async () => true),
    listarTermos: vi.fn(async () => [] as TermoMulta[]),
    enviarTermoMulta: vi.fn(async () => 't9'),
    cancelarTermoMulta: vi.fn(async () => {}),
    baixarPdfTermo: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    ...overrides,
  } as unknown as DataSource & Record<string, ReturnType<typeof vi.fn>>
}

async function montar(source: DataSource, item: Multa = multa, valorCatalogo: number | null = 195.23) {
  const onChanged = vi.fn()
  await act(async () => { render(<ToastProvider><TermoMultaPanel source={source} multa={item} valorCatalogo={valorCatalogo} onChanged={onChanged} /></ToastProvider>) })
  return { onChanged }
}

const proximaCompetencia = addMonths(`${todaySP().slice(0, 7)}-01`, 1)

afterEach(cleanup)

describe('TermoMultaPanel', () => {
  it('sem aditivo: mostra o aviso e o envio fica desabilitado', async () => {
    await montar(fake({ temAditivo: vi.fn(async () => false) }))
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    expect(screen.getByText(/ainda não tem o aditivo de assinatura eletrônica/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar termo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('folha em 3x mostra a prévia das parcelas de calcularParcelas', async () => {
    await montar(fake())
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto em folha' }))
    fireEvent.click(screen.getByRole('radio', { name: '3x' }))
    const previa = screen.getByRole('list', { name: 'Prévia das parcelas' })
    expect(previa.querySelectorAll('li')).toHaveLength(3)
    expect(previa.textContent).toMatch(/100,01/)
    expect(previa.textContent).toMatch(/100,00/)
  })

  it('enviar chama enviarTermoMulta com o payload do acordo', async () => {
    const source = fake()
    const { onChanged } = await montar(source)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto em folha' }))
    fireEvent.click(screen.getByRole('radio', { name: '3x' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar termo' })) })
    expect(source.enviarTermoMulta).toHaveBeenCalledWith('u1', { forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: proximaCompetencia })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('guia envia 1 parcela com a competência do mês atual', async () => {
    const source = fake()
    await montar(source)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar termo' })) })
    expect(source.enviarTermoMulta).toHaveBeenCalledWith('u1', { forma: 'guia', parcelas: 1, valorTotal: 300.01, primeiraCompetencia: `${todaySP().slice(0, 7)}-01` })
  })

  it('termo Pendente: aguardando assinatura desde dd/mm e Cancelar envio', async () => {
    const source = fake({ listarTermos: vi.fn(async () => [termo({})]) })
    await montar(source)
    expect(screen.getByText('Aguardando assinatura desde 20/10')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Preparar termo' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio' })) })
    expect(source.cancelarTermoMulta).toHaveBeenCalledWith('t1')
  })

  it('termo Assinado: data do servidor, hash curto com copiar e Baixar PDF', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    const hash = 'abcdef1234567890'.repeat(4)
    const source = fake({ listarTermos: vi.fn(async () => [termo({ status: 'assinado', assinadoEm: '2026-10-21T17:30:00Z', hashPdf: hash })]) })
    await montar(source)
    expect(screen.getByText(/Assinado em 21\/10\/2026 às 14:30/)).toBeTruthy()
    expect(screen.getByText('abcdef12')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar hash' })) })
    expect(writeText).toHaveBeenCalledWith(hash)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' })) })
    expect(source.baixarPdfTermo).toHaveBeenCalledWith('t1')
  })

  it('termo Contestado mostra o motivo', async () => {
    await montar(fake({ listarTermos: vi.fn(async () => [termo({ status: 'contestado', motivoContestacao: 'Não era eu dirigindo' })]) }))
    expect(screen.getByText(/Não era eu dirigindo/)).toBeTruthy()
  })

  it('valor da guia vem do catálogo quando vazio', async () => {
    await montar(fake(), { ...multa, valorGuia: null })
    expect((screen.getByLabelText(/Valor da guia/) as HTMLInputElement).value).toBe('195.23')
  })

  it('recurso pendente grava na multa', async () => {
    const source = fake()
    await montar(source)
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /^Recurso pendente/ })) })
    expect(source.update).toHaveBeenCalledWith('multa', 'u1', { new_recursopendente: true })
  })
})
