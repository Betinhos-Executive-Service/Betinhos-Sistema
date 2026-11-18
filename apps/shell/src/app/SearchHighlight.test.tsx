// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SearchHighlight, SearchTokensContext } from './SearchHighlight'

afterEach(cleanup)
const view = (text: string, tokens: string[]) => render(<SearchTokensContext.Provider value={tokens}><span data-testid="c"><SearchHighlight text={text} /></span></SearchTokensContext.Provider>).container.firstElementChild as HTMLElement

describe('SearchHighlight', () => {
  it('destaca "São José" para a busca "sao jose"', () => {
    const cell = view('São José dos Campos', ['sao', 'jose'])
    expect([...cell.querySelectorAll('mark.search-hit')].map((item) => item.textContent)).toEqual(['São', 'José'])
    expect(cell.textContent).toBe('São José dos Campos')
  })
  it('sem match ou sem busca não renderiza mark', () => {
    expect(view('Guarulhos', ['xyz']).querySelector('mark')).toBeNull()
    expect(view('Guarulhos', []).querySelector('mark')).toBeNull()
  })
})
