import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'
import { applyRouteFromSearch } from './nav/useHashRoute'
import { instalarLogDeErros } from './app/errorLog'

instalarLogDeErros()

// Item do sitemap do model-driven abre o WebResource com `?data=<rota>`; vira hash antes de montar.
applyRouteFromSearch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
