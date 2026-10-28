import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@betinhos/ui/styles.css'
import './styles.css'
import { App } from './App'
import { CODIGO_MOCK, createMockApi } from './api/mockApi'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={createMockApi({ atrasoMs: 350 })} dicaCodigo={`Protótipo: use o código ${CODIGO_MOCK}.`} />
  </StrictMode>,
)
