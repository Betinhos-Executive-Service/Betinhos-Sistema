// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../host'
import { ListaAgrupada } from './ListaAgrupada'
import { LAZY_BATCH } from './LazyList'
import { ClientesPage } from '../pages/clientes/ClientesPage'
import { DespesasPage } from '../pages/despesas/DespesasPage'
import { EquipamentosPage } from '../pages/equipamentos/EquipamentosPage'
import { FrotaPage, type Tab } from '../pages/frota/FrotaPage'
import { FuncionariosPage } from '../pages/funcionarios/FuncionariosPage'
import { InfracoesPage } from '../pages/infracoes/InfracoesPage'
import { LogsPage } from '../pages/logs/LogsPage'
import { PagantesPage } from '../pages/pagantes/PagantesPage'
import { PendenciasPage } from '../pages/pendencias/PendenciasPage'
import { PessoasPage } from '../pages/pessoas/PessoasPage'
import { TreinamentosPage } from '../pages/treinamentos/TreinamentosPage'
import { ValidacaoClientePage } from '../pages/validacao-cliente/ValidacaoClientePage'

configure({ asyncUtilTimeout: 8000 })
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const frota = (aba: Tab) => ({ host }: { host: Host }) => <FrotaPage host={host} aba={aba} />

type Tela = [nome: string, hash: string, Page: ComponentType<{ host: Host }>, coluna: string]

const TELAS: Tela[] = [
  ['Pagantes', '#/pagantes', PagantesPage, 'Pagamento'],
  ['Despesas', '#/despesas-operacionais', DespesasPage, 'Operacional'],
  ['Pessoas', '#/pessoas', PessoasPage, 'Cargo'],
  ['Funcionários', '#/funcionarios', FuncionariosPage, 'Status'],
  ['Pendências', '#/pendencias', PendenciasPage, 'Tipo'],
  ['Infrações', '#/infracoes', InfracoesPage, 'Gravidade'],
  ['Equipamentos', '#/equipamentos', EquipamentosPage, 'Status'],
  ['Frota › Veículos', '#/frota-veiculos', frota('veiculos'), 'Status'],
  ['Frota › Registros', '#/frota-multas', frota('multas'), 'Etapa'],
  ['Clientes', '#/clientes', ClientesPage, 'Registro'],
  ['Logs', '#/logs', LogsPage, 'Severidade'],
  ['Treinamentos', '#/treinamentos', TreinamentosPage, 'Situação'],
  ['Validação do cliente', '#/validacao-cliente', ValidacaoClientePage, 'Situação'],
]

describe('Agrupar por nas listas com visão', () => {
  it.each(TELAS)('%s: o menu do título da coluna agrupa e mostra os grupos com contagem', async (_nome, hash, Page, coluna) => {
    window.location.hash = hash
    render(<Page host={{ mode: 'mock' }} />)
    fireEvent.click(await screen.findByRole('button', { name: coluna }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Agrupar por esta coluna', hidden: true }))
    const grupos = await screen.findAllByRole('button', { expanded: false, name: /\d+ linhas?$/ })
    expect(grupos.length).toBeGreaterThan(0)
  })
})

describe('ListaAgrupada: carga em lotes por grupo', () => {
  const total = LAZY_BATCH + 20
  const groups = [{ id: 'a', label: 'Grupo A', rows: Array.from({ length: total }, (_, i) => `linha ${i}`) }]
  const group = { key: 'k' }

  const montar = (mobile: boolean) => render(
    <ListaAgrupada
      groups={groups} group={group} lazyKey="x" mobile={mobile} footer="total"
      table={(rows) => <ul data-testid="tabela">{rows.map((r) => <li key={r}>{r}</li>)}</ul>}
      cards={(rows) => <ul data-testid="cartoes">{rows.map((r) => <li key={r}>{r}</li>)}</ul>}
    />,
  )
  const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Grupo A/ }))

  beforeEach(() => {
    // Sem IntersectionObserver o rodapé revela tudo sozinho; o stub mantém o sentinela esperando a rolagem.
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  })

  it('desktop: o grupo aberto mostra só o primeiro lote e deixa o sentinela da próxima carga', () => {
    montar(false)
    abrir()
    expect(screen.getByTestId('tabela').children).toHaveLength(LAZY_BATCH)
    expect(document.querySelector('.gr-sentinel')).not.toBeNull()
    expect(screen.queryByTestId('cartoes')).toBeNull()
    expect(screen.getByText('total')).toBeTruthy()
  })

  it('celular: o grupo aberto mostra cartões em lote e a tabela não aparece', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
    montar(true)
    abrir()
    expect(screen.getByTestId('cartoes').children).toHaveLength(LAZY_BATCH)
    expect(document.querySelector('.gr-sentinel')).not.toBeNull()
    expect(screen.queryByTestId('tabela')).toBeNull()
    expect(screen.queryByText('total')).toBeNull()
  })
})
