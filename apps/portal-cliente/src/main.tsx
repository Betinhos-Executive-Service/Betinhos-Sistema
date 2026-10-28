import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'
import { CODIGO_MOCK, createMockApi, refazerAutenticadorMock } from './api/mockApi'

// Protótipo: `?refazer-autenticador` apaga o autenticador cadastrado e o computador lembrado para testar o 1º acesso de novo.
const url = new URL(location.href)
if (url.searchParams.has('refazer-autenticador')) {
  refazerAutenticadorMock()
  url.searchParams.delete('refazer-autenticador')
  history.replaceState(null, '', url)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={createMockApi({ atrasoMs: 350 })} dicaCodigo={`Protótipo: use o código ${CODIGO_MOCK}.`} />
  </StrictMode>,
)
