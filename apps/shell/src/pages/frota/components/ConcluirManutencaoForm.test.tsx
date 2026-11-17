// apps/shell/src/pages/frota/components/ConcluirManutencaoForm.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { createMockSource } from '../data/mock'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { escolher } from '../testUtils'
import { ConcluirManutencaoForm } from './ConcluirManutencaoForm'

afterEach(cleanup)

/** O mock responde depois de um setTimeout(0): deixa as listas iniciais de cidade e funcionário chegarem. */
const esperarMock = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function montar(id = 'm2') {
  const source = createMockSource()
  const detalhe = (await source.detalheManutencao(id)) as DetalheManutencao
  vi.spyOn(source, 'concluirManutencao')
  vi.spyOn(source, 'enviarArquivoManutencao')
  vi.spyOn(source, 'anexarNotaFiscalDespesa')
  const onConcluida = vi.fn()
  const onDesatualizada = vi.fn()
  render(<ToastProvider><ConcluirManutencaoForm source={source} detalhe={detalhe} onConcluida={onConcluida} onVoltar={() => {}} onDesatualizada={onDesatualizada} /></ToastProvider>)
  await esperarMock()
  return { source, onConcluida, onDesatualizada }
}

async function preencher(nota: File) {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pastilhas de freio' }))
  fireEvent.change(screen.getByLabelText(/Km do veículo/), { target: { value: '51000' } })
  fireEvent.change(screen.getByLabelText(/Valor pago/), { target: { value: '350.5' } })
  escolher('Forma de pagamento', 'Dinheiro')
  fireEvent.change(screen.getByLabelText(/^Estabelecimento/), { target: { value: 'Oficina Teste' } })
  escolher('Cidade', 'São José dos Campos - SP')
  escolher('Quem realizou', 'Ana Souza (fictício)')
  const [entradaNota] = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[]
  await act(async () => { fireEvent.change(entradaNota, { target: { files: [nota] } }) })
}

describe('ConcluirManutencaoForm', () => {
  it('não conclui sem os campos obrigatórios e mostra o que falta', async () => {
    const { source } = await montar()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    expect(screen.getByText('Escolha pelo menos um serviço realizado')).toBeTruthy()
    expect(screen.getByText('Anexe a nota fiscal')).toBeTruthy()
    expect(screen.getByText('Informe o km do veículo (número inteiro)')).toBeTruthy()
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })

  it('avisa, sem bloquear, quando o km é menor que o do pedido', async () => {
    await montar()
    fireEvent.change(screen.getByLabelText(/Km do veículo/), { target: { value: '40000' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    expect(screen.getByText(/O km informado \(40\.000\) é menor que o km do pedido \(50\.000\)/)).toBeTruthy()
  })

  it('conclui: sobe a nota, chama a Custom API com Dinheiro e anexa a nota na despesa', async () => {
    const { source, onConcluida } = await montar()
    const nota = new File(['nf'], 'nota.jpg', { type: 'image/jpeg' })
    await preencher(nota)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    await waitFor(() => expect(onConcluida).toHaveBeenCalledWith(null))
    expect(source.enviarArquivoManutencao).toHaveBeenCalledWith(expect.objectContaining({ id: 'm2' }), nota, 'NOTA_FISCAL', 1)
    expect(source.concluirManutencao).toHaveBeenCalledWith(expect.objectContaining({
      manutencaoId: 'm2', servicos: [100000007], km: 51000, valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1',
      linkNotaFiscal: expect.stringContaining('https://example.invalid/'),
    }))
    expect(source.anexarNotaFiscalDespesa).toHaveBeenCalledWith('d-m2', [nota], 'f1')
  })

  it('outra pessoa mudou a manutenção: não envia nada e pede recarga', async () => {
    const { source, onDesatualizada } = await montar()
    vi.spyOn(source, 'currentStatus').mockResolvedValue(MANUT.CANCELADO)
    await preencher(new File(['nf'], 'nota.jpg', { type: 'image/jpeg' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    await waitFor(() => expect(onDesatualizada).toHaveBeenCalledTimes(1))
    expect(source.enviarArquivoManutencao).not.toHaveBeenCalled()
    expect(source.concluirManutencao).not.toHaveBeenCalled()
  })

  it('falha do servidor: o alerta aparece com a mensagem dele e o que foi preenchido continua lá', async () => {
    const { source, onConcluida } = await montar()
    vi.spyOn(source, 'concluirManutencao').mockRejectedValue(new Error('Informe o valor pago.'))
    await preencher(new File(['nf'], 'nota.jpg', { type: 'image/jpeg' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    const alerta = await screen.findByText(/Informe o valor pago\. O que você preencheu foi mantido\./)
    expect(alerta).toBeTruthy()
    expect(onConcluida).not.toHaveBeenCalled()
    expect((screen.getByLabelText(/Km do veículo/) as HTMLInputElement).value).toBe('51000')
    expect((screen.getByLabelText(/Valor pago/) as HTMLInputElement).value).toBe('350.5')
    expect((screen.getByLabelText(/^Estabelecimento/) as HTMLInputElement).value).toBe('Oficina Teste')
    expect((screen.getByRole('checkbox', { name: 'Pastilhas de freio' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('button', { name: 'Concluir manutenção' }) as HTMLButtonElement).disabled).toBe(false) // dá para tentar de novo
  })

  it('dois envios no mesmo instante, com a primeira chamada ainda pendente, chamam a Custom API uma única vez', async () => {
    const { source } = await montar()
    // A releitura do status é a primeira espera do envio: segurando-a, a primeira chamada fica pendente sem depender de tempo.
    let liberar: (status: number | null) => void = () => {}
    const releitura = vi.spyOn(source, 'currentStatus').mockImplementation(() => new Promise((resolve) => { liberar = resolve }))
    const concluir = vi.spyOn(source, 'concluirManutencao')
    await preencher(new File(['nf'], 'nota.jpg', { type: 'image/jpeg' }))
    const formulario = screen.getByRole('button', { name: 'Concluir manutenção' }).closest('form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(formulario)
      fireEvent.submit(formulario) // mesmo tick: o estado ainda não re-renderizou
    })
    expect(releitura).toHaveBeenCalledTimes(1) // o segundo envio nem chegou à releitura: a guarda o barrou
    await act(async () => { liberar(MANUT.AGENDADO) })
    await waitFor(() => expect(concluir).toHaveBeenCalledTimes(1))
  })

  it('o rótulo dos serviços nomeia a grade e o erro dela fica ligado a ela', async () => {
    await montar()
    const grade = screen.getByRole('group', { name: /Serviços realizados/ })
    expect(grade.getAttribute('aria-describedby')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Concluir manutenção' })) })
    const ligado = grade.getAttribute('aria-describedby')
    expect(ligado).toBeTruthy()
    expect(document.getElementById(ligado as string)?.textContent).toBe('Escolha pelo menos um serviço realizado')
  })
})
