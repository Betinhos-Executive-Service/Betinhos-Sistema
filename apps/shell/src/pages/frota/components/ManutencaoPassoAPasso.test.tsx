// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { abrirGavetaRegistro } from '../../../app/registroAberto'
import { ManutencaoPassoAPasso } from './ManutencaoPassoAPasso'

vi.mock('../../../app/registroAberto', async (importOriginal) => ({ ...(await importOriginal<object>()), abrirGavetaRegistro: vi.fn() }))
afterEach(cleanup)

const HOJE = '2026-11-17'
// Mesmos fixtures do manutencaoEtapas.test.ts.
const base: DetalheManutencao = {
  id: 'm1', codigo: 'OM-1', descricao: 'Revisão fictícia', status: MANUT.SOLICITADO, grau: 2, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null,
  dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 60000,
  veiculo: { id: 'v1', label: 'TST4D44' }, solicitante: { id: 'p1', label: 'Motorista Fictício' }, criadoEm: '2026-11-14T12:00:00Z', servicos: [], categorias: [],
  origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [],
  linkNotaFiscal: null, fotosFinais: [], programacao: null, despesa: null,
}
const m = (patch: Partial<DetalheManutencao>): DetalheManutencao => ({ ...base, ...patch })
const agendada = m({ status: MANUT.AGENDADO, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', programacao: { geralId: 'g1', motorista: null, saida: '2026-11-23T03:00:00.000Z' } })
const programada = m({ ...agendada, status: MANUT.PROGRAMADO, programacao: { geralId: 'g1', motorista: { id: 'p2', label: 'Outro Fictício' }, saida: '2026-11-24T13:00:00.000Z' } })

function fonte() {
  return {
    currentStatus: vi.fn(async () => MANUT.SOLICITADO),
    agendarManutencao: vi.fn(async () => {}),
    programarManutencao: vi.fn(async () => {}),
    buscarFuncionarios: vi.fn(async () => [{ id: 'p2', nome: 'Outro Fictício' }]),
  } as unknown as Parameters<typeof ManutencaoPassoAPasso>[0]['source']
}
/** Como o ConcluirManutencaoForm.test escolhe "Quem realizou": abre o Select e clica na opção (o painel usa popover, oculto no jsdom), depois que a lista inicial chega. */
async function escolherMotorista() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Motorista' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Outro Fictício', hidden: true }))
}
function montar(detalhe: DetalheManutencao, source = fonte()) {
  const props = { source, m: detalhe, hoje: HOJE, onFeito: vi.fn(), onDesatualizada: vi.fn(), onExtra: vi.fn() }
  render(<ManutencaoPassoAPasso {...props} />)
  return props
}

describe('ManutencaoPassoAPasso', () => {
  it('mostra só o passo Agendar, com a etapa 1 atual e o prazo de espera', () => {
    montar(base)
    expect(screen.getByRole('heading', { name: 'Quando vai ser?' })).toBeTruthy()
    expect(screen.queryByText('Quem leva e quando sai?')).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Etapas' })).getByText('Agendar').closest('li')?.getAttribute('aria-current')).toBe('step')
    expect(screen.getByText('há 3 dias')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('TST4D44 · Revisão fictícia')
  })

  it('Agendar chama a API com o grau escolhido', async () => {
    const props = montar(base)
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Agendar' })) })
    await waitFor(() => expect(props.source.agendarManutencao).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm1', grau: 3 })))
    expect(props.onFeito).toHaveBeenCalledWith(expect.stringMatching(/^Manutenção agendada: /))
  })

  it('Programar exige motorista e avisa fora da janela, sem bloquear', async () => {
    const source = fonte()
    ;(source.currentStatus as ReturnType<typeof vi.fn>).mockResolvedValue(MANUT.AGENDADO)
    const props = montar(agendada, source)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Programar' })) })
    expect(screen.getByText('Escolha o motorista')).toBeTruthy()
    expect(source.programarManutencao).not.toHaveBeenCalled()
    // Como o ConcluirManutencaoForm.test escolhe "Quem realizou": abre o Select e clica na opção; a data muda por change.
    await escolherMotorista()
    fireEvent.change(screen.getByLabelText(/^Saída/), { target: { value: '2026-11-30T10:00' } })
    expect(screen.getByText(/fica fora da janela/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Programar' })) })
    await waitFor(() => expect(source.programarManutencao).toHaveBeenCalledWith({ manutencaoId: 'm1', geralId: 'g1', motoristaId: 'p2', saida: '2026-11-30T13:00:00.000Z' }))
    expect(props.onFeito).toHaveBeenCalled()
  })

  it('Programar relê o status antes de gravar: outra pessoa mudou → desatualizada, sem gravar', async () => {
    const source = fonte()
    ;(source.currentStatus as ReturnType<typeof vi.fn>).mockResolvedValue(MANUT.PROGRAMADO)
    const props = montar(agendada, source)
    await escolherMotorista()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Programar' })) })
    await waitFor(() => expect(props.onDesatualizada).toHaveBeenCalled())
    expect(source.programarManutencao).not.toHaveBeenCalled()
  })

  it('falha do servidor vira alerta e o digitado fica', async () => {
    const source = fonte()
    ;(source.agendarManutencao as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha fictícia.'))
    montar(base, source)
    fireEvent.click(screen.getByRole('radio', { name: 'Urgente' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Agendar' })) })
    expect(await screen.findByText('Não foi possível gravar')).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Urgente' }) as HTMLInputElement).checked).toBe(true)
  })

  it('Programado mostra aguardando o App e o ⋯ com Concluir por ele', async () => {
    const props = montar(programada)
    expect(screen.getByRole('heading', { name: 'Aguardando o motorista concluir no App' })).toBeTruthy()
    expect(screen.getByText(/Outro Fictício leva o carro em 24\/11\/2026 10:00/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Concluir por ele', hidden: true }))
    expect(props.onExtra).toHaveBeenCalledWith('concluir')
  })

  it('o prazo atrasado diz "Atrasada" em texto, não só na cor', () => {
    montar(m({ ...agendada, janelaInicio: '2026-11-09', janelaFim: '2026-11-15' }))
    const prazo = screen.getByText('desde 15/11').closest('[data-perigo]')
    expect(prazo?.textContent).toContain('Atrasada')
  })

  it('Realizada mostra a despesa e abre a gaveta dela', () => {
    montar({ ...programada, status: MANUT.REALIZADO, valor: 1240, despesa: { id: 'd1', statusOperacional: 100000000, statusAnexo: 100000002 } })
    expect(screen.getByText('Em conferência')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'abrir despesa' })).toBeTruthy()
    const itens = within(screen.getByRole('list', { name: 'Etapas' })).getAllByRole('listitem')
    expect(itens.every((li) => li.hasAttribute('data-feita'))).toBe(true)
  })

  it('Reprovada: barra parada, motivo, sem botão nem ⋯', () => {
    montar({ ...base, status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' })
    expect(screen.getByText('Reprovada: Duplicada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mais ações' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Agendar' })).toBeNull()
    expect(within(screen.getByRole('list', { name: 'Etapas' })).getByText('Agendar').closest('li')?.hasAttribute('data-parada')).toBe(true)
  })

  it('sem linha na Geral, Programar oferece Reagendar', () => {
    const props = montar({ ...agendada, programacao: null })
    expect(screen.getByText(/não tem linha na Geral/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reagendar' }))
    expect(props.onExtra).toHaveBeenCalledWith('reagendar')
  })

  it('m novo com o mesmo passo: a Saída parte da janela nova (o passo remonta)', () => {
    const props = { source: fonte(), hoje: HOJE, onFeito: vi.fn(), onDesatualizada: vi.fn(), onExtra: vi.fn() }
    const { rerender } = render(<ManutencaoPassoAPasso {...props} m={agendada} />)
    expect((screen.getByLabelText(/^Saída/) as HTMLInputElement).value).toBe('2026-11-23T08:00')
    rerender(<ManutencaoPassoAPasso {...props} m={{ ...agendada, janelaInicio: '2026-11-30', janelaFim: '2026-12-06' }} />)
    expect((screen.getByLabelText(/^Saída/) as HTMLInputElement).value).toBe('2026-11-30T08:00')
  })

  it('dois cliques antes de renderizar gravam uma vez só', async () => {
    const props = montar(base)
    fireEvent.click(screen.getByRole('radio', { name: 'Alta' }))
    // O clique do DOM já esbarra no botão desabilitado depois do 1º render; aqui o handler roda duas vezes antes de qualquer render.
    const botao = screen.getByRole('button', { name: 'Agendar' }) as unknown as Record<string, { onClick: () => void }>
    const reactProps = botao[Object.keys(botao).find((k) => k.startsWith('__reactProps'))!]
    await act(async () => { reactProps.onClick(); reactProps.onClick() })
    await waitFor(() => expect(props.onFeito).toHaveBeenCalled())
    expect(props.source.agendarManutencao).toHaveBeenCalledTimes(1)
    // A trava de executarAcaoManutencao já barrava o 2º; sem a trava do passo ele virava o alerta "Já há uma ação em andamento".
    expect(screen.queryByText('Não foi possível gravar')).toBeNull()
  })

  it('a barra diz ao leitor de tela qual etapa foi concluída e onde parou', () => {
    montar({ ...agendada, status: MANUT.CANCELADO })
    const itens = within(screen.getByRole('list', { name: 'Etapas' })).getAllByRole('listitem')
    expect(itens[0].textContent).toContain('concluída')
    expect(itens[1].textContent).toContain('parou aqui')
    expect(itens[2].textContent).not.toMatch(/concluída|parou aqui/)
  })

  it('"abrir despesa" abre a gaveta da despesa', () => {
    montar({ ...programada, status: MANUT.REALIZADO, despesa: { id: 'd1', statusOperacional: 100000000, statusAnexo: 100000002 } })
    fireEvent.click(screen.getByRole('button', { name: 'abrir despesa' }))
    expect(abrirGavetaRegistro).toHaveBeenCalledWith('cr40f_despesaoperacional', 'd1')
  })

  it('despesa ilegível: avisa que não foi possível ler', () => {
    montar({ ...programada, status: MANUT.REALIZADO, despesa: undefined })
    expect(screen.getByText('Não foi possível ler a despesa')).toBeTruthy()
  })

  it('programação ilegível: aviso para reabrir a gaveta', () => {
    montar({ ...agendada, programacao: undefined })
    expect(screen.getByText('Não foi possível ler a programação. Feche e abra a gaveta de novo.')).toBeTruthy()
  })
})
