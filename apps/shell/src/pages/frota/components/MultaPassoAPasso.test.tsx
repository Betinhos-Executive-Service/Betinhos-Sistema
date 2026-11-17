// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import { ApiError } from '../data/xrm'
import type { Dossie, FrotaData, Multa } from '../data/types'
import { dadosSemVazios, MultaPassoAPasso, opcoesMotoristas } from './MultaPassoAPasso'

const HOJE = '2026-11-17'
const multa: Multa = { id: 'u1', titulo: 'AIT 1A2B3C', status: MULTA.NOTIFICAR, dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', dataParaIndicar: '2026-11-30', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: null, infracaoId: null, criadoEm: '2026-11-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const dossie: Dossie = { multa: { id: 'u1', auto: '1A2B3C', placa: 'TST1A11', dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', orgao: null, dataParaIndicar: '2026-11-30', infracao: null }, servicos: [], infleet: { viagens: [] } }
const ana = { id: 'f1', label: 'Ana Souza (fictício)' }

function fonte(overrides: Partial<DataSource> = {}) {
  return { passoMulta: vi.fn(async () => ({ etapa: 'pagar', pendentes: [], proximoPasso: 'Aguardando penalidade', proximoPrazo: null, prazoVencido: false, aguardandoPenalidade: true })), dossieMulta: vi.fn(async () => dossie), enviarArquivoMulta: vi.fn(async () => {}), ...overrides } as unknown as DataSource
}

function renderPasso(source: DataSource, m: Multa = multa, data: FrotaData = { ...EMPTY_DATA, multas: [m] }) {
  const onChanged = vi.fn()
  render(<ToastProvider><MultaPassoAPasso source={source} multa={m} data={data} onChanged={onChanged} hoje={HOJE} /></ToastProvider>)
  return { onChanged }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('MultaPassoAPasso', () => {
  it('mostra o topo, a barra de etapas e só o passo atual', () => {
    renderPasso(fonte())
    expect(screen.getByText('AIT 1A2B3C')).toBeTruthy()
    expect(screen.getByText('30/11/2026')).toBeTruthy()
    const atual = screen.getByRole('list', { name: 'Etapas da multa' }).querySelector('[aria-current="step"]')
    expect(atual?.textContent).toContain('Identificar')
    expect(screen.getByRole('heading', { name: 'Definir o responsável' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Avisar o motorista' })).toBeNull()
  })

  it('o botão só libera com os obrigatórios e grava pela cr40f_PassoMulta', async () => {
    const source = fonte()
    const { onChanged } = renderPasso(source)
    const confirmar = screen.getByRole('button', { name: 'Confirmar responsável' }) as HTMLButtonElement
    expect(confirmar.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    expect(confirmar.disabled).toBe(false)
    await act(async () => { fireEvent.click(confirmar) })
    expect(source.passoMulta).toHaveBeenCalledWith('u1', 'DefinirResponsavel', { responsavel: 'empresa' })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('mostra a recusa do servidor como está', async () => {
    const source = fonte({ passoMulta: vi.fn(async () => { throw new ApiError('Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos (cr40f_status).', 400) }) })
    renderPasso(source)
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar responsável' })) })
    expect(await screen.findByText('Os campos de passo da multa só mudam pelo passo a passo do Sistema Betinhos (cr40f_status).')).toBeTruthy()
  })

  it.each([
    ['falha de rede', new Error('Failed to fetch')],
    ['erro 500 do servidor', new ApiError('Unhandled exception: NullReferenceException', 500)],
  ])('%s não vaza para a tela: mostra a mensagem genérica', async (_nome, falha) => {
    renderPasso(fonte({ passoMulta: vi.fn(async () => { throw falha }) }))
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar responsável' })) })
    expect(await screen.findByText('Não foi possível gravar o passo. Tente de novo.')).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch|Unhandled/)).toBeNull()
  })

  it('falha no envio do comprovante mostra a mensagem do arquivo e não grava o pagamento', async () => {
    const source = fonte({ enviarArquivoMulta: vi.fn(async () => { throw new Error('Failed to fetch') }) })
    renderPasso(source, { ...multa, status: MULTA.INDICADA, responsavel: 100000000, motorista: ana, vencimento: '2026-12-01' })
    fireEvent.change(screen.getByLabelText(/Data do pagamento/), { target: { value: '2026-11-16' } })
    fireEvent.change(screen.getByLabelText(/Valor pago/), { target: { value: '130.16' } })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['x'], 'comprovante.pdf', { type: 'application/pdf' })] } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' })) })
    expect(await screen.findByText('Não foi possível enviar o arquivo. Tente de novo.')).toBeTruthy()
    expect(source.passoMulta).not.toHaveBeenCalled()
  })

  it('o que o gestor escolheu não some quando a multa recarrega com os mesmos valores', () => {
    const m = { ...multa, motorista: ana }
    const { rerender } = render(<ToastProvider><MultaPassoAPasso source={fonte()} multa={m} data={{ ...EMPTY_DATA, multas: [m] }} onChanged={vi.fn()} hoje={HOJE} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    const recarregada = { ...m, motorista: { ...ana } }
    rerender(<ToastProvider><MultaPassoAPasso source={fonte()} multa={recarregada} data={{ ...EMPTY_DATA, multas: [recarregada] }} onChanged={vi.fn()} hoje={HOJE} /></ToastProvider>)
    expect((screen.getByLabelText('Empresa (culpa da empresa)') as HTMLInputElement).checked).toBe(true)
  })

  it('prazo vencido ocupa o passo inteiro com as duas saídas e esconde o menu Mais', () => {
    renderPasso(fonte(), { ...multa, dataParaIndicar: '2026-11-16' })
    expect(screen.getByRole('heading', { name: 'O prazo de indicação venceu' })).toBeTruthy()
    expect(screen.getByLabelText('Sim, foi indicada')).toBeTruthy()
    expect(screen.getByLabelText('Não: a empresa paga a guia (prazo perdido)')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mais ações da multa' })).toBeNull()
    expect(screen.getByText(/· vencido/)).toBeTruthy()
  })

  it('prazo vencido, "Sim" e sem responsável: o motorista indicado é obrigatório', async () => {
    const source = fonte()
    const vencida = { ...multa, dataParaIndicar: '2026-11-16' }
    renderPasso(source, vencida, { ...EMPTY_DATA, multas: [vencida], posses: [{ id: 'p1', inicio: null, fim: null, veiculo: null, motorista: ana, localBase: null }] })
    expect(screen.queryByRole('combobox', { name: 'Motorista indicado' })).toBeNull()
    fireEvent.click(screen.getByLabelText('Sim, foi indicada'))
    fireEvent.click(screen.getByRole('combobox', { name: 'Canal da indicação' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Senatran', hidden: true }))
    fireEvent.change(screen.getByLabelText(/Data da indicação/), { target: { value: '2026-11-15' } })
    const responder = screen.getByRole('button', { name: 'Responder' }) as HTMLButtonElement
    expect(responder.disabled).toBe(true)
    fireEvent.click(screen.getByRole('combobox', { name: 'Motorista indicado' }))
    fireEvent.click(await screen.findByRole('option', { name: ana.label, hidden: true }))
    expect(responder.disabled).toBe(false)
    await act(async () => { fireEvent.click(responder) })
    expect(source.passoMulta).toHaveBeenCalledWith('u1', 'PrazoVencido', { indicou: true, canal: 'senatran', data: '2026-11-15', motoristaId: 'f1' })
  })

  it('prazo vencido com motorista já definido não pergunta quem foi indicado', () => {
    renderPasso(fonte(), { ...multa, dataParaIndicar: '2026-11-16', motorista: ana })
    fireEvent.click(screen.getByLabelText('Sim, foi indicada'))
    expect(screen.queryByRole('combobox', { name: 'Motorista indicado' })).toBeNull()
  })

  it('Copiar mensagem: sem clipboard, deixa o texto selecionado para copiar à mão', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('negado') }) } })
    const source = fonte()
    renderPasso(source, { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(source.dossieMulta).toHaveBeenCalledWith('u1')
    const texto = screen.getByLabelText('Mensagem para o WhatsApp') as HTMLTextAreaElement
    expect(texto.value).toContain('Olá, Ana. Chegou uma notificação de multa do veículo TST1A11.')
    expect(screen.getByText('Não deu para copiar sozinho: o texto está selecionado. Use Ctrl+C.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avisei' })).toBeTruthy()
  })

  it('Copiar mensagem: copiou, avisa e não mostra o campo de fallback', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderPasso(fonte(), { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Não deu para copiar sozinho/)).toBeNull()
  })

  it('o erro do InFleet fica na tela para o gestor e fora da mensagem', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } })
    const source = fonte({ dossieMulta: vi.fn(async () => ({ ...dossie, infleet: { erro: 'Token da Infleet inválido (fictício)' } })) })
    renderPasso(source, { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(screen.getByText(/Token da Infleet inválido \(fictício\)/)).toBeTruthy()
    const texto = screen.getByLabelText('Mensagem para o WhatsApp') as HTMLTextAreaElement
    expect(texto.value).toContain('Rastreador: indisponível no momento.')
    expect(texto.value).not.toContain('Token da Infleet')
  })

  it('falha ao montar o dossiê mostra a mensagem do dossiê, sem o erro técnico', async () => {
    renderPasso(fonte({ dossieMulta: vi.fn(async () => { throw new Error('Failed to fetch') }) }), { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(await screen.findByText('Não foi possível montar o dossiê. Tente de novo.')).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('aguardando penalidade não tem passo e explica o porquê', () => {
    renderPasso(fonte(), { ...multa, status: MULTA.INDICADA, responsavel: 100000001, motivoEmpresa: 100000000 })
    expect(screen.getByText(/Aguardando a penalidade/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Feito até agora' })).toBeTruthy()
    expect(screen.getByText('Responsável')).toBeTruthy()
    expect(screen.getByText('Empresa (prazo perdido)')).toBeTruthy()
  })
})

describe('dadosSemVazios', () => {
  it('texto vazio deixa de ir no passo (equivale a null no servidor)', () => {
    expect(dadosSemVazios({ data: '', competencia: '', canal: 'dsv', valorPago: 0 })).toEqual({ canal: 'dsv', valorPago: 0 })
  })
})

describe('opcoesMotoristas', () => {
  it('junta atual, posses e multas sem repetir e em ordem alfabética', () => {
    const bruno = { id: 'f2', label: 'Bruno Lima (fictício)' }
    const m = { ...multa, motorista: bruno }
    const lista = opcoesMotoristas({ ...EMPTY_DATA, multas: [m], posses: [{ id: 'p1', inicio: null, fim: null, veiculo: null, motorista: ana, localBase: null }] }, bruno)
    expect(lista).toEqual([{ value: 'f1', label: ana.label }, { value: 'f2', label: bruno.label }])
  })
})
