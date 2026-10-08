// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertList } from './AlertList'
import { AnaliseCard } from './AnaliseCard'
import { DashboardToolbar } from './DashboardToolbar'
import { Analises } from './Analises'
import { Emergenciais } from './Emergenciais'
import { FrotaPessoas } from './FrotaPessoas'
import { ApoioTexto, KpiChip } from './KpiChip'
import { KpiGrid } from './KpiGrid'
import { ProducaoPropriaTerceira } from './ProducaoPropriaTerceira'
import { calcularResumo } from '../domain/resumo'
import { reserva } from '../domain/test-utils'
import type { Dados, Filtros } from '../domain/types'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const telaCelular = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && query.includes('820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  telaCelular(false)
})

describe('componentes do Dashboard', () => {
  it('chip mostra seta, sinal e texto', () => {
    render(<KpiChip chip={{ rotulo: 'LM', tipo: 'valor', anterior: 'R$ 2,0k', variacao: -12.34 }} />)
    expect(screen.getByText(/LM R\$ 2,0k −12,3%/)).toBeTruthy()
  })

  it('alerta tem status em texto, não só cor', () => {
    render(<AlertList titulo="Operação" itens={[{ id: 'cnh', valor: '2', rotulo: 'CNH', status: 'Atenção', tom: 'danger' }]} />)
    expect(screen.getByText('CNH')).toBeTruthy()
    expect(screen.getAllByText('Atenção').length).toBeGreaterThan(0)
  })

  it('alerta indisponível aparece como s/dado em tom neutro, não como atenção', () => {
    const { container } = render(<AlertList titulo="Operação" itens={[{ id: 'cnh', valor: '—', rotulo: 'CNH', status: 's/dado', tom: 'neutral' }]} />)
    expect(screen.getAllByText('s/dado').length).toBe(2)
    expect(screen.queryByText('Atenção')).toBeNull()
    expect(container.querySelector('.bt-status--warning, .bt-badge--warning')).toBeNull()
  })

  it('apoio em atenção tem ícone e texto "Atenção:" além da cor', () => {
    const { container, rerender } = render(<ApoioTexto apoio={{ rotulo: '% da receita', texto: '12,0% · Alto', atencao: true }} />)
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('.dash-sr')?.textContent).toBe('Atenção:')
    rerender(<ApoioTexto apoio={{ rotulo: '% da receita', texto: '5,0% · OK' }} />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('.dash-sr')).toBeNull()
  })

  it('KPI: chips e apoio ficam fora do hint do MetricCard (que o DS esconde no celular)', () => {
    const kpis = [{ id: 'faturamento' as const, rotulo: 'Faturamento', valor: 'R$ 10,0k', chips: [{ rotulo: 'LM', tipo: 'valor' as const, anterior: 'R$ 9,0k', variacao: 11.1 }], apoio: [{ rotulo: 'Previsão', texto: 'R$ 12,0k' }], serie: [{ mes: '2026-09', rotulo: 'set/26', valor: 1 }, { mes: '2026-10', rotulo: 'out/26', valor: 2 }] }]
    const { container } = render(<KpiGrid kpis={kpis} carregando={false} />)
    const card = container.querySelector('.dash-kpi') as HTMLElement
    expect(container.querySelector('.bt-metric__hint')).toBeNull()
    const extras = card.querySelector('.dash-kpi__extras') as HTMLElement
    expect(extras.textContent).toContain('LM R$ 9,0k +11,1%')
    expect(extras.textContent).toContain('Previsão')
    expect(card.querySelector('.dash-spark')?.parentElement).toBe(card)
  })

  it('card de frota: apoio fica em .dash-kpi__extras, não no hint', () => {
    const { container } = render(<FrotaPessoas cards={[{ id: 'multas', rotulo: 'Multas', valor: '3', apoio: '1 pendentes · 33%', atencao: true }]} />)
    expect(container.querySelector('.bt-metric__hint')).toBeNull()
    expect(container.querySelector('.dash-kpi__extras')?.textContent).toBe('1 pendentes · 33%')
  })

  it('card de análise alterna entre gráfico e tabela', () => {
    render(<AnaliseCard titulo="Custo" periodo="01/10/2026 a 15/10/2026" unidade="R$" valor="R$ 10,00" grafico={<p>grafico</p>} tabela={<p>tabela</p>} />)
    expect(screen.getByText('grafico')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver tabela' }))
    expect(screen.getByText('tabela')).toBeTruthy()
    expect(screen.queryByText('grafico')).toBeNull()
  })

  it('card de análise sem gráfico na primeira renderização passa a mostrar o gráfico quando ele chega', () => {
    const props = { titulo: 'Custo', periodo: 'p', unidade: 'R$', valor: '1', tabela: <p>tabela</p> }
    const { rerender } = render(<AnaliseCard {...props} />)
    expect(screen.getByText('tabela')).toBeTruthy()
    rerender(<AnaliseCard {...props} grafico={<p>grafico</p>} />)
    expect(screen.getByText('grafico')).toBeTruthy()
    expect(screen.queryByText('tabela')).toBeNull()
  })

  it('card de análise sem gráfico mostra só a tabela, sem botão de alternar', () => {
    render(<AnaliseCard titulo="Status" periodo="p" unidade="serviços" valor="3" tabela={<p>tabela</p>} />)
    expect(screen.getByText('tabela')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
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
    const now = new Date('2026-10-15T15:00:00Z')
    const f: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
    const vazio: Dados = { reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], indisponiveis: [] }
    const cheio: Dados = { ...vazio, reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', valor: 500, cliente: 'Tenaris' })], manutencoes: [{ dia: '2026-10-03', valor: 100 }] }
    // Recharts avisa que o contêiner tem 0 x 0 no jsdom; o aviso é esperado aqui.
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      for (const dados of [vazio, cheio]) {
        const r = calcularResumo(dados, f, now)
        const { container } = render(<>
          <KpiGrid kpis={r.kpis} carregando={false} />
          <FrotaPessoas cards={r.frota} />
          <ProducaoPropriaTerceira dados={r.producao} periodo="01/10/2026 a 15/10/2026" />
          <Emergenciais dados={r.emergenciais} periodo="01/10/2026 a 15/10/2026" />
          <Analises resumo={r} periodo="01/10/2026 a 15/10/2026" />
        </>)
        expect(container.querySelectorAll('.dash-analise').length).toBe(11)
        expect(screen.getAllByText('Meta × realizado').length).toBe(1)
        cleanup()
      }
    } finally {
      aviso.mockRestore()
    }
  })
  it('no celular as tabelas ganham 2 colunas com rótulo inline e nada fica escondido', () => {
    telaCelular(true)
    const now = new Date('2026-10-15T15:00:00Z')
    const f: Filtros = { atalho: 'esteMes', inicio: '2026-10-01', fim: '2026-10-15', status: [], clientes: [], motoristas: [], tipos: [] }
    const dados: Dados = {
      reservas: [reserva({ saidaRaw: '2026-10-02T12:00:00Z', criadoRaw: '2026-10-02T08:00:00Z', valor: 500, cliente: 'Tenaris', motoristaId: 'm', motoristaKey: 'm', motorista: 'Ana', veiculoId: 'v1' })],
      manutencoes: [{ dia: '2026-10-03', valor: 100 }], multas: [], ocorrencias: [], funcionarios: [], indisponiveis: [],
      veiculos: [{ id: 'v1', statusLabel: 'Disponível', categoria: 'Propria' }],
    }
    const r = calcularResumo(dados, f, now)
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { container } = render(<>
        <ProducaoPropriaTerceira dados={r.producao} periodo="p" />
        <Emergenciais dados={r.emergenciais} periodo="p" />
        <Analises resumo={r} periodo="p" />
      </>)
      for (const b of screen.getAllByRole('button', { name: 'Ver tabela' })) fireEvent.click(b)
      const texto = container.textContent ?? ''
      expect(container.querySelectorAll('.bt-table__cell--hide-mobile, .bt-table__cell--hide-compact').length).toBe(0)
      expect(texto).toMatch(/Meta R\$[^·]*· Realizado R\$[^·]*· \d+,\d%/)
      expect(texto).toMatch(/Própria 1 · Terceirizada 0/)
      expect(texto).toMatch(/2026: R\$\s500,00/)
      expect(texto).toMatch(/1 serviços · R\$/)
      expect(texto).toMatch(/Tenaris · 100,0%/)
      expect(texto).toMatch(/1º Tenaris · 1/)
      expect(texto).toMatch(/Total R\$[^·]*· Participação 100,0%/)
      // Todas as tabelas do celular têm exatamente 2 colunas por linha.
      const linhas = Array.from(container.querySelectorAll('.bt-table__row:not(.bt-table__row--loading)'))
      expect(linhas.length).toBeGreaterThan(0)
      for (const l of linhas) expect(l.querySelectorAll('.bt-table__cell').length).toBe(2)
    } finally {
      aviso.mockRestore()
    }
  })
})
