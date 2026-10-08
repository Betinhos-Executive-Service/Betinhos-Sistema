// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertList } from './AlertList'
import { AnaliseCard } from './AnaliseCard'
import { AbaLegado, embutirLegado } from './DashboardAbas'
import { tomStatus } from './Celulas'
import { DashboardToolbar } from './DashboardToolbar'
import { Emergenciais } from './Emergenciais'
import { FrotaPessoas } from './FrotaPessoas'
import { ApoioChip, ApoioTexto, KpiChip } from './KpiChip'
import { KPI_PLACEHOLDER, KpiGrid } from './KpiGrid'
import { ResumoSecoes } from './ResumoSecoes'
import { calcularResumo } from '../domain/resumo'
import { manutencao, reserva, veiculo } from '../domain/test-utils'
import type { Dados, Filtros } from '../domain/types'
import type { Host } from '../../../host'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const telaCelular = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && query.includes('820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  telaCelular(false)
})
/** Recharts avisa que o contêiner tem 0 x 0 no jsdom; o aviso é esperado nos testes que desenham gráficos. */
function semAvisoDeGrafico<T>(fn: () => T): T {
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try { return fn() } finally { aviso.mockRestore() }
}
const PERIODO = '01/10/2026 a 15/10/2026'
const TITULOS = [
  'Produção própria × terceirizada', 'Serviços emergenciais', 'Top 5 motoristas próprios', 'Top 5 motoristas terceirizados',
  'Total produzido', 'Meta × realizado', 'Faturamento por cliente', 'Ticket médio — mensal', 'Status dos serviços',
  'Custo frota — manutenções', 'Top clientes — volume', 'Top clientes — faturamento', 'Serviços por motorista',
]
const resumoDe = (dados: Dados, p: Partial<Filtros> = {}) =>
  calcularResumo(dados, { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [], ...p }, new Date('2026-10-15T15:00:00Z'))
const renderResumo = (dados: Dados) => render(<ResumoSecoes resumo={resumoDe(dados)} periodo={PERIODO} />)
const VAZIO: Dados = { reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [], pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], indisponiveis: [] }
const UM_SERVICO: Dados = {
  reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', criadoRaw: '2026-10-02T08:00:00Z', valor: 500, cliente: 'Tenaris', motoristaId: 'm', motoristaKey: 'm', motorista: 'Ana', veiculoId: 'v1' })],
  manutencoes: [manutencao({ dia: '2026-10-03', valor: 100 })], multas: [], ocorrencias: [], funcionarios: [], viagens: [], eventos: [], telemetria: [], pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], indisponiveis: [],
  veiculos: [veiculo({ id: 'v1', statusLabel: 'Disponível', categoria: 'Propria' })],
}

/** Dois clientes e dois motoristas no mesmo mês, todos emergenciais: Tenaris com 2 serviços (R$ 1.000) e Embraer com 1 (R$ 300). */
const DOIS_CLIENTES: Dados = {
  ...VAZIO,
  reservas: [
    reserva({ saidaRaw: '2026-10-02T12:00:00Z', criadoRaw: '2026-10-02T08:00:00Z', valor: 500, cliente: 'Tenaris', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Ana' }),
    reserva({ saidaRaw: '2026-10-03T12:00:00Z', criadoRaw: '2026-10-03T08:00:00Z', valor: 500, cliente: 'Tenaris', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Ana' }),
    reserva({ saidaRaw: '2026-10-04T12:00:00Z', criadoRaw: '2026-10-04T08:00:00Z', valor: 300, cliente: 'Embraer', motoristaId: 'm2', motoristaKey: 'm2', motorista: 'Bia' }),
  ],
}
/** Linha da lista cuja 1ª célula é `titulo`. */
const linhaDe = (card: HTMLElement, titulo: string) => {
  const linha = within(card).getAllByRole('row').find((l) => within(l).queryAllByRole('cell')[0]?.textContent === titulo)
  if (!linha) throw new Error(`Linha "${titulo}" não encontrada`)
  return linha
}
const detalheDe = (botao: HTMLElement) => document.getElementById(botao.getAttribute('aria-controls') ?? '')

describe('componentes do Dashboard', () => {
  it('chip comparativo mostra rótulo, valor anterior, sinal e percentual, com seta', () => {
    const { container } = render(<KpiChip chip={{ rotulo: 'LM', tipo: 'valor', anterior: 'R$ 2,0k', variacao: -12.34 }} />)
    expect(container.textContent).toBe('LM R$ 2,0k −12,3%')
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    cleanup()
    render(<KpiChip chip={{ rotulo: 'LY', tipo: 'sem-dado' }} />)
    expect(screen.getByText('s/dado')).toBeTruthy()
  })

  it('chip de apoio usa rótulo curto visível e o rótulo inteiro para o leitor de tela', () => {
    render(<ApoioChip apoio={{ rotulo: 'Projeção', texto: 'R$ 37,4k', atencao: true }} />)
    expect(screen.getByText('Proj').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('Projeção')).toBeTruthy()
    expect(screen.getByText('Atenção:')).toBeTruthy()
    expect(screen.getByText('R$ 37,4k')).toBeTruthy()
  })

  it('alerta tem status em texto e ícone, não só cor', () => {
    render(<AlertList titulo="Operação" itens={[
      { id: 'cnh', valor: '2', rotulo: 'CNH', status: 'Atenção', tom: 'danger' },
      { id: 'multas', valor: '3', rotulo: 'Multas', status: '24% pendentes', tom: 'danger' },
    ]} />)
    const faixa = screen.getByRole('region', { name: 'Operação' })
    expect(within(faixa).getAllByRole('listitem').length).toBe(2)
    expect(within(faixa).getByText('CNH')).toBeTruthy()
    expect(within(faixa).getByText('Atenção')).toBeTruthy()
    // Quando o selo não diz o estado, o leitor de tela recebe "Atenção:" antes do texto.
    expect(within(faixa).getByText('24% pendentes', { exact: false }).textContent).toBe('Atenção: 24% pendentes')
    expect(faixa.querySelectorAll('svg').length).toBe(2)
  })

  it('alerta indisponível aparece como s/dado em tom neutro, sem ícone de atenção', () => {
    render(<AlertList titulo="Operação" itens={[{ id: 'cnh', valor: '—', rotulo: 'CNH', status: 's/dado', tom: 'neutral' }]} />)
    expect(screen.getAllByText('s/dado').length).toBe(1)
    expect(screen.queryByText(/Atenção/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Operação' }).querySelector('svg')).toBeNull()
  })

  it('apoio em atenção tem ícone e texto "Atenção:" além da cor', () => {
    const { container, rerender } = render(<ApoioTexto apoio={{ rotulo: '% da receita', texto: '12,0% · Alto', atencao: true }} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('Atenção:')).toBeTruthy()
    rerender(<ApoioTexto apoio={{ rotulo: '% da receita', texto: '5,0% · OK' }} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.queryByText('Atenção:')).toBeNull()
  })

  it('KPI: valor, chips e apoio sempre visíveis e sparkline dentro do próprio card', () => {
    const kpis = [{ id: 'faturamento' as const, rotulo: 'Faturamento', valor: 'R$ 10,0k', chips: [{ rotulo: 'LM', tipo: 'valor' as const, anterior: 'R$ 9,0k', variacao: 11.1 }], apoio: [{ rotulo: 'Previsão', texto: 'R$ 12,0k' }], serie: [{ mes: '2026-09', rotulo: 'set/26', valor: 1 }, { mes: '2026-10', rotulo: 'out/26', valor: 2 }] }]
    semAvisoDeGrafico(() => render(<KpiGrid kpis={kpis} carregando={false} />))
    const card = screen.getByRole('article', { name: 'Faturamento' })
    expect(within(card).getByText('R$ 10,0k')).toBeTruthy()
    expect(within(card).getByText('R$ 9,0k').parentElement?.textContent).toBe('LM R$ 9,0k +11,1%')
    expect(within(card).getByText('Previsão')).toBeTruthy()
    expect(card.lastElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('KPI na primeira carga: seis cards no formato final, ocupados e sem números', () => {
    render(<KpiGrid kpis={KPI_PLACEHOLDER} carregando />)
    const grade = screen.getByRole('region', { name: 'Indicadores executivos' })
    expect(grade.getAttribute('aria-busy')).toBe('true')
    expect(within(grade).getAllByRole('article').length).toBe(6)
    expect(within(grade).getAllByText('Carregando').length).toBe(6)
    expect(within(grade).queryByText('—')).toBeNull()
  })

  it('frota e pessoas: card no formato de alerta, com apoio no selo e atenção em texto', () => {
    render(<FrotaPessoas cards={[{ id: 'multas', rotulo: 'Multas', valor: '3', apoio: '1 pendentes · 33%', atencao: true }, { id: 'frota', rotulo: 'Frota ativa', valor: '4', apoio: 'Total: 5', atencao: false }]} />)
    const faixa = screen.getByRole('region', { name: 'Frota e pessoas' })
    expect(within(faixa).getByText('1 pendentes · 33%', { exact: false }).textContent).toBe('Atenção: 1 pendentes · 33%')
    expect(within(faixa).getByText('Total: 5').textContent).toBe('Total: 5')
  })

  it('card de análise com gráfico: o gráfico fica sempre à vista e os valores abrem sob demanda', () => {
    render(<AnaliseCard titulo="Custo" periodo={PERIODO} unidade="R$" valor="R$ 10,00" grafico={<p>grafico</p>} tabela={<p>tabela</p>} tabelaSobDemanda />)
    const card = screen.getByRole('region', { name: 'Custo' })
    expect(within(card).getByText(`${PERIODO} · R$`)).toBeTruthy()
    const botao = within(card).getByRole('button', { name: 'Ver valores' })
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(within(card).queryByText('tabela')).toBeNull()
    fireEvent.click(botao)
    expect(within(card).getByText('grafico')).toBeTruthy()
    expect(within(card).getByText('tabela')).toBeTruthy()
    const ocultar = within(card).getByRole('button', { name: 'Ocultar valores' })
    expect(ocultar.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(ocultar.getAttribute('aria-controls') ?? '')?.textContent).toBe('tabela')
    fireEvent.click(ocultar)
    expect(within(card).queryByText('tabela')).toBeNull()
  })

  it('card de análise com gráfico e tabela mostra os dois juntos, sem botão', () => {
    render(<AnaliseCard titulo="Status" periodo="p" unidade="serviços" valor="3" grafico={<p>grafico</p>} tabela={<p>tabela</p>} />)
    expect(screen.getByText('grafico')).toBeTruthy()
    expect(screen.getByText('tabela')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('status por texto: concluído em sucesso, cancelado e recusado em perigo, demais neutros', () => {
    expect(tomStatus('Concluído')).toBe('success')
    expect(tomStatus('Cancelado')).toBe('danger')
    expect(tomStatus('Recusado')).toBe('danger')
    expect(tomStatus('Mensal')).toBe('neutral')
  })

  it('barra de filtros: atalhos visíveis, o escolhido marcado, e a troca recalcula o período', () => {
    const filtros: Filtros = { atalho: 'esteAno', inicio: '2026-01-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
    const onChange = vi.fn()
    render(<DashboardToolbar filtros={filtros} opcoes={{ status: [], clientes: [], motoristas: [], tipos: [] }} now={new Date('2026-10-15T12:00:00Z')} onChange={onChange} />)
    const grupo = screen.getByRole('group', { name: 'Período' })
    expect(within(grupo).getAllByRole('button').length).toBe(8)
    expect(within(grupo).getByRole('button', { name: 'Este ano' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(grupo).getByRole('button', { name: 'Hoje' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(within(grupo).getByRole('button', { name: 'Mês anterior' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ atalho: 'mesAnt', inicio: '2026-09-01', fim: '2026-09-30' }))
  })

  it('barra de filtros: período inválido mostra erro e não propaga', () => {
    const filtros: Filtros = { atalho: 'personalizado', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
    const onChange = vi.fn()
    render(<DashboardToolbar filtros={filtros} opcoes={{ status: [], clientes: [], motoristas: [], tipos: [] }} now={new Date('2026-10-15T12:00:00Z')} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-10-20' } })
    expect(screen.getByRole('alert').textContent).toContain('O início precisa ser antes do fim.')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-10-05' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ inicio: '2026-10-05', fim: '2026-10-15' }))
  })

  it('barra de filtros: "Limpar filtros" só aparece com segmento e zera os quatro', () => {
    const base: Filtros = { atalho: 'esteAno', inicio: '2026-01-01', fim: '2026-12-31', status: [], clientes: [], motoristas: [], tipos: [] }
    const onChange = vi.fn()
    const props = { opcoes: { status: [], clientes: [], motoristas: [], tipos: [] }, now: new Date('2026-10-15T12:00:00Z'), onChange }
    const { rerender } = render(<DashboardToolbar filtros={base} {...props} />)
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    rerender(<DashboardToolbar filtros={{ ...base, clientes: ['A'], tipos: ['Van'] }} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(onChange).toHaveBeenCalledWith({ ...base, clientes: [], tipos: [] })
  })

  it('seções do Resumo renderizam com dados reais e sem dados', () => {
    semAvisoDeGrafico(() => {
      for (const dados of [VAZIO, UM_SERVICO]) {
        renderResumo(dados)
        for (const titulo of TITULOS) expect(screen.getByRole('region', { name: titulo })).toBeTruthy()
        if (dados === VAZIO) expect(screen.getAllByText('Nenhum registro no período').length).toBe(2)
        cleanup()
      }
    })
  })

  it('no desktop: um mês por coluna com valor e variação, participação em barra e tabela larga rolando dentro do card', () => {
    semAvisoDeGrafico(() => renderResumo(UM_SERVICO))
    const card = screen.getByRole('region', { name: 'Faturamento por cliente' })
    const rolagem = within(card).getByRole('region', { name: 'Faturamento por cliente e mês' })
    expect(within(rolagem).getByRole('columnheader', { name: 'out/26' })).toBeTruthy()
    expect(within(rolagem).getByRole('columnheader', { name: 'Participação' })).toBeTruthy()
    expect(within(rolagem).getByRole('progressbar', { name: 'Participação de Tenaris: 100,0%' })).toBeTruthy()
    const status = screen.getByRole('region', { name: 'Status dos serviços' })
    expect(within(status).getByRole('progressbar', { name: /^Participação de .+: 100,0%$/ })).toBeTruthy()
    const meta = screen.getByRole('region', { name: 'Meta × realizado' })
    expect(within(meta).getByRole('progressbar', { name: /^Atingimento de out\/26: \d+,\d%$/ })).toBeTruthy()
    const emerg = screen.getByRole('region', { name: 'Serviços emergenciais' })
    expect(within(emerg).getByRole('list', { name: 'Clientes com mais pedidos emergenciais' }).textContent).toContain('Tenaris')
    expect(within(emerg).getByRole('columnheader', { name: '5º cliente' })).toBeTruthy()
  })

  it('no celular as tabelas ganham 2 colunas com rótulo inline e nada fica escondido', () => {
    telaCelular(true)
    const { container } = semAvisoDeGrafico(() => {
      const r = renderResumo(UM_SERVICO)
      for (const b of screen.getAllByRole('button', { name: 'Ver valores' })) fireEvent.click(b)
      for (const b of screen.getAllByRole('button', { name: 'Ver meses' })) fireEvent.click(b)
      return r
    })
    const texto = container.textContent ?? ''
    expect(texto).toMatch(/Meta R\$[^·]*· Realizado R\$[^·]*· \d+,\d%/)
    expect(texto).toMatch(/Própria 1 · Terceirizada 0/)
    expect(texto).toMatch(/2026: R\$\s500,00/)
    expect(texto).toMatch(/1 serviços · R\$/)
    expect(texto).toMatch(/Tenaris · 100,0%/)
    expect(texto).toMatch(/1º Tenaris · 1/)
    expect(texto).toMatch(/Total R\$[^·]*· Participação 100,0%/)
    // Os meses de cliente e de motorista só aparecem depois de "Ver meses".
    expect(texto).toMatch(/out\/26: R\$\s500,00 · —/)
    expect(texto).toMatch(/out\/26: 1 · 100,0%/)
    // Nenhuma tabela rola no celular: todas viram lista.
    expect(screen.queryByRole('region', { name: /e mês$/ })).toBeNull()
    // Todas as linhas com dados têm exatamente 2 células.
    const linhas = screen.getAllByRole('row').filter((l) => within(l).queryAllByRole('cell').length > 0)
    expect(linhas.length).toBeGreaterThan(0)
    for (const l of linhas) expect(within(l).getAllByRole('cell').length).toBe(2)
  })

  describe('listas mensais no celular', () => {
    beforeEach(() => telaCelular(true))

    it('faturamento por cliente: a linha mostra só o total e os meses abrem sob demanda, na mesma célula', () => {
      semAvisoDeGrafico(() => render(<ResumoSecoes resumo={resumoDe(DOIS_CLIENTES)} periodo={PERIODO} />))
      const card = screen.getByRole('region', { name: 'Faturamento por cliente' })
      const tenaris = linhaDe(card, 'Tenaris')
      expect(tenaris.textContent).toMatch(/Total R\$\s1,0k · Participação 76,9%/)
      expect(tenaris.textContent).not.toMatch(/out\/26/)
      const abrir = within(tenaris).getByRole('button', { name: 'Ver meses' })
      expect(abrir.getAttribute('aria-expanded')).toBe('false')
      expect(abrir.hasAttribute('aria-controls')).toBe(false)
      // Alvo de toque de 44 px (size touch do DS).
      expect(abrir.classList.contains('bt-button--touch')).toBe(true)
      fireEvent.click(abrir)
      const fechar = within(tenaris).getByRole('button', { name: 'Ocultar meses' })
      expect(fechar.getAttribute('aria-expanded')).toBe('true')
      expect(detalheDe(fechar)?.textContent).toMatch(/^out\/26: R\$\s1,0k · —$/)
      expect(within(tenaris).getAllByRole('cell')).toHaveLength(2)
      // Só a linha clicada abre.
      expect(linhaDe(card, 'Embraer').textContent).not.toMatch(/out\/26/)
      fireEvent.click(fechar)
      expect(within(tenaris).getByRole('button', { name: 'Ver meses' }).getAttribute('aria-expanded')).toBe('false')
      expect(tenaris.textContent).not.toMatch(/out\/26/)
    })

    it('serviços por motorista: a linha mostra o total e a participação, e os meses abrem sob demanda', () => {
      semAvisoDeGrafico(() => render(<ResumoSecoes resumo={resumoDe(DOIS_CLIENTES)} periodo={PERIODO} />))
      const card = screen.getByRole('region', { name: 'Serviços por motorista' })
      const ana = linhaDe(card, 'Ana')
      expect(ana.textContent).toMatch(/Total 2 · 66,7%/)
      expect(ana.textContent).not.toMatch(/out\/26/)
      const abrir = within(ana).getByRole('button', { name: 'Ver meses' })
      expect(abrir.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(abrir)
      const fechar = within(ana).getByRole('button', { name: 'Ocultar meses' })
      expect(fechar.getAttribute('aria-expanded')).toBe('true')
      expect(detalheDe(fechar)?.textContent).toBe('out/26: 2 · 66,7%')
      expect(linhaDe(card, 'Bia').textContent).not.toMatch(/out\/26/)
    })

    it('emergenciais: a linha do mês mostra o 1º cliente e "Ver ranking" abre os demais', () => {
      render(<Emergenciais dados={resumoDe(DOIS_CLIENTES).emergenciais} periodo={PERIODO} />)
      const mes = linhaDe(screen.getByRole('region', { name: 'Serviços emergenciais' }), 'out/26')
      expect(mes.textContent).toMatch(/1º Tenaris · 2/)
      expect(mes.textContent).not.toMatch(/Embraer/)
      const abrir = within(mes).getByRole('button', { name: 'Ver ranking' })
      expect(abrir.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(abrir)
      const fechar = within(mes).getByRole('button', { name: 'Ocultar ranking' })
      expect(fechar.getAttribute('aria-expanded')).toBe('true')
      expect(detalheDe(fechar)?.textContent).toBe('2º Embraer · 1')
      fireEvent.click(fechar)
      expect(mes.textContent).not.toMatch(/Embraer/)
    })

    it('emergenciais: mês com um só cliente não tem botão, porque não há mais o que mostrar', () => {
      render(<Emergenciais dados={resumoDe(UM_SERVICO).emergenciais} periodo={PERIODO} />)
      const mes = linhaDe(screen.getByRole('region', { name: 'Serviços emergenciais' }), 'out/26')
      expect(mes.textContent).toMatch(/1º Tenaris · 1/)
      expect(within(mes).queryByRole('button')).toBeNull()
    })

    it('ao mudar o filtro, a linha aberta continua aberta só se a chave ainda existir', () => {
      const painel = (p: Partial<Filtros> = {}) => <ResumoSecoes resumo={resumoDe(DOIS_CLIENTES, p)} periodo={PERIODO} />
      const { rerender } = semAvisoDeGrafico(() => render(painel()))
      const card = () => screen.getByRole('region', { name: 'Faturamento por cliente' })
      fireEvent.click(within(linhaDe(card(), 'Tenaris')).getByRole('button', { name: 'Ver meses' }))
      semAvisoDeGrafico(() => rerender(painel({ clientes: ['Tenaris'] })))
      expect(within(linhaDe(card(), 'Tenaris')).getByRole('button', { name: 'Ocultar meses' }).getAttribute('aria-expanded')).toBe('true')
      // Tenaris sai da lista e, ao voltar, volta fechada.
      semAvisoDeGrafico(() => rerender(painel({ clientes: ['Embraer'] })))
      expect(() => linhaDe(card(), 'Tenaris')).toThrow()
      semAvisoDeGrafico(() => rerender(painel()))
      expect(within(linhaDe(card(), 'Tenaris')).getByRole('button', { name: 'Ver meses' }).getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('abas do dashboard antigo', () => {
    it('no Dataverse abre a aba do legado em iframe, com aviso e "Abrir em tela cheia"', () => {
      const host = { mode: 'dataverse', clientUrl: 'https://org.crm2.dynamics.com' } as unknown as Host
      render(<AbaLegado host={host} aba="financeiro" />)
      expect(screen.getByText('Esta aba ainda abre o dashboard antigo.')).toBeTruthy()
      expect(screen.getByRole('link', { name: 'Abrir em tela cheia' }).getAttribute('href')).toBe('#/new_dashboard')
      const iframe = screen.getByTitle('Dashboard antigo, aba Faturamento')
      expect(iframe.getAttribute('src')).toBe('https://org.crm2.dynamics.com/WebResources/new_dashboard?tab=financeiro')
      expect(screen.getByRole('status').textContent).toContain('Carregando')
    })

    it('esconde o chrome do legado na mesma origem, uma vez só, e ignora documento inacessível', () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      embutirLegado(iframe)
      embutirLegado(iframe)
      const estilos = iframe.contentDocument!.querySelectorAll('#bt-shell-embutido')
      expect(estilos.length).toBe(1)
      expect(estilos[0].textContent).toContain('.topbar, .sidebar, .mobile-nav')
      iframe.remove()
      const bloqueado = { get contentDocument(): Document { throw new DOMException('Blocked', 'SecurityError') } } as unknown as HTMLIFrameElement
      expect(() => embutirLegado(bloqueado)).not.toThrow()
    })
  })
})
