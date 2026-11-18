import { createContext, useContext } from 'react'
import { highlightParts } from './keywordSearch'
import './SearchHighlight.css'

/** Palavras da busca ativa; as células leem daqui em vez de receber por props em cada nível. */
export const SearchTokensContext = createContext<string[]>([])

/** Texto com os trechos que casam com a busca envolvidos em `<mark class="search-hit">`; sem match devolve o texto puro. */
export function SearchHighlight({ text }: { text: string }) {
  const tokens = useContext(SearchTokensContext)
  if (!tokens.length) return <>{text}</>
  const parts = highlightParts(text, tokens)
  if (!parts.some((part) => part.hit)) return <>{text}</>
  return <>{parts.map((part, index) => part.hit ? <mark key={index} className="search-hit">{part.text}</mark> : part.text)}</>
}
