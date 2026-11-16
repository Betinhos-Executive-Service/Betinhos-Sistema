// @vitest-environment jsdom
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Host } from '../host'
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
  ['Frota › Registros', '#/frota-multas', frota('multas'), 'Status'],
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
