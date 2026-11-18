// apps/shell/src/pages/frota/components/EditarManutencaoForm.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSource } from '../data/mock'
import type { DetalheManutencao } from '../data/types'
import { EditarManutencaoForm } from './EditarManutencaoForm'

afterEach(cleanup)

async function montar(id: string, ajuste: Partial<DetalheManutencao> = {}) {
  const source = createMockSource()
  const lido = await source.detalheManutencao(id)
  if (!lido) throw new Error('mock sem a manutenção')
  const m = { ...lido, ...ajuste }
  const update = vi.spyOn(source, 'update')
  const props = { onSalvo: vi.fn(), onVoltar: vi.fn(), onDesatualizada: vi.fn(), onEstado: vi.fn() }
  render(<EditarManutencaoForm source={source} m={m} {...props} />)
  return { update, ...props }
}
const campo = (nome: RegExp) => screen.getByLabelText(nome)
const salvar = () => screen.getByRole('button', { name: 'Salvar' })

describe('EditarManutencaoForm', () => {
  it('sem alteração, Salvar fica desabilitado e nada é gravado', async () => {
    const { update } = await montar('m1')
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(salvar().closest('form')!)
    expect(update).not.toHaveBeenCalled()
  })

  it('grava só os campos alterados, com os nomes das colunas, num único update', async () => {
    const { update, onSalvo } = await montar('m1')
    fireEvent.change(campo(/Descrição do problema/), { target: { value: 'Freio com ruído forte' } })
    fireEvent.change(campo(/Km no pedido/), { target: { value: '123456' } })
    fireEvent.change(campo(/Comentário ao motorista/), { target: { value: 'Levar cedo' } })
    fireEvent.change(campo(/Início da janela/), { target: { value: '2026-11-23' } })
    fireEvent.change(campo(/Fim da janela/), { target: { value: '2026-11-29' } })
    fireEvent.click(salvar())
    await waitFor(() => expect(onSalvo).toHaveBeenCalled())
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', {
      cr40f_descricao: 'Freio com ruído forte', cr40f_kmatual: 123456, cr40f_comentariosdoaprovador: 'Levar cedo', cr40f_janelainicio: '2026-11-23', cr40f_janelafim: '2026-11-29',
    })
  })

  it('descrição vazia bloqueia o salvamento', async () => {
    const { update } = await montar('m1')
    fireEvent.change(campo(/Descrição do problema/), { target: { value: '   ' } })
    fireEvent.click(salvar())
    expect(await screen.findByText('Descreva o problema')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('veículo e grau são obrigatórios', async () => {
    const { update } = await montar('m1', { veiculo: null, grau: null })
    fireEvent.change(campo(/Km no pedido/), { target: { value: '10' } })
    fireEvent.click(salvar())
    expect(await screen.findByText('Escolha o veículo')).toBeTruthy()
    expect(screen.getByText('Escolha o grau')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('janela com só um dos lados ou com o fim antes do início não grava', async () => {
    const { update } = await montar('m1')
    fireEvent.change(campo(/Início da janela/), { target: { value: '2026-11-23' } })
    fireEvent.click(salvar())
    expect(await screen.findByText('Informe o início e o fim da janela')).toBeTruthy()
    fireEvent.change(campo(/Fim da janela/), { target: { value: '2026-11-20' } })
    fireEvent.click(salvar())
    expect(await screen.findByText('O fim não pode ser antes do início')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  it('a seção Conclusão some quando não está realizada e sem dados', async () => {
    await montar('m1')
    expect(screen.queryByRole('region', { name: 'Conclusão' })).toBeNull()
    expect(screen.queryByLabelText(/Valor pago/)).toBeNull()
  })

  it('a seção Conclusão aparece quando realizada e grava valor e data em formato do Dataverse', async () => {
    const { update, onSalvo } = await montar('m4')
    expect(screen.getByRole('region', { name: 'Conclusão' })).toBeTruthy()
    fireEvent.change(campo(/Valor pago/), { target: { value: '500.5' } })
    fireEvent.change(campo(/Data e hora da manutenção/), { target: { value: '2026-10-01T10:30' } })
    fireEvent.change(campo(/Estabelecimento/), { target: { value: 'Oficina Nova' } })
    fireEvent.click(salvar())
    await waitFor(() => expect(onSalvo).toHaveBeenCalled())
    expect(update).toHaveBeenCalledWith('manutencao', 'm4', { cr40f_valor: 500.5, cr40f_datamanutencao: '2026-10-01T13:30:00.000Z', cr40f_estabelecimento: 'Oficina Nova' })
  })

  it('a seção Conclusão aparece fora de Realizado quando já há dado de conclusão', async () => {
    await montar('m1', { valor: 90 })
    expect(screen.getByRole('region', { name: 'Conclusão' })).toBeTruthy()
  })

  it('falha ao gravar mostra o aviso e mantém o que foi digitado', async () => {
    const source = createMockSource()
    const m = (await source.detalheManutencao('m1'))!
    vi.spyOn(source, 'update').mockRejectedValue(new Error('Sem permissão'))
    render(<EditarManutencaoForm source={source} m={m} onSalvo={vi.fn()} onVoltar={vi.fn()} onDesatualizada={vi.fn()} onEstado={vi.fn()} />)
    fireEvent.change(campo(/Descrição do problema/), { target: { value: 'Novo texto' } })
    fireEvent.click(salvar())
    expect(await screen.findByText(/Sem permissão/)).toBeTruthy()
    expect((campo(/Descrição do problema/) as HTMLTextAreaElement).value).toBe('Novo texto')
  })

  it('informa à gaveta se há alteração pendente', async () => {
    const { onEstado } = await montar('m1')
    expect(onEstado).toHaveBeenLastCalledWith({ sujo: false, salvando: false })
    fireEvent.change(campo(/Km no pedido/), { target: { value: '99' } })
    expect(onEstado).toHaveBeenLastCalledWith({ sujo: true, salvando: false })
  })
})
