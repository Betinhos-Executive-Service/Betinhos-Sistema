// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContagemDrawer, EXCLUIDOS_KEY } from './ContagemDrawer'

const D = '2026-10-09'
const at = (hhmm: string) => `${D}T${hhmm}:00Z`
const reservas = [
  { cr40f_reservadeveculosid: 'r1', _cr40f_motorista_value: 'a', cr40f_dataehorriodesada: at('15:00'), cr40f_trajeto: 'GRU → Hotel' },
  { cr40f_reservadeveculosid: 'r2', _cr40f_motorista_value: 'a', cr40f_dataehorriodesada: at('12:00'), cr40f_trajeto: 'Hotel → CGH' },
  { cr40f_reservadeveculosid: 'r3', _cr40f_motorista_value: 'b', cr40f_dataehorriodesada: at('13:00'), cr40f_trajeto: 'Centro → GRU' },
  { cr40f_reservadeveculosid: 'r4', _cr40f_motorista_value: 'b', cr40f_dataehorriodesada: at('14:00'), cr40f_trajeto: 'GRU → Centro' },
  { cr40f_reservadeveculosid: 'r5', _cr40f_motorista_value: 'b', cr40f_dataehorriodesada: at('16:00'), cr40f_trajeto: 'Centro → CGH' },
  { cr40f_reservadeveculosid: 'r6', _cr40f_motorista_value: 'b', cr40f_dataehorriodesada: at('17:00'), cr40f_trajeto: 'CGH → Centro' },
]
const motoristas = [{ id: 'a', nome: 'Ana' }, { id: 'b', nome: 'Bruno' }, { id: 'c', nome: 'Caio' }]

function memoryKV() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } }
}
const setup = (contagem = vi.fn(async () => ({ reservas, motoristas })), kv = memoryKV()) => {
  render(<ContagemDrawer open onClose={() => {}} source={{ contagem }} initialDay={D} kv={kv} mobile={false} />)
  return { contagem, kv }
}

beforeEach(() => { HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') } })
afterEach(cleanup)

describe('ContagemDrawer', () => {
  it('lista motoristas com total, tom e rodapé', async () => {
    setup()
    expect(await screen.findByText('Bruno')).toBeTruthy()
    const item = (name: string) => screen.getByText(name).closest('li') as HTMLElement
    expect(within(item('Bruno')).getByText('4 · acima da média').className).toContain('bt-badge__label')
    expect(item('Bruno').querySelector('.bt-badge--warning')).toBeTruthy()
    expect(item('Ana').querySelector('.bt-badge--warning')).toBeTruthy()
    expect(item('Caio').querySelector('.bt-badge--neutral')).toBeTruthy()
    expect(screen.getByText('Total — 09/10/2026: 6')).toBeTruthy()
    expect(screen.getByText('Média: 3,0')).toBeTruthy()
    expect(screen.getByText('09/10/2026')).toBeTruthy()
  })

  it('excluir da média recalcula e persiste', async () => {
    const { kv } = setup()
    await screen.findByText('Bruno')
    const box = within(screen.getByText('Bruno').closest('li') as HTMLElement).getByLabelText('Excluir da média')
    fireEvent.click(box)
    expect(screen.getByText('Média: 2,0')).toBeTruthy()
    expect(JSON.parse(kv.getItem(EXCLUIDOS_KEY) ?? '[]')).toEqual(['b'])
  })

  it('lê exclusões salvas e ignora lixo', async () => {
    const kv = memoryKV(); kv.setItem(EXCLUIDOS_KEY, '{"x":1}')
    setup(undefined, kv)
    expect(await screen.findByText('Média: 3,0')).toBeTruthy()
  })

  it('navega pelos dias chamando contagem com o dia certo', async () => {
    const { contagem } = setup()
    await screen.findByText('Bruno')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo dia' }))
    await waitFor(() => expect(contagem).toHaveBeenLastCalledWith('2026-10-10'))
    expect(screen.getByText('10/10/2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }))
    await waitFor(() => expect(contagem).toHaveBeenLastCalledWith('2026-10-08'))
  })

  it('expandir mostra hora e trajeto em ordem', async () => {
    setup()
    await screen.findByText('Ana')
    const toggle = screen.getByRole('button', { name: /Ana/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const lines = within(screen.getByText('Ana').closest('li') as HTMLElement).getAllByText(/→/).map((n) => n.textContent)
    expect(lines).toEqual(['09:00 · Hotel → CGH', '12:00 · GRU → Hotel'])
  })

  it('erro mostra alerta e tenta de novo', async () => {
    const contagem = vi.fn().mockRejectedValueOnce(new Error('Falhou a consulta')).mockResolvedValue({ reservas, motoristas })
    setup(contagem)
    expect(await screen.findByText('Falhou a consulta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Bruno')).toBeTruthy()
    expect(screen.queryByText('Falhou a consulta')).toBeNull()
  })
})
