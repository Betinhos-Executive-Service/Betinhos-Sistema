// apps/shell/src/pages/frota/components/GavetaManutencao.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@betinhos/ui'
import { todaySP } from '../data/dates'
import { createMockSource } from '../data/mock'
import { MANUT } from '../data/schema'
import type { DataSource } from '../data/source'
import { GavetaManutencao } from './GavetaManutencao'

const hoje = todaySP()
afterEach(cleanup)

const M1 = 'TST1A11 · Freio com ruído (fictício)'
const M2 = 'TST2B22 · Manutenção fictícia m2'
const M3 = 'TST1A11 · Manutenção fictícia m3'

function montar(id: string, source: DataSource = createMockSource()) {
  const onChanged = vi.fn()
  const onClassificado = vi.fn()
  const arvore = (i: string) => <ToastProvider><GavetaManutencao source={source} id={i} hoje={hoje} onClose={() => {}} onChanged={onChanged} onClassificado={onClassificado} /></ToastProvider>
  const { rerender } = render(arvore(id))
  return { source, onChanged, onClassificado, trocarId: (i: string) => rerender(arvore(i)) }
}
const gaveta = (nome: string) => screen.findByRole('dialog', { name: nome })
/** Abre o "⋯" do guia e escolhe a exceção (o menu usa popover, oculto no jsdom). */
async function mais(g: HTMLElement, nome: string) {
  fireEvent.click(within(g).getByRole('button', { name: 'Mais ações' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: nome, hidden: true }))
}

describe('GavetaManutencao', () => {
  it('abre com o pedido primeiro, o passo da etapa depois e sem rodapé', async () => {
    montar('m1')
    const g = await gaveta(M1)
    const pedido = within(g).getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('“Freio com ruído (fictício)”')).toBeTruthy()
    expect(within(pedido).getAllByRole('link', { name: /Fotos do pedido, arquivo/ })).toHaveLength(2)
    const passo = within(g).getByRole('region', { name: 'Próximo passo' })
    expect(within(passo).getByRole('heading', { name: 'Quando vai ser?' })).toBeTruthy()
    expect(pedido.compareDocumentPosition(passo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(g).queryByRole('button', { name: /Abrir formulário/ })).toBeNull()
    expect(within(g).queryByText(/Edição completa no formulário/)).toBeNull()
    expect(within(g).queryByText(/As alterações uma a uma/)).toBeNull()
  })

  it('o card do pedido traz o tipo de reparo e o comentário ao motorista só quando existem', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => { const d = await original(i); return d && { ...d, comentarioAoMotorista: 'Levar cedo' } })
    montar('m1', source)
    const pedido = within(await gaveta(M1)).getByRole('region', { name: 'Pedido' })
    expect(within(pedido).getByText('Preventiva sistemática')).toBeTruthy()
    expect(within(pedido).getByText('Levar cedo')).toBeTruthy()
    cleanup()
    const semNada = createMockSource()
    const lido = semNada.detalheManutencao.bind(semNada)
    vi.spyOn(semNada, 'detalheManutencao').mockImplementation(async (i) => { const d = await lido(i); return d && { ...d, tipo: null } })
    montar('m1', semNada)
    const pedido2 = within(await gaveta(M1)).getByRole('region', { name: 'Pedido' })
    expect(within(pedido2).queryByText('Tipo de reparo')).toBeNull()
    expect(within(pedido2).queryByText('Comentário ao motorista')).toBeNull()
  })

  it('Agendar pelo guia grava, recarrega e avisa quem abriu', async () => {
    const source = createMockSource()
    const agendar = vi.spyOn(source, 'agendarManutencao')
    const { onChanged } = montar('m1', source)
    const g = await gaveta(M1)
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Agendar' })) })
    await waitFor(() => expect(agendar).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm1' })))
    expect(await within(g).findByRole('heading', { name: 'Quem leva e quando sai?' })).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
  })

  it('Reagendar pelo ⋯ abre o formulário de janela e Voltar volta ao guia', async () => {
    montar('m3')
    const g = await gaveta(M3)
    await mais(g, 'Reagendar')
    expect(within(g).getByText(/tira o motorista da programação/)).toBeTruthy()
    expect(within(g).queryByRole('heading', { name: 'Aguardando o motorista concluir no App' })).toBeNull()
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    expect(within(g).getByRole('heading', { name: 'Aguardando o motorista concluir no App' })).toBeTruthy()
  })

  it('com uma exceção aberta, o card do formulário leva o nome da exceção', async () => {
    montar('m1')
    const g = await gaveta(M1)
    await mais(g, 'Reprovar')
    expect(within(g).getByRole('region', { name: 'Reprovar' })).toBeTruthy()
    expect(within(g).queryByRole('region', { name: 'Próximo passo' })).toBeNull()
  })

  it('Reprovar pelo ⋯ exige motivo', async () => {
    const source = createMockSource()
    const reprovar = vi.spyOn(source, 'reprovarManutencao')
    montar('m1', source)
    const g = await gaveta(M1)
    await mais(g, 'Reprovar')
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(within(g).getByText('Escreva o motivo da reprovação')).toBeTruthy()
    expect(reprovar).not.toHaveBeenCalled()
    fireEvent.change(within(g).getByLabelText(/Motivo da reprovação/), { target: { value: 'Sem verba' } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(reprovar).toHaveBeenCalledWith('m1', 'Sem verba')
    expect((await within(g).findAllByText(/Reprovada/)).length).toBeGreaterThan(0)
  })

  it('Concluir pelo ⋯ abre o formulário da conclusão', async () => {
    montar('m2')
    const g = await gaveta(M2)
    await mais(g, 'Já foi feita: concluir')
    expect(within(g).getByRole('button', { name: 'Concluir manutenção' })).toBeTruthy()
  })

  it('sem a prop hoje, usa o dia de hoje em São Paulo (a Geral abre a gaveta só com source e id)', async () => {
    const source = createMockSource()
    render(<ToastProvider><GavetaManutencao source={source} id="m3" onClose={() => {}} onChanged={() => {}} /></ToastProvider>)
    const g = await gaveta(M3)
    expect(within(g).getByText(/Atrasada/)).toBeTruthy()
  })

  it('erro na primeira leitura: aviso na gaveta e "Tentar de novo" lê outra vez', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    vi.spyOn(source, 'detalheManutencao').mockRejectedValueOnce(new Error('A rede caiu')).mockImplementation(original)
    montar('m1', source)
    const erro = await gaveta('Não foi possível abrir')
    expect(within(erro).getByText('A rede caiu')).toBeTruthy()
    await act(async () => { fireEvent.click(within(erro).getByRole('button', { name: 'Tentar de novo' })) })
    expect(await gaveta(M1)).toBeTruthy()
  })

  it('manutenção que não existe mais avisa na própria gaveta', async () => {
    montar('nao-existe')
    expect(await gaveta('Manutenção não encontrada')).toBeTruthy()
  })

  it('cabeçalho com status e histórico em linha do tempo', async () => {
    montar('m3')
    const g = await gaveta(M3)
    expect(within(g).getByText('Programado')).toBeTruthy()
    expect(within(within(g).getByRole('region', { name: 'Histórico' })).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('tem o botão da auditoria no alto da gaveta', async () => {
    montar('m1')
    const g = await gaveta(M1)
    expect(within(g).getByRole('button', { name: /auditoria/i })).toBeTruthy()
  })
})

/** Simula "outra pessoa mudou a manutenção": o servidor passa a dizer `novo` e o detalhe, depois da primeira leitura, também. */
function mudarParaStatus(source: DataSource, novo: number) {
  const original = source.detalheManutencao.bind(source)
  let leituras = 0
  vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => {
    leituras += 1
    const d = await original(i)
    return leituras === 1 || !d ? d : { ...d, status: novo }
  })
  vi.spyOn(source, 'currentStatus').mockResolvedValue(novo)
}

describe('GavetaManutencao: registro mudou com uma exceção aberta', () => {
  it('StaleError com o extra aberto mantém o formulário quando ainda vale, e a nova confirmação grava', async () => {
    const source = createMockSource()
    mudarParaStatus(source, MANUT.AGENDADO) // Solicitado -> Agendado: cancelar continua no ⋯
    const cancelar = vi.spyOn(source, 'cancelarManutencao')
    montar('m1', source)
    const g = await gaveta(M1)
    await mais(g, 'Cancelar manutenção')
    fireEvent.change(within(g).getByLabelText(/Motivo do cancelamento/), { target: { value: 'Sem verba' } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' })) })
    expect(await screen.findByText(/alterado por outra pessoa.*Confira e confirme de novo/)).toBeTruthy()
    expect(cancelar).not.toHaveBeenCalled()
    expect((within(g).getByLabelText(/Motivo do cancelamento/) as HTMLTextAreaElement).value).toBe('Sem verba')
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' })) })
    await waitFor(() => expect(cancelar).toHaveBeenCalledWith('m1', 'Sem verba'))
  })

  it('sem exceção aberta e o passo mudou: o digitado no passo foi descartado', async () => {
    const source = createMockSource()
    mudarParaStatus(source, MANUT.AGENDADO) // Solicitado -> Agendado: o passo Agendar vira Programar
    montar('m1', source)
    const g = await gaveta(M1)
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Agendar' })) })
    expect(await screen.findByText(/descartado porque a ação não se aplica mais/)).toBeTruthy()
    expect(within(g).getByRole('heading', { name: 'Quem leva e quando sai?' })).toBeTruthy()
  })

  it('em Programar, outra pessoa reagendou (mesmo passo, janela nova): o digitado foi descartado', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    let leituras = 0
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => {
      leituras += 1
      const d = await original(i)
      return leituras === 1 || !d ? d : { ...d, janelaInicio: '2026-12-07', janelaFim: '2026-12-13' }
    })
    vi.spyOn(source, 'currentStatus').mockResolvedValueOnce(MANUT.PROGRAMADO) // a gravação vê outro status e recusa
    montar('m2', source)
    const g = await gaveta(M2)
    fireEvent.click(within(g).getByRole('combobox', { name: 'Motorista' }))
    fireEvent.click(await screen.findByRole('option', { name: /Ana Souza/, hidden: true }))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Programar' })) })
    expect(await screen.findByText(/descartado porque a ação não se aplica mais/)).toBeTruthy()
    expect(within(g).getByRole('heading', { name: 'Quem leva e quando sai?' })).toBeTruthy()
  })

  it('sem exceção aberta e o mesmo passo: pede para conferir e confirmar de novo', async () => {
    const source = createMockSource()
    vi.spyOn(source, 'currentStatus').mockResolvedValueOnce(MANUT.AGENDADO) // o servidor respondeu outro status, o detalhe relido continua Solicitado
    montar('m1', source)
    const g = await gaveta(M1)
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Agendar' })) })
    expect(await screen.findByText(/alterado por outra pessoa.*Confira e confirme de novo/)).toBeTruthy()
  })

  it('a exceção não vale mais: volta ao guia e diz que o que foi digitado foi descartado', async () => {
    const source = createMockSource()
    mudarParaStatus(source, MANUT.AGENDADO) // Solicitado -> Agendado: reprovar sai do ⋯
    montar('m1', source)
    const g = await gaveta(M1)
    await mais(g, 'Reprovar')
    fireEvent.change(within(g).getByLabelText(/Motivo da reprovação/), { target: { value: 'Sem verba' } })
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Reprovar' })) })
    expect(await screen.findByText(/descartado porque a ação não se aplica mais/)).toBeTruthy()
    expect(within(g).queryByLabelText(/Motivo da reprovação/)).toBeNull()
    expect(within(g).getByRole('heading', { name: 'Quem leva e quando sai?' })).toBeTruthy()
  })
})

describe('GavetaManutencao: foco e texto dos formulários', () => {
  it('abrir uma exceção leva o foco ao primeiro campo e Voltar devolve o foco ao "Mais ações"', async () => {
    montar('m1')
    const g = await gaveta(M1)
    await mais(g, 'Reprovar')
    await waitFor(() => expect(document.activeElement).toBe(within(g).getByLabelText(/Motivo da reprovação/)))
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(document.activeElement).toBe(within(g).getByRole('button', { name: 'Mais ações' })))
  })

  it('com StrictMode (o dev roda os efeitos duas vezes), Voltar deixa o foco no "Mais ações", não no campo do passo', async () => {
    render(<StrictMode><ToastProvider><GavetaManutencao source={createMockSource()} id="m2" hoje={hoje} onClose={() => {}} onChanged={() => {}} /></ToastProvider></StrictMode>)
    const g = await gaveta(M2)
    await mais(g, 'Reagendar')
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(document.activeElement).toBe(within(g).getByRole('button', { name: 'Mais ações' })))
  })

  it('o aviso da linha da Geral aparece só em Cancelar, não em Reprovar', async () => {
    montar('m1')
    const g = await gaveta(M1)
    await mais(g, 'Reprovar')
    expect(within(g).queryByText(/linha na Geral/)).toBeNull()
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    await mais(g, 'Cancelar manutenção')
    expect(within(g).getByText(/Se já houver linha na Geral, ela é cancelada/)).toBeTruthy()
  })
})

describe('GavetaManutencao: recarga depois de gravar', () => {
  it('recarga que falha depois de uma gravação boa mantém o último detalhe e avisa por toast', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    let leituras = 0
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => { leituras += 1; if (leituras > 1) throw new Error('A rede caiu'); return original(i) })
    const cancelar = vi.spyOn(source, 'cancelarManutencao')
    montar('m1', source)
    const g = await gaveta(M1)
    await mais(g, 'Cancelar manutenção')
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Cancelar manutenção' })) })
    await waitFor(() => expect(cancelar).toHaveBeenCalled())
    expect(await screen.findByText(/Não foi possível atualizar a gaveta \(A rede caiu\)/)).toBeTruthy()
    expect(screen.getByRole('dialog', { name: M1 })).toBeTruthy() // a gaveta continua, com o último detalhe
  })

  it('resposta de recarga que chega fora de ordem não sobrescreve a mais nova', async () => {
    const source = createMockSource()
    const original = source.detalheManutencao.bind(source)
    const pendentes: ((titulo: string) => void)[] = []
    let leituras = 0
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => {
      leituras += 1
      if (leituras === 1) return original(i)
      const d = await original(i)
      const titulo = await new Promise<string>((resolve) => { pendentes.push(resolve) })
      return d ? { ...d, descricao: titulo } : d
    })
    const { trocarId } = montar('m1', source)
    await gaveta(M1)
    act(() => { trocarId('m2') })
    act(() => { trocarId('m1') })
    await waitFor(() => expect(pendentes).toHaveLength(2))
    await act(async () => { pendentes[1]('NOVO') }) // a leitura mais nova (m1) responde primeiro
    expect(await screen.findByRole('dialog', { name: 'TST1A11 · NOVO' })).toBeTruthy()
    await act(async () => { pendentes[0]('ANTIGO') }) // a de m2 chega tarde
    expect(screen.getByRole('dialog', { name: 'TST1A11 · NOVO' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /ANTIGO/ })).toBeNull()
  })
})

describe('GavetaManutencao: editar', () => {
  const comStatus = (status: number) => {
    const source = createMockSource()
    const lido = source.detalheManutencao.bind(source)
    vi.spyOn(source, 'detalheManutencao').mockImplementation(async (i) => { const d = await lido(i); return d && { ...d, status } })
    return source
  }

  it.each([['reprovada', MANUT.REPROVADO], ['cancelada', MANUT.CANCELADO], ['realizada', MANUT.REALIZADO], ['agendada', MANUT.AGENDADO]])('o lápis aparece em manutenção %s', async (_nome, status) => {
    montar('m1', comStatus(status))
    const g = await gaveta(M1)
    expect(within(g).getByRole('button', { name: 'Editar' })).toBeTruthy()
  })

  it('o lápis troca o corpo pelo formulário, com o foco no primeiro campo, e Voltar devolve o foco ao lápis', async () => {
    montar('m1')
    const g = await gaveta(M1)
    fireEvent.click(within(g).getByRole('button', { name: 'Editar' }))
    expect(await within(g).findByRole('heading', { name: 'Pedido' })).toBeTruthy()
    expect(within(g).queryByRole('region', { name: 'Próximo passo' })).toBeNull()
    expect(within(g).queryByRole('button', { name: 'Mais ações' })).toBeNull()
    await waitFor(() => expect(g.contains(document.activeElement) && document.activeElement !== g).toBe(true))
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(document.activeElement).toBe(within(g).getByRole('button', { name: 'Editar' })))
    expect(within(g).getByRole('region', { name: 'Próximo passo' })).toBeTruthy()
  })

  it('Voltar com alteração pendente pede para descartar', async () => {
    montar('m1')
    const g = await gaveta(M1)
    fireEvent.click(within(g).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await within(g).findByLabelText(/Km no pedido/), { target: { value: '777' } })
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }))
    expect(within(g).getByLabelText(/Km no pedido/)).toBeTruthy()
    fireEvent.click(within(g).getByRole('button', { name: 'Voltar' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }))
    expect(await within(g).findByRole('region', { name: 'Próximo passo' })).toBeTruthy()
  })

  it('Voltar sem alteração volta direto', async () => {
    montar('m1')
    const g = await gaveta(M1)
    fireEvent.click(within(g).getByRole('button', { name: 'Editar' }))
    fireEvent.click(await within(g).findByRole('button', { name: 'Voltar' }))
    expect(await within(g).findByRole('region', { name: 'Próximo passo' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Descartar alterações?' })).toBeNull()
  })

  it('fechar a gaveta com alteração pendente pede para descartar; Descartar fecha', async () => {
    const onClose = vi.fn()
    render(<ToastProvider><GavetaManutencao source={createMockSource()} id="m1" hoje={hoje} onClose={onClose} onChanged={() => {}} /></ToastProvider>)
    const g = await gaveta(M1)
    fireEvent.click(within(g).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await within(g).findByLabelText(/Km no pedido/), { target: { value: '777' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Salvar grava o patch, avisa, recarrega, avisa quem abriu e volta à visão normal', async () => {
    const { source, onChanged } = montar('m1')
    const update = vi.spyOn(source, 'update')
    const g = await gaveta(M1)
    fireEvent.click(within(g).getByRole('button', { name: 'Editar' }))
    fireEvent.change(await within(g).findByLabelText(/Descrição do problema/), { target: { value: 'Freio chiando' } })
    fireEvent.click(within(g).getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Manutenção atualizada.')).toBeTruthy()
    expect(update).toHaveBeenCalledWith('manutencao', 'm1', { cr40f_descricao: 'Freio chiando' })
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'TST1A11 · Freio chiando' })).toBeTruthy()
  })
})
