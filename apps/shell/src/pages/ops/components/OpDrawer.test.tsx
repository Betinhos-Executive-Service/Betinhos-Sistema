// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Source } from '../data/source'
import { withOpFallback } from '../domain/status'
import type { Op } from '../domain/types'
import { OpDrawer } from './OpDrawer'

vi.mock('../../../app/auditoria/AuditoriaProvider', () => ({ BotaoAuditoria: () => null }))
afterEach(cleanup)

const servico = (n: number, valor: number) => ({ id: `s${n}`, codigo: `OS-${n}`, data: null, destino: 'Embraer', status: 'Concluído', valor })
const op: Op = {
  id: 'op-1', codigo: 'OP-1902', status: null, valor: 2370, cliente: 'Particular', passageiros: '', trajetos: '',
  primeiroServico: null, ultimoServico: null, idioma: null, criadoEm: null, criadoPor: '', alteradoEm: null,
}

function source(valorAtual: number): Source {
  return {
    valor: async () => valorAtual,
    pagantes: {
      rateio: async () => [],
      servicos: async () => [servico(1, 1390), servico(2, 490), servico(3, 490), servico(4, 490), servico(5, 1390)],
      choices: async () => ({ status: [], forma: [] }),
      contatos: async () => new Map(),
      recebimentos: { carregar: async () => [], contar: async () => new Map(), arquivo: async () => { throw new Error('sem arquivo') } },
    },
  } as unknown as Source
}

const renderDrawer = (valorAtual: number) =>
  render(<OpDrawer op={op} onClose={() => {}} choices={withOpFallback({})} source={source(valorAtual)} version={0} busy={false} onCancel={() => {}} onGerarPagantes={() => {}} />)

describe('OpDrawer', () => {
  it('relê o valor da OP: a lista leu no meio da soma do plugin e não acusa divergência', async () => {
    renderDrawer(4250)
    await screen.findByText(/5 serviços/)
    expect(screen.queryByText('Confira o valor antes de cobrar')).toBeNull()
    expect(screen.getAllByText('R$ 4.250,00').length).toBeGreaterThan(0)
  })

  it('continua avisando quando o valor gravado diverge de verdade', async () => {
    renderDrawer(2370)
    expect(await screen.findByText('Confira o valor antes de cobrar')).toBeTruthy()
  })
})
