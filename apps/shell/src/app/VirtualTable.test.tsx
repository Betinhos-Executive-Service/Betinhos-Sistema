// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { VirtualTable } from './VirtualTable'

type Row = { id: string; nome: string }
const rows: Row[] = [{ id: '1', nome: 'Ana' }, { id: '2', nome: 'Bruno' }]
const columns = [{ key: 'nome', header: 'Nome', cell: (r: Row) => r.nome }]

/** jsdom não faz layout: a largura das colunas e a da área visível vêm daqui. */
function larguras(conteudo: number, visivel: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('bt-table__scroll') ? conteudo : 0 })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return visivel })
}

const montar = () => render(<VirtualTable columns={columns} rows={rows} rowKey={(r) => r.id} scrollRef={() => undefined} />)

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('barra horizontal presa ao pé da tela', () => {
  it('fica escondida quando as colunas cabem', () => {
    larguras(800, 800)
    const { container } = montar()
    expect(container.querySelector<HTMLElement>('.vt-xbar')!.hidden).toBe(true)
  })

  it('aparece quando as colunas passam da largura e acompanha a tabela nos dois sentidos', () => {
    larguras(1400, 1000)
    const { container } = montar()
    const barra = container.querySelector<HTMLElement>('.vt-xbar')!
    const tabela = container.querySelector<HTMLElement>('.bt-table__scroll')!
    expect(barra.hidden).toBe(false)
    expect(container.querySelector<HTMLElement>('.vt-xbar__fill')!.style.width).toBe('1400px')

    barra.scrollLeft = 250
    fireEvent.scroll(barra)
    expect(tabela.scrollLeft).toBe(250)

    tabela.scrollLeft = 90
    fireEvent.scroll(tabela)
    expect(barra.scrollLeft).toBe(90)
  })
})
