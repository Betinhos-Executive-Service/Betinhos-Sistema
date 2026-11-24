// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { MULTA } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import { ApiError } from '../data/xrm'
import type { Dossie, FrotaData, Multa, TermoMulta } from '../data/types'
import { dadosSemVazios, MultaPassoAPasso, opcoesMotoristas, penalidadeFaltando } from './MultaPassoAPasso'

const HOJE = '2026-11-17'
const multa: Multa = { id: 'u1', codigo: 'NT-1073', titulo: 'AIT 1A2B3C', status: MULTA.NOTIFICAR, dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', dataParaIndicar: '2026-11-30', indicado: false, dataAviso: null, dataIndicacao: null, veiculo: { id: 'v1', label: 'TST1A11' }, motorista: null, infracaoId: null, criadoEm: '2026-11-11T12:00:00Z', valorGuia: null, recursoPendente: false, termoVigente: null }
const dossie: Dossie = { multa: { id: 'u1', auto: '1A2B3C', placa: 'TST1A11', dataHora: '2026-11-10T16:00:00Z', local: 'Av. de Teste, 100', orgao: null, dataParaIndicar: '2026-11-30', infracao: null }, servicos: [], infleet: { viagens: [] } }
const ana = { id: 'f1', label: 'Ana Souza (fictício)' }

function fonte(overrides: Partial<DataSource> = {}) {
  return { passoMulta: vi.fn(async () => ({ etapa: 'pagar', pendentes: [], proximoPasso: 'Aguardando penalidade', proximoPrazo: null, prazoVencido: false, aguardandoPenalidade: true })), dossieMulta: vi.fn(async () => dossie), enviarArquivoMulta: vi.fn(async () => {}), temAditivo: vi.fn(async () => false), ...overrides } as unknown as DataSource
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

  it('aviso automático já enviado: mostra a data e deixa a mensagem do WhatsApp opcional', async () => {
    renderPasso(fonte(), { ...multa, status: MULTA.NOTIFICADO, motorista: ana, avisoAutomaticoEm: '2026-11-20' })
    await act(async () => {})
    expect(screen.getByText(/O motorista já recebeu o aviso pelo app em 20\/11\/2026/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copiar mensagem (opcional)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avisei' })).toBeTruthy()
  })

  it('Copiar mensagem: sem clipboard, deixa o texto selecionado para copiar à mão', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => { throw new Error('negado') }) } })
    const source = fonte()
    renderPasso(source, { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => {})
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
    await act(async () => {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Não deu para copiar sozinho/)).toBeNull()
  })

  it('o erro do InFleet fica na tela para o gestor e fora da mensagem', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } })
    const source = fonte({ dossieMulta: vi.fn(async () => ({ ...dossie, infleet: { erro: 'Token da Infleet inválido (fictício)' } })) })
    renderPasso(source, { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(screen.getByText(/Token da Infleet inválido \(fictício\)/)).toBeTruthy()
    const texto = screen.getByLabelText('Mensagem para o WhatsApp') as HTMLTextAreaElement
    expect(texto.value).toContain('Rastreador: indisponível no momento.')
    expect(texto.value).not.toContain('Token da Infleet')
  })

  it('falha ao montar o dossiê mostra a mensagem do dossiê, sem o erro técnico', async () => {
    renderPasso(fonte({ dossieMulta: vi.fn(async () => { throw new Error('Failed to fetch') }) }), { ...multa, status: MULTA.NOTIFICADO, motorista: ana })
    await act(async () => {})
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copiar mensagem' })) })
    expect(await screen.findByText('Não foi possível montar o dossiê. Tente de novo.')).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('aguardando penalidade mostra o formulário Registrar penalidade, sem o passo de pagamento', () => {
    renderPasso(fonte(), { ...multa, status: MULTA.INDICADA, responsavel: 100000001, motivoEmpresa: 100000000 })
    expect(screen.getByRole('heading', { name: 'Registrar penalidade' })).toBeTruthy()
    expect(screen.getByText(/Aguardando a penalidade/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Registrar pagamento' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Feito até agora' })).toBeTruthy()
    expect(screen.getByText('Responsável')).toBeTruthy()
    expect(screen.getByText('Empresa (prazo perdido)')).toBeTruthy()
  })
})

describe('Registrar penalidade', () => {
  const aguardando = { ...multa, status: MULTA.INDICADA, responsavel: 100000001, motivoEmpresa: 100000000 }
  const arquivoPdf = () => new File(['x'], 'penalidade.pdf', { type: 'application/pdf' })
  const botao = () => screen.getByRole('button', { name: 'Registrar penalidade' }) as HTMLButtonElement

  it('o vencimento é obrigatório: sem ele o botão fica desabilitado e diz o que falta', () => {
    renderPasso(fonte(), aguardando)
    expect(botao().disabled).toBe(true)
    expect(screen.getByText('Informe o vencimento da guia.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Vencimento da guia/), { target: { value: '2026-12-05' } })
    expect(botao().disabled).toBe(false)
    expect(screen.queryByText('Informe o vencimento da guia.')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Valor com desconto/), { target: { value: '0' } })
    expect(botao().disabled).toBe(true)
    expect(screen.getByText('O valor com desconto precisa ser maior que zero.')).toBeTruthy()
  })

  it('grava vencimento e valor direto na multa (campos livres), envia o PDF antes e recarrega', async () => {
    const ordem: string[] = []
    const source = fonte({
      dateBehaviors: vi.fn(async () => ({ cr40f_vencimento: 'DateOnly' as const })),
      enviarArquivoMulta: vi.fn(async () => { ordem.push('pdf') }),
      update: vi.fn(async () => { ordem.push('update') }),
    })
    const { onChanged } = renderPasso(source, aguardando)
    fireEvent.change(screen.getByLabelText(/Vencimento da guia/), { target: { value: '2026-12-05' } })
    fireEvent.change(screen.getByLabelText(/Valor com desconto/), { target: { value: '78.10' } })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [arquivoPdf()] } })
    await act(async () => { fireEvent.click(botao()) })
    expect(source.enviarArquivoMulta).toHaveBeenCalledWith('u1', 'cr40f_pdfpenalidade', expect.any(File))
    expect(source.update).toHaveBeenCalledWith('multa', 'u1', { cr40f_vencimento: '2026-12-05', cr40f_valorcomdesconto: 78.1 })
    expect(source.passoMulta).not.toHaveBeenCalled()
    expect(ordem).toEqual(['pdf', 'update'])
    expect(onChanged).toHaveBeenCalled()
  })

  it('valor e PDF são opcionais; coluna UserLocal recebe a meia-noite de São Paulo', async () => {
    const source = fonte({ dateBehaviors: vi.fn(async () => ({ cr40f_vencimento: 'UserLocal' as const })), update: vi.fn(async () => {}) })
    renderPasso(source, aguardando)
    fireEvent.change(screen.getByLabelText(/Vencimento da guia/), { target: { value: '2026-12-05' } })
    await act(async () => { fireEvent.click(botao()) })
    expect(source.update).toHaveBeenCalledWith('multa', 'u1', { cr40f_vencimento: '2026-12-05T03:00:00Z' })
    expect(source.enviarArquivoMulta).not.toHaveBeenCalled()
  })

  it('recusa 400 do servidor aparece como veio; outro erro vira a mensagem genérica', async () => {
    const update = vi.fn<DataSource['update']>().mockRejectedValueOnce(new ApiError('Vencimento fora do prazo da guia.', 400)).mockRejectedValueOnce(new Error('Failed to fetch'))
    renderPasso(fonte({ update, dateBehaviors: vi.fn(async () => ({})) }), aguardando)
    fireEvent.change(screen.getByLabelText(/Vencimento da guia/), { target: { value: '2026-12-05' } })
    await act(async () => { fireEvent.click(botao()) })
    expect(await screen.findByText('Vencimento fora do prazo da guia.')).toBeTruthy()
    await act(async () => { fireEvent.click(botao()) })
    expect(await screen.findByText('Não foi possível registrar a penalidade. Tente de novo.')).toBeTruthy()
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('falha no envio do PDF mostra a mensagem do arquivo e não grava o vencimento', async () => {
    const source = fonte({ enviarArquivoMulta: vi.fn(async () => { throw new Error('Failed to fetch') }), update: vi.fn(async () => {}) })
    renderPasso(source, aguardando)
    fireEvent.change(screen.getByLabelText(/Vencimento da guia/), { target: { value: '2026-12-05' } })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [arquivoPdf()] } })
    await act(async () => { fireEvent.click(botao()) })
    expect(await screen.findByText('Não foi possível enviar o arquivo. Tente de novo.')).toBeTruthy()
    expect(source.update).not.toHaveBeenCalled()
  })

  it('penalidadeFaltando: vencimento válido e valor vazio ou positivo', () => {
    expect(penalidadeFaltando({ vencimento: '', valor: '' })).toBe('Informe o vencimento da guia.')
    expect(penalidadeFaltando({ vencimento: '2026-12-05', valor: '' })).toBeNull()
    expect(penalidadeFaltando({ vencimento: '2026-12-05', valor: '78.1' })).toBeNull()
    expect(penalidadeFaltando({ vencimento: '2026-12-05', valor: '-1' })).toBe('O valor com desconto precisa ser maior que zero.')
  })
})

describe('motivo do botão desabilitado', () => {
  it('mostra abaixo do botão o que validarPasso devolve e some quando o passo está completo', () => {
    renderPasso(fonte())
    expect((screen.getByRole('button', { name: 'Confirmar responsável' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Escolha o responsável: motorista ou empresa.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Empresa (culpa da empresa)'))
    expect((screen.getByRole('button', { name: 'Confirmar responsável' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('Escolha o responsável: motorista ou empresa.')).toBeNull()
  })

  it('o botão aponta para o texto com aria-describedby', () => {
    renderPasso(fonte())
    const texto = screen.getByText('Escolha o responsável: motorista ou empresa.')
    expect(screen.getByRole('button', { name: 'Confirmar responsável' }).getAttribute('aria-describedby')).toBe(texto.id)
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

describe('Acertar na folha com parcelas', () => {
  const acertar: Multa = { ...multa, status: MULTA.PAGO, responsavel: 100000000, motorista: ana, dataAviso: '2026-10-01', dataIndicacao: '2026-10-02', indicado: true, canal: 100000001, dataParaIndicar: '2026-10-20', vencimento: '2026-11-01', pagaEm: '2026-11-05', valorPago: 60, valorGuia: 100 }
  const descontando: Multa = { ...acertar, competencia: '2026-10-01', acertoEm: '2026-11-10' }
  const parcela = (n: number, status: 'prevista' | 'descontada') => ({ id: `p${n}`, numero: n, total: 3, competencia: `2026-${String(9 + n).padStart(2, '0')}-01`, valor: 33.33, status, lancadoEm: status === 'descontada' ? '2026-11-10' : null, origem: 'multa' as const, colaborador: null, multa: null })

  it('Lancei na folha pede primeiro mês (mês atual) e parcelas, mostra a prévia e grava com parcelas', async () => {
    const source = fonte()
    renderPasso(source, acertar)
    fireEvent.click(screen.getByLabelText('Lancei na folha'))
    const mes = screen.getByLabelText(/Primeiro mês/) as HTMLInputElement
    expect(mes.value).toBe('2026-11')
    expect(mes.min).toBe('2026-10')
    expect(mes.max).toBe('2027-11')
    expect((screen.getByLabelText(/Parcelas/) as HTMLInputElement).value).toBe('1')
    fireEvent.change(screen.getByLabelText(/Parcelas/), { target: { value: '3' } })
    expect(screen.getByText('Valor cheio R$ 100,00 · 3× R$ 33,33 · última R$ 33,34')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Registrar acerto' })) })
    expect(source.passoMulta).toHaveBeenCalledWith('u1', 'RegistrarAcerto', { acerto: 'folha', competencia: '2026-11', parcelas: 3 })
  })

  it('multa descontando mostra o bloco Descontos em folha com as parcelas e o andamento', async () => {
    const source = fonte({ listarParcelasMulta: vi.fn(async () => [parcela(1, 'descontada'), parcela(2, 'prevista'), parcela(3, 'prevista')]) })
    renderPasso(source, descontando)
    expect(await screen.findByRole('heading', { name: 'Descontando 1/3' })).toBeTruthy()
    expect(screen.getByText('1/3 · 10/2026')).toBeTruthy()
    expect(screen.getByText('Lançada em 10/11')).toBeTruthy()
    expect(screen.getAllByText('Prevista')).toHaveLength(2)
    expect(screen.queryByText('Multa encerrada. Nada a fazer.')).toBeNull()
  })
})

const termoBase: TermoMulta = { id: 't1', status: 'pendente', forma: 'folha', parcelas: 3, valorTotal: 300, primeiraCompetencia: '2026-12-01', enviadoEm: '2026-11-17T13:00:00Z', assinadoEm: null, hashPdf: null, motivoContestacao: null, ultimoLembreteEm: null, criadoEm: '2026-11-17T13:00:00Z' }

describe('Termo dentro do passo a passo', () => {
  const avisar: Multa = { ...multa, status: MULTA.NOTIFICADO, motorista: ana, dataParaIndicar: '2026-12-10' }

  it('etapa 2 com aditivo e sem termo: oferece o termo pelo app e o WhatsApp', async () => {
    renderPasso(fonte({ temAditivo: vi.fn(async () => true) }), avisar)
    expect(await screen.findByRole('button', { name: 'Enviar termo pelo app' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avisar pelo WhatsApp' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Avisei' })).toBeNull()
  })

  it('enquanto confere o aditivo: só o carregamento, sem WhatsApp e com Avisei desabilitado', () => {
    renderPasso(fonte({ temAditivo: vi.fn(() => new Promise<boolean>(() => {})) }), avisar)
    expect(screen.getByText('Conferindo o aditivo…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copiar mensagem' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Avisei' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('termo pendente: mostra o andamento e deixa o Avisei desabilitado com o motivo', async () => {
    const m: Multa = { ...avisar, termo: { status: 'pendente', enviadoEm: termoBase.enviadoEm }, termoVigente: { id: 't1', label: 'Termo' } }
    renderPasso(fonte({ temAditivo: vi.fn(async () => true), listarTermos: vi.fn(async () => [termoBase]) }), m)
    expect(await screen.findByText('Aguardando o motorista assinar o termo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lembrar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar termo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avisar pelo WhatsApp' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Avisei' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Cancele o termo antes de avisar pelo WhatsApp.')).toBeTruthy()
  })

  it('etapa 1 com termo contestado mostra a contestação do motorista', async () => {
    const m: Multa = { ...multa, motorista: ana, contestadaEm: '2026-11-16', termo: { status: 'contestado', enviadoEm: termoBase.enviadoEm } }
    renderPasso(fonte({ listarTermos: vi.fn(async () => [{ ...termoBase, status: 'contestado' as const, motivoContestacao: 'Não era eu dirigindo' }]) }), m)
    expect(await screen.findByText('Contestação do motorista')).toBeTruthy()
    expect(screen.getByText(/Não era eu dirigindo/)).toBeTruthy()
  })

  const acertar: Multa = { ...multa, status: MULTA.PAGO, responsavel: 100000000, motorista: ana, dataAviso: '2026-10-01', dataIndicacao: '2026-10-02', indicado: true, canal: 100000001, dataParaIndicar: '2026-10-20', vencimento: '2026-11-01', pagaEm: '2026-11-05', valorPago: 90, termo: { status: 'assinado', enviadoEm: '2026-10-05T13:00:00Z' } }

  it('acerto com termo assinado: parcelas fixas e mês do termo', async () => {
    const termo = { ...termoBase, status: 'assinado' as const, parcelas: 3, primeiraCompetencia: '2026-11-01' }
    renderPasso(fonte({ listarTermos: vi.fn(async () => [termo]) }), acertar)
    fireEvent.click(await screen.findByLabelText('Lancei na folha'))
    expect(await screen.findByText('3 parcelas, como assinado')).toBeTruthy()
    expect((screen.getByLabelText(/Primeiro mês/) as HTMLInputElement).value).toBe('2026-11')
  })

  it('acerto com primeiro mês do termo já passado avisa e usa o primeiro mês possível', async () => {
    const termo = { ...termoBase, status: 'assinado' as const, parcelas: 3, primeiraCompetencia: '2026-08-01' }
    renderPasso(fonte({ listarTermos: vi.fn(async () => [termo]) }), acertar)
    fireEvent.click(await screen.findByLabelText('Lancei na folha'))
    expect(await screen.findByText('O primeiro mês do termo (08/2026) já passou; as parcelas começam em 11/2026.')).toBeTruthy()
  })

  it('acerto com termo assinado mostra a evidência e baixa o PDF', async () => {
    const termo = { ...termoBase, status: 'assinado' as const, assinadoEm: '2026-11-10T15:00:00Z', hashPdf: 'abcdef0123456789' }
    const baixarPdfTermo = vi.fn(async () => ({ nome: 'Termo.pdf', blob: new Blob(['%PDF']) }))
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
    renderPasso(fonte({ listarTermos: vi.fn(async () => [termo]), baixarPdfTermo }), acertar)
    expect(await screen.findByText(/Termo assinado em 10\/11\/2026 · hash abcdef01/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' })) })
    expect(baixarPdfTermo).toHaveBeenCalledWith('t1')
  })
})
