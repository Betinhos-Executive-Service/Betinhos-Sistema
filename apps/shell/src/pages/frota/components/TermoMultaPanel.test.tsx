// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { addMonths, todaySP } from '../data/dates'
import { MULTA } from '../data/schema'
import type { DataSource } from '../data/source'
import type { Multa, TermoMulta } from '../data/types'
import { TermoMultaPanel } from './TermoMultaPanel'

const multa: Multa = { id: 'u1', titulo: 'AIT 1', status: MULTA.NOTIFICADO, dataHora: null, local: null, dataParaIndicar: null, indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'ABC1234' }, motorista: { id: 'f1', label: 'Ana' }, infracaoId: null, criadoEm: '2026-10-01T12:00:00Z', valorGuia: 300.01, recursoPendente: false, termoVigente: null }
const termo = (extra: Partial<TermoMulta>): TermoMulta => ({ id: 't1', status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: '2026-11-01', enviadoEm: '2026-10-20T13:00:00Z', assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: '2026-10-20T13:00:00Z', ...extra })

function fake(overrides: Partial<DataSource> = {}) {
  return {
    temAditivo: vi.fn(async () => true),
    listarTermos: vi.fn(async () => [] as TermoMulta[]),
    enviarTermoMulta: vi.fn(async () => 't9'),
    cancelarTermoMulta: vi.fn(async () => {}),
    baixarPdfTermo: vi.fn(async () => ({ nome: 'Termo-1.pdf', blob: new Blob(['%PDF']) })),
    lembrarTermoMulta: vi.fn(async () => {}),
    listarParcelasTermo: vi.fn(async () => []),
    update: vi.fn(async () => {}),
    ...overrides,
  } as unknown as DataSource & Record<string, ReturnType<typeof vi.fn>>
}

async function montar(source: DataSource, item: Multa = multa, valorCatalogo: number | null = 195.23) {
  const onChanged = vi.fn()
  await act(async () => { render(<ToastProvider><TermoMultaPanel source={source} multa={item} valorCatalogo={valorCatalogo} onChanged={onChanged} /></ToastProvider>) })
  return { onChanged }
}

async function confirmarEnvio() {
  fireEvent.click(screen.getByRole('button', { name: 'Enviar termo' }))
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' })) })
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
    await confirmarEnvio()
    expect(source.enviarTermoMulta).toHaveBeenCalledWith('u1', { forma: 'folha', parcelas: 3, valorTotal: 300.01, primeiraCompetencia: proximaCompetencia })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('guia envia 1 parcela com a competência do mês atual', async () => {
    const source = fake()
    await montar(source)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    await confirmarEnvio()
    expect(source.enviarTermoMulta).toHaveBeenCalledWith('u1', { forma: 'guia', parcelas: 1, valorTotal: 300.01, primeiraCompetencia: `${todaySP().slice(0, 7)}-01` })
  })

  it('valor vazio bloqueia o envio com a mensagem do validarAcordo', async () => {
    await montar(fake(), { ...multa, valorGuia: null }, null)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    expect(screen.getByText('Informe um valor maior que zero.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar termo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('valor 0 também bloqueia o envio', async () => {
    await montar(fake(), { ...multa, valorGuia: 0 }, null)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    expect(screen.getByText('Informe um valor maior que zero.')).toBeTruthy()
  })

  it('salvar o valor da guia avisa a tela e não regrava no próximo blur', async () => {
    const source = fake()
    const { onChanged } = await montar(source)
    const campo = screen.getByLabelText(/Valor da guia/)
    fireEvent.change(campo, { target: { value: '150' } })
    await act(async () => { fireEvent.blur(campo) })
    await act(async () => { fireEvent.blur(campo) })
    expect(source.update).toHaveBeenCalledTimes(1)
    expect(source.update).toHaveBeenCalledWith('multa', 'u1', { new_valorguia: 150 })
    expect(onChanged).toHaveBeenCalled()
  })

  it('recurso pendente + folha bloqueia o envio', async () => {
    await montar(fake(), { ...multa, recursoPendente: true })
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto em folha' }))
    expect(screen.getByText(/Há recurso pendente/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Enviar termo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('falha ao ler o aditivo não esconde os termos', async () => {
    await montar(fake({ temAditivo: vi.fn(async () => { throw new Error('sem acesso') }), listarTermos: vi.fn(async () => [termo({})]) }))
    expect(screen.getByText('Enviado em 20/10 · expira em 27/10')).toBeTruthy()
  })

  it('termo Pendente: enviado, expira e Cancelar envio', async () => {
    const source = fake({ listarTermos: vi.fn(async () => [termo({})]) })
    await montar(source)
    expect(screen.getByText('Enviado em 20/10 · expira em 27/10')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Preparar termo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar envio' }))
    expect(source.cancelarTermoMulta).not.toHaveBeenCalled()
    expect(screen.getByText('Cancelar o termo enviado ao motorista?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar termo' })) })
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
    const createObjectURL = vi.fn(() => 'blob:termo')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' })) })
    expect(source.baixarPdfTermo).toHaveBeenCalledWith('t1')
    expect(createObjectURL).toHaveBeenCalled()
  })

  it('G5: termo Assinado lista as parcelas (competência, valor, status)', async () => {
    const source = fake({
      listarTermos: vi.fn(async () => [termo({ status: 'assinado', assinadoEm: '2026-10-21T17:30:00Z', hashPdf: 'a'.repeat(64) })]),
      listarParcelasTermo: vi.fn(async () => [{ numero: 1, competencia: '2026-11-01', valor: 100.01, status: 'Prevista' }, { numero: 2, competencia: '2026-12-01', valor: 100, status: 'Prevista' }]),
    })
    await montar(source)
    const lista = await screen.findByRole('list', { name: 'Parcelas do termo' })
    expect(source.listarParcelasTermo).toHaveBeenCalledWith('t1')
    expect(lista.querySelectorAll('li')).toHaveLength(2)
    expect(lista.textContent).toMatch(/11\/2026/)
    expect(lista.textContent).toMatch(/100,01/)
    expect(lista.textContent).toMatch(/Prevista/)
  })

  it('G5: erro ao baixar o PDF aparece na tela', async () => {
    const source = fake({ listarTermos: vi.fn(async () => [termo({ status: 'assinado', hashPdf: 'a'.repeat(64) })]), baixarPdfTermo: vi.fn(async () => { throw new Error('Este termo não é seu.') }) })
    await montar(source)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' })) })
    expect(await screen.findByText(/Este termo não é seu/)).toBeTruthy()
  })

  it('G1: primeira linha mostra o motorista e o aditivo', async () => {
    await montar(fake())
    expect(screen.getByText('Motorista: Ana')).toBeTruthy()
    expect(screen.getByText('Aditivo ✓')).toBeTruthy()
  })

  it('G1: sem aditivo, o alerta leva à ficha do funcionário e volta para a multa', async () => {
    window.location.hash = '#/frota-multas?registro=multa:u1'
    await montar(fake({ temAditivo: vi.fn(async () => false) }))
    expect(screen.getByText('Aditivo ✗')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar aditivo de Ana' }))
    const destino = new URLSearchParams(window.location.hash.split('?')[1])
    expect(window.location.hash.startsWith('#/funcionarios?')).toBe(true)
    expect(destino.get('ficha')).toBe('f1')
    expect(destino.get('voltar')).toBe('#/frota-multas?registro=multa:u1')
  })

  it('G3: Enviar pede confirmação com o resumo; Voltar não envia', async () => {
    const source = fake()
    await montar(source)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto em folha' }))
    fireEvent.click(screen.getByRole('radio', { name: '3x' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar termo' }))
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toMatch(/Enviar a Ana: desconto em folha 3x/)
    expect(dialogo.textContent).toMatch(/100,01/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }))
    expect(source.enviarTermoMulta).not.toHaveBeenCalled()
  })

  it('G4: Pendente mostra o último lembrete e Lembrar motorista chama a API', async () => {
    const source = fake({ listarTermos: vi.fn(async () => [termo({ ultimoLembreteEm: '2026-10-21T10:00:00Z' })]) })
    await montar(source)
    expect(screen.getByText('Enviado em 20/10 · expira em 27/10 · último lembrete 21/10')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lembrar motorista' })) })
    expect(source.lembrarTermoMulta).toHaveBeenCalledWith('t1')
  })

  it('G4: recusa do servidor aparece com a mensagem dele', async () => {
    const source = fake({ listarTermos: vi.fn(async () => [termo({})]), lembrarTermoMulta: vi.fn(async () => { throw new Error('Já foi enviado um lembrete nas últimas 24 horas.') }) })
    await montar(source)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lembrar motorista' })) })
    expect(await screen.findByText(/Já foi enviado um lembrete nas últimas 24 horas/)).toBeTruthy()
  })

  it('G4: lembrete nas últimas 24 h deixa o botão desabilitado com o motivo', async () => {
    const recente = new Date(Date.now() - 3600 * 1000).toISOString()
    await montar(fake({ listarTermos: vi.fn(async () => [termo({ ultimoLembreteEm: recente })]) }))
    expect((screen.getByRole('button', { name: 'Lembrar motorista' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Próximo lembrete a partir de/)).toBeTruthy()
  })

  it('G4: o botão volta a habilitar quando passam as 24 h, sem novo render vindo de fora', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const quase = new Date(Date.now() - (24 * 3600 - 30) * 1000).toISOString()
      await montar(fake({ listarTermos: vi.fn(async () => [termo({ ultimoLembreteEm: quase })]) }))
      expect((screen.getByRole('button', { name: 'Lembrar motorista' }) as HTMLButtonElement).disabled).toBe(true)
      await act(async () => { vi.advanceTimersByTime(61_000) })
      expect((screen.getByRole('button', { name: 'Lembrar motorista' }) as HTMLButtonElement).disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('G3: enquanto envia, o Enviar do diálogo fica ocupado', async () => {
    let soltar!: () => void
    const source = fake({ enviarTermoMulta: vi.fn(() => new Promise<string>((ok) => { soltar = () => ok('t9') })) })
    await montar(source)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar termo' }))
    const enviar = within(screen.getByRole('dialog')).getByRole('button', { name: /Enviar/ })
    await act(async () => { fireEvent.click(enviar) })
    expect(source.enviarTermoMulta).toHaveBeenCalledTimes(1)
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: /Enviar/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(enviar)
    expect(source.enviarTermoMulta).toHaveBeenCalledTimes(1)
    await act(async () => { soltar() })
  })

  it('G6: valor da guia fica travado com termo pendente', async () => {
    await montar(fake({ listarTermos: vi.fn(async () => [termo({})]) }))
    expect((screen.getByLabelText(/Valor da guia/) as HTMLInputElement).disabled).toBe(true)
  })

  it('termo Contestado mostra o motivo', async () => {
    await montar(fake({ listarTermos: vi.fn(async () => [termo({ status: 'contestado', motivoContestacao: 'Não era eu dirigindo' })]) }))
    expect(screen.getByText(/Não era eu dirigindo/)).toBeTruthy()
  })

  it('valor da guia vem do catálogo quando vazio', async () => {
    await montar(fake(), { ...multa, valorGuia: null })
    expect((screen.getByLabelText(/Valor da guia/) as HTMLInputElement).value).toBe('195.23')
  })

  it('recurso marcado fora do painel (transição "Entrar com recurso") atualiza o switch e bloqueia a folha', async () => {
    const source = fake()
    const props = { source, valorCatalogo: 195.23, onChanged: vi.fn() }
    let view!: ReturnType<typeof render>
    await act(async () => { view = render(<ToastProvider><TermoMultaPanel {...props} multa={multa} /></ToastProvider>) })
    await act(async () => { view.rerender(<ToastProvider><TermoMultaPanel {...props} multa={{ ...multa, recursoPendente: true }} /></ToastProvider>) })
    expect((screen.getByRole('switch', { name: /^Recurso pendente/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Preparar termo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto em folha' }))
    expect(screen.getByText(/Há recurso pendente/)).toBeTruthy()
  })

  it('recurso pendente grava na multa', async () => {
    const source = fake()
    await montar(source)
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: /^Recurso pendente/ })) })
    expect(source.update).toHaveBeenCalledWith('multa', 'u1', { new_recursopendente: true })
  })
})
