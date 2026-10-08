// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertList } from './AlertList'
import { AnaliseCard } from './AnaliseCard'
import { tomStatus } from './Celulas'
import { DashboardToolbar } from './DashboardToolbar'
import { Emergenciais } from './Emergenciais'
import { ApoioChip, ApoioTexto, KpiChip } from './KpiChip'
import { KPI_PLACEHOLDER, KpiGrid } from './KpiGrid'
import { StatusServicosCard } from './Analises'
import { ProducaoPropriaTerceira } from './ProducaoPropriaTerceira'
import { ResumoTab } from './abas/ResumoTab'
import { statusServicos } from '../domain/analises'
import { filtrarServicos } from '../domain/base'
import { emergenciais, producaoPropriaTerceira } from '../domain/destaques'
import { calcularResumo } from '../domain/resumo'
import { manutencao, reserva, veiculo } from '../domain/test-utils'
import type { Dados, Filtros } from '../domain/types'

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
/** Blocos da aba Resumo, na ordem da página. */
const TITULOS = ['Alertas de operação', 'Qualidade dos dados', 'Total produzido', 'Meta × realizado']
const FILTROS: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
const AGORA = new Date('2026-10-15T15:00:00Z')
const resumoDe = (dados: Dados) => calcularResumo(dados, FILTROS, AGORA)
const renderResumo = (dados: Dados) => render(<ResumoTab resumo={resumoDe(dados)} periodo={PERIODO} />)
const rvDe = (dados: Dados) => filtrarServicos(dados.reservas, FILTROS)
/** Cards que as abas Serviços e Financeiro reaproveitam, montados direto do domínio. */
const renderBlocos = (dados: Dados) => render(<>
  <ResumoTab resumo={resumoDe(dados)} periodo={PERIODO} />
  <ProducaoPropriaTerceira dados={producaoPropriaTerceira(rvDe(dados), dados.veiculos)} periodo={PERIODO} />
  <Emergenciais dados={emergenciais(rvDe(dados))} periodo={PERIODO} />
  <StatusServicosCard dados={statusServicos({ todas: dados.reservas, rv: rvDe(dados), f: FILTROS, now: AGORA })} periodo={PERIODO} />
</>)
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

  it('Resumo: seis KPIs, Alertas de operação | Qualidade dos dados e Total produzido | Meta × realizado, com e sem dados', () => {
    semAvisoDeGrafico(() => {
      for (const dados of [VAZIO, UM_SERVICO]) {
        const { container } = renderResumo(dados)
        expect(within(screen.getByRole('region', { name: 'Indicadores executivos' })).getAllByRole('article')).toHaveLength(6)
        expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(TITULOS)
        for (const titulo of TITULOS.slice(0, 2)) expect(within(screen.getByRole('region', { name: titulo })).getAllByRole('listitem')).toHaveLength(4)
        // Produção, clientes, motoristas e frota saíram do Resumo.
        expect(container.textContent).not.toMatch(/Produção própria|Faturamento por cliente|Serviços por motorista|Frota e pessoas|Top 5/)
        cleanup()
      }
    })
  })

  it('no desktop: participação e atingimento em barra, ranking dos emergenciais em colunas', () => {
    semAvisoDeGrafico(() => renderBlocos(UM_SERVICO))
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
      const r = renderBlocos(UM_SERVICO)
      for (const b of screen.getAllByRole('button', { name: 'Ver valores' })) fireEvent.click(b)
      return r
    })
    const texto = container.textContent ?? ''
    expect(texto).toMatch(/Meta R\$[^·]*· Realizado R\$[^·]*· \d+,\d%/)
    expect(texto).toMatch(/Própria 1 · Terceirizada 0/)
    expect(texto).toMatch(/2026: R\$\s500,00/)
    expect(texto).toMatch(/1º Tenaris · 1/)
    expect(texto).toMatch(/1 serviços · Participação 100,0%/)
    // Todas as linhas com dados têm exatamente 2 células.
    const linhas = screen.getAllByRole('row').filter((l) => within(l).queryAllByRole('cell').length > 0)
    expect(linhas.length).toBeGreaterThan(0)
    for (const l of linhas) expect(within(l).getAllByRole('cell').length).toBe(2)
  })

  describe('listas mensais no celular', () => {
    beforeEach(() => telaCelular(true))

    it('emergenciais: a linha do mês mostra o 1º cliente e "Ver ranking" abre os demais', () => {
      render(<Emergenciais dados={emergenciais(rvDe(DOIS_CLIENTES))} periodo={PERIODO} />)
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
      render(<Emergenciais dados={emergenciais(rvDe(UM_SERVICO))} periodo={PERIODO} />)
      const mes = linhaDe(screen.getByRole('region', { name: 'Serviços emergenciais' }), 'out/26')
      expect(mes.textContent).toMatch(/1º Tenaris · 1/)
      expect(within(mes).queryByRole('button')).toBeNull()
    })

    it('ao mudar os dados, a linha aberta continua aberta só se a chave ainda existir', () => {
      const setembro = reserva({ saidaRaw: '2026-09-02T12:00:00Z', criadoRaw: '2026-09-02T08:00:00Z', valor: 200, cliente: 'Vale' })
      const outubro = rvDe(DOIS_CLIENTES)
      const painel = (rows: typeof outubro) => <Emergenciais dados={emergenciais(rows)} periodo={PERIODO} />
      const { rerender } = render(painel(outubro))
      const card = () => screen.getByRole('region', { name: 'Serviços emergenciais' })
      fireEvent.click(within(linhaDe(card(), 'out/26')).getByRole('button', { name: 'Ver ranking' }))
      rerender(painel([setembro, ...outubro]))
      expect(within(linhaDe(card(), 'out/26')).getByRole('button', { name: 'Ocultar ranking' }).getAttribute('aria-expanded')).toBe('true')
      // Outubro sai da lista e, ao voltar, volta fechado.
      rerender(painel([setembro]))
      expect(() => linhaDe(card(), 'out/26')).toThrow()
      rerender(painel(outubro))
      expect(within(linhaDe(card(), 'out/26')).getByRole('button', { name: 'Ver ranking' }).getAttribute('aria-expanded')).toBe('false')
    })
  })
})
