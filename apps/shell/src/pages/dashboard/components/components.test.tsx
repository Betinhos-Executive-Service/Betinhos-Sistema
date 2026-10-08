// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AlertList } from './AlertList'
import { AnaliseCard } from './AnaliseCard'
import { DashboardToolbar } from './DashboardToolbar'
import { Analises } from './Analises'
import { Emergenciais } from './Emergenciais'
import { FrotaPessoas } from './FrotaPessoas'
import { KpiChip } from './KpiChip'
import { KpiGrid } from './KpiGrid'
import { ProducaoPropriaTerceira } from './ProducaoPropriaTerceira'
import { calcularResumo } from '../domain/resumo'
import { reserva } from '../domain/test-utils'
import type { Dados, Filtros } from '../domain/types'

afterEach(cleanup)
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })

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

  it('card de análise alterna entre gráfico e tabela', () => {
    render(<AnaliseCard titulo="Custo" periodo="01/10/2026 a 15/10/2026" unidade="R$" valor="R$ 10,00" grafico={<p>grafico</p>} tabela={<p>tabela</p>} />)
    expect(screen.getByText('grafico')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver tabela' }))
    expect(screen.getByText('tabela')).toBeTruthy()
    expect(screen.queryByText('grafico')).toBeNull()
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
    aviso.mockRestore()
  })
})
