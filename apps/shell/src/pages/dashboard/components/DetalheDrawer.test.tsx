// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Detalhe } from '../domain/detalhes'
import { DetalheDrawer } from './DetalheDrawer'

const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const telaCelular = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: mobile && query.includes('820px'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
beforeEach(() => telaCelular(false))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const SERVICOS: Detalhe = {
  tipo: 'servicos', titulo: 'A receber', descricao: 'Regra.', comOp: true,
  linhas: [
    { id: GUID, dia: '2026-10-02', codigo: 'CP-1', op: 'OP-1', cliente: 'Tenaris', motorista: 'Oliveira', status: 'Concluído', valor: 1500 },
    { id: 'legacy-2026-0001', dia: '2026-10-03', codigo: '', op: '', cliente: 'Embraer', motorista: 'Sem motorista', status: 'Concluído', valor: 500 },
  ],
}

describe('DetalheDrawer', () => {
  it('resumo, colunas e link "Abrir no Dataverse" só para registros com GUID no modo Dataverse', () => {
    render(<DetalheDrawer detalhe={SERVICOS} aberto onFechar={() => undefined} clientUrl="https://org.crm2.dynamics.com" />)
    const drawer = screen.getByRole('dialog', { name: 'A receber' })
    expect(within(drawer).getByText(/2 serviços · R\$\s2\.000,00/)).toBeTruthy()
    expect(within(drawer).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Data', 'Código', 'OP', 'Cliente', 'Motorista', 'Valor', 'Abrir no Dataverse'])
    const links = within(drawer).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe(`https://org.crm2.dynamics.com/main.aspx?etn=cr40f_reservadeveculos&id=${GUID}&pagetype=entityrecord`)
    expect(links[0].textContent).toContain('Abrir no Dataverse: serviço CP-1 de 02/10/2026')
  })

  it('fecha por X e Esc (cancel do dialog)', () => {
    const onFechar = vi.fn()
    render(<DetalheDrawer detalhe={SERVICOS} aberto onFechar={onFechar} clientUrl={null} />)
    const drawer = screen.getByRole('dialog', { name: 'A receber' })
    expect(within(drawer).queryByRole('link')).toBeNull()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar painel' }))
    fireEvent(drawer, new Event('cancel', { cancelable: true }))
    fireEvent.click(drawer)
    expect(onFechar).toHaveBeenCalledTimes(3)
  })

  it('CNH com a situação em texto e multas com infração', () => {
    render(<DetalheDrawer aberto onFechar={() => undefined} clientUrl={null} detalhe={{ tipo: 'cnh', titulo: 'CNH em atenção', descricao: '', linhas: [{ id: 'f1', motorista: 'Bia', validade: '2026-10-05', dias: -10 }] }} />)
    expect(screen.getByText('Vencida há 10 dias')).toBeTruthy()
    cleanup()
    render(<DetalheDrawer aberto onFechar={() => undefined} clientUrl={null} detalhe={{ tipo: 'multas', titulo: 'Multas pendentes', descricao: '', linhas: [{ id: 'm1', dia: '2026-10-02', motorista: 'Ana', infracao: '745-50', status: 'Notificar' }] }} />)
    expect(screen.getByText('745-50')).toBeTruthy()
    expect(screen.getByText('1 multa')).toBeTruthy()
  })
})
