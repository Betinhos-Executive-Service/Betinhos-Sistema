// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANUT, VEICULO } from '../data/schema'
import { EMPTY_DATA, type DataSource } from '../data/source'
import type { FrotaData } from '../data/types'
import { FichaVeiculo } from './FichaVeiculo'
import { ToastProvider } from '@betinhos/ui'

const v1 = { id: 'v1', label: 'TST1A11' }
const data: FrotaData = {
  ...EMPTY_DATA,
  veiculos: [{ id: 'v1', placa: 'TST1A11', marca: 'Toyota', modelo: 'Corolla', cor: 'Preto', anoModelo: 2024, status: VEICULO.ATIVO, categoria: 100000000, motorista: { id: 'f1', label: 'Ana' }, hodometro: null, hodometroEm: null }],
  manutencoes: [
    { id: 'm1', codigo: 'M1', descricao: 'Troca de óleo', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-20T12:00:00Z', valor: 200, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: v1, solicitante: null, criadoEm: '2026-09-01T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
    { id: 'm2', codigo: 'M2', descricao: 'Alinhamento', status: MANUT.REALIZADO, grau: 1, tipo: 1, agendarPara: null, dataManutencao: '2026-09-25T12:00:00Z', valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: null, veiculo: v1, solicitante: null, criadoEm: '2026-09-21T12:00:00Z', servicos: [], categorias: [], origemClassificacao: null, confiancaIa: null },
  ],
  planoPreventivo: [{ id: 'i1', nome: 'Revisão anual', servico: 100000035, intervaloKm: null, intervaloMeses: 12, avisoKm: 1000, avisoDias: 30, ativo: true }],
}
const source = { openForm: vi.fn(async () => {}) } as unknown as DataSource

afterEach(cleanup)

describe('FichaVeiculo', () => {
  it('mostra dados, motorista atual, custo com os sem valor à parte e a linha do tempo', () => {
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    expect(screen.getByRole('heading', { name: 'TST1A11' })).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getAllByText(/200,00/).length).toBeGreaterThan(0)
    expect(screen.getByText('1 manutenção sem valor informado')).toBeTruthy()
    const linha = screen.getByRole('heading', { name: 'Linha do tempo' }).closest('section')!
    expect(within(linha).getAllByRole('listitem').map((item) => item.textContent)).toEqual([expect.stringContaining('Alinhamento'), expect.stringContaining('Troca de óleo')])
  })

  it('abre o registro ao clicar em um item da linha do tempo', () => {
    const onOpen = vi.fn()
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={onOpen} onReload={() => {}} />)
    fireEvent.click(screen.getByText('Troca de óleo'))
    expect(onOpen).toHaveBeenCalledWith('manutencao', 'm1')
  })

  it('avisa quando o veículo não existe', () => {
    render(<FichaVeiculo errors={{}} source={source} id="x" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    expect(screen.getByText(/Veículo não encontrado/)).toBeTruthy()
  })

  it('fecha com Esc (cancel do dialog nativo)', () => {
    const onClose = vi.fn()
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" onClose={onClose} onOpen={() => {}} onReload={() => {}} />)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('mostra o erro real e não recarrega quando o openForm é rejeitado', async () => {
    const onReload = vi.fn()
    const falha = { openForm: vi.fn(async () => { throw new Error('Sem permissão no Dataverse') }) } as unknown as DataSource
    render(<ToastProvider><FichaVeiculo errors={{}} source={falha} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={onReload} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Abrir cadastro/ }))
    expect(await screen.findByText(/Sem permissão no Dataverse/)).toBeTruthy()
    await waitFor(() => expect(falha.openForm).toHaveBeenCalledWith('veiculo', 'v1'))
    expect(onReload).not.toHaveBeenCalled()
  })

  it('mostra "Não informado" no custo, e não R$ 0,00, quando todas as realizadas estão sem valor', () => {
    const semValor: FrotaData = { ...data, manutencoes: [data.manutencoes[1]] }
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={semValor} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    const grupo = screen.getByText('Custo de manutenção').closest('section')!
    expect(grupo.querySelector('.frota-kpi strong')?.textContent).toBe('Não informado')
    expect(grupo.textContent).not.toMatch(/0,00/)
    expect(screen.getByText('1 manutenção sem valor informado')).toBeTruthy()
  })

  it('mostra o erro de manutenções no custo e na linha do tempo, sem zero nem "sem registros"', () => {
    const vazio: FrotaData = { ...data, manutencoes: [] }
    render(<FichaVeiculo errors={{ manutencoes: 'Sem privilégio de leitura' }} source={source} id="v1" data={vazio} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    const grupo = screen.getByText('Custo de manutenção').closest('section')!
    expect(grupo.textContent).toContain('Não foi possível carregar Manutenções: Sem privilégio de leitura')
    expect(grupo.querySelector('.kpi')).toBeNull()
    expect(grupo.textContent).not.toMatch(/R\$/)
    expect(screen.getAllByRole('alert').length).toBe(2)
    expect(screen.queryByText('Sem registros para este veículo.')).toBeNull()
  })

  it('mostra só o erro de veículos quando a tabela de veículos falhou', () => {
    render(<FichaVeiculo errors={{ veiculos: 'Falha' }} source={source} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    expect(screen.getByText('Não foi possível carregar Veículos: Falha')).toBeTruthy()
    expect(screen.queryByText('Custo de manutenção')).toBeNull()
    expect(screen.queryByText('Linha do tempo')).toBeNull()
  })

  it('mostra a seção Preventivas antes da linha do tempo', () => {
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    const secao = screen.getByRole('region', { name: 'Preventivas' })
    expect(secao.id).toBe('v1-preventivas')
    expect(secao.textContent).toContain('Revisão anual')
    expect(secao.textContent).toContain('Sem base')
    const linha = screen.getByRole('region', { name: 'Linha do tempo' })
    expect(secao.compareDocumentPosition(linha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('com secao="preventivas", rola até a seção', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" secao="preventivas" onClose={() => {}} onOpen={() => {}} onReload={() => {}} />)
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('v1-preventivas'))
  })

  it('recarrega depois de abrir o cadastro com sucesso', async () => {
    const onReload = vi.fn()
    render(<FichaVeiculo errors={{}} source={source} id="v1" data={data} today="2026-10-02" onClose={() => {}} onOpen={() => {}} onReload={onReload} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir cadastro/ }))
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1))
  })
})
