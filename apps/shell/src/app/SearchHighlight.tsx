import { createContext, useContext, useMemo } from 'react'
import { highlightParts } from './keywordSearch'
import './SearchHighlight.css'

/** Palavras da busca ativa; as células leem daqui em vez de receber por props em cada nível. */
export const SearchTokensContext = createContext<string[]>([])

/** Texto com os trechos que casam com a busca envolvidos em `<mark class="search-hit">`; sem match devolve o texto puro. */
export function SearchHighlight({ text }: { text: string }) {
  const tokens = useContext(SearchTokensContext)
  const parts = useMemo(() => {
    if (!tokens.length) return null
    const found = highlightParts(text, tokens)
    return found.some((part) => part.hit) ? found : null
  }, [text, tokens])
  if (!parts) return <>{text}</>
  return <>{parts.map((part, index) => part.hit ? <mark key={index} className="search-hit">{part.text}</mark> : part.text)}</>
}
