// apps/shell/src/pages/frota/components/CamposManutencao.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GRUPOS_MANUT, SERVICOS_MANUT } from '../domain/manutencaoCatalogo'
import type { ValoresJanela } from '../domain/janela'
import { GradeServicos } from './GradeServicos'
import { JanelaCampos } from './JanelaCampos'
import { useOpcoesBusca } from './useOpcoesBusca'

afterEach(cleanup)

describe('GradeServicos', () => {
  it('marca e desmarca serviços do catálogo e mostra o erro do grupo', () => {
    const onChange = vi.fn()
    render(<GradeServicos selecionados={[100000007]} onChange={onChange} erro="Escolha pelo menos um serviço realizado" />)
    expect((screen.getByRole('checkbox', { name: 'Pastilhas de freio' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Discos de freio' }))
    expect(onChange).toHaveBeenLastCalledWith([100000007, 100000008])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pastilhas de freio' }))
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('alert').textContent).toBe('Escolha pelo menos um serviço realizado')
  })
})

describe('JanelaCampos', () => {
  function Controlado({ inicial }: { inicial: ValoresJanela }) {
    const [valores, setValores] = useState(inicial)
    return (
      <>
        <JanelaCampos valores={valores} erros={{}} hoje="2026-11-18" onChange={setValores} />
        <output data-testid="valores">{JSON.stringify(valores)}</output>
      </>
    )
  }
  const lidos = () => JSON.parse(screen.getByTestId('valores').textContent ?? '{}') as ValoresJanela

  it('começa em Semana (seletor de semanas) e troca para Dia (campo de data)', () => {
    render(<Controlado inicial={{ modo: 'semana', dia: '2026-11-18', semana: '2026-11-16', comentario: '' }} />)
    expect(screen.getByRole('combobox', { name: /Semana/ })).toBeTruthy()
    expect(document.querySelector('input[type="date"]')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Dia' }))
    expect(lidos().modo).toBe('dia')
    const data = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(data, { target: { value: '2026-11-20' } })
    expect(lidos().dia).toBe('2026-11-20')
  })

  it('não oferece semanas que já terminaram, nem a que veio nos valores', () => {
    render(<Controlado inicial={{ modo: 'semana', dia: '2026-11-18', semana: '2026-11-02', comentario: '' }} />)
    fireEvent.click(screen.getByRole('combobox', { name: /Semana/ }))
    const opcoes = screen.getAllByRole('option', { hidden: true }).map((o) => o.textContent ?? '')
    expect(opcoes.length).toBeGreaterThan(0)
    expect(opcoes.some((texto) => texto.includes('02/11'))).toBe(false)
    expect(opcoes[0]).toContain('16/11') // a primeira é a semana de hoje
  })

  it('a semana gravada mais adiante, fora das próximas oito, continua na lista', () => {
    render(<Controlado inicial={{ modo: 'semana', dia: '2026-11-18', semana: '2027-03-01', comentario: '' }} />)
    fireEvent.click(screen.getByRole('combobox', { name: /Semana/ }))
    expect(screen.getAllByRole('option', { hidden: true }).some((o) => (o.textContent ?? '').includes('01/03'))).toBe(true)
  })

  it('guarda o comentário ao motorista', () => {
    render(<Controlado inicial={{ modo: 'dia', dia: '2026-11-18', semana: '2026-11-16', comentario: '' }} />)
    fireEvent.change(screen.getByLabelText(/Comentário ao motorista/), { target: { value: 'Levar cedo' } })
    expect(lidos().comentario).toBe('Levar cedo')
  })
})

describe('catálogo agrupado (fonte única)', () => {
  it('cada serviço aparece em exatamente um grupo, na categoria dele', () => {
    const todos = GRUPOS_MANUT.flatMap((grupo) => grupo.servicos.map((servico) => servico.value))
    expect([...todos].sort()).toEqual(SERVICOS_MANUT.map((servico) => servico.value).sort())
    for (const grupo of GRUPOS_MANUT) for (const servico of grupo.servicos) expect(servico.categoria).toBe(grupo.value)
  })
})

describe('useOpcoesBusca', () => {
  const ana = { id: 'f1', nome: 'Ana' }
  const bruno = { id: 'f2', nome: 'Bruno' }

  it('traz a lista inicial, mantém a escolhida na lista e refina ao digitar', async () => {
    const buscar = vi.fn(async (texto: string) => (texto === 'br' ? [bruno] : [ana]))
    const { result } = renderHook(() => useOpcoesBusca(buscar, bruno))
    await waitFor(() => expect(result.current.lista.map((o) => o.id)).toEqual(['f2', 'f1'])) // a escolhida vem primeiro, sem repetir
    expect(result.current.opcoes).toEqual([{ value: 'f2', label: 'Bruno' }, { value: 'f1', label: 'Ana' }])
    // Abrir o painel (texto vazio) não busca de novo nem mostra "Carregando…": a lista inicial já está aqui.
    act(() => result.current.onSearch(''))
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(result.current.carregando).toBe(false)
    expect(result.current.lista.map((o) => o.id)).toEqual(['f2', 'f1'])
    // Digitando, busca no servidor e mostra só o que veio; apagar o texto volta à lista inicial.
    act(() => result.current.onSearch('br'))
    await waitFor(() => expect(buscar).toHaveBeenCalledWith('br'))
    await waitFor(() => expect(result.current.lista.map((o) => o.id)).toEqual(['f2']))
    act(() => result.current.onSearch(''))
    expect(result.current.lista.map((o) => o.id)).toEqual(['f2', 'f1'])
  })

  it('se a carga inicial falhou, abrir o painel (texto vazio) tenta de novo', async () => {
    const buscar = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue([ana])
    const { result } = renderHook(() => useOpcoesBusca(buscar, null))
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1))
    expect(result.current.lista).toEqual([])
    act(() => result.current.onSearch(''))
    await waitFor(() => expect(result.current.lista).toEqual([ana]))
    expect(buscar).toHaveBeenCalledTimes(2)
    act(() => result.current.onSearch('')) // já carregou: não busca de novo
    expect(buscar).toHaveBeenCalledTimes(2)
  })

  it('sem escolhida, a lista é a do servidor', async () => {
    const buscar = vi.fn(async () => [ana])
    const { result } = renderHook(() => useOpcoesBusca(buscar, null))
    await waitFor(() => expect(result.current.lista).toEqual([ana]))
  })
})
