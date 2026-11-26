import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import './app/tabelas.css'
import { App } from './App'
import { esconderSplashInicial } from './app/BrandLoader'
import { applyRouteFromSearch } from './nav/useHashRoute'
import { aplicarTema, lerTema } from './app/tema'
import { instalarLogDeErros } from './app/errorLog'
import { instalarMedicaoDesempenho } from './app/perfLog'
import { instalarCorrecaoViewportIos } from './app/viewportIos'
import { instalarFaixaAmbiente } from './app/faixaAmbiente'

instalarLogDeErros()
instalarFaixaAmbiente()
aplicarTema(lerTema())

// Item do sitemap do model-driven abre o WebResource com `?data=<rota>`; vira hash antes de montar.
applyRouteFromSearch()
instalarMedicaoDesempenho()
instalarCorrecaoViewportIos()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// O splash do index.html cobre o download do bundle; some quando o shell pinta o primeiro quadro.
requestAnimationFrame(esconderSplashInicial)
