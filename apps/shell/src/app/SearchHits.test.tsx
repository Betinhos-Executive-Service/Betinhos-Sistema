// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, expect, it } from 'vitest'
import { SearchHits } from './SearchHits'
import { highlightRanges } from './keywordSearch'

// jsdom não tem o CSS Custom Highlight: um Set basta para conferir o que entra e sai do registro.
const registry = new Map<string, Set<Range>>()
beforeAll(() => {
  Object.assign(globalThis, { Highlight: class extends Set<Range> {} })
  Object.assign(globalThis.CSS ?? (globalThis.CSS = {} as typeof CSS), { highlights: registry })
})
afterEach(cleanup)

const marked = () => [...(registry.get('search-hit') ?? [])].map((range) => range.toString())

it('highlightRanges une trechos vizinhos e ignora acento e caixa', () => {
  expect(highlightRanges('São Paulo – GRU', ['sao', 'gru'])).toEqual([[0, 3], [12, 15]])
  expect(highlightRanges('abab', ['ab', 'ba'])).toEqual([[0, 4]])
  expect(highlightRanges('texto', [])).toEqual([])
})

it('marca o texto das linhas, não o cabeçalho nem campos, e limpa ao sair', async () => {
  const table = (
    <div>
      <div className="bt-table__head">Cliente Embraer</div>
      <div className="bt-table__row"><span>Embraer SJC</span><input defaultValue="embraer" /></div>
    </div>
  )
  const view = render(<SearchHits tokens={['embraer']}>{table}</SearchHits>)
  expect(marked()).toEqual(['Embraer'])
  view.rerender(<SearchHits tokens={['sjc']}>{table}</SearchHits>)
  expect(marked()).toEqual(['SJC'])
  view.unmount()
  expect(marked()).toEqual([])
})

it('refaz quando a área muda (rolagem virtual, página nova)', async () => {
  const view = render(<SearchHits tokens={['gru']}><p>Congonhas</p></SearchHits>)
  expect(marked()).toEqual([])
  view.rerender(<SearchHits tokens={['gru']}><p>Guarulhos GRU</p></SearchHits>)
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))))
  expect(marked()).toEqual(['GRU'])
})
