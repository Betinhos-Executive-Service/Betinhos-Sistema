import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'
import { esconderSplashInicial } from './app/BrandLoader'
import { applyRouteFromSearch } from './nav/useHashRoute'
import { instalarLogDeErros } from './app/errorLog'
import { instalarMedicaoDesempenho } from './app/perfLog'

instalarLogDeErros()

// Item do sitemap do model-driven abre o WebResource com `?data=<rota>`; vira hash antes de montar.
applyRouteFromSearch()
instalarMedicaoDesempenho()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// O splash do index.html cobre o download do bundle; some quando o shell pinta o primeiro quadro.
requestAnimationFrame(esconderSplashInicial)
