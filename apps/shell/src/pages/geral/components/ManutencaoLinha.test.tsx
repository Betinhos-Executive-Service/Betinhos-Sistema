// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '@betinhos/dataverse'
import { createMockManutencoes, createMockRows } from '../data/mock'
import { lerLinhaManutencao, trechosDaManutencao } from '../domain/manutencao'
import type { AttributeInfo, Column } from '../domain/types'
import { Cell } from './Cell'
import { GeralCards } from './GeralCards'
import { GeralTable } from './GeralTable'
import { ManutencaoResumo } from './ManutencaoResumo'

afterEach(cleanup)
const NOW = new Date('2026-11-18T15:00:00Z')
const HOJE = '2026-11-18'
const [m2, m3] = createMockManutencoes(NOW)
const servico = createMockRows(NOW)[0]
const coluna = (key: string, width = 120): Column => ({ key, attribute: key, alias: null, entity: null, width })
const columns: Column[] = [coluna('cr40f_id')]

describe('linha de manutenção', () => {
  it('o resumo mostra problema, grau, janela, status e o selo de atrasada', () => {
    render(<ManutencaoResumo m={lerLinhaManutencao(m3, HOJE)!} />)
    expect(screen.getByText('Manutenção fictícia m3')).toBeTruthy()
    expect(screen.getByText('Média')).toBeTruthy()
    expect(screen.getByText('15/11/2026')).toBeTruthy()
    expect(screen.getByText('Programado')).toBeTruthy()
    expect(screen.getByText('Atrasada')).toBeTruthy()
    expect(screen.queryByText('Fora da janela')).toBeNull()
  })

  it('"Fora da janela" só para Agendado ou Programado: Realizado, Cancelado e os demais não ganham o selo', () => {
    // m2: janela da semana que vem; a saída de hoje fica fora dela.
    const fora = (status: number) => lerLinhaManutencao({ ...m2, cr40f_dataehorriodesada: '2026-11-18T13:00:00Z', 'bt_manut.cr40f_status': status }, HOJE)!
    for (const [status, esperado] of [[202410001, true], [202410005, true], [202410002, false], [100000001, false], [100000002, false], [0, false]] as const) {
      const m = fora(status)
      expect(m.foraDaJanela).toBe(esperado)
      const { unmount } = render(<ManutencaoResumo m={m} />)
      expect(screen.queryByText('Fora da janela') != null).toBe(esperado)
      unmount()
    }
  })

  it('nos cards, a manutenção tem cara própria, abre a gaveta e "Programar" abre a edição', () => {
    const abrir = vi.fn()
    const onEdit = vi.fn()
    const onOpen = vi.fn()
    render(<GeralCards rows={[servico, m2]} columns={columns} attributes={null} loading={false} selected={new Set()} onToggle={() => undefined} onOpen={onOpen} onEdit={onEdit} manutencao={{ ler: (row) => lerLinhaManutencao(row, HOJE), abrir }} />)
    const [cardServico, cardManutencao] = screen.getAllByRole('listitem')
    expect(cardServico.className).not.toContain('gr-card--manutencao')
    expect(cardManutencao.className).toContain('gr-card--manutencao')
    expect(within(cardManutencao).getByText('Sem motorista')).toBeTruthy()
    expect(within(cardManutencao).getByText('Semana de 23/11 a 29/11/2026')).toBeTruthy()
    fireEvent.click(within(cardManutencao).getByRole('button', { name: 'Abrir manutenção Manutenção fictícia m2 (TST2B22)' }))
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm2' }))
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(within(cardManutencao).getByRole('button', { name: 'Programar' }))
    expect(onEdit).toHaveBeenCalledWith(String(m2.cr40f_reservadeveculosid))
  })
})

describe('trechos: o resumo vem antes dos campos editáveis', () => {
  it('[id, saída, motorista, cliente]: sem coluna antes dos campos, o resumo vai para a primeira coluna', () => {
    const cols = ['cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_motorista', 'cr40f_cliente'].map((k) => coluna(k))
    expect(trechosDaManutencao(cols)).toEqual([
      { tipo: 'resumo', key: 'cr40f_id', span: 1 },
      { tipo: 'campo', column: cols[1] },
      { tipo: 'campo', column: cols[2] },
      { tipo: 'vazio', key: 'cr40f_cliente', span: 1 },
    ])
  })

  it('com uma coluna comum antes dos campos, o resumo fica nela', () => {
    const cols = ['cr40f_id', 'cr40f_cliente', 'cr40f_dataehorriodesada', 'cr40f_motorista', 'cr40f_trajeto'].map((k) => coluna(k))
    expect(trechosDaManutencao(cols).map((t) => t.tipo)).toEqual(['resumo', 'campo', 'campo', 'vazio'])
  })
})

const INFO = { type: 'String', updatable: true, options: [] } as unknown as AttributeInfo
function tabela(cols: Column[], rows: Row[], abrir = vi.fn()) {
  const view = render(
    <GeralTable
      columns={cols} attributes={null} rows={rows} loading={false} sort={null} defaultSort={null} onSort={() => undefined} filteredKeys={[]} onClearFilter={() => undefined} onHide={() => undefined}
      onResize={() => undefined} onMove={() => undefined} selected={new Set()} onToggle={() => undefined} onSelectRow={() => undefined} onToggleAll={() => undefined} onOpen={() => undefined}
      renderCell={(row, column) => <Cell key={column.key} row={row} column={column} info={INFO} status={{ kind: 'idle' }} onSave={async () => true} onReset={() => undefined} search={async () => []} editable />}
      footer={null} empty={null}
      manutencao={{ ler: (row) => lerLinhaManutencao(row, HOJE), abrir }}
    />,
  )
  return { ...view, abrir }
}
const celulaDe = (linha: HTMLElement, key: string) => linha.querySelector<HTMLElement>('[data-col="' + key + '"]')!

describe('tabela com linha de manutenção', () => {
  it('visão sem coluna para o resumo: o resumo aparece na primeira coluna, abaixo do botão, e não desalinha as colunas', () => {
    const cols = ['cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_motorista'].map((k) => coluna(k))
    const { container, abrir } = tabela(cols, [m2])
    const linha = container.querySelector<HTMLElement>('.gr-row--manutencao')!
    const celulas = within(linha).getAllByRole('gridcell')
    expect(celulas).toHaveLength(4) // seleção, primeira, saída, motorista: nenhuma célula a mais
    const primeira = celulas[1]
    expect(within(primeira).getByRole('button', { name: 'Abrir manutenção Manutenção fictícia m2 (TST2B22)' }).textContent).toContain('Manutenção · TST2B22')
    expect(within(primeira).getByText('Manutenção fictícia m2')).toBeTruthy()
    expect(within(primeira).getByText('Semana de 23/11 a 29/11/2026')).toBeTruthy()
    fireEvent.click(within(primeira).getByRole('button', { name: /Abrir manutenção/ }))
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ manutencaoId: 'm2' }))
  })

  it('com colunas comuns, o resumo vai no trecho que junta as colunas vizinhas e só aparece uma vez', () => {
    const cols = ['cr40f_id', 'cr40f_status', 'cr40f_cliente', 'cr40f_dataehorriodesada', 'cr40f_motorista'].map((k) => coluna(k))
    const { container } = tabela(cols, [m2])
    const linha = container.querySelector<HTMLElement>('.gr-row--manutencao')!
    const celulas = within(linha).getAllByRole('gridcell')
    expect(celulas).toHaveLength(5) // seleção, primeira, trecho (status + cliente), saída, motorista
    expect(celulas[2].getAttribute('aria-colspan')).toBe('2')
    expect(celulas[2].style.gridColumn).toBe('span 2')
    expect(within(celulas[2]).getByText('Manutenção fictícia m2')).toBeTruthy()
    expect(within(linha).getAllByText('Manutenção fictícia m2')).toHaveLength(1)
    expect(celulas[1].classList.contains('gr-cell--first')).toBe(true)
  })

  it('setas para cima e para baixo entre serviço e manutenção levam à célula editável mais próxima', () => {
    const cols = ['cr40f_id', 'cr40f_status', 'cr40f_cliente', 'cr40f_dataehorriodesada', 'cr40f_motorista'].map((k) => coluna(k))
    const { container } = tabela(cols, [servico, m2])
    const linhas = container.querySelectorAll<HTMLElement>('.bt-table__row:not(.bt-table__head)')
    const [linhaServico, linhaManutencao] = [linhas[0], linhas[1]]
    const apertar = (de: HTMLElement, key: string) => { de.focus(); fireEvent.keyDown(de, { key }) }

    // A mesma coluna existe na manutenção: vai nela.
    apertar(celulaDe(linhaServico, 'cr40f_motorista'), 'ArrowDown')
    expect(document.activeElement).toBe(celulaDe(linhaManutencao, 'cr40f_motorista'))
    apertar(celulaDe(linhaServico, 'cr40f_dataehorriodesada'), 'ArrowDown')
    expect(document.activeElement).toBe(celulaDe(linhaManutencao, 'cr40f_dataehorriodesada'))
    // A coluna foi absorvida pelo resumo: a editável mais próxima.
    apertar(celulaDe(linhaServico, 'cr40f_cliente'), 'ArrowDown')
    expect(document.activeElement).toBe(celulaDe(linhaManutencao, 'cr40f_dataehorriodesada'))
    apertar(celulaDe(linhaServico, 'cr40f_status'), 'ArrowDown')
    expect(document.activeElement).toBe(celulaDe(linhaManutencao, 'cr40f_dataehorriodesada'))
    // Saindo da manutenção: a mesma coluna do serviço.
    apertar(celulaDe(linhaManutencao, 'cr40f_motorista'), 'ArrowUp')
    expect(document.activeElement).toBe(celulaDe(linhaServico, 'cr40f_motorista'))
    apertar(celulaDe(linhaManutencao, 'cr40f_dataehorriodesada'), 'ArrowUp')
    expect(document.activeElement).toBe(celulaDe(linhaServico, 'cr40f_dataehorriodesada'))
  })

  it('setas para os lados dentro da manutenção pulam o resumo e andam só entre as células que existem', () => {
    const cols = ['cr40f_id', 'cr40f_status', 'cr40f_cliente', 'cr40f_dataehorriodesada', 'cr40f_motorista'].map((k) => coluna(k))
    const { container } = tabela(cols, [m2])
    const linha = container.querySelector<HTMLElement>('.gr-row--manutencao')!
    const saida = celulaDe(linha, 'cr40f_dataehorriodesada')
    saida.focus()
    fireEvent.keyDown(saida, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(celulaDe(linha, 'cr40f_motorista'))
    fireEvent.keyDown(saida, { key: 'ArrowLeft' })
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^Abrir manutenção/)
  })
})
