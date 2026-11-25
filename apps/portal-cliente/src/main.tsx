import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'
import { apagarSenhasMock, CODIGO_MOCK, createMockApi } from './api/mockApi'
import { createWorkerApi } from './api/workerApi'

// Mock só no dev server local (porta 52463) ou com `?mock`; em qualquer outro endereço (workers.dev, wrangler dev) fala com o Worker.
const url = new URL(location.href)
const mock = (['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '52463') || url.searchParams.has('mock')

// Mock: `?apagar-senhas` apaga as senhas criadas e a sessão para testar o 1º acesso de novo.
if (mock && url.searchParams.has('apagar-senhas')) {
  apagarSenhasMock()
  url.searchParams.delete('apagar-senhas')
  history.replaceState(null, '', url)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      api={mock ? createMockApi({ atrasoMs: 350, enderecosReais: import.meta.env.DEV }) : createWorkerApi()}
      dicaCodigo={mock ? `Protótipo: use o código ${CODIGO_MOCK}.` : undefined}
    />
  </StrictMode>,
)
